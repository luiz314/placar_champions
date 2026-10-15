const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const auth = require('./auth');
const balancer = require('./balancer');
const mailer = require('./mailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

function getBaseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const MAX_ROOMS = 5000;
const ROOM_MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

// Railway fica atras de um proxy: necessario para req.ip refletir o IP real do cliente
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '3mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// SALAS DO PLACAR (MEMORIA + DISCO)
// ==========================================

function hashRoomPassword(password, salt = crypto.randomBytes(8).toString('hex')) {
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `${salt}:${hash}`;
}

function checkRoomPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt] = stored.split(':');
  const a = Buffer.from(hashRoomPassword(String(password), salt));
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cleanTeamName(value, fallback) {
  return (typeof value === 'string' ? value.trim().slice(0, 20) : '') || fallback;
}

function createDefaultRoomState(roomId, password = null) {
  return {
    roomId: String(roomId),
    passwordHash: password ? hashRoomPassword(String(password).trim()) : null,
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

// Nunca envia o hash da senha aos clientes
function sanitizeRoomState(room) {
  if (!room) return null;
  const { passwordHash, ...safeRoom } = room;
  return { ...safeRoom, hasPassword: Boolean(passwordHash) };
}

function toNonNegativeInt(value, max = 1000000) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
}

// Historico vem de clientes (sincronizacao offline): aceita apenas campos conhecidos e tipados
function sanitizeMatchHistory(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 200).filter(m => m && typeof m === 'object').map(m => ({
    id: toNonNegativeInt(m.id, Number.MAX_SAFE_INTEGER),
    matchNumber: toNonNegativeInt(m.matchNumber, 100000),
    nameA: cleanTeamName(m.nameA, 'LADO A'),
    scoreA: toNonNegativeInt(m.scoreA, 1000),
    nameB: cleanTeamName(m.nameB, 'LADO B'),
    scoreB: toNonNegativeInt(m.scoreB, 1000),
    winner: typeof m.winner === 'string' ? m.winner.trim().slice(0, 20) : 'Empate',
    durationSeconds: toNonNegativeInt(m.durationSeconds),
    time: typeof m.time === 'string' ? m.time.slice(0, 10) : ''
  }));
}

const rooms = new Map();

function loadPersistedRooms() {
  try {
    if (!fs.existsSync(ROOMS_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return;

    const now = Date.now();
    Object.entries(parsed).forEach(([id, r]) => {
      if (!/^\d{6}$/.test(id) || now - (r.lastActivity || 0) > ROOM_MAX_IDLE_MS) return;
      // Salas antigas guardavam a senha em texto puro: converte para hash ao carregar
      const passwordHash = r.passwordHash || (r.password ? hashRoomPassword(String(r.password).trim()) : null);
      rooms.set(id, {
        roomId: id,
        passwordHash,
        scoreA: toNonNegativeInt(r.scoreA),
        nameA: cleanTeamName(r.nameA, 'LADO A'),
        scoreB: toNonNegativeInt(r.scoreB),
        nameB: cleanTeamName(r.nameB, 'LADO B'),
        timer: {
          seconds: toNonNegativeInt(r.timer && r.timer.seconds),
          running: false // Sempre inicia pausado ao ligar servidor
        },
        matchHistory: sanitizeMatchHistory(r.matchHistory),
        createdAt: r.createdAt || now,
        lastActivity: r.lastActivity || now
      });
    });
    console.log(`📦 ${rooms.size} sala(s) carregada(s) do disco com sucesso.`);
    persistRoomsToDisk(true);
  } catch (err) {
    console.warn('Aviso: Erro ao carregar persistência de salas:', err.message);
  }
}

let saveTimeout = null;
function persistRoomsToDisk(immediate = false) {
  const doSave = () => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(ROOMS_FILE, JSON.stringify(Object.fromEntries(rooms), null, 2), 'utf8');
    } catch (err) {
      console.warn('Erro ao salvar salas em disco:', err.message);
    }
  };

  if (immediate) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = null;
    doSave();
  } else if (!saveTimeout) {
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      doSave();
    }, 1500);
  }
}

function generateUniqueRoomCode() {
  for (let i = 0; i < 10000; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!rooms.has(code)) return code;
  }
  return null;
}

