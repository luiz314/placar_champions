const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const balancer = require('./balancer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const LEGACY_FILE = path.join(DATA_DIR, 'game_state.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Estrutura padrão de uma nova sala
function createDefaultRoomState(roomId, password = null) {
  return {
    roomId: String(roomId),
    password: password ? String(password).trim() : null,
    scoreA: 0,
    nameA: 'LADO A',
    scoreB: 0,
    nameB: 'LADO B',
    timer: {
      seconds: 0,
      running: false
    },
    matchHistory: [],
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
}

// Higieniza o estado da sala para nunca enviar a senha em texto puro aos clientes
function sanitizeRoomState(room) {
  if (!room) return null;
  const { password, ...safeRoom } = room;
  return {
    ...safeRoom,
    hasPassword: Boolean(password && String(password).trim().length > 0)
  };
}

// Mapa em memória de salas: roomId -> RoomState
const rooms = new Map();

// Carrega salas persistidas em disco
function loadPersistedRooms() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(ROOMS_FILE)) {
      const raw = fs.readFileSync(ROOMS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([id, r]) => {
          rooms.set(String(id), {
            roomId: String(id),
            password: r.password ? String(r.password).trim() : null,
            scoreA: Number(r.scoreA) || 0,
            nameA: r.nameA || 'LADO A',
            scoreB: Number(r.scoreB) || 0,
            nameB: r.nameB || 'LADO B',
            timer: {
              seconds: Number(r.timer?.seconds) || 0,
              running: false // Sempre inicia pausado ao ligar servidor
            },
            matchHistory: Array.isArray(r.matchHistory) ? r.matchHistory : [],
            createdAt: r.createdAt || Date.now(),
            lastActivity: r.lastActivity || Date.now()
          });
        });
        console.log(`📦 ${rooms.size} sala(s) carregada(s) do disco com sucesso.`);
        return;
      }
    }

    // Migração de estado legado de versão anterior (se existir)
    if (fs.existsSync(LEGACY_FILE)) {
      const rawLegacy = fs.readFileSync(LEGACY_FILE, 'utf8');
      const legacy = JSON.parse(rawLegacy);
      const defaultId = '100001';
      rooms.set(defaultId, {
        roomId: defaultId,
        password: null,
        scoreA: Number(legacy.scoreA) || 0,
        nameA: legacy.nameA || 'LADO A',
        scoreB: Number(legacy.scoreB) || 0,
        nameB: legacy.nameB || 'LADO B',
        timer: {
          seconds: Number(legacy.timer?.seconds) || 0,
          running: false
        },
        matchHistory: Array.isArray(legacy.matchHistory) ? legacy.matchHistory : [],
        createdAt: Date.now(),
        lastActivity: Date.now()
      });
      console.log(`📦 Estado legado importado com sucesso na sala #${defaultId}.`);
      persistRoomsToDisk();
    }
  } catch (err) {
    console.warn('Aviso: Erro ao carregar persistência de salas:', err.message);
  }
}

// Salva todas as salas no disco
let saveTimeout = null;
function persistRoomsToDisk(immediate = false) {
  const doSave = () => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj = {};
      rooms.forEach((val, key) => {
        obj[key] = val;
      });
      fs.writeFileSync(ROOMS_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.warn('Erro ao salvar salas em disco:', err.message);
    }
  };

  if (immediate) {
    if (saveTimeout) clearTimeout(saveTimeout);
    doSave();
  } else {
    if (saveTimeout) return;
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      doSave();
    }, 1500);
  }
}

// Gera código aleatório único de 6 dígitos numéricos
function generateUniqueRoomCode() {
  for (let i = 0; i < 10000; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    if (!rooms.has(code)) {
      return code;
    }
  }
  return String(Date.now()).slice(-6);
}

// Inicializa persistência
loadPersistedRooms();

// Transmite estado para todos os integrantes da sala
function broadcastRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.lastActivity = Date.now();
  persistRoomsToDisk();
  io.to(roomId).emit('state:update', sanitizeRoomState(room));
}

