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

app.use(express.static(path.join(__dirname, 'public')));

// Estado da aplicação: Lado A, Lado B, Cronômetro e Histórico de Partidas
let gameState = {
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

function broadcastState() {
  io.emit('state:update', gameState);
}

// Loop do cronômetro sincronizado no servidor
setInterval(() => {
  if (gameState.timer.running) {
    gameState.timer.seconds += 1;
    io.emit('timer:tick', gameState.timer);
  }
}, 1000);

io.on('connection', (socket) => {
  // Envia estado atual ao conectar
  socket.emit('state:update', gameState);

  // Aumentar ponto
  socket.on('point:add', (team) => {
    if (team === 'A') gameState.scoreA += 1;
    if (team === 'B') gameState.scoreB += 1;
    io.emit('sound:play', { type: 'point_add' });
    broadcastState();
  });

  // Diminuir ponto
  socket.on('point:sub', (team) => {
    if (team === 'A' && gameState.scoreA > 0) {
      gameState.scoreA -= 1;
      io.emit('sound:play', { type: 'point_sub' });
    }
    if (team === 'B' && gameState.scoreB > 0) {
      gameState.scoreB -= 1;
      io.emit('sound:play', { type: 'point_sub' });
    }
    broadcastState();
  });

  // Resetar placar atual
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
      // Toca apito ao iniciar o cronômetro
      io.emit('sound:play', { type: 'whistle' });
    }
    broadcastState();
  });

  // Cronômetro: Reiniciar / Zerar
  socket.on('timer:restart', () => {
    gameState.timer.seconds = 0;
    broadcastState();
  });

  // Encerrar Partida e salvar no Histórico
  socket.on('match:finish', () => {
    // Registra a partida concluída
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

    gameState.matchHistory.unshift(matchRecord); // Adiciona no início da lista

    // Reseta pontos e cronômetro para a próxima partida
    gameState.scoreA = 0;
    gameState.scoreB = 0;
    gameState.timer.running = false;
    gameState.timer.seconds = 0;

    // Dispara apito longo / final
    io.emit('sound:play', { type: 'whistle_final' });
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