// Remove salas paradas ha mais de 30 dias
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  rooms.forEach((room, id) => {
    if (now - room.lastActivity > ROOM_MAX_IDLE_MS) {
      rooms.delete(id);
      removed++;
    }
  });
  if (removed > 0) persistRoomsToDisk();
}, 6 * 60 * 60 * 1000).unref();

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
    if (room.timer.running) {
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

// ==========================================
// ROTAS DE PÁGINAS
// ==========================================
app.get('/placar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'placar.html')));
app.get('/login', (req, res) => res.redirect('/'));
app.get('/pelada', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pelada.html')));
app.get('/avaliar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'avaliar.html')));
app.get('/privacidade', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacidade.html')));
app.get('/politica-de-privacidade', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacidade.html')));
app.get('/termos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'termos.html')));
app.get('/termos-de-servico', (req, res) => res.sendFile(path.join(__dirname, 'public', 'termos.html')));
app.get('/termos-de-uso', (req, res) => res.sendFile(path.join(__dirname, 'public', 'termos.html')));

// ==========================================
// AUTENTICAÇÃO E PERMISSÕES (MIDDLEWARES)
// ==========================================

// Erro com status HTTP e mensagem que pode ser exibida ao usuário
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Envolve rotas async: erros de validação viram 400 com a mensagem; erros internos viram 500 genérico
function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const internal = !err.status && /^Sequelize|TypeError|ReferenceError/.test(err.name || '');
      if (internal) {
        console.error(`Erro em ${req.method} ${req.path}:`, err);
        return res.status(500).json({ success: false, error: 'Erro interno no servidor. Tente novamente.' });
      }
      res.status(err.status || 400).json({ success: false, error: err.message });
    }
  };
}

// Identifica o usuário pelo token "Authorization: Bearer <token>" (quando enviado)
app.use('/api', async (req, res, next) => {
  req.user = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const userId = auth.verifyToken(token);
  if (userId) {
    try {
      req.user = await db.getUserById(userId);
    } catch (err) {
      console.warn('Falha ao carregar usuário do token:', err.message);
    }
  }
  next();
});

function requireUser(req) {
  if (!req.user) throw httpError(401, 'Sua sessão expirou ou você não está logado. Faça login novamente.');
  return req.user;
}

// Garante que o usuário administra a pelada (dono, admin adicionado ou super admin)
async function requirePeladaAdmin(req, peladaId, { ownerOnly = false } = {}) {
  const user = requireUser(req);
  const role = await db.getPeladaRole(peladaId, user.id);
  if (!role.exists) throw httpError(404, 'Pelada não encontrada.');
  if (auth.isSuperAdmin(user)) return { ...role, isSuper: true };
  if (ownerOnly ? !role.isOwner : !role.isAdmin) {
    throw httpError(403, ownerOnly
      ? 'Apenas o criador da pelada pode fazer isso.'
      : 'Apenas administradores desta pelada podem fazer isso.');
  }
  return { ...role, isSuper: false };
}

function sessionResponse(user) {
  return { success: true, user, token: auth.issueToken(user.id) };
}

// ==========================================
// ROTAS DE AUTENTICAÇÃO E USUÁRIOS
// ==========================================

app.get('/api/auth/config', (req, res) => {
  res.json({ success: true, googleClientId: auth.GOOGLE_CLIENT_ID || null });
});

app.post('/api/auth/register', route(async (req, res) => {
  const { username, password, name, inviteToken } = req.body || {};
  const user = await db.createUser(username, password, name);

  // Se veio por um convite assinado, aceita automaticamente na pelada correspondente
  if (inviteToken) {
    const payload = auth.verifyPeladaInviteToken(inviteToken);
    if (payload && payload.pid) {
      try {
        if (payload.role === 'admin') await db.addPeladaAdmin(payload.pid, user.id);
        else await db.addPeladaMember(payload.pid, user.id, payload.role || 'votante');
      } catch (e) {
        console.warn('Aviso: Falha ao associar membro pós-registro com token de convite:', e.message);
      }
    }
  }

  res.status(201).json(sessionResponse(user));
}));

app.post('/api/auth/login', route(async (req, res) => {
  const { username, password, inviteToken } = req.body || {};
  const email = String(username || '').trim().toLowerCase();
  if (auth.isLoginBlocked(req.ip, email)) {
    throw httpError(429, 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.');
  }
  try {
    const user = await db.authenticateUser(email, password);
    auth.clearLoginFailures(req.ip, email);

    if (inviteToken) {
      const payload = auth.verifyPeladaInviteToken(inviteToken);
      if (payload && payload.pid) {
        try {
          if (payload.role === 'admin') await db.addPeladaAdmin(payload.pid, user.id);
          else await db.addPeladaMember(payload.pid, user.id, payload.role || 'votante');
        } catch (e) {}
      }
    }

    res.json(sessionResponse(user));
  } catch (err) {
    if (err.status || /^Sequelize/.test(err.name || '')) throw err;
    auth.registerLoginFailure(req.ip, email);
    throw httpError(401, err.message);
  }
}));

app.post('/api/auth/google', route(async (req, res) => {
  const { credential, inviteToken } = req.body || {};
  const profile = await auth.verifyGoogleCredential(credential);
  const user = await db.findOrCreateGoogleUser(profile);

  if (inviteToken) {
    const payload = auth.verifyPeladaInviteToken(inviteToken);
    if (payload && payload.pid) {
      try {
        if (payload.role === 'admin') await db.addPeladaAdmin(payload.pid, user.id);
        else await db.addPeladaMember(payload.pid, user.id, payload.role || 'votante');
      } catch (e) {}
    }
  }

  res.json(sessionResponse(user));
}));

app.get('/api/auth/me', (req, res) => {
  res.json({ success: true, user: req.user });
});

// Solicitar link de recuperação de senha por e-mail
app.post('/api/auth/forgot-password', route(async (req, res) => {
  const { email } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) throw httpError(400, 'Informe o e-mail cadastrado na sua conta.');

  const user = await db.getUserWithHashByEmail(cleanEmail);
  if (!user) {
    // Retorno neutro seguro para evitar enumeração de contas
    return res.json({
      success: true,
      message: 'Se este e-mail estiver cadastrado, você receberá um link de redefinição em instantes.'
    });
  }

  const token = auth.issuePasswordResetToken(user);
  const resetUrl = `${getBaseUrl(req)}/?resetToken=${token}`;

  const mailResult = await mailer.sendPasswordResetEmail({
    to: cleanEmail,
    userName: user.name || cleanEmail,
    resetUrl
  });

  res.json({
    success: true,
    message: 'Se este e-mail estiver cadastrado, você receberá um link de redefinição em instantes.',
    simulated: mailResult.simulated,
    previewUrl: mailResult.simulated ? resetUrl : undefined
  });
}));

// Redefinir senha usando token assinado recebido por e-mail
app.post('/api/auth/reset-password', route(async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token) throw httpError(400, 'Token de recuperação não fornecido.');
  if (!newPassword || String(newPassword).length < 6) {
    throw httpError(400, 'A nova senha deve ter pelo menos 6 caracteres.');
  }

  const payload = auth.verifyPasswordResetToken(token);
  if (!payload || !payload.uid) {
    throw httpError(400, 'O link de recuperação expirou ou é inválido. Solicite um novo link.');
  }

  const user = await db.getUserWithHashById(payload.uid);
  if (!user) throw httpError(404, 'Usuário não encontrado.');

  const valid = auth.verifyPasswordResetToken(token, user);
  if (!valid) {
    throw httpError(400, 'Este link de recuperação já foi utilizado ou sua senha já foi alterada.');
  }

  const updatedUser = await db.resetUserPassword(user.id, newPassword);
  res.json({
    success: true,
    message: 'Senha alterada com sucesso! Você já pode entrar com a nova senha.',
    user: updatedUser
  });
}));

// ==========================================
// ROTAS DE PELADAS (SESSÕES / GRUPOS)
// ==========================================

// Acrescenta as permissões do usuário logado em cada pelada
async function withPermissions(req, peladas) {
  const user = req.user;
  const isSuper = auth.isSuperAdmin(user);
  const managed = user ? await db.getManagedPeladaIds(user.id) : new Set();
  return peladas.map(p => ({
    ...p,
    is_owner: Boolean(user && Number(p.owner_id) === Number(user.id)),
    can_manage: isSuper || managed.has(Number(p.id)),
    can_delete: isSuper || Boolean(user && Number(p.owner_id) === Number(user.id))
  }));
}

app.get('/api/peladas', route(async (req, res) => {
  const isSuper = auth.isSuperAdmin(req.user);
  const userPeladas = await db.getPeladasForUser(req.user ? req.user.id : null, isSuper);
  const peladas = await withPermissions(req, userPeladas);
  res.json({ success: true, peladas });
}));

// Entrar em uma pelada usando código de convite
app.post('/api/peladas/join', route(async (req, res) => {
  const user = requireUser(req);
  const { inviteCode } = req.body || {};
  const pelada = await db.joinPeladaByCode(user.id, inviteCode);
  const [withPerms] = await withPermissions(req, [pelada]);
  res.json({ success: true, pelada: withPerms, message: 'Você entrou na sala com sucesso!' });
}));

app.get('/api/peladas/:id', route(async (req, res) => {
  const pelada = await db.getPeladaById(req.params.id);
  if (!pelada) throw httpError(404, 'Pelada não encontrada.');
  const [withPerms] = await withPermissions(req, [pelada]);
  res.json({ success: true, pelada: withPerms });
}));

// Role do usuário logado nesta pelada e permissão de voto
app.get('/api/peladas/:id/my-role', route(async (req, res) => {
  const user = req.user;
  if (!user) {
    return res.json({ success: true, role: 'espectador', canVote: false, isLogged: false });
  }
  const isSuper = auth.isSuperAdmin(user);
  const role = await db.getUserPeladaRole(user.id, req.params.id);
  const canVote = await db.canUserVote(user.id, req.params.id);
  res.json({ success: true, role: isSuper ? 'admin' : (role || 'espectador'), canVote, isLogged: true });
}));

// Membros e convidados da pelada (com seus papéis de votação)
app.get('/api/peladas/:id/members', route(async (req, res) => {
  const user = requireUser(req);
  const role = await db.getPeladaRole(req.params.id, user.id);
  const isSuper = auth.isSuperAdmin(user);
  if (!role.exists) throw httpError(404, 'Pelada não encontrada.');
  const membersData = await db.getPeladaMembers(req.params.id);
  res.json({ success: true, ...membersData, can_edit: role.isAdmin || isSuper });
}));

// Aceitar convite assinado por token de e-mail
app.post('/api/peladas/accept-invite', route(async (req, res) => {
  const user = requireUser(req);
  const { inviteToken } = req.body || {};
  if (!inviteToken) throw httpError(400, 'Token de convite não fornecido.');

  const payload = auth.verifyPeladaInviteToken(inviteToken);
  if (!payload || !payload.pid) {
    throw httpError(400, 'Convite inválido ou expirado.');
  }

  const pelada = await db.getPeladaById(payload.pid);
  if (!pelada) throw httpError(404, 'Pelada não encontrada.');

  if (payload.role === 'admin') {
    await db.addPeladaAdmin(pelada.id, user.id);
  } else {
    await db.addPeladaMember(pelada.id, user.id, payload.role || 'votante');
  }

  const [withPerms] = await withPermissions(req, [pelada]);
  res.json({
    success: true,
    pelada: withPerms,
    message: `Você agora faz parte da sala "${pelada.name}" como ${payload.role || 'votante'}!`
  });
}));

// Convidar/adicionar membro ou admin à pelada por e-mail com disparo automático de notificação
app.post('/api/peladas/:id/members', route(async (req, res) => {
  const adminRole = await requirePeladaAdmin(req, req.params.id);
  const { email, role = 'votante' } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw httpError(400, 'Informe um endereço de e-mail válido.');
  }

  const pelada = await db.getPeladaById(req.params.id);
  if (!pelada) throw httpError(404, 'Pelada não encontrada.');

  if (role === 'admin' && !adminRole.isOwner && !adminRole.isSuper) {
    throw httpError(403, 'Apenas o criador da pelada pode convidar administradores.');
  }

  const inviter = req.user;
  const inviteCode = pelada.invite_code || String(pelada.id);
  const target = await db.getUserByEmail(cleanEmail);

  if (target) {
    if (role === 'admin') {
      await db.addPeladaAdmin(req.params.id, target.id);
    } else {
      await db.addPeladaMember(req.params.id, target.id, role);
    }

    const inviteUrl = `${getBaseUrl(req)}/?convite=${encodeURIComponent(inviteCode)}`;

    const mailResult = await mailer.sendInviteEmail({
      to: cleanEmail,
      peladaName: pelada.name,
      peladaId: pelada.id,
      inviteCode,
      inviterName: inviter.name || inviter.username,
      role,
      inviteUrl
    });

    res.status(201).json({
      success: true,
      member: { ...target, peladaRole: role },
      emailSent: mailResult.sent,
      simulated: mailResult.simulated,
      inviteUrl,
      message: mailResult.sent
        ? `E-mail de convite enviado para ${cleanEmail}!`
        : `Membro adicionado à sala! Convite gerado para envio.`
    });
  } else {
    // Usuário ainda não cadastrado na plataforma: gera token assinado e envia convite
    const inviteToken = auth.issuePeladaInviteToken({
      peladaId: pelada.id,
      email: cleanEmail,
      role,
      inviterId: inviter.id
    });

    const inviteUrl = `${getBaseUrl(req)}/?convite=${encodeURIComponent(inviteCode)}&inviteToken=${inviteToken}&email=${encodeURIComponent(cleanEmail)}`;

    const mailResult = await mailer.sendInviteEmail({
      to: cleanEmail,
      peladaName: pelada.name,
      peladaId: pelada.id,
      inviteCode,
      inviterName: inviter.name || inviter.username,
      role,
      inviteUrl
    });

    res.status(201).json({
      success: true,
      pending: true,
      email: cleanEmail,
      role,
      emailSent: mailResult.sent,
      simulated: mailResult.simulated,
      inviteUrl,
      message: mailResult.sent
        ? `Convite enviado por e-mail para ${cleanEmail}! Assim que acessar o link, entrará na sala.`
        : `Convite gerado para ${cleanEmail}!`
    });
  }
}));

// Alterar role do membro na pelada (votante vs espectador)
app.put('/api/peladas/:id/members/:userId/role', route(async (req, res) => {
  await requirePeladaAdmin(req, req.params.id);
  const { role } = req.body || {};
  if (role !== 'votante' && role !== 'espectador') {
    throw httpError(400, 'Papel inválido. Escolha entre "votante" ou "espectador".');
  }
  await db.updatePeladaMemberRole(req.params.id, req.params.userId, role);
  res.json({ success: true, role });
}));

// Remover membro da pelada
app.delete('/api/peladas/:id/members/:userId', route(async (req, res) => {
  const user = requireUser(req);
  if (Number(req.params.userId) !== Number(user.id)) {
    await requirePeladaAdmin(req, req.params.id);
  }
  await db.removePeladaMember(req.params.id, req.params.userId);
  res.json({ success: true });
}));

app.post('/api/peladas', route(async (req, res) => {
  const user = requireUser(req);
  const pelada = await db.createPelada((req.body || {}).name, user);
  const [withPerms] = await withPermissions(req, [pelada]);
  res.status(201).json({ success: true, pelada: withPerms });
}));

app.put('/api/peladas/:id', route(async (req, res) => {
  await requirePeladaAdmin(req, req.params.id);
  const pelada = await db.updatePelada(req.params.id, (req.body || {}).name);
  const [withPerms] = await withPermissions(req, [pelada]);
  res.json({ success: true, pelada: withPerms });
}));

app.delete('/api/peladas/:id', route(async (req, res) => {
  await requirePeladaAdmin(req, req.params.id, { ownerOnly: true });
  if (Number(req.params.id) === db.DEFAULT_PELADA_ID) {
    throw httpError(400, 'A pelada padrão do placar não pode ser excluída.');
  }
  await db.deletePelada(req.params.id);
  res.json({ success: true });
}));

// Administradores da pelada: visíveis para admins; somente o criador (ou super admin) altera a lista
app.get('/api/peladas/:id/admins', route(async (req, res) => {
  const role = await requirePeladaAdmin(req, req.params.id);
  const result = await db.getPeladaAdmins(req.params.id);
  res.json({ success: true, ...result, can_edit: role.isOwner || role.isSuper });
}));

app.post('/api/peladas/:id/admins', route(async (req, res) => {
  await requirePeladaAdmin(req, req.params.id, { ownerOnly: true });
  const { email } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw httpError(400, 'Informe um endereço de e-mail válido.');
  }

  const pelada = await db.getPeladaById(req.params.id);
  if (!pelada) throw httpError(404, 'Pelada não encontrada.');

  const inviter = req.user;
  const inviteCode = pelada.invite_code || String(pelada.id);
  const target = await db.getUserByEmail(cleanEmail);

  if (target) {
    const role = await db.getPeladaRole(req.params.id, target.id);
    if (role.isOwner) throw httpError(400, 'Este usuário já é o criador da pelada.');
    await db.addPeladaAdmin(req.params.id, target.id);

    const inviteUrl = `${getBaseUrl(req)}/?convite=${encodeURIComponent(inviteCode)}`;
    const mailResult = await mailer.sendInviteEmail({
      to: cleanEmail,
      peladaName: pelada.name,
      peladaId: pelada.id,
      inviteCode,
      inviterName: inviter.name || inviter.username,
      role: 'admin',
      inviteUrl
    });

    res.status(201).json({
      success: true,
      admin: target,
      emailSent: mailResult.sent,
      simulated: mailResult.simulated,
      inviteUrl,
      message: mailResult.sent
        ? `Convite de administrador enviado para ${cleanEmail}!`
        : `Administrador adicionado com sucesso!`
    });
  } else {
    const inviteToken = auth.issuePeladaInviteToken({
      peladaId: pelada.id,
      email: cleanEmail,
      role: 'admin',
      inviterId: inviter.id
    });

    const inviteUrl = `${getBaseUrl(req)}/?convite=${encodeURIComponent(inviteCode)}&inviteToken=${inviteToken}&email=${encodeURIComponent(cleanEmail)}`;

    const mailResult = await mailer.sendInviteEmail({
      to: cleanEmail,
      peladaName: pelada.name,
      peladaId: pelada.id,
      inviteCode,
      inviterName: inviter.name || inviter.username,
      role: 'admin',
      inviteUrl
    });

    res.status(201).json({
      success: true,
      pending: true,
      email: cleanEmail,
      role: 'admin',
      emailSent: mailResult.sent,
      simulated: mailResult.simulated,
      inviteUrl,
      message: mailResult.sent
        ? `Convite de administrador enviado por e-mail para ${cleanEmail}!`
        : `Convite de administrador gerado para ${cleanEmail}!`
    });
  }
}));