// Loop do cronômetro sincronizado por sala no servidor
let timerSaveCounter = 0;
setInterval(() => {
  let anyRunning = false;
  rooms.forEach((room, roomId) => {
    if (room.timer && room.timer.running) {
      anyRunning = true;
      room.timer.seconds += 1;
      room.lastActivity = Date.now();
      io.to(roomId).emit('timer:tick', room.timer);
    }
  });

  if (anyRunning) {
    timerSaveCounter += 1;
    if (timerSaveCounter >= 10) {
      timerSaveCounter = 0;
      persistRoomsToDisk();
    }
  }
}, 1000);

// Rotas de Páginas
app.get('/placar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'placar.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pelada', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pelada.html'));
});

app.get('/avaliar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'avaliar.html'));
});

// API HTTP rápida para verificar se uma sala existe e se requer senha
app.get('/api/room/:roomId', (req, res) => {
  const code = String(req.params.roomId).trim();
  const exists = rooms.has(code);
  const room = rooms.get(code);
  res.json({
    exists,
    roomId: code,
    hasPassword: room ? Boolean(room.password && room.password.trim().length > 0) : false
  });
});

// ==========================================
// REST API: JOGADORES, AVALIAÇÕES E PELADA
// ==========================================

// ==========================================
// ROTAS DE AUTENTICAÇÃO E USUÁRIOS
// ==========================================

// Cadastro de novo usuário (O usuário deve ser exclusivamente e-mail)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    const cleanUsername = String(username || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanUsername)) {
      return res.status(400).json({ success: false, error: 'O usuário deve ser um e-mail válido (ex: seuemail@dominio.com).' });
    }
    const user = await db.createUser(cleanUsername, password, name, role || 'user');
    res.status(201).json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Login de usuário (O usuário deve ser exclusivamente e-mail)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const cleanUsername = String(username || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanUsername)) {
      return res.status(400).json({ success: false, error: 'O usuário deve ser um e-mail válido (ex: seuemail@dominio.com).' });
    }
    const user = await db.authenticateUser(cleanUsername, password);
    res.json({ success: true, user });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Obter dados do usuário autenticado
app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    if (!userId) {
      return res.json({ success: true, user: null });
    }
    const user = await db.getUserById(userId);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obter os votos dados pelo usuário logado para exibir e editar estrelas na tela
