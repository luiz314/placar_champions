const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Estado inicial da partida
function createInitialState() {
  return {
    teamA: {
      id: 'A',
      name: 'LADO A',
      score: 0,
      setsWon: 0,
      timeouts: 0, // max 2 por set
      color: '#2563eb' // Azul vibrante
    },
    teamB: {
      id: 'B',
      name: 'LADO B',
      score: 0,
      setsWon: 0,
      timeouts: 0,
      color: '#ef4444' // Vermelho vibrante
    },
    currentSet: 1,
    maxSets: 5, // 5 = melhor de 5 (ganha quem fizer 3), 3 = melhor de 3 (ganha quem fizer 2)
    serving: 'A',
    courtSwapped: false, // se true, visualmente B fica à esquerda e A à direita
    setHistory: [],
    timer: {
      running: false,
      seconds: 0
    },
    timeoutModal: {
      active: false,
      team: null,
      teamName: null,
      secondsLeft: 30
    },
    matchOver: false,
    winner: null,
    statusAlert: '' // mensagens como 'SET POINT', 'MATCH POINT'
  };
}

let gameState = createInitialState();

function isTieBreakSet(setNum, maxSets) {
  return (maxSets === 5 && setNum === 5) || (maxSets === 3 && setNum === 3);
}

function getTargetPoints(setNum, maxSets) {
  return isTieBreakSet(setNum, maxSets) ? 15 : 25;
}

function setsToWin(maxSets) {
  return Math.ceil(maxSets / 2);
}

function updateGameAlerts() {
  if (gameState.matchOver) {
    gameState.statusAlert = `VITÓRIA - ${gameState.winner === 'A' ? gameState.teamA.name : gameState.teamB.name}`;
    return;
  }

  const target = getTargetPoints(gameState.currentSet, gameState.maxSets);
  const neededToWinMatch = setsToWin(gameState.maxSets);
  const scoreA = gameState.teamA.score;
  const scoreB = gameState.teamB.score;

  let alert = '';

  const isPointAwayA = (scoreA >= target - 1 && scoreA > scoreB) || (scoreA >= target && scoreA - scoreB === 1);
  const isPointAwayB = (scoreB >= target - 1 && scoreB > scoreA) || (scoreB >= target && scoreB - scoreA === 1);

  if (isPointAwayA) {
    if (gameState.teamA.setsWon + 1 >= neededToWinMatch) {
      alert = `MATCH POINT - ${gameState.teamA.name}`;
    } else {
      alert = `SET POINT - ${gameState.teamA.name}`;
    }
  } else if (isPointAwayB) {
    if (gameState.teamB.setsWon + 1 >= neededToWinMatch) {
      alert = `MATCH POINT - ${gameState.teamB.name}`;
    } else {
      alert = `SET POINT - ${gameState.teamB.name}`;
    }
  }

  gameState.statusAlert = alert;
}

function broadcastState() {
  updateGameAlerts();
  io.emit('state:update', gameState);
}

function finishCurrentSet(winnerTeam) {
  const winner = winnerTeam === 'A' ? gameState.teamA : gameState.teamB;
  winner.setsWon += 1;

  gameState.setHistory.push({
    set: gameState.currentSet,
    scoreA: gameState.teamA.score,
    scoreB: gameState.teamB.score,
    winner: winnerTeam
  });

  const needed = setsToWin(gameState.maxSets);
  if (winner.setsWon >= needed) {
    gameState.matchOver = true;
    gameState.winner = winnerTeam;
    gameState.timer.running = false;
    io.emit('sound:play', { type: 'match_won' });
  } else {
    gameState.currentSet += 1;
    gameState.teamA.score = 0;
    gameState.teamB.score = 0;
    gameState.teamA.timeouts = 0;
    gameState.teamB.timeouts = 0;
    // Tradicionalmente no vôlei, os times trocam de lado a cada set
    gameState.courtSwapped = !gameState.courtSwapped;
    io.emit('sound:play', { type: 'set_won' });
  }

  broadcastState();
}

function checkAutoSetFinish() {
  const target = getTargetPoints(gameState.currentSet, gameState.maxSets);
  const scoreA = gameState.teamA.score;
  const scoreB = gameState.teamB.score;

  if (scoreA >= target && scoreA - scoreB >= 2) {
    finishCurrentSet('A');
    return true;
  }
  if (scoreB >= target && scoreB - scoreA >= 2) {
    finishCurrentSet('B');
    return true;
  }
  return false;
}

// Loop do cronômetro do servidor (preciso e sincronizado para todos os clientes)
setInterval(() => {
  let changed = false;

  if (gameState.timer.running && !gameState.matchOver) {
    gameState.timer.seconds += 1;
    changed = true;
  }

  if (gameState.timeoutModal.active) {
    if (gameState.timeoutModal.secondsLeft > 0) {
      gameState.timeoutModal.secondsLeft -= 1;
      changed = true;
      if (gameState.timeoutModal.secondsLeft === 0) {
        gameState.timeoutModal.active = false;
        io.emit('sound:play', { type: 'buzzer' });
      }
    }
  }

  if (changed) {
    io.emit('timer:tick', {
      timer: gameState.timer,
      timeoutModal: gameState.timeoutModal
    });
  }
}, 1000);