app.delete('/api/peladas/:id/admins/:userId', route(async (req, res) => {
  const user = requireUser(req);
  // Um admin pode sair por conta própria; remover outra pessoa exige ser o criador
  if (Number(req.params.userId) !== Number(user.id)) {
    await requirePeladaAdmin(req, req.params.id, { ownerOnly: true });
  }
  await db.removePeladaAdmin(req.params.id, req.params.userId);
  res.json({ success: true });
}));

// ==========================================
// LISTA DE PRESENÇA & CHECK-IN
// ==========================================
app.get('/api/peladas/:id/attendance', route(async (req, res) => {
  const attendances = await db.getAttendance(req.params.id, req.query.date);
  res.json({ success: true, attendances });
}));

app.post('/api/peladas/:id/attendance', route(async (req, res) => {
  const user = requireUser(req);
  const { date, playerId, maxSpots } = req.body || {};

  let result;
  if (playerId) {
    // Adicionar/remover outro atleta da lista é tarefa do administrador da pelada
    await requirePeladaAdmin(req, req.params.id);
    const player = await db.getPlayerById(playerId);
    if (!player || Number(player.pelada_id) !== Number(req.params.id)) {
      throw httpError(404, 'Jogador não encontrado nesta pelada.');
    }
    result = await db.toggleAttendance(req.params.id, date, null, player.name, player.id, maxSpots);
  } else {
    const role = await db.getPeladaRole(req.params.id, user.id);
    if (!role.exists) throw httpError(404, 'Pelada não encontrada.');
    result = await db.toggleAttendance(req.params.id, date, user.id, user.name || user.username, null, maxSpots);
  }
  res.json({ success: true, result });
}));

