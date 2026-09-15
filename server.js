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

// Estado simplificado: Lado A (Azul), Lado B (Vermelho) e Cronômetro
let gameState = {
  scoreA: 0,
  nameA: 'LADO A',
  scoreB: 0,
  nameB: 'LADO B',
  timer: {
    seconds: 0,
    running: false
  }
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
    io.emit('sound:play', { type: 'point' });
    broadcastState();
  });

  // Diminuir ponto
  socket.on('point:sub', (team) => {
    if (team === 'A' && gameState.scoreA > 0) gameState.scoreA -= 1;
    if (team === 'B' && gameState.scoreB > 0) gameState.scoreB -= 1;
    broadcastState();
  });

  // Resetar placar geral
  socket.on('score:reset', () => {
    gameState.scoreA = 0;
    gameState.scoreB = 0;
    broadcastState();
  });

  // Cronômetro: Iniciar / Pausar
  socket.on('timer:toggle', () => {
    gameState.timer.running = !gameState.timer.running;
    broadcastState();
  });

  // Cronômetro: Reiniciar / Zerar
  socket.on('timer:restart', () => {
    gameState.timer.seconds = 0;
    broadcastState();
  });

  // Atualizar nomes (opcional)
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