// Gerenciamento de eventos de conexão
io.on('connection', (socket) => {
  // Envia estado completo na conexão
  socket.emit('state:update', gameState);

  // Adicionar ponto
  socket.on('point:add', ({ team }) => {
    if (gameState.matchOver) return;
    if (team === 'A') {
      gameState.teamA.score += 1;
      gameState.serving = 'A';
    } else if (team === 'B') {
      gameState.teamB.score += 1;
      gameState.serving = 'B';
    }
    io.emit('sound:play', { type: 'point' });
    if (!checkAutoSetFinish()) {
      broadcastState();
    }
  });

  // Subtrair ponto (correção)
  socket.on('point:sub', ({ team }) => {
    if (gameState.matchOver) return;
    if (team === 'A' && gameState.teamA.score > 0) {
      gameState.teamA.score -= 1;
    } else if (team === 'B' && gameState.teamB.score > 0) {
      gameState.teamB.score -= 1;
    }
    broadcastState();
  });

  // Definir posse de saque
  socket.on('serve:set', ({ team }) => {
    if (team === 'A' || team === 'B') {
      gameState.serving = team;
      broadcastState();
    }
  });

  // Trocar de quadra / inverter lados visualmente
  socket.on('court:swap', () => {
    gameState.courtSwapped = !gameState.courtSwapped;
    broadcastState();
  });

  // Pedir tempo (Timeout 30s)
  socket.on('timeout:call', ({ team }) => {
    if (gameState.timeoutModal.active) return;
    const teamObj = team === 'A' ? gameState.teamA : gameState.teamB;
    if (teamObj.timeouts < 2) {
      teamObj.timeouts += 1;
      gameState.timeoutModal = {
        active: true,
        team: team,
        teamName: teamObj.name,
        secondsLeft: 30
      };
      io.emit('sound:play', { type: 'whistle' });
      broadcastState();
    }
  });

  // Cancelar / Fechar tempo técnico
  socket.on('timeout:cancel', () => {
    if (gameState.timeoutModal.active) {
      gameState.timeoutModal.active = false;
      broadcastState();
    }
  });

  // Controle do cronômetro da partida
  socket.on('timer:toggle', () => {
    gameState.timer.running = !gameState.timer.running;
    broadcastState();
  });

  socket.on('timer:start', () => {
    gameState.timer.running = true;
    broadcastState();
  });

  socket.on('timer:pause', () => {
    gameState.timer.running = false;
    broadcastState();
  });

  socket.on('timer:reset', () => {
    gameState.timer.running = false;
    gameState.timer.seconds = 0;
    broadcastState();
  });

  // Finalizar set manualmente
  socket.on('set:manual_finish', ({ winner }) => {
    if (gameState.matchOver) return;
    if (winner === 'A' || winner === 'B') {
      finishCurrentSet(winner);
    }
  });

  // Desfazer último set
  socket.on('set:undo', () => {
    if (gameState.setHistory.length === 0) return;
    const last = gameState.setHistory.pop();
    if (last.winner === 'A') gameState.teamA.setsWon = Math.max(0, gameState.teamA.setsWon - 1);
    if (last.winner === 'B') gameState.teamB.setsWon = Math.max(0, gameState.teamB.setsWon - 1);
    gameState.currentSet = Math.max(1, gameState.currentSet - 1);
    gameState.teamA.score = last.scoreA;
    gameState.teamB.score = last.scoreB;
    gameState.matchOver = false;
    gameState.winner = null;
    broadcastState();
  });

  // Atualizar configurações da partida
  socket.on('match:update_config', (config) => {
    if (config.teamAName !== undefined) gameState.teamA.name = config.teamAName.trim() || 'LADO A';
    if (config.teamBName !== undefined) gameState.teamB.name = config.teamBName.trim() || 'LADO B';
    if (config.maxSets !== undefined) gameState.maxSets = Number(config.maxSets);
    broadcastState();
  });

  // Reiniciar partida completa
  socket.on('match:reset', () => {
    const prevA = gameState.teamA.name;
    const prevB = gameState.teamB.name;
    const prevMax = gameState.maxSets;
    gameState = createInitialState();
    gameState.teamA.name = prevA;
    gameState.teamB.name = prevB;
    gameState.maxSets = prevMax;
    broadcastState();
  });

  // Disparar som para todos os clientes conectados
  socket.on('sound:trigger', ({ type }) => {
    io.emit('sound:play', { type });
  });
});

// Rotas amigáveis
app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

server.listen(PORT, () => {
  console.log(`🏐 Placar de Vôlei rodando na porta ${PORT}`);
  console.log(`- Visualizador (Telão): http://localhost:${PORT}`);
  console.log(`- Mesa de Controle: http://localhost:${PORT}/control`);
});