app.delete('/api/peladas/:id/attendance/:attId', route(async (req, res) => {
  const user = requireUser(req);
  const record = await db.getAttendanceById(req.params.attId);
  if (!record || Number(record.peladaId) !== Number(req.params.id)) {
    throw httpError(404, 'Registro de presença não encontrado.');
  }
  if (Number(record.userId) !== Number(user.id)) {
    await requirePeladaAdmin(req, req.params.id);
  }
  await db.removeAttendance(record.id);
  res.json({ success: true });
}));

// ==========================================
// ESTATÍSTICAS, RANKING E MVP
// ==========================================
app.get('/api/peladas/:id/stats', route(async (req, res) => {
  const stats = await db.getPlayerStats(req.params.id);
  res.json({ success: true, stats });
}));

app.get('/api/peladas/:id/mvp', route(async (req, res) => {
  const mvp = await db.getMvpVotes(req.params.id, req.query.date, req.user ? req.user.id : null);
  res.json({ success: true, mvp });
}));

app.post('/api/peladas/:id/mvp', route(async (req, res) => {
  const user = requireUser(req);
  const canVote = await db.canUserVote(user.id, req.params.id);
  if (!canVote) {
    throw httpError(403, 'Você não possui permissão para votar no MVP desta pelada (seu papel atual é Espectador ou você não é membro desta sala).');
  }
  const { date, votes } = req.body || {};
  if (!votes || typeof votes !== 'object') throw httpError(400, 'Votos sao obrigatorios.');
  const vote = await db.saveMvpVote(req.params.id, date, user.id, user.name || user.username, votes);
  res.status(201).json({ success: true, vote });
}));

