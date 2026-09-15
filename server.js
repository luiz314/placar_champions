const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'game_state.json');

app.use(express.static(path.join(__dirname, 'public')));

// Carrega o estado persistido em disco para NUNCA resetar sozinho em caso de reinício do servidor
function loadPersistedState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      console.log('📦 Estado persistido carregado com sucesso:', {
        scoreA: parsed.scoreA,
        scoreB: parsed.scoreB,
        partidasNoHistorico: parsed.matchHistory?.length || 0
      });
      return {
        scoreA: Number(parsed.scoreA) || 0,
        nameA: parsed.nameA || 'LADO A',
        scoreB: Number(parsed.scoreB) || 0,
        nameB: parsed.nameB || 'LADO B',
        timer: {
          seconds: Number(parsed.timer?.seconds) || 0,
          running: Boolean(parsed.timer?.running)
        },
        matchHistory: Array.isArray(parsed.matchHistory) ? parsed.matchHistory : []
      };
    }
  } catch (err) {
    console.warn('Aviso: Não foi possível carregar o arquivo de persistência:', err.message);
  }

  return {
    scoreA: 0,
    nameA: 'LADO A',
    scoreB: 0,
    nameB: 'LADO B',
    timer: {
      seconds: 0,
      running: false
    },
    matchHistory: []
  };
}

let gameState = loadPersistedState();

// Salva o estado em disco de forma segura
function persistStateToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(gameState, null, 2), 'utf8');
  } catch (err) {
    console.warn('Erro ao salvar estado em disco:', err.message);
  }
}

// Garante que o arquivo exista imediatamente
persistStateToDisk();

function broadcastState() {
  persistStateToDisk();
  io.emit('state:update', gameState);
}

// Loop do cronômetro sincronizado no servidor
let lastSavedTimer = 0;
setInterval(() => {
  if (gameState.timer.running) {
    gameState.timer.seconds += 1;
    io.emit('timer:tick', gameState.timer);

    // Salva em disco a cada 10 segundos de cronômetro rodando
    if (gameState.timer.seconds - lastSavedTimer >= 10) {
      lastSavedTimer = gameState.timer.seconds;
      persistStateToDisk();
    }
  }
}, 1000);

io.on('connection', (socket) => {
  // Envia estado atual ao conectar
  socket.emit('state:update', gameState);

  // Aumentar ponto (SEM LIMITE e SEM RESET AUTOMÁTICO)
  socket.on('point:add', (team) => {
    if (team === 'A') gameState.scoreA += 1;
    if (team === 'B') gameState.scoreB += 1;
    socket.broadcast.emit('sound:play', { type: 'point_add' });
    broadcastState();
  });

  // Diminuir ponto (apenas se for maior que zero)
  socket.on('point:sub', (team) => {
    let changed = false;
    if (team === 'A' && gameState.scoreA > 0) {
      gameState.scoreA -= 1;
      changed = true;
    }
    if (team === 'B' && gameState.scoreB > 0) {
      gameState.scoreB -= 1;
      changed = true;
    }
    if (changed) {
      socket.broadcast.emit('sound:play', { type: 'point_sub' });
      broadcastState();
    }
  });

  // Resetar placar atual (APENAS disparado por clique intencional do usuário)
  socket.on('score:reset', () => {
    gameState.scoreA = 0;
    gameState.scoreB = 0;
    broadcastState();
  });

  // Cronômetro: Iniciar / Pausar
  socket.on('timer:toggle', () => {
    const wasRunning = gameState.timer.running;
    gameState.timer.running = !wasRunning;
    if (!wasRunning) {
      socket.broadcast.emit('sound:play', { type: 'whistle' });
    }
    broadcastState();
  });

  // Cronômetro: Reiniciar / Zerar
  socket.on('timer:restart', () => {
    gameState.timer.seconds = 0;
    broadcastState();
  });

  // Encerrar Partida e salvar no Histórico (APENAS disparado pelo usuário)
  socket.on('match:finish', () => {
    let winner = 'Empate';
    if (gameState.scoreA > gameState.scoreB) winner = gameState.nameA;
    else if (gameState.scoreB > gameState.scoreA) winner = gameState.nameB;

    const matchRecord = {
      id: Date.now(),
      matchNumber: gameState.matchHistory.length + 1,
      nameA: gameState.nameA,
      scoreA: gameState.scoreA,
      nameB: gameState.nameB,
      scoreB: gameState.scoreB,
      winner: winner,
      durationSeconds: gameState.timer.seconds,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    gameState.matchHistory.unshift(matchRecord);

    gameState.scoreA = 0;
    gameState.scoreB = 0;
    gameState.timer.running = false;
    gameState.timer.seconds = 0;

    socket.broadcast.emit('sound:play', { type: 'whistle_final' });
    broadcastState();
  });

  // Limpar histórico de partidas
  socket.on('history:clear', () => {
    gameState.matchHistory = [];
    broadcastState();
  });

  // Atualizar nomes das equipes
  socket.on('name:update', ({ team, name }) => {
    if (team === 'A') gameState.nameA = name.trim() || 'LADO A';
    if (team === 'B') gameState.nameB = name.trim() || 'LADO B';
    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`🏐 Placar de Vôlei rodando na porta ${PORT}`);
  console.log(`- Acesse: http://localhost:${PORT}`);
});