app.get('/api/players/my-ratings', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    if (!userId) {
      return res.json({ success: true, ratings: {} });
    }
    const ratings = await db.getUserRatingsMap(userId);
    res.json({ success: true, ratings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// ROTAS DE PELADAS (SESSÕES / GRUPOS COM ID E NOME)
// ==========================================

// Listar todas as peladas com ID, Nome e quantidade de jogadores
app.get('/api/peladas', async (req, res) => {
  try {
    const peladas = await db.getPeladas();
    res.json({ success: true, peladas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obter dados de uma pelada específica
app.get('/api/peladas/:id', async (req, res) => {
  try {
    const pelada = await db.getPeladaById(req.params.id);
    if (!pelada) {
      return res.status(404).json({ success: false, error: 'Pelada não encontrada.' });
    }
    res.json({ success: true, pelada });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cadastrar nova pelada (ID e Nome da pelada definidos pelo administrador)
app.post('/api/peladas', async (req, res) => {
  try {
    const { name, adminName } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'O nome da pelada é obrigatório.' });
    }
    const pelada = await db.createPelada(name, adminName);
    res.status(201).json({ success: true, pelada });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atualizar nome da pelada
app.put('/api/peladas/:id', async (req, res) => {
  try {
    const { name, adminName } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'O nome da pelada não pode ser vazio.' });
    }
    const pelada = await db.updatePelada(req.params.id, name, adminName);
    res.json({ success: true, pelada });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Excluir pelada
app.delete('/api/peladas/:id', async (req, res) => {
  try {
    await db.deletePelada(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// FUNCAO 1: ROTAS DE LISTA DE PRESENCA & CHECK-IN
// ==========================================
app.get('/api/peladas/:id/attendance', async (req, res) => {
  try {
    const { date } = req.query;
    const attendances = await db.getAttendance(req.params.id, date);
    res.json({ success: true, attendances });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/peladas/:id/attendance', async (req, res) => {
  try {
    const { date, userId, playerName, playerId, maxSpots } = req.body;
    const effectiveUserId = userId || req.headers['x-user-id'] || null;
    
    // Se o usuário estiver autenticado, busca seu nome oficial
    let finalName = playerName;
    if (effectiveUserId) {
      const u = await db.getUserById(effectiveUserId);
      if (u) finalName = u.name || u.username;
    }

    if (!finalName || !finalName.trim()) {
      return res.status(400).json({ success: false, error: 'O nome do atleta e obrigatorio.' });
    }

    const result = await db.toggleAttendance(
      req.params.id,
      date,
      effectiveUserId,
      finalName,
      playerId,
      maxSpots || 12
    );
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/peladas/:id/attendance/:attId', async (req, res) => {
  try {
    await db.removeAttendance(req.params.attId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// FUNCAO 3: ROTAS DE ESTATISTICAS & RANKING
// ==========================================
app.get('/api/peladas/:id/stats', async (req, res) => {
  try {
    const stats = await db.getPlayerStats(req.params.id);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// FUNCAO 5: ROTAS DE VOTACAO DE CRAQUES (MVP)
// ==========================================
app.get('/api/peladas/:id/mvp', async (req, res) => {
  try {
    const { date, userId } = req.query;
    const effectiveUserId = userId || req.headers['x-user-id'] || null;
    const mvpData = await db.getMvpVotes(req.params.id, date, effectiveUserId);
    res.json({ success: true, mvp: mvpData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/peladas/:id/mvp', async (req, res) => {
  try {
    const { date, userId, voterName, votes } = req.body;
    const effectiveUserId = userId || req.headers['x-user-id'] || null;

    if (!effectiveUserId) {
      return res.status(401).json({ success: false, error: 'Apenas usuarios autenticados podem votar no MVP.' });
    }

    const authUser = await db.getUserById(effectiveUserId);
    if (!authUser) {
      return res.status(401).json({ success: false, error: 'Usuario nao encontrado.' });
    }

    if (!votes || typeof votes !== 'object') {
      return res.status(400).json({ success: false, error: 'Votos sao obrigatorios.' });
    }

    const vote = await db.saveMvpVote(
      req.params.id,
      date,
      authUser.id,
      authUser.name || authUser.username,
      votes
    );
    res.status(201).json({ success: true, vote });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar jogadores com médias de estrelas e overall (com suporte a filtro por peladaId)
app.get('/api/players', async (req, res) => {
  try {
    const { peladaId } = req.query;
    const players = await db.getPlayersWithRatings(peladaId);
    res.json({ success: true, players });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cadastrar novo jogador vinculado a uma pelada
app.post('/api/players', async (req, res) => {
  try {
    const { name, nickname, position, photoUrl, peladaId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'O nome do jogador é obrigatório.' });
    }
    const player = await db.addPlayer(name, nickname, position, photoUrl, peladaId);
    res.status(201).json({ success: true, player });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atualizar dados de um jogador (nome, apelido, posição, foto, etc.)
app.put('/api/players/:id', async (req, res) => {
  try {
    const player = await db.updatePlayer(req.params.id, req.body);
    res.json({ success: true, player });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Remover jogador
app.delete('/api/players/:id', async (req, res) => {
  try {
    await db.deletePlayer(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obter histórico de avaliações de um jogador
app.get('/api/players/:id/ratings', async (req, res) => {
  try {
    const ratings = await db.getPlayerRatings(req.params.id);
    res.json({ success: true, ratings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Enviar ou editar avaliação de um jogador (1 voto por usuário com edição garantida)
app.post('/api/players/:id/rate', async (req, res) => {
  try {
    const { voterName, attack, defense, setPass, set_pass, movement, userId } = req.body;
    const effectiveSetPass = setPass !== undefined ? setPass : set_pass;
    const effectiveUserId = userId || req.headers['x-user-id'] || null;

    // REGRA MANDATÓRIA: Apenas usuários logados poderão avaliar outros jogadores
    if (!effectiveUserId) {
      return res.status(401).json({
        success: false,
        error: 'Apenas usuários autenticados podem avaliar outros jogadores. Por favor, faça login para registrar sua nota.'
      });
    }

    const authUser = await db.getUserById(effectiveUserId);
    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Sessão inválida ou usuário não encontrado. Por favor, faça login novamente.'
      });
    }

    if (attack === undefined || defense === undefined || effectiveSetPass === undefined || movement === undefined) {
      return res.status(400).json({ success: false, error: 'Todos os 4 atributos (Ataque, Defesa, Passe e Movimentação) devem ser avaliados.' });
    }

    const voterCleanName = authUser.name || authUser.username || voterName || 'Avaliador';

    const rating = await db.addPlayerRating(
      req.params.id,
      voterCleanName,
      attack,
      defense,
      effectiveSetPass,
      movement,
      authUser.id
    );
    res.status(201).json({ success: true, rating });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Algoritmo de Equilíbrio de Times
app.post('/api/pelada/balance', async (req, res) => {
  try {
    const { playerIds, numTeams = 2, maxPerTeam = null, peladaId = null } = req.body;
    if (!Array.isArray(playerIds) || playerIds.length < 2) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos 2 jogadores para equilibrar os times.' });
    }

    const allPlayers = await db.getPlayersWithRatings(peladaId);
    const idSet = new Set(playerIds.map(id => Number(id)));
    const selectedPlayers = allPlayers.filter(p => idSet.has(Number(p.id)));

    const result = balancer.balanceTeams(selectedPlayers, {
      numTeams: parseInt(numTeams, 10) || 2,
      maxPerTeam: maxPerTeam ? parseInt(maxPerTeam, 10) : null
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Salvar sessão/escalação de pelada
app.post('/api/pelada/save', async (req, res) => {
  try {
    const { title, format, teams, bench, peladaId } = req.body;
    const session = await db.savePeladaSession(title, format, teams, bench, peladaId);
    res.status(201).json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Buscar histórico de partidas gravadas no Banco de Dados
app.get('/api/matches', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const matches = await db.getMatches(limit);
    res.json({ success: true, matches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

io.on('connection', (socket) => {
  let currentRoomId = null;

  // Função auxiliar para obter a sala atual do socket
  const getRoom = () => {
    if (!currentRoomId) return null;
    return rooms.get(currentRoomId) || null;
  };

  // Criar uma nova sala com código de 6 dígitos e senha opcional
  socket.on('room:create', (options, callback) => {
    const newCode = generateUniqueRoomCode();
    const rawPassword = (options && options.password) ? String(options.password).trim() : null;
    const newRoom = createDefaultRoomState(newCode, rawPassword);

    if (options && typeof options === 'object') {
      if (options.nameA) newRoom.nameA = String(options.nameA).trim().slice(0, 20) || 'LADO A';
      if (options.nameB) newRoom.nameB = String(options.nameB).trim().slice(0, 20) || 'LADO B';
    }

    rooms.set(newCode, newRoom);
    persistRoomsToDisk(true);

    if (currentRoomId) {
      socket.leave(currentRoomId);
    }
    currentRoomId = newCode;
    socket.join(newCode);

    console.log(`✨ Nova sala criada: #${newCode} ${rawPassword ? '(Protegida por senha)' : '(Sem senha)'}`);
    const safeState = sanitizeRoomState(newRoom);
    if (typeof callback === 'function') {
      callback({ success: true, roomId: newCode, state: safeState });
    }
    socket.emit('state:update', safeState);
  });

  // Entrar em uma sala existente (com checagem de senha)
  socket.on('room:join', ({ roomId, password, autoCreate = false }, callback) => {
    const cleanId = String(roomId || '').replace(/\D/g, '').trim();

    if (!cleanId || cleanId.length !== 6) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'O código da sala deve ter 6 números.' });
      }
      return;
    }

    let room = rooms.get(cleanId);
    if (!room) {
      if (autoCreate) {
        room = createDefaultRoomState(cleanId, null);
        rooms.set(cleanId, room);
        persistRoomsToDisk(true);
        console.log(`✨ Sala criada por link direto: #${cleanId}`);
      } else {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Sala não encontrada. Verifique o código ou crie uma nova partida.' });
        }
        return;
      }
    }

    // Validação de senha caso a sala esteja protegida
    if (room.password) {
      const providedPwd = password ? String(password).trim() : '';
      if (!providedPwd || providedPwd !== room.password) {
        if (typeof callback === 'function') {
          callback({
            success: false,
            requiresPassword: true,
            error: providedPwd ? 'Senha incorreta. Tente novamente.' : 'Esta sala é protegida por senha. Digite a senha para entrar.'
          });
        }
        return;
      }
    }

    if (currentRoomId) {
      socket.leave(currentRoomId);
    }
    currentRoomId = cleanId;
    socket.join(cleanId);

    console.log(`👤 Dispositivo entrou na sala: #${cleanId}`);
    const safeState = sanitizeRoomState(room);
    if (typeof callback === 'function') {
      callback({ success: true, roomId: cleanId, state: safeState });
    }
    socket.emit('state:update', safeState);
  });

  // Sincronização de estado vindo de cliente que operou offline
  socket.on('room:sync', (clientState, callback) => {
    const room = getRoom();
    if (!room || !clientState || typeof clientState !== 'object') {
      if (typeof callback === 'function') callback({ success: false, error: 'Sala não encontrada ou estado inválido' });
      return;
    }

    if (typeof clientState.scoreA === 'number' && clientState.scoreA >= 0) {
      room.scoreA = Math.floor(clientState.scoreA);
    }
    if (typeof clientState.scoreB === 'number' && clientState.scoreB >= 0) {
      room.scoreB = Math.floor(clientState.scoreB);
    }
    if (clientState.nameA && typeof clientState.nameA === 'string') {
      room.nameA = clientState.nameA.trim().slice(0, 20) || 'LADO A';
    }
    if (clientState.nameB && typeof clientState.nameB === 'string') {
      room.nameB = clientState.nameB.trim().slice(0, 20) || 'LADO B';
    }
    if (clientState.timer && typeof clientState.timer === 'object') {
      if (typeof clientState.timer.seconds === 'number' && clientState.timer.seconds >= 0) {
        room.timer.seconds = Math.floor(clientState.timer.seconds);
      }
      if (typeof clientState.timer.running === 'boolean') {
        room.timer.running = clientState.timer.running;
      }
    }
    if (Array.isArray(clientState.matchHistory)) {
      room.matchHistory = clientState.matchHistory;
    }

    room.lastActivity = Date.now();
    persistRoomsToDisk(true);
    broadcastRoomState(currentRoomId);
    console.log(`🔄 Sala #${currentRoomId} sincronizada com sucesso após reconexão.`);

    if (typeof callback === 'function') {
      callback({ success: true, state: sanitizeRoomState(room) });
    }
  });

  // Aumentar ponto (+1)
  socket.on('point:add', (team) => {
    const room = getRoom();
    if (!room) return;

    if (team === 'A') room.scoreA += 1;
    if (team === 'B') room.scoreB += 1;

    socket.to(currentRoomId).emit('sound:play', { type: 'point_add' });
    broadcastRoomState(currentRoomId);
  });

  // Diminuir ponto (-1)
  socket.on('point:sub', (team) => {
    const room = getRoom();
    if (!room) return;

    let changed = false;
    if (team === 'A' && room.scoreA > 0) {
      room.scoreA -= 1;
      changed = true;
    }
    if (team === 'B' && room.scoreB > 0) {
      room.scoreB -= 1;
      changed = true;
    }

    if (changed) {
      socket.to(currentRoomId).emit('sound:play', { type: 'point_sub' });
      broadcastRoomState(currentRoomId);
    }
  });

  // Resetar placar
  socket.on('score:reset', () => {
    const room = getRoom();
    if (!room) return;

    room.scoreA = 0;
    room.scoreB = 0;
    broadcastRoomState(currentRoomId);
  });

  // Cronômetro: Iniciar / Pausar
  socket.on('timer:toggle', () => {
    const room = getRoom();
    if (!room) return;

    const wasRunning = room.timer.running;
    room.timer.running = !wasRunning;

    if (!wasRunning) {
      socket.to(currentRoomId).emit('sound:play', { type: 'whistle' });
    }
    broadcastRoomState(currentRoomId);
  });

  // Cronômetro: Reiniciar / Zerar
  socket.on('timer:restart', () => {
    const room = getRoom();
    if (!room) return;

    room.timer.seconds = 0;
    broadcastRoomState(currentRoomId);
  });

  // Encerrar Partida e salvar no Histórico da Sala
  socket.on('match:finish', () => {
    const room = getRoom();
    if (!room) return;

    let winner = 'Empate';
    if (room.scoreA > room.scoreB) winner = room.nameA;
    else if (room.scoreB > room.scoreA) winner = room.nameB;

    const matchRecord = {
      id: Date.now(),
      matchNumber: (room.matchHistory ? room.matchHistory.length : 0) + 1,
      nameA: room.nameA,
      scoreA: room.scoreA,
      nameB: room.nameB,
      scoreB: room.scoreB,
      winner: winner,
      durationSeconds: room.timer.seconds,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    if (!room.matchHistory) room.matchHistory = [];
    room.matchHistory.unshift(matchRecord);

    // Persistência no PostgreSQL / Fallback
    db.saveMatch({
      roomId: currentRoomId,
      teamA: room.nameA,
      scoreA: room.scoreA,
      teamB: room.nameB,
      scoreB: room.scoreB,
      winner: winner,
      durationSeconds: room.timer.seconds,
      matchNumber: matchRecord.matchNumber
    }).catch(err => {
      console.warn('Aviso: Falha ao salvar partida no banco de dados:', err.message);
    });

    room.scoreA = 0;
    room.scoreB = 0;
    room.timer.running = false;
    room.timer.seconds = 0;

    socket.to(currentRoomId).emit('sound:play', { type: 'whistle_final' });
    broadcastRoomState(currentRoomId);
  });

  // Limpar histórico de partidas da sala
  socket.on('history:clear', () => {
    const room = getRoom();
    if (!room) return;

    room.matchHistory = [];
    broadcastRoomState(currentRoomId);
  });

  // Atualizar nomes das equipes
  socket.on('name:update', ({ team, name }) => {
    const room = getRoom();
    if (!room) return;

    if (team === 'A') room.nameA = name.trim().slice(0, 20) || 'LADO A';
    if (team === 'B') room.nameB = name.trim().slice(0, 20) || 'LADO B';
    broadcastRoomState(currentRoomId);
  });

  // Desconexão
  socket.on('disconnect', () => {
    // Socket saiu da sala automaticamente pelo Socket.IO
  });
});

server.listen(PORT, async () => {
  console.log(`🏐 Placar de Vôlei Multi-Sessões rodando na porta ${PORT}`);
  console.log(`- Acesse: http://localhost:${PORT}`);
  console.log(`- Controle da Pelada: http://localhost:${PORT}/pelada`);
  console.log(`- Votação de Jogadores: http://localhost:${PORT}/avaliar`);
  try {
    await db.initDb();
  } catch (err) {
    console.error('Erro ao inicializar DB:', err.message);
  }
});