// ==========================================
// JOGADORES E AVALIAÇÕES
// ==========================================
app.get('/api/players', route(async (req, res) => {
  const players = await db.getPlayersWithRatings(req.query.peladaId);
  res.json({ success: true, players });
}));

// Votos dados pelo usuário logado (para exibir e editar as estrelas na tela)
app.get('/api/players/my-ratings', route(async (req, res) => {
  const user = requireUser(req);
  const ratings = await db.getUserRatingsMap(user.id);
  res.json({ success: true, ratings });
}));

app.post('/api/players', route(async (req, res) => {
  const { name, nickname, position, photoUrl, peladaId } = req.body || {};
  await requirePeladaAdmin(req, peladaId);
  const player = await db.addPlayer({ name, nickname, position, photoUrl }, peladaId);
  res.status(201).json({ success: true, player });
}));

async function requirePlayerAdmin(req, playerId) {
  const player = await db.getPlayerById(playerId);
  if (!player) throw httpError(404, 'Jogador não encontrado.');
  await requirePeladaAdmin(req, player.pelada_id);
  return player;
}

app.put('/api/players/:id', route(async (req, res) => {
  await requirePlayerAdmin(req, req.params.id);
  const { name, nickname, position, photoUrl, photo_url } = req.body || {};
  const player = await db.updatePlayer(req.params.id, { name, nickname, position, photoUrl, photo_url });
  res.json({ success: true, player });
}));

app.delete('/api/players/:id', route(async (req, res) => {
  await requirePlayerAdmin(req, req.params.id);
  await db.deletePlayer(req.params.id);
  res.json({ success: true });
}));

// Enviar ou editar avaliação (1 voto por usuário, sempre editável, protegido por role de votante)
app.post('/api/players/:id/rate', route(async (req, res) => {
  const user = requireUser(req);
  const { attack, defense, setPass, set_pass, movement } = req.body || {};
  const effectiveSetPass = setPass !== undefined ? setPass : set_pass;
  if (attack === undefined || defense === undefined || effectiveSetPass === undefined || movement === undefined) {
    throw httpError(400, 'Todos os 4 atributos (Ataque, Defesa, Passe e Movimentação) devem ser avaliados.');
  }
  const player = await db.getPlayerById(req.params.id);
  if (!player) throw httpError(404, 'Jogador não encontrado.');

  const canVote = await db.canUserVote(user.id, player.pelada_id);
  if (!canVote) {
    throw httpError(403, 'Você não possui permissão para votar nesta pelada (seu papel atual é Espectador ou você não foi convidado para esta sala). Solicite permissão de Votante ao administrador.');
  }

  const rating = await db.addPlayerRating(
    player.id,
    user.name || user.username,
    attack,
    defense,
    effectiveSetPass,
    movement,
    user.id
  );
  res.status(201).json({ success: true, rating });
}));

// Algoritmo de Equilíbrio de Times
app.post('/api/pelada/balance', route(async (req, res) => {
  requireUser(req);
  const { playerIds, numTeams = 2, maxPerTeam = null, peladaId = null } = req.body || {};
  if (!Array.isArray(playerIds) || playerIds.length < 2) {
    throw httpError(400, 'Selecione pelo menos 2 jogadores para equilibrar os times.');
  }

  const allPlayers = await db.getPlayersWithRatings(peladaId);
  const idSet = new Set(playerIds.map(id => Number(id)));
  const selectedPlayers = allPlayers.filter(p => idSet.has(Number(p.id)));

  const result = balancer.balanceTeams(selectedPlayers, {
    numTeams: parseInt(numTeams, 10) || 2,
    maxPerTeam: maxPerTeam ? parseInt(maxPerTeam, 10) : null
  });

  res.json({ success: true, ...result });
}));

// Histórico de partidas gravadas no banco
app.get('/api/matches', route(async (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const matches = await db.getMatches(limit);
  res.json({ success: true, matches });
}));

// Status do banco: resumo público; detalhes de conexão apenas para super admin
app.get('/api/db-status', (req, res) => {
  res.json(db.getDbStatus(auth.isSuperAdmin(req.user)));
});

// Verifica se uma sala do placar existe e se requer senha
app.get('/api/room/:roomId', (req, res) => {
  const code = String(req.params.roomId).trim();
  const room = rooms.get(code);
  res.json({ exists: Boolean(room), roomId: code, hasPassword: Boolean(room && room.passwordHash) });
});

// ==========================================
// SOCKET.IO: PLACAR EM TEMPO REAL
// ==========================================
io.on('connection', (socket) => {
  let currentRoomId = null;

  const getRoom = () => (currentRoomId ? rooms.get(currentRoomId) || null : null);

  // Protege o servidor contra payloads inesperados: um erro num handler não pode derrubar o processo
  const on = (event, handler) => {
    socket.on(event, (...args) => {
      try {
        handler(...args);
      } catch (err) {
        console.warn(`Evento ${event} ignorado por erro:`, err.message);
      }
    });
  };

  const reply = (callback, payload) => {
    if (typeof callback === 'function') callback(payload);
  };

  const joinSocketRoom = (roomId) => {
    if (currentRoomId) socket.leave(currentRoomId);
    currentRoomId = roomId;
    socket.join(roomId);
  };

  on('room:create', (options, callback) => {
    const opts = options && typeof options === 'object' ? options : {};
    if (rooms.size >= MAX_ROOMS) return reply(callback, { success: false, error: 'Limite de salas atingido. Tente mais tarde.' });
    const newCode = generateUniqueRoomCode();
    if (!newCode) return reply(callback, { success: false, error: 'Não foi possível gerar um código de sala.' });

    const rawPassword = typeof opts.password === 'string' && opts.password.trim() ? opts.password.trim().slice(0, 50) : null;
    const newRoom = createDefaultRoomState(newCode, rawPassword);
    newRoom.nameA = cleanTeamName(opts.nameA, 'LADO A');
    newRoom.nameB = cleanTeamName(opts.nameB, 'LADO B');

    rooms.set(newCode, newRoom);
    persistRoomsToDisk(true);
    joinSocketRoom(newCode);

    console.log(`✨ Nova sala criada: #${newCode} ${rawPassword ? '(Protegida por senha)' : '(Sem senha)'}`);
    const safeState = sanitizeRoomState(newRoom);
    reply(callback, { success: true, roomId: newCode, state: safeState });
    socket.emit('state:update', safeState);
  });

  on('room:join', (payload, callback) => {
    const { roomId, password, autoCreate = false } = payload && typeof payload === 'object' ? payload : {};
    const cleanId = String(roomId || '').replace(/\D/g, '');

    if (cleanId.length !== 6) {
      return reply(callback, { success: false, error: 'O código da sala deve ter 6 números.' });
    }

    let room = rooms.get(cleanId);
    if (!room) {
      if (!autoCreate || rooms.size >= MAX_ROOMS) {
        return reply(callback, { success: false, error: 'Sala não encontrada. Verifique o código ou crie uma nova partida.' });
      }
      room = createDefaultRoomState(cleanId, null);
      rooms.set(cleanId, room);
      persistRoomsToDisk(true);
      console.log(`✨ Sala criada por link direto: #${cleanId}`);
    }

    if (room.passwordHash) {
      const providedPwd = typeof password === 'string' ? password.trim() : '';
      if (!providedPwd || !checkRoomPassword(providedPwd, room.passwordHash)) {
        return reply(callback, {
          success: false,
          requiresPassword: true,
          error: providedPwd ? 'Senha incorreta. Tente novamente.' : 'Esta sala é protegida por senha. Digite a senha para entrar.'
        });
      }
    }

    joinSocketRoom(cleanId);
    const safeState = sanitizeRoomState(room);
    reply(callback, { success: true, roomId: cleanId, state: safeState });
    socket.emit('state:update', safeState);
  });

  // Sincronização de estado vindo de cliente que operou offline
  on('room:sync', (clientState, callback) => {
    const room = getRoom();
    if (!room || !clientState || typeof clientState !== 'object') {
      return reply(callback, { success: false, error: 'Sala não encontrada ou estado inválido' });
    }

    if (typeof clientState.scoreA === 'number') room.scoreA = toNonNegativeInt(clientState.scoreA, 1000);
    if (typeof clientState.scoreB === 'number') room.scoreB = toNonNegativeInt(clientState.scoreB, 1000);
    if (typeof clientState.nameA === 'string') room.nameA = cleanTeamName(clientState.nameA, 'LADO A');
    if (typeof clientState.nameB === 'string') room.nameB = cleanTeamName(clientState.nameB, 'LADO B');
    if (clientState.timer && typeof clientState.timer === 'object') {
      if (typeof clientState.timer.seconds === 'number') room.timer.seconds = toNonNegativeInt(clientState.timer.seconds);
      if (typeof clientState.timer.running === 'boolean') room.timer.running = clientState.timer.running;
    }
    if (Array.isArray(clientState.matchHistory)) {
      room.matchHistory = sanitizeMatchHistory(clientState.matchHistory);
    }

    persistRoomsToDisk(true);
    broadcastRoomState(currentRoomId);
    reply(callback, { success: true, state: sanitizeRoomState(room) });
  });

  on('point:add', (team) => {
    const room = getRoom();
    if (!room) return;

    if (team === 'A' && room.scoreA < 1000) room.scoreA += 1;
    else if (team === 'B' && room.scoreB < 1000) room.scoreB += 1;
    else return;

    socket.to(currentRoomId).emit('sound:play', { type: 'point_add' });
    broadcastRoomState(currentRoomId);
  });

  on('point:sub', (team) => {
    const room = getRoom();
    if (!room) return;

    if (team === 'A' && room.scoreA > 0) room.scoreA -= 1;
    else if (team === 'B' && room.scoreB > 0) room.scoreB -= 1;
    else return;

    socket.to(currentRoomId).emit('sound:play', { type: 'point_sub' });
    broadcastRoomState(currentRoomId);
  });

  on('score:reset', () => {
    const room = getRoom();
    if (!room) return;
    room.scoreA = 0;
    room.scoreB = 0;
    broadcastRoomState(currentRoomId);
  });

  on('timer:toggle', () => {
    const room = getRoom();
    if (!room) return;

    const wasRunning = room.timer.running;
    room.timer.running = !wasRunning;
    if (!wasRunning) {
      socket.to(currentRoomId).emit('sound:play', { type: 'whistle' });
    }
    broadcastRoomState(currentRoomId);
  });

  on('timer:restart', () => {
    const room = getRoom();
    if (!room) return;
    room.timer.seconds = 0;
    broadcastRoomState(currentRoomId);
  });

  // Encerrar partida e salvar no histórico da sala
  on('match:finish', () => {
    const room = getRoom();
    if (!room) return;

    let winner = 'Empate';
    if (room.scoreA > room.scoreB) winner = room.nameA;
    else if (room.scoreB > room.scoreA) winner = room.nameB;

    const matchRecord = {
      id: Date.now(),
      matchNumber: room.matchHistory.length + 1,
      nameA: room.nameA,
      scoreA: room.scoreA,
      nameB: room.nameB,
      scoreB: room.scoreB,
      winner,
      durationSeconds: room.timer.seconds,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    };
    room.matchHistory.unshift(matchRecord);
    room.matchHistory = room.matchHistory.slice(0, 200);

    db.saveMatch({
      roomId: currentRoomId,
      teamA: room.nameA,
      scoreA: room.scoreA,
      teamB: room.nameB,
      scoreB: room.scoreB,
      winner,
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

  on('history:clear', () => {
    const room = getRoom();
    if (!room) return;
    room.matchHistory = [];
    broadcastRoomState(currentRoomId);
  });

  on('name:update', (payload) => {
    const room = getRoom();
    if (!room || !payload || typeof payload !== 'object') return;

    if (payload.team === 'A') room.nameA = cleanTeamName(payload.name, 'LADO A');
    else if (payload.team === 'B') room.nameB = cleanTeamName(payload.name, 'LADO B');
    else return;
    broadcastRoomState(currentRoomId);
  });
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
async function start() {
  loadPersistedRooms();
  await db.initDb();
  auth.setTokenSecret(await db.getAuthSecret());

  server.listen(PORT, () => {
    console.log(`🏐 Placar de Vôlei Multi-Sessões rodando na porta ${PORT}`);
    console.log(`- Acesse: http://localhost:${PORT}`);
    console.log(`- Login com Google: ${auth.GOOGLE_CLIENT_ID ? 'ativado' : 'desativado (defina GOOGLE_CLIENT_ID)'}`);
  });
}

start().catch(err => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
