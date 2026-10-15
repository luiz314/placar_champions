const crypto = require('crypto');
const { Sequelize, DataTypes, Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { hashPassword, verifyPassword, isSuperAdmin } = require('./auth');

const DATA_DIR = path.join(__dirname, 'data');
const FALLBACK_DB_FILE = path.join(DATA_DIR, 'db_fallback.json');

// Pesos para o calculo da Media Ponderada
const DEFAULT_WEIGHTS = {
  attack: 1.0,
  defense: 1.0,
  set_pass: 1.0,
  movement: 1.0
};

function calculateOverall(attack, defense, set_pass, movement, weights = DEFAULT_WEIGHTS) {
  const wA = weights.attack || 1.0;
  const wD = weights.defense || 1.0;
  const wP = weights.set_pass || 1.0;
  const wM = weights.movement || 1.0;
  const totalWeight = wA + wD + wP + wM;
  const weightedSum = (attack * wA) + (defense * wD) + (set_pass * wP) + (movement * wM);
  return Number((weightedSum / totalWeight).toFixed(2));
}

let sequelize = null;
let Match = null;
let User = null;
let Pelada = null;
let Player = null;
let PlayerRating = null;
let PeladaAdmin = null;
let PeladaMember = null;
let AppSetting = null;
let Attendance = null;
let MvpVote = null;
// Fica true somente depois que initDb() autentica e sincroniza o PostgreSQL
let isPostgres = false;

// Pelada padrao usada pelo placar quando nenhuma sala foi escolhida
const DEFAULT_PELADA_ID = 733849;


// Detecta qualquer variavel de conexao PostgreSQL suportada pelo Railway e outros provedores
function getDatabaseUrl() {
  const directKeys = [
    'DATABASE_URL',
    'DATABASE_PRIVATE_URL',
    'DATABASE_PUBLIC_URL',
    'POSTGRES_URL',
    'POSTGRESQL_URL',
    'DB_URL',
    'DB_URI',
    'DATABASE_URI',
    'POSTGRES_URI',
    'POSTGRES_DATABASE_URL',
    'postgres',
    'POSTGRES'
  ];

  for (const k of directKeys) {
    if (process.env[k]) return process.env[k];
  }

  // Auto-detecta qualquer variavel de ambiente que contenha string de conexao postgresql:// ou postgres://
  for (const [key, val] of Object.entries(process.env)) {
    if (typeof val === 'string' && (val.startsWith('postgres://') || val.startsWith('postgresql://'))) {
      console.log(`Auto-detectada conexao PostgreSQL na variavel: ${key}`);
      return val;
    }
  }

  if (process.env.PGHOST) {
    const user = process.env.PGUSER || 'postgres';
    const pass = process.env.PGPASSWORD ? encodeURIComponent(process.env.PGPASSWORD) : '';
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || 5432;
    const dbName = process.env.PGDATABASE || 'railway';
    return `postgresql://${user}:${pass}@${host}:${port}/${dbName}`;
  }
  return null;
}

const dbUrl = getDatabaseUrl();
let dbConnectionError = null;

// Inicializa Sequelize se URL de conexao estiver configurada
if (dbUrl) {
  try {
    const isInternal = dbUrl.includes('.railway.internal') || dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    const needsSsl = !isInternal && (
      process.env.NODE_ENV === 'production' || 
      dbUrl.includes('.railway.app') || 
      dbUrl.includes('postgres.') || 
      dbUrl.includes('sslmode=require') || 
      process.env.DB_SSL === 'true'
    );

    sequelize = new Sequelize(dbUrl, {
      dialect: 'postgres',
      dialectOptions: needsSsl ? {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      } : {},
      logging: false
    });

    // ==========================================
    // DEFINICAO DOS MODELOS AUTONOMOS (SEQUELIZE)
    // ==========================================

    // Modelo de Usuarios (Admin e Votantes)
    User = sequelize.define('User', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(60), unique: true, allowNull: false },
      // Nulo para contas criadas exclusivamente pelo login com Google
      passwordHash: { type: DataTypes.STRING(255), allowNull: true },
      googleId: { type: DataTypes.STRING(64), unique: true, allowNull: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      // Coluna legada: o papel efetivo agora vem de SUPER_ADMIN_EMAILS e dos admins de cada pelada
      role: { type: DataTypes.STRING(20), defaultValue: 'user' }
    }, {
      tableName: 'users',
      timestamps: true,
      underscored: true
    });

    // Modelo de Partidas
    Match = sequelize.define('Match', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      roomId: { type: DataTypes.STRING, defaultValue: 'DEFAULT' },
      peladaId: { type: DataTypes.INTEGER, defaultValue: DEFAULT_PELADA_ID },
      teamA: { type: DataTypes.STRING, defaultValue: 'LADO A' },
      scoreA: { type: DataTypes.INTEGER, defaultValue: 0 },
      teamB: { type: DataTypes.STRING, defaultValue: 'LADO B' },
      scoreB: { type: DataTypes.INTEGER, defaultValue: 0 },
      winner: { type: DataTypes.STRING, defaultValue: 'Empate' },
      teamAPlayers: { type: DataTypes.TEXT, allowNull: true },
      teamBPlayers: { type: DataTypes.TEXT, allowNull: true },
      durationSeconds: { type: DataTypes.INTEGER, defaultValue: 0 },
      matchNumber: { type: DataTypes.INTEGER, defaultValue: 1 }
    }, {
      tableName: 'matches',
      timestamps: true,
      underscored: true
    });

    // Modelo de Peladas / Sessoes
    Pelada = sequelize.define('Pelada', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false, defaultValue: 'Pelada Principal' },
      // Nome exibido do criador (informativo); a permissao real vem de ownerId e pelada_admins
      adminName: { type: DataTypes.STRING(100), defaultValue: 'Administrador' },
      ownerId: { type: DataTypes.INTEGER, allowNull: true },
      inviteCode: { type: DataTypes.STRING(32), allowNull: true }
    }, {
      tableName: 'peladas',
      timestamps: true,
      underscored: true
    });

    // Administradores adicionais de cada pelada (alem do criador)
    PeladaAdmin = sequelize.define('PeladaAdmin', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      peladaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'peladas', key: 'id' },
        onDelete: 'CASCADE'
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      }
    }, {
      tableName: 'pelada_admins',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['pelada_id', 'user_id'] }]
    });

    // Membros/convidados da pelada com roles de votacao ('votante' ou 'espectador')
    PeladaMember = sequelize.define('PeladaMember', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      peladaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'peladas', key: 'id' },
        onDelete: 'CASCADE'
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      role: {
        type: DataTypes.STRING(30),
        defaultValue: 'votante' // 'votante' ou 'espectador'
      }
    }, {
      tableName: 'pelada_members',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['pelada_id', 'user_id'] }]
    });

    // Configuracoes internas persistentes (ex: segredo dos tokens de sessao)
    AppSetting = sequelize.define('AppSetting', {
      key: { type: DataTypes.STRING(60), primaryKey: true },
      value: { type: DataTypes.TEXT, allowNull: false }
    }, {
      tableName: 'app_settings',
      timestamps: true,
      underscored: true
    });

    // Modelo de Jogadores
    Player = sequelize.define('Player', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      peladaId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'peladas', key: 'id' },
        onDelete: 'CASCADE'
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      nickname: { type: DataTypes.STRING(50) },
      position: { type: DataTypes.STRING(50), defaultValue: 'Geral' },
      photoUrl: { type: DataTypes.TEXT },
      isMonthly: { type: DataTypes.BOOLEAN, defaultValue: true },
      active: { type: DataTypes.BOOLEAN, defaultValue: true }
    }, {
      tableName: 'players',
      timestamps: true,
      underscored: true
    });

    // Modelo de Avaliacoes com Estrelas (1 a 5)
    PlayerRating = sequelize.define('PlayerRating', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      playerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'players', key: 'id' },
        onDelete: 'CASCADE'
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      voterName: { type: DataTypes.STRING(100), defaultValue: 'Anonimo' },
      attack: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 3.0 },
      defense: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 3.0 },
      setPass: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 3.0 },
      movement: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 3.0 },
      overall: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 3.0 }
    }, {
      tableName: 'player_ratings',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['player_id', 'user_id'] }]
    });

    // Modelo de Lista de Presenca (Attendance)
    Attendance = sequelize.define('Attendance', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      peladaId: { type: DataTypes.INTEGER }, // Sem defaultValue: o Sequelize gera SQL invalido ao alterar coluna com default + FK
      date: { type: DataTypes.STRING(20), allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: true },
      playerId: { type: DataTypes.INTEGER, allowNull: true },
      playerName: { type: DataTypes.STRING(100), allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'confirmed' } // 'confirmed' ou 'waitlist'
    }, {
      tableName: 'attendances',
      timestamps: true,
      underscored: true
    });

    // Modelo de Votacao de Craques da Rodada (MVP)
    MvpVote = sequelize.define('MvpVote', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      peladaId: { type: DataTypes.INTEGER }, // Sem defaultValue (ver Attendance)
      date: { type: DataTypes.STRING(20), allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      voterName: { type: DataTypes.STRING(100), defaultValue: 'Atleta' },
      mvpPlayerId: { type: DataTypes.INTEGER, allowNull: true },
      defensePlayerId: { type: DataTypes.INTEGER, allowNull: true },
      passPlayerId: { type: DataTypes.INTEGER, allowNull: true },
      funnyPlayerId: { type: DataTypes.INTEGER, allowNull: true }
    }, {
      tableName: 'mvp_votes',
      timestamps: true,
      underscored: true
    });

    // Relacoes
    Pelada.hasMany(Player, { foreignKey: 'peladaId', as: 'players', onDelete: 'CASCADE' });
    Player.belongsTo(Pelada, { foreignKey: 'peladaId', as: 'pelada' });
    Player.hasMany(PlayerRating, { foreignKey: 'playerId', as: 'ratings', onDelete: 'CASCADE' });
    PlayerRating.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });
    User.hasMany(PlayerRating, { foreignKey: 'userId', as: 'ratings', onDelete: 'SET NULL' });
    PlayerRating.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    Pelada.hasMany(Attendance, { foreignKey: 'peladaId', as: 'attendances' });
    Attendance.belongsTo(Pelada, { foreignKey: 'peladaId', as: 'pelada' });
    Pelada.hasMany(MvpVote, { foreignKey: 'peladaId', as: 'mvpVotes' });
    MvpVote.belongsTo(Pelada, { foreignKey: 'peladaId', as: 'pelada' });
    Pelada.hasMany(PeladaAdmin, { foreignKey: 'peladaId', as: 'admins', onDelete: 'CASCADE' });
    PeladaAdmin.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    Pelada.hasMany(PeladaMember, { foreignKey: 'peladaId', as: 'members', onDelete: 'CASCADE' });
    PeladaMember.belongsTo(Pelada, { foreignKey: 'peladaId', as: 'pelada' });
    PeladaMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    User.hasMany(PeladaMember, { foreignKey: 'userId', as: 'memberships', onDelete: 'CASCADE' });

    console.log('Sequelize ORM configurado com PostgreSQL (Railway).');
  } catch (err) {
    console.error('Erro ao inicializar Sequelize com PostgreSQL:', err.message);
    dbConnectionError = err.message;
    isPostgres = false;
  }
} else {
  console.log('Nenhuma variavel DATABASE_URL/POSTGRES_URL detectada. Modo fallback para JSON local ativo (data/db_fallback.json).');
}

const INITIAL_PELADA_PLAYERS = [
  'Aline',
  'Airton',
  'Adriel',
  'Murilo',
  'Lucas',
  'Rodrigo',
  'Roberta',
  'Luiz',
  'Thomas',
  'Noelle',
  'Evaldo',
  'Bia'
];

// Helper para banco de dados fallback local JSON (uso em desenvolvimento local, sem PostgreSQL)
function createInitialFallbackData() {
  const now = new Date().toISOString();
  return {
    users: [],
    peladas: [{ id: DEFAULT_PELADA_ID, name: 'Sala 733849', admin_name: 'Administrador', owner_id: null, invite_code: '733849', created_at: now }],
    pelada_admins: [],
    pelada_members: [],
    matches: [],
    players: INITIAL_PELADA_PLAYERS.map((name, idx) => ({
      id: idx + 1,
      pelada_id: DEFAULT_PELADA_ID,
      name,
      nickname: name,
      position: 'Geral',
      photo_url: '',
      active: true,
      created_at: now
    })),
    player_ratings: [],
    attendances: [],
    mvp_votes: [],
    settings: {}
  };
}

function getFallbackData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(FALLBACK_DB_FILE)) {
    const initial = createInitialFallbackData();
    saveFallbackData(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(FALLBACK_DB_FILE, 'utf8'));
    const defaults = createInitialFallbackData();
    // Garante que todas as colecoes existam sem sobrescrever dados existentes
    ['users', 'peladas', 'pelada_admins', 'pelada_members', 'matches', 'players', 'player_ratings', 'attendances', 'mvp_votes'].forEach(k => {
      if (!Array.isArray(parsed[k])) parsed[k] = defaults[k];
    });
    if (!parsed.settings || typeof parsed.settings !== 'object') parsed.settings = {};
    return parsed;
  } catch (err) {
    console.error('Erro ao ler fallback db, usando estrutura vazia:', err.message);
    return createInitialFallbackData();
  }
}

function saveFallbackData(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(FALLBACK_DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar fallback db:', err.message);
  }
}

function nextFallbackId(list) {
  return list.length > 0 ? Math.max(...list.map(item => Number(item.id) || 0)) + 1 : 1;
}

// ==========================================
// SINCRONIZACAO AUTOMATICA E AUTONOMA DO ESQUEMA
// ==========================================
async function initDb() {
  if (!sequelize) {
    getFallbackData(); // Garante inicializacao do fallback
    return;
  }

  try {
    console.log('Tentando conectar ao PostgreSQL...');
    try {
      await sequelize.authenticate();
      console.log('Conexao com PostgreSQL autenticada com sucesso!');
    } catch (authErr) {
      console.warn('Falha na tentativa inicial com SSL:', authErr.message);
      if (sequelize.options && sequelize.options.dialectOptions && sequelize.options.dialectOptions.ssl) {
        console.log('Tentando reconectar sem SSL (modo rede interna Railway)...');
        sequelize.options.dialectOptions = {};
        await sequelize.authenticate();
        console.log('Conexao sem SSL autenticada com sucesso!');
      } else {
        throw authErr;
      }
    }
  } catch (err) {
    dbConnectionError = err.message;
    console.error('Nao foi possivel conectar ao PostgreSQL. Usando fallback JSON:', err.message);
    getFallbackData();
    return;
  }

  // Conectado: os dados ficam no PostgreSQL mesmo que algum ajuste de esquema falhe,
  // para nunca alternar silenciosamente para o JSON local (o que pareceria "apagar" os dados).
  isPostgres = true;
  try {
    console.log('Executando sincronizacao autonoma do banco (Sequelize auto-alter)...');
    await sequelize.sync({ alter: true });
    console.log('Banco de dados PostgreSQL 100% sincronizado com sucesso!');

    // Garante a pelada padrao do placar; os jogadores iniciais so sao criados junto com ela
    const defaultPelada = await Pelada.findByPk(DEFAULT_PELADA_ID);
    if (!defaultPelada) {
      await Pelada.create({ id: DEFAULT_PELADA_ID, name: 'Sala 733849', adminName: 'Administrador' });
      await Player.bulkCreate(INITIAL_PELADA_PLAYERS.map(name => ({
        peladaId: DEFAULT_PELADA_ID,
        name,
        nickname: name,
        position: 'Geral',
        active: true
      })));
      console.log(`Pelada padrao #${DEFAULT_PELADA_ID} criada com os jogadores iniciais.`);
    }

    await migratePeladaOwners();
    await sequelize.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS is_monthly BOOLEAN DEFAULT TRUE;').catch(() => {});
    await sequelize.query(`
      DELETE FROM player_ratings a USING player_ratings b
      WHERE a.id < b.id AND a.player_id = b.player_id AND a.user_id = b.user_id AND a.user_id IS NOT NULL;
    `).catch(() => {});
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS player_ratings_player_user_unique ON player_ratings (player_id, user_id) WHERE user_id IS NOT NULL;').catch(() => {});
  } catch (err) {
    dbConnectionError = err.message;
    console.error('ERRO na sincronizacao do esquema PostgreSQL (o app segue usando o PostgreSQL):', err.message);
  }
}

// Peladas criadas antes do controle de dono guardavam apenas o nome/e-mail do criador em adminName.
// Quando esse texto identifica um unico usuario (e-mail ou nome exato), ele passa a ser o dono.
async function migratePeladaOwners() {
  const orphans = await Pelada.findAll({ where: { ownerId: null } });
  if (orphans.length === 0) return;

  const users = (await User.findAll({ attributes: ['id', 'username', 'name'] })).map(u => u.toJSON());
  for (const pelada of orphans) {
    const ref = String(pelada.adminName || '').trim().toLowerCase();
    if (!ref) continue;
    let matches = users.filter(u => u.username.toLowerCase() === ref);
    if (matches.length === 0) matches = users.filter(u => String(u.name || '').trim().toLowerCase() === ref);
    if (matches.length === 1) {
      pelada.ownerId = matches[0].id;
      await pelada.save();
      console.log(`Pelada #${pelada.id}: dono definido como ${matches[0].username}.`);
    }
  }
}

// ==========================================
// CONFIGURACOES INTERNAS PERSISTENTES
// ==========================================
async function getOrCreateSetting(key, generate) {
  if (isPostgres && AppSetting) {
    const existing = await AppSetting.findByPk(key);
    if (existing) return existing.value;
    const value = generate();
    const [row] = await AppSetting.findOrCreate({ where: { key }, defaults: { value } });
    return row.value;
  }

  const data = getFallbackData();
  if (!data.settings[key]) {
    data.settings[key] = generate();
    saveFallbackData(data);
  }
  return data.settings[key];
}

async function getAuthSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  return getOrCreateSetting('auth_secret', () => crypto.randomBytes(48).toString('hex'));
}


// ==========================================
// METODOS DE AUTENTICACAO & USUARIOS
// ==========================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

// Formato publico do usuario enviado ao navegador (nunca inclui hash de senha)
function toPublicUser(raw) {
  if (!raw) return null;
  const user = { id: Number(raw.id), username: raw.username, name: raw.name };
  user.role = isSuperAdmin(user) ? 'admin' : 'user';
  return user;
}

async function createUser(username, password, name) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanName = String(name || '').trim().slice(0, 100);

  if (!cleanUsername || !EMAIL_REGEX.test(cleanUsername) || cleanUsername.length > 60) {
    throw new Error('O usuário deve ser um e-mail válido.');
  }
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (!cleanName) {
    throw new Error('O nome do usuario e obrigatorio.');
  }

  const passHash = hashPassword(password);

  if (isPostgres) {
    const exists = await User.findOne({ where: { username: cleanUsername } });
    if (exists) throw new Error('Este e-mail já está cadastrado.');
    const user = await User.create({ username: cleanUsername, passwordHash: passHash, name: cleanName });
    return toPublicUser(user.toJSON());
  }

  const data = getFallbackData();
  if (data.users.find(u => u.username.toLowerCase() === cleanUsername)) {
    throw new Error('Este e-mail já está cadastrado.');
  }
  const newUser = {
    id: nextFallbackId(data.users),
    username: cleanUsername,
    password_hash: passHash,
    google_id: null,
    name: cleanName,
    created_at: new Date().toISOString()
  };
  data.users.push(newUser);
  saveFallbackData(data);
  return toPublicUser(newUser);
}

async function authenticateUser(username, password) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!cleanUsername || !EMAIL_REGEX.test(cleanUsername) || !password) {
    throw new Error('Informe um e-mail válido e a senha.');
  }

  if (isPostgres) {
    const user = await User.findOne({ where: { username: cleanUsername } });
    if (!user || !user.passwordHash) throw new Error('E-mail ou senha incorretos.');
    const { valid, needsRehash } = verifyPassword(password, user.passwordHash);
    if (!valid) throw new Error('E-mail ou senha incorretos.');
    if (needsRehash) {
      user.passwordHash = hashPassword(password);
      await user.save();
    }
    return toPublicUser(user.toJSON());
  }

  const data = getFallbackData();
  const user = data.users.find(u => u.username.toLowerCase() === cleanUsername);
  if (!user || !user.password_hash) throw new Error('E-mail ou senha incorretos.');
  const { valid, needsRehash } = verifyPassword(password, user.password_hash);
  if (!valid) throw new Error('E-mail ou senha incorretos.');
  if (needsRehash) {
    user.password_hash = hashPassword(password);
    saveFallbackData(data);
  }
  return toPublicUser(user);
}

// Login com Google: encontra a conta pelo googleId ou pelo e-mail (vinculando-a) ou cria uma nova.
async function findOrCreateGoogleUser({ googleId, email, name }) {
  const cleanName = String(name || email).trim().slice(0, 100);

  if (isPostgres) {
    let user = await User.findOne({ where: { googleId } });
    if (!user) {
      user = await User.findOne({ where: { username: email } });
      if (user) {
        user.googleId = googleId;
        await user.save();
      } else {
        user = await User.create({ username: email, googleId, name: cleanName, passwordHash: null });
      }
    }
    return toPublicUser(user.toJSON());
  }

  const data = getFallbackData();
  let user = data.users.find(u => u.google_id === googleId) || data.users.find(u => u.username.toLowerCase() === email);
  if (user) {
    user.google_id = googleId;
  } else {
    user = {
      id: nextFallbackId(data.users),
      username: email,
      password_hash: null,
      google_id: googleId,
      name: cleanName,
      created_at: new Date().toISOString()
    };
    data.users.push(user);
  }
  saveFallbackData(data);
  return toPublicUser(user);
}

async function getUserById(id) {
  const numId = parseInt(id, 10);
  if (!numId) return null;

  if (isPostgres) {
    const user = await User.findByPk(numId);
    return user ? toPublicUser(user.toJSON()) : null;
  }

  const data = getFallbackData();
  return toPublicUser(data.users.find(u => Number(u.id) === numId));
}

async function getUserByEmail(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  if (isPostgres) {
    const user = await User.findOne({ where: { username: cleanEmail } });
    return user ? toPublicUser(user.toJSON()) : null;
  }

  const data = getFallbackData();
  return toPublicUser(data.users.find(u => u.username.toLowerCase() === cleanEmail));
}

// Retorna o usuário com hash de senha interno para fins de autenticação e recuperação
async function getUserWithHashByEmail(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  if (isPostgres) {
    const user = await User.findOne({ where: { username: cleanEmail } });
    return user ? user.toJSON() : null;
  }

  const data = getFallbackData();
  const u = data.users.find(x => x.username.toLowerCase() === cleanEmail);
  return u ? { ...u, passwordHash: u.password_hash } : null;
}

async function getUserWithHashById(id) {
  const numId = parseInt(id, 10);
  if (!numId) return null;

  if (isPostgres) {
    const user = await User.findByPk(numId);
    return user ? user.toJSON() : null;
  }

  const data = getFallbackData();
  const u = data.users.find(x => Number(x.id) === numId);
  return u ? { ...u, passwordHash: u.password_hash } : null;
}

// Redefine a senha de um usuário no banco
async function resetUserPassword(userId, newPassword) {
  const numId = parseInt(userId, 10);
  if (!numId) throw new Error('ID de usuário inválido.');
  if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const passHash = hashPassword(newPassword);

  if (isPostgres) {
    const user = await User.findByPk(numId);
    if (!user) throw new Error('Usuário não encontrado.');
    user.passwordHash = passHash;
    await user.save();
    return toPublicUser(user.toJSON());
  }

  const data = getFallbackData();
  const user = data.users.find(u => Number(u.id) === numId);
  if (!user) throw new Error('Usuário não encontrado.');
  user.password_hash = passHash;
  saveFallbackData(data);
  return toPublicUser(user);
}

// Retorna mapa { [playerId]: rating } dos votos ja dados por um usuario especifico
async function getUserRatingsMap(userId) {
  const numUserId = parseInt(userId, 10);
  if (!numUserId) return {};

  if (isPostgres && PlayerRating) {
    try {
      const ratings = await PlayerRating.findAll({
        where: { userId: numUserId }
      });
      const map = {};
      ratings.forEach(r => {
        const raw = r.toJSON();
        map[raw.playerId] = {
          attack: raw.attack,
          defense: raw.defense,
          set_pass: raw.setPass,
          movement: raw.movement,
          overall: raw.overall
        };
      });
      return map;
    } catch (err) {
      console.error('Erro ao buscar ratings do usuario no Sequelize:', err.message);
      return {};
    }
  }

  const data = getFallbackData();
  const ratings = (data.player_ratings || []).filter(r => Number(r.user_id) === numUserId);
  const map = {};
  ratings.forEach(r => {
    map[r.player_id] = {
      attack: r.attack,
      defense: r.defense,
      set_pass: r.set_pass,
      movement: r.movement,
      overall: r.overall
    };
  });
  return map;
}

// ==========================================
// METODOS DE PELADAS (PELADAS / SESSOES)
// ==========================================
function toPublicPelada(raw, playerCount) {
  return {
    id: Number(raw.id),
    name: raw.name,
    admin_name: raw.adminName || raw.admin_name || 'Administrador',
    owner_id: raw.ownerId !== undefined ? raw.ownerId : (raw.owner_id || null),
    invite_code: raw.inviteCode || raw.invite_code || String(raw.id),
    player_count: playerCount || 0,
    created_at: raw.createdAt || raw.created_at
  };
}

async function getPeladas() {
  if (isPostgres) {
    const peladas = await Pelada.findAll({
      order: [['id', 'ASC']],
      include: [{ model: Player, as: 'players', attributes: ['id'] }]
    });
    return peladas.map(p => {
      const raw = p.toJSON();
      return toPublicPelada(raw, (raw.players || []).length);
    });
  }

  const data = getFallbackData();
  return data.peladas.map(p => toPublicPelada(p, data.players.filter(pl => Number(pl.pelada_id) === Number(p.id)).length));
}

// Retorna apenas as salas em que o usuario e dono, admin ou membro convidado.
// Novos usuarios sem convite recebem lista vazia [].
async function getPeladasForUser(userId, isSuper = false) {
  if (isSuper) {
    return getPeladas();
  }
  const numUser = parseInt(userId, 10);
  if (!numUser) {
    return [];
  }

  if (isPostgres) {
    const owned = await Pelada.findAll({
      where: { ownerId: numUser },
      include: [{ model: Player, as: 'players', attributes: ['id'] }]
    });

    const adminRows = await PeladaAdmin.findAll({
      where: { userId: numUser },
      attributes: ['peladaId']
    });
    const adminPeladaIds = adminRows.map(r => r.peladaId);

    const memberRows = await PeladaMember.findAll({
      where: { userId: numUser },
      attributes: ['peladaId']
    });
    const memberPeladaIds = memberRows.map(r => r.peladaId);

    const otherIds = [...new Set([...adminPeladaIds, ...memberPeladaIds])].filter(id => !owned.some(p => p.id === id));
    let others = [];
    if (otherIds.length > 0) {
      others = await Pelada.findAll({
        where: { id: { [Op.in]: otherIds } },
        include: [{ model: Player, as: 'players', attributes: ['id'] }]
      });
    }

    const all = [...owned, ...others].sort((a, b) => a.id - b.id);
    return all.map(p => {
      const raw = p.toJSON();
      return toPublicPelada(raw, (raw.players || []).length);
    });
  }

  const data = getFallbackData();
  data.pelada_members = data.pelada_members || [];
  const memberPeladaIds = new Set(data.pelada_members.filter(m => Number(m.user_id) === numUser).map(m => Number(m.pelada_id)));
  const adminPeladaIds = new Set(data.pelada_admins.filter(a => Number(a.user_id) === numUser).map(a => Number(a.pelada_id)));

  const userPeladas = data.peladas.filter(p => 
    Number(p.owner_id) === numUser ||
    adminPeladaIds.has(Number(p.id)) ||
    memberPeladaIds.has(Number(p.id))
  );

  return userPeladas.map(p => toPublicPelada(p, data.players.filter(pl => Number(pl.pelada_id) === Number(p.id)).length));
}

async function getPeladaById(id) {
  const numId = parseInt(id, 10);
  if (!numId) return null;

  if (isPostgres) {
    const pelada = await Pelada.findByPk(numId);
    if (!pelada) return null;
    const count = await Player.count({ where: { peladaId: numId } });
    return toPublicPelada(pelada.toJSON(), count);
  }

  const data = getFallbackData();
  const pelada = data.peladas.find(p => Number(p.id) === numId);
  if (!pelada) return null;
  return toPublicPelada(pelada, data.players.filter(pl => Number(pl.pelada_id) === numId).length);
}

async function createPelada(name, owner) {
  const cleanName = String(name || '').trim().slice(0, 150);
  if (!cleanName) throw new Error('O nome da pelada e obrigatorio.');
  const adminName = String(owner.name || owner.username).slice(0, 100);
  const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

  if (isPostgres) {
    const pelada = await Pelada.create({ name: cleanName, adminName, ownerId: owner.id, inviteCode });
    return toPublicPelada(pelada.toJSON(), 0);
  }

  const data = getFallbackData();
  const newPelada = {
    id: nextFallbackId(data.peladas),
    name: cleanName,
    admin_name: adminName,
    owner_id: owner.id,
    invite_code: inviteCode,
    created_at: new Date().toISOString()
  };
  data.peladas.push(newPelada);
  saveFallbackData(data);
  return toPublicPelada(newPelada, 0);
}

async function updatePelada(id, name) {
  const numId = parseInt(id, 10);
  const cleanName = String(name || '').trim().slice(0, 150);
  if (!cleanName) throw new Error('O nome da pelada nao pode ser vazio.');

  if (isPostgres) {
    const pelada = await Pelada.findByPk(numId);
    if (!pelada) throw new Error('Pelada nao encontrada.');
    pelada.name = cleanName;
    await pelada.save();
    return toPublicPelada(pelada.toJSON());
  }

  const data = getFallbackData();
  const pelada = data.peladas.find(p => Number(p.id) === numId);
  if (!pelada) throw new Error('Pelada nao encontrada.');
  pelada.name = cleanName;
  saveFallbackData(data);
  return toPublicPelada(pelada);
}

async function deletePelada(id) {
  const numId = parseInt(id, 10);

  if (isPostgres) {
    await Pelada.destroy({ where: { id: numId } });
    return { success: true };
  }

  const data = getFallbackData();
  const removedPlayerIds = new Set(data.players.filter(p => Number(p.pelada_id) === numId).map(p => Number(p.id)));
  data.peladas = data.peladas.filter(p => Number(p.id) !== numId);
  data.players = data.players.filter(p => Number(p.pelada_id) !== numId);
  data.player_ratings = data.player_ratings.filter(r => !removedPlayerIds.has(Number(r.player_id)));
  data.pelada_admins = data.pelada_admins.filter(a => Number(a.pelada_id) !== numId);
  data.pelada_members = (data.pelada_members || []).filter(m => Number(m.pelada_id) !== numId);
  data.attendances = data.attendances.filter(a => Number(a.pelada_id) !== numId);
  data.mvp_votes = data.mvp_votes.filter(v => Number(v.pelada_id) !== numId);
  saveFallbackData(data);
  return { success: true };
}

// ==========================================
// PERMISSOES E ADMINISTRADORES DAS PELADAS
// ==========================================

// Retorna { exists, isOwner, isAdmin } do usuario em relacao a pelada.
// isAdmin inclui o dono e os administradores adicionais.
async function getPeladaRole(peladaId, userId) {
  const numPelada = parseInt(peladaId, 10);
  const numUser = parseInt(userId, 10);
  const result = { exists: false, isOwner: false, isAdmin: false };
  if (!numPelada) return result;

  if (isPostgres) {
    const pelada = await Pelada.findByPk(numPelada, { attributes: ['id', 'ownerId'] });
    if (!pelada) return result;
    result.exists = true;
    if (!numUser) return result;
    result.isOwner = Number(pelada.ownerId) === numUser;
    result.isAdmin = result.isOwner || Boolean(await PeladaAdmin.findOne({ where: { peladaId: numPelada, userId: numUser } }));
    return result;
  }

  const data = getFallbackData();
  const pelada = data.peladas.find(p => Number(p.id) === numPelada);
  if (!pelada) return result;
  result.exists = true;
  if (!numUser) return result;
  result.isOwner = Number(pelada.owner_id) === numUser;
  result.isAdmin = result.isOwner || data.pelada_admins.some(a => Number(a.pelada_id) === numPelada && Number(a.user_id) === numUser);
  return result;
}

// Ids das peladas em que o usuario e dono ou administrador
async function getManagedPeladaIds(userId) {
  const numUser = parseInt(userId, 10);
  if (!numUser) return new Set();

  if (isPostgres) {
    const owned = await Pelada.findAll({ where: { ownerId: numUser }, attributes: ['id'] });
    const admin = await PeladaAdmin.findAll({ where: { userId: numUser }, attributes: ['peladaId'] });
    return new Set([...owned.map(p => Number(p.id)), ...admin.map(a => Number(a.peladaId))]);
  }

  const data = getFallbackData();
  return new Set([
    ...data.peladas.filter(p => Number(p.owner_id) === numUser).map(p => Number(p.id)),
    ...data.pelada_admins.filter(a => Number(a.user_id) === numUser).map(a => Number(a.pelada_id))
  ]);
}

async function getPeladaAdmins(peladaId) {
  const numPelada = parseInt(peladaId, 10);

  if (isPostgres) {
    const pelada = await Pelada.findByPk(numPelada, { attributes: ['id', 'ownerId'] });
    if (!pelada) throw new Error('Pelada nao encontrada.');
    const owner = pelada.ownerId ? await getUserById(pelada.ownerId) : null;
    const rows = await PeladaAdmin.findAll({
      where: { peladaId: numPelada },
      include: [{ model: User, as: 'user', attributes: ['id', 'username', 'name'] }],
      order: [['createdAt', 'ASC']]
    });
    return {
      owner,
      admins: rows.filter(r => r.user).map(r => toPublicUser(r.user.toJSON()))
    };
  }

  const data = getFallbackData();
  const pelada = data.peladas.find(p => Number(p.id) === numPelada);
  if (!pelada) throw new Error('Pelada nao encontrada.');
  const findUser = (uid) => toPublicUser(data.users.find(u => Number(u.id) === Number(uid)));
  return {
    owner: pelada.owner_id ? findUser(pelada.owner_id) : null,
    admins: data.pelada_admins
      .filter(a => Number(a.pelada_id) === numPelada)
      .map(a => findUser(a.user_id))
      .filter(Boolean)
  };
}

async function addPeladaAdmin(peladaId, userId) {
  const numPelada = parseInt(peladaId, 10);
  const numUser = parseInt(userId, 10);

  if (isPostgres) {
    await PeladaAdmin.findOrCreate({ where: { peladaId: numPelada, userId: numUser } });
    return { success: true };
  }

  const data = getFallbackData();
  const exists = data.pelada_admins.some(a => Number(a.pelada_id) === numPelada && Number(a.user_id) === numUser);
  if (!exists) {
    data.pelada_admins.push({ id: nextFallbackId(data.pelada_admins), pelada_id: numPelada, user_id: numUser, created_at: new Date().toISOString() });
    saveFallbackData(data);
  }
  return { success: true };
}

async function removePeladaAdmin(peladaId, userId) {
  const numPelada = parseInt(peladaId, 10);
  const numUser = parseInt(userId, 10);

  if (isPostgres) {
    await PeladaAdmin.destroy({ where: { peladaId: numPelada, userId: numUser } });
    return { success: true };
  }

  const data = getFallbackData();
  data.pelada_admins = data.pelada_admins.filter(a => !(Number(a.pelada_id) === numPelada && Number(a.user_id) === numUser));
  saveFallbackData(data);
  return { success: true };
}

// ==========================================
// MEMBROS, CONVITES E ROLES DE VOTACAO
// ==========================================

async function getUserPeladaRole(userId, peladaId) {
  const numUser = parseInt(userId, 10);
  const numPelada = parseInt(peladaId, 10);
  if (!numUser || !numPelada) return null;

  const peladaRole = await getPeladaRole(numPelada, numUser);
  if (peladaRole.isAdmin) return 'admin';

  if (isPostgres && PeladaMember) {
    const member = await PeladaMember.findOne({ where: { peladaId: numPelada, userId: numUser } });
    if (member) return member.role || 'votante';
    return null;
  }

  const data = getFallbackData();
  data.pelada_members = data.pelada_members || [];
  const mem = data.pelada_members.find(m => Number(m.pelada_id) === numPelada && Number(m.user_id) === numUser);
  if (mem) return mem.role || 'votante';
  return null;
}

async function canUserVote(userId, peladaId) {
  const numUser = parseInt(userId, 10);
  const numPelada = parseInt(peladaId, 10);
  if (!numUser || !numPelada) return false;

  const user = await getUserById(numUser);
  if (user && isSuperAdmin(user)) return true;

  const role = await getUserPeladaRole(numUser, numPelada);
  if (!role) return false;
  return role === 'admin' || role === 'votante';
}

async function getPeladaMembers(peladaId) {
  const numPelada = parseInt(peladaId, 10);
  if (!numPelada) return { owner: null, admins: [], members: [] };

  const adminsData = await getPeladaAdmins(numPelada);

  if (isPostgres && PeladaMember) {
    const rows = await PeladaMember.findAll({
      where: { peladaId: numPelada },
      include: [{ model: User, as: 'user', attributes: ['id', 'username', 'name'] }],
      order: [['createdAt', 'ASC']]
    });
    const members = rows.filter(r => r.user).map(r => ({
      ...toPublicUser(r.user.toJSON()),
      peladaRole: r.role || 'votante'
    }));
    return { ...adminsData, members };
  }

  const data = getFallbackData();
  data.pelada_members = data.pelada_members || [];
  const findUser = (uid) => toPublicUser(data.users.find(u => Number(u.id) === Number(uid)));
  const members = data.pelada_members
    .filter(m => Number(m.pelada_id) === numPelada)
    .map(m => {
      const u = findUser(m.user_id);
      return u ? { ...u, peladaRole: m.role || 'votante' } : null;
    })
    .filter(Boolean);

  return { ...adminsData, members };
}

async function addPeladaMember(peladaId, userId, role = 'votante') {
  const numPelada = parseInt(peladaId, 10);
  const numUser = parseInt(userId, 10);
  const cleanRole = role === 'espectador' ? 'espectador' : 'votante';

  if (isPostgres && PeladaMember) {
    const [member, created] = await PeladaMember.findOrCreate({
      where: { peladaId: numPelada, userId: numUser },
      defaults: { role: cleanRole }
    });
    if (!created && member.role !== cleanRole) {
      member.role = cleanRole;
      await member.save();
    }
    return { success: true, member };
  }

  const data = getFallbackData();
  data.pelada_members = data.pelada_members || [];
  let existing = data.pelada_members.find(m => Number(m.pelada_id) === numPelada && Number(m.user_id) === numUser);
  if (existing) {
    existing.role = cleanRole;
  } else {
    data.pelada_members.push({
      id: nextFallbackId(data.pelada_members),
      pelada_id: numPelada,
      user_id: numUser,
      role: cleanRole,
      created_at: new Date().toISOString()
    });
  }
  saveFallbackData(data);
  return { success: true };
}

async function updatePeladaMemberRole(peladaId, userId, role) {
  const numPelada = parseInt(peladaId, 10);
  const numUser = parseInt(userId, 10);
  const cleanRole = role === 'espectador' ? 'espectador' : 'votante';

  if (isPostgres && PeladaMember) {
    const member = await PeladaMember.findOne({ where: { peladaId: numPelada, userId: numUser } });
    if (!member) {
      await PeladaMember.create({ peladaId: numPelada, userId: numUser, role: cleanRole });
    } else {
      member.role = cleanRole;
      await member.save();
    }
    return { success: true, role: cleanRole };
  }

  const data = getFallbackData();
  data.pelada_members = data.pelada_members || [];
  let member = data.pelada_members.find(m => Number(m.pelada_id) === numPelada && Number(m.user_id) === numUser);
  if (!member) {
    data.pelada_members.push({
      id: nextFallbackId(data.pelada_members),
      pelada_id: numPelada,
      user_id: numUser,
      role: cleanRole,
      created_at: new Date().toISOString()
    });
  } else {
    member.role = cleanRole;
  }
  saveFallbackData(data);
  return { success: true, role: cleanRole };
}

async function removePeladaMember(peladaId, userId) {
  const numPelada = parseInt(peladaId, 10);
  const numUser = parseInt(userId, 10);

  if (isPostgres && PeladaMember) {
    await PeladaMember.destroy({ where: { peladaId: numPelada, userId: numUser } });
    return { success: true };
  }

  const data = getFallbackData();
  data.pelada_members = (data.pelada_members || []).filter(m => !(Number(m.pelada_id) === numPelada && Number(m.user_id) === numUser));
  saveFallbackData(data);
  return { success: true };
}

async function joinPeladaByCode(userId, inviteCode) {
  const cleanCode = String(inviteCode || '').trim();
  if (!cleanCode) throw new Error('Código de convite inválido.');

  let targetPelada = null;
  if (isPostgres && Pelada) {
    targetPelada = await Pelada.findOne({
      where: {
        [Op.or]: [
          { inviteCode: cleanCode },
          { id: parseInt(cleanCode, 10) || 0 }
        ]
      }
    });
  } else {
    const data = getFallbackData();
    targetPelada = data.peladas.find(p => 
      (p.invite_code && p.invite_code.toUpperCase() === cleanCode.toUpperCase()) ||
      String(p.id) === cleanCode
    );
  }

  if (!targetPelada) {
    throw new Error('Nenhuma sala encontrada com este código de convite.');
  }

  const peladaId = Number(targetPelada.id);
  await addPeladaMember(peladaId, userId, 'votante');
  return targetPelada;
}

// ==========================================
// METODOS DE PARTIDAS (MATCHES)
// ==========================================
async function saveMatch(matchData) {
  const { roomId, teamA, scoreA, teamB, scoreB, winner, durationSeconds, matchNumber, teamAPlayers, teamBPlayers, peladaId } = matchData;
  const teamAStr = Array.isArray(teamAPlayers) ? JSON.stringify(teamAPlayers) : (teamAPlayers || null);
  const teamBStr = Array.isArray(teamBPlayers) ? JSON.stringify(teamBPlayers) : (teamBPlayers || null);
  const numPelada = peladaId ? parseInt(peladaId, 10) : DEFAULT_PELADA_ID;

  if (isPostgres && Match) {
    try {
      const match = await Match.create({
        roomId: roomId || 'DEFAULT',
        peladaId: numPelada,
        teamA: teamA || 'LADO A',
        scoreA: scoreA || 0,
        teamB: teamB || 'LADO B',
        scoreB: scoreB || 0,
        winner: winner || 'Empate',
        teamAPlayers: teamAStr,
        teamBPlayers: teamBStr,
        durationSeconds: durationSeconds || 0,
        matchNumber: matchNumber || 1
      });
      return match.toJSON();
    } catch (err) {
      console.error('Erro ao salvar partida no Sequelize:', err.message);
    }
  }

  // Fallback
  const data = getFallbackData();
  const newMatch = {
    id: Date.now(),
    room_id: roomId || 'DEFAULT',
    pelada_id: numPelada,
    team_a: teamA || 'LADO A',
    score_a: scoreA || 0,
    team_b: teamB || 'LADO B',
    score_b: scoreB || 0,
    winner: winner || 'Empate',
    team_a_players: teamAStr,
    team_b_players: teamBStr,
    duration_seconds: durationSeconds || 0,
    match_number: matchNumber || (data.matches.length + 1),
    created_at: new Date().toISOString()
  };
  data.matches.unshift(newMatch);
  saveFallbackData(data);
  return newMatch;
}

async function getMatches(limit = 50) {
  if (isPostgres && Match) {
    try {
      const matches = await Match.findAll({
        order: [['created_at', 'DESC']],
        limit: limit
      });
      return matches.map(m => {
        const raw = m.toJSON();
        return {
          id: raw.id,
          room_id: raw.roomId,
          team_a: raw.teamA,
          score_a: raw.scoreA,
          team_b: raw.teamB,
          score_b: raw.scoreB,
          winner: raw.winner,
          duration_seconds: raw.durationSeconds,
          match_number: raw.matchNumber,
          created_at: raw.createdAt
        };
      });
    } catch (err) {
      console.error('Erro ao buscar partidas no Sequelize:', err.message);
    }
  }
  const data = getFallbackData();
  return (data.matches || []).slice(0, limit);
}

// ==========================================
// METODOS DE JOGADORES (PLAYERS)
// ==========================================
function computeWeightedPlayerRatings(ratings, voterWeightsMap = {}) {
  const count = ratings.length;
  if (count === 0) {
    return {
      vote_count: 0,
      avg_attack: 0,
      avg_defense: 0,
      avg_set_pass: 0,
      avg_movement: 0,
      overall: 0
    };
  }

  let totalWeight = 0;
  let weightedA = 0;
  let weightedD = 0;
  let weightedP = 0;
  let weightedM = 0;

  ratings.forEach(r => {
    const uId = r.userId || r.user_id;
    const w = (uId && voterWeightsMap[uId]) ? voterWeightsMap[uId] : 1.0;
    totalWeight += w;
    weightedA += Number(r.attack || 0) * w;
    weightedD += Number(r.defense || 0) * w;
    weightedP += Number(r.setPass !== undefined ? r.setPass : (r.set_pass || 0)) * w;
    weightedM += Number(r.movement || 0) * w;
  });

  const avgA = totalWeight > 0 ? Number((weightedA / totalWeight).toFixed(1)) : 0;
  const avgD = totalWeight > 0 ? Number((weightedD / totalWeight).toFixed(1)) : 0;
  const avgP = totalWeight > 0 ? Number((weightedP / totalWeight).toFixed(1)) : 0;
  const avgM = totalWeight > 0 ? Number((weightedM / totalWeight).toFixed(1)) : 0;
  const overall = calculateOverall(avgA, avgD, avgP, avgM);

  return {
    vote_count: count,
    avg_attack: avgA,
    avg_defense: avgD,
    avg_set_pass: avgP,
    avg_movement: avgM,
    overall: overall
  };
}

async function getPlayersWithRatings(peladaId = null) {
  const filterPeladaId = (peladaId !== null && peladaId !== undefined && peladaId !== '') ? parseInt(peladaId, 10) : null;

  if (isPostgres && Player) {
    try {
      const queryOptions = {
        include: [{
          model: PlayerRating,
          as: 'ratings'
        }],
        order: [['name', 'ASC']]
      };

      if (filterPeladaId) {
        queryOptions.where = { peladaId: filterPeladaId };
      }

      const players = await Player.findAll(queryOptions);

      // Mapa de pesos dos votantes na pelada (Admins/Donos tem peso 1.5, Votantes comuns 1.0)
      const voterWeightsMap = {};
      if (filterPeladaId) {
        const admins = await PeladaAdmin.findAll({ where: { peladaId: filterPeladaId }, attributes: ['userId'] });
        admins.forEach(a => { voterWeightsMap[a.userId] = 1.5; });
        const pelada = await Pelada.findByPk(filterPeladaId, { attributes: ['ownerId'] });
        if (pelada && pelada.ownerId) voterWeightsMap[pelada.ownerId] = 1.5;
      }

      return players.map(p => {
        const raw = p.toJSON();
        const ratings = raw.ratings || [];
        const computed = computeWeightedPlayerRatings(ratings, voterWeightsMap);

        return {
          id: raw.id,
          pelada_id: raw.peladaId,
          name: raw.name,
          nickname: raw.nickname,
          position: raw.position,
          is_monthly: raw.isMonthly !== undefined ? Boolean(raw.isMonthly) : (raw.is_monthly !== undefined ? Boolean(raw.is_monthly) : true),
          photo_url: raw.photoUrl,
          active: raw.active,
          created_at: raw.createdAt,
          ...computed
        };
      }).sort((a, b) => (b.overall - a.overall) || a.name.localeCompare(b.name));
    } catch (err) {
      console.error('Erro ao buscar jogadores no Sequelize:', err.message);
    }
  }

  // Fallback
  const data = getFallbackData();
  let players = data.players || [];
  if (filterPeladaId) {
    players = players.filter(p => Number(p.pelada_id) === filterPeladaId);
  }
  const ratings = data.player_ratings || [];

  const voterWeightsMap = {};
  if (filterPeladaId) {
    (data.pelada_admins || [])
      .filter(a => Number(a.pelada_id) === filterPeladaId)
      .forEach(a => { voterWeightsMap[a.user_id] = 1.5; });
    const pelada = (data.peladas || []).find(p => Number(p.id) === filterPeladaId);
    if (pelada && pelada.owner_id) voterWeightsMap[pelada.owner_id] = 1.5;
  }

  return players.map(p => {
    const pRatings = ratings.filter(r => Number(r.player_id) === Number(p.id));
    const computed = computeWeightedPlayerRatings(pRatings, voterWeightsMap);

    return {
      ...p,
      is_monthly: p.is_monthly !== undefined ? Boolean(p.is_monthly) : (p.isMonthly !== undefined ? Boolean(p.isMonthly) : true),
      pelada_id: p.pelada_id || 1,
      ...computed
    };
  }).sort((a, b) => (b.overall - a.overall) || a.name.localeCompare(b.name));
}

const MAX_PHOTO_LENGTH = 2 * 1024 * 1024;

// Aceita apenas imagens embutidas (data:image/...) ou links http(s); qualquer outro valor vira vazio
function sanitizePhotoUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.length > MAX_PHOTO_LENGTH) throw new Error('A foto e muito grande. Use uma imagem menor.');
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) return url;
  throw new Error('Formato de foto invalido. Envie uma imagem ou um link http(s).');
}

function cleanPlayerFields(fields) {
  const result = {};
  if (fields.name !== undefined) {
    result.name = String(fields.name).trim().slice(0, 100);
    if (!result.name) throw new Error('O nome do jogador e obrigatorio.');
  }
  if (fields.nickname !== undefined) result.nickname = String(fields.nickname).trim().slice(0, 50);
  if (fields.position !== undefined) result.position = String(fields.position).trim().slice(0, 50) || 'Geral';
  const photo = fields.photoUrl !== undefined ? fields.photoUrl : fields.photo_url;
  if (photo !== undefined) result.photoUrl = sanitizePhotoUrl(photo);
  const monthly = fields.isMonthly !== undefined ? fields.isMonthly : fields.is_monthly;
  if (monthly !== undefined) {
    result.isMonthly = (monthly === true || monthly === 'true' || monthly === 1 || monthly === '1');
  }
  if (fields.active !== undefined) result.active = Boolean(fields.active);
  return result;
}

async function getPlayerById(id) {
  const numId = parseInt(id, 10);
  if (!numId) return null;

  if (isPostgres) {
    const player = await Player.findByPk(numId);
    if (!player) return null;
    const raw = player.toJSON();
    return {
      ...raw,
      pelada_id: raw.peladaId,
      photo_url: raw.photoUrl,
      is_monthly: raw.isMonthly !== undefined ? Boolean(raw.isMonthly) : true
    };
  }

  const data = getFallbackData();
  const player = data.players.find(p => Number(p.id) === numId);
  if (!player) return null;
  return {
    ...player,
    is_monthly: player.is_monthly !== undefined ? Boolean(player.is_monthly) : true
  };
}

async function addPlayer(fields, peladaId) {
  const numPeladaId = parseInt(peladaId, 10);
  if (!numPeladaId) throw new Error('Informe a pelada do jogador.');
  const clean = cleanPlayerFields({ name: '', ...fields });
  const nickname = clean.nickname || clean.name;
  const position = clean.position || 'Geral';
  const isMonthly = clean.isMonthly !== undefined ? clean.isMonthly : true;

  if (isPostgres) {
    const p = await Player.create({
      peladaId: numPeladaId,
      name: clean.name,
      nickname,
      position,
      photoUrl: clean.photoUrl || null,
      isMonthly,
      active: true
    });
    const raw = p.toJSON();
    return {
      ...raw,
      pelada_id: raw.peladaId,
      photo_url: raw.photoUrl,
      is_monthly: raw.isMonthly !== undefined ? Boolean(raw.isMonthly) : true
    };
  }

  const data = getFallbackData();
  const newPlayer = {
    id: nextFallbackId(data.players),
    pelada_id: numPeladaId,
    name: clean.name,
    nickname,
    position,
    photo_url: clean.photoUrl || '',
    is_monthly: isMonthly,
    active: true,
    created_at: new Date().toISOString()
  };
  data.players.push(newPlayer);
  saveFallbackData(data);
  return newPlayer;
}

// Atualiza dados cadastrais do jogador. A pelada do jogador nao pode ser trocada por aqui.
async function updatePlayer(id, updates = {}) {
  const numId = parseInt(id, 10);
  const clean = cleanPlayerFields(updates);

  if (isPostgres) {
    const player = await Player.findByPk(numId);
    if (!player) throw new Error('Jogador nao encontrado.');
    Object.entries(clean).forEach(([key, value]) => {
      if (key === 'photoUrl') player.photoUrl = value || null;
      else if (key === 'isMonthly') player.isMonthly = value;
      else player[key] = value;
    });
    await player.save();
    const raw = player.toJSON();
    return {
      ...raw,
      photo_url: raw.photoUrl,
      pelada_id: raw.peladaId,
      is_monthly: raw.isMonthly !== undefined ? Boolean(raw.isMonthly) : true
    };
  }

  const data = getFallbackData();
  const player = data.players.find(p => Number(p.id) === numId);
  if (!player) throw new Error('Jogador nao encontrado.');
  Object.entries(clean).forEach(([key, value]) => {
    if (key === 'photoUrl') player.photo_url = value;
    else if (key === 'isMonthly') player.is_monthly = value;
    else player[key] = value;
  });
  saveFallbackData(data);
  return player;
}

async function deletePlayer(id) {
  const numId = parseInt(id, 10);

  if (isPostgres) {
    await Player.destroy({ where: { id: numId } });
    return { success: true };
  }

  const data = getFallbackData();
  data.players = data.players.filter(p => Number(p.id) !== numId);
  data.player_ratings = data.player_ratings.filter(r => Number(r.player_id) !== numId);
  saveFallbackData(data);
  return { success: true };
}

// ==========================================
// METODOS DE AVALIACAO DE JOGADORES (RATINGS)
// ==========================================
async function addPlayerRating(playerId, voterName, attack, defense, setPass, movement, userId = null) {
  const pId = parseInt(playerId, 10);
  const numUserId = userId ? parseInt(userId, 10) : null;
  const cleanVoter = String(voterName || 'Anonimo').trim().slice(0, 50);

  const numA = Math.max(1, Math.min(5, parseFloat(attack) || 3));
  const numD = Math.max(1, Math.min(5, parseFloat(defense) || 3));
  const numP = Math.max(1, Math.min(5, parseFloat(setPass) || 3));
  const numM = Math.max(1, Math.min(5, parseFloat(movement) || 3));
  const overall = calculateOverall(numA, numD, numP, numM);

  if (isPostgres && PlayerRating) {
    try {
      // Se tiver userId, verifica se o usuario ja votou neste jogador para atualizar seu voto
      if (numUserId) {
        const existing = await PlayerRating.findOne({
          where: { playerId: pId, userId: numUserId }
        });
        if (existing) {
          existing.voterName = cleanVoter;
          existing.attack = numA;
          existing.defense = numD;
          existing.setPass = numP;
          existing.movement = numM;
          existing.overall = overall;
          await existing.save();
          return { ...existing.toJSON(), updated: true };
        }
      }

      const r = await PlayerRating.create({
        playerId: pId,
        userId: numUserId,
        voterName: cleanVoter,
        attack: numA,
        defense: numD,
        setPass: numP,
        movement: numM,
        overall: overall
      });
      return r.toJSON();
    } catch (err) {
      console.error('Erro ao inserir avaliacao no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  if (!data.player_ratings) data.player_ratings = [];

  if (numUserId) {
    const existing = data.player_ratings.find(r => Number(r.player_id) === pId && Number(r.user_id) === numUserId);
    if (existing) {
      existing.voter_name = cleanVoter;
      existing.attack = numA;
      existing.defense = numD;
      existing.set_pass = numP;
      existing.movement = numM;
      existing.overall = overall;
      existing.updated_at = new Date().toISOString();
      saveFallbackData(data);
      return { ...existing, updated: true };
    }
  }

  const newRating = {
    id: Date.now(),
    player_id: pId,
    user_id: numUserId,
    voter_name: cleanVoter,
    attack: numA,
    defense: numD,
    set_pass: numP,
    movement: numM,
    overall: overall,
    created_at: new Date().toISOString()
  };
  data.player_ratings.push(newRating);
  saveFallbackData(data);
  return newRating;
}

async function removePlayerRating(playerId, userId) {
  const pId = parseInt(playerId, 10);
  const numUserId = parseInt(userId, 10);
  if (!pId || !numUserId) return { success: false, error: 'Parâmetros inválidos.' };

  if (isPostgres && PlayerRating) {
    try {
      await PlayerRating.destroy({
        where: { playerId: pId, userId: numUserId }
      });
    } catch (err) {
      console.error('Erro ao remover avaliação no Sequelize:', err.message);
      throw err;
    }
  } else {
    const data = getFallbackData();
    if (data.player_ratings) {
      data.player_ratings = data.player_ratings.filter(
        r => !(Number(r.player_id) === pId && Number(r.user_id) === numUserId)
      );
      saveFallbackData(data);
    }
  }

  // Recalcula o status atualizado do jogador após a exclusão do voto
  const player = await getPlayerById(pId);
  const allWithRatings = await getPlayersWithRatings(player ? player.pelada_id : null);
  const updatedPlayer = allWithRatings.find(p => Number(p.id) === pId);

  return {
    success: true,
    removed: true,
    player: updatedPlayer || {
      id: pId,
      overall: 0,
      vote_count: 0,
      avg_attack: 0,
      avg_defense: 0,
      avg_set_pass: 0,
      avg_movement: 0
    }
  };
}

// ==========================================
// FUNCAO 1: LISTA DE PRESENCA & CHECK-IN
// ==========================================
function normalizeDate(date) {
  const str = date ? String(date).slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : new Date().toISOString().slice(0, 10);
}

// Formato unico (camelCase) para registros de presenca vindos do Postgres ou do fallback
function toPublicAttendance(a) {
  return {
    id: Number(a.id),
    peladaId: Number(a.peladaId !== undefined ? a.peladaId : a.pelada_id),
    date: a.date,
    userId: a.userId !== undefined ? a.userId : (a.user_id || null),
    playerId: a.playerId !== undefined ? a.playerId : (a.player_id || null),
    playerName: a.playerName || a.player_name,
    status: a.status || 'confirmed',
    createdAt: a.createdAt || a.created_at
  };
}

async function getAttendance(peladaId, date = null) {
  const numPelada = parseInt(peladaId, 10) || DEFAULT_PELADA_ID;
  const targetDate = normalizeDate(date);

  if (isPostgres) {
    const records = await Attendance.findAll({
      where: { peladaId: numPelada, date: targetDate },
      order: [['createdAt', 'ASC']]
    });
    return records.map(r => toPublicAttendance(r.toJSON()));
  }

  const data = getFallbackData();
  return data.attendances
    .filter(a => Number(a.pelada_id) === numPelada && a.date === targetDate)
    .map(toPublicAttendance);
}

async function getAttendanceById(attendanceId) {
  const numId = parseInt(attendanceId, 10);
  if (!numId) return null;

  if (isPostgres) {
    const record = await Attendance.findByPk(numId);
    return record ? toPublicAttendance(record.toJSON()) : null;
  }

  const data = getFallbackData();
  const record = data.attendances.find(a => Number(a.id) === numId);
  return record ? toPublicAttendance(record) : null;
}

// Marca/desmarca presenca. Usuario logado e identificado pelo userId; jogador adicionado
// por um admin e identificado pelo playerId (ou pelo nome, se nao houver cadastro).
async function toggleAttendance(peladaId, date, userId, playerName, playerId, maxSpots = 12) {
  const numPelada = parseInt(peladaId, 10) || DEFAULT_PELADA_ID;
  const targetDate = normalizeDate(date);
  const cleanName = String(playerName || '').trim().slice(0, 100);
  const numUserId = userId ? parseInt(userId, 10) : null;
  const numPlayerId = playerId ? parseInt(playerId, 10) : null;
  const spots = Math.max(1, Math.min(100, parseInt(maxSpots, 10) || 12));

  if (isPostgres) {
    const base = { peladaId: numPelada, date: targetDate };
    let existing = null;
    if (numUserId) existing = await Attendance.findOne({ where: { ...base, userId: numUserId } });
    else if (numPlayerId) existing = await Attendance.findOne({ where: { ...base, playerId: numPlayerId } });
    else if (cleanName) existing = await Attendance.findOne({ where: { ...base, playerName: cleanName } });

    if (existing) {
      await existing.destroy();
      return { action: 'removed', date: targetDate };
    }

    const confirmedCount = await Attendance.count({ where: { ...base, status: 'confirmed' } });
    const record = await Attendance.create({
      ...base,
      userId: numUserId,
      playerId: numPlayerId,
      playerName: cleanName || 'Atleta',
      status: confirmedCount >= spots ? 'waitlist' : 'confirmed'
    });
    return { action: 'added', attendance: toPublicAttendance(record.toJSON()) };
  }

  const data = getFallbackData();
  const sameDay = (a) => Number(a.pelada_id) === numPelada && a.date === targetDate;
  const idx = data.attendances.findIndex(a => sameDay(a) && (
    (numUserId && Number(a.user_id) === numUserId) ||
    (!numUserId && numPlayerId && Number(a.player_id) === numPlayerId) ||
    (!numUserId && !numPlayerId && cleanName && String(a.player_name).toLowerCase() === cleanName.toLowerCase())
  ));

  if (idx !== -1) {
    data.attendances.splice(idx, 1);
    saveFallbackData(data);
    return { action: 'removed', date: targetDate };
  }

  const confirmedCount = data.attendances.filter(a => sameDay(a) && a.status === 'confirmed').length;
  const newAtt = {
    id: nextFallbackId(data.attendances),
    pelada_id: numPelada,
    date: targetDate,
    user_id: numUserId,
    player_id: numPlayerId,
    player_name: cleanName || 'Atleta',
    status: confirmedCount >= spots ? 'waitlist' : 'confirmed',
    created_at: new Date().toISOString()
  };
  data.attendances.push(newAtt);
  saveFallbackData(data);
  return { action: 'added', attendance: toPublicAttendance(newAtt) };
}

async function removeAttendance(attendanceId) {
  const numId = parseInt(attendanceId, 10);

  if (isPostgres) {
    await Attendance.destroy({ where: { id: numId } });
    return { success: true };
  }

  const data = getFallbackData();
  data.attendances = data.attendances.filter(a => Number(a.id) !== numId);
  saveFallbackData(data);
  return { success: true };
}

// ==========================================
// FUNCAO 3: ESTATISTICAS & RANKING DE VITORIAS
// ==========================================
async function getPlayerStats(peladaId) {
  const numPelada = parseInt(peladaId, 10) || DEFAULT_PELADA_ID;
  const players = await getPlayersWithRatings(numPelada);
  let matches = [];

  if (isPostgres && Match) {
    try {
      const dbMatches = await Match.findAll({
        where: {
          [Op.or]: [{ peladaId: numPelada }, { peladaId: null }]
        },
        order: [['createdAt', 'DESC']]
      });
      matches = dbMatches.map(m => m.toJSON());
    } catch (err) {
      console.error('Erro ao buscar partidas para estatisticas:', err.message);
    }
  } else {
    const data = getFallbackData();
    matches = (data.matches || []).filter(m => !m.pelada_id || Number(m.pelada_id) === numPelada);
  }

  // Mapa de estatisticas por jogador
  const statsMap = {};
  players.forEach(p => {
    statsMap[p.id] = {
      id: p.id,
      name: p.name,
      nickname: p.nickname,
      photo_url: p.photo_url,
      position: p.position,
      overall: p.overall,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0
    };
  });

  matches.forEach(m => {
    let teamAPlayers = [];
    let teamBPlayers = [];

    try {
      if (typeof m.teamAPlayers === 'string') teamAPlayers = JSON.parse(m.teamAPlayers);
      else if (typeof m.team_a_players === 'string') teamAPlayers = JSON.parse(m.team_a_players);
      else if (Array.isArray(m.teamAPlayers)) teamAPlayers = m.teamAPlayers;

      if (typeof m.teamBPlayers === 'string') teamBPlayers = JSON.parse(m.teamBPlayers);
      else if (typeof m.team_b_players === 'string') teamBPlayers = JSON.parse(m.team_b_players);
      else if (Array.isArray(m.teamBPlayers)) teamBPlayers = m.teamBPlayers;
    } catch (e) {
      // Ignora erro de parse em partidas legadas
    }

    const winner = String(m.winner || '').toUpperCase();
    const teamAWon = winner.includes('LADO A') || winner.includes('TIME A') || winner.includes('EQUIPE A');
    const teamBWon = winner.includes('LADO B') || winner.includes('TIME B') || winner.includes('EQUIPE B');

    // Processa time A
    teamAPlayers.forEach(item => {
      const pId = typeof item === 'object' ? item.id : item;
      if (statsMap[pId]) {
        statsMap[pId].matchesPlayed += 1;
        if (teamAWon) statsMap[pId].wins += 1;
        else if (teamBWon) statsMap[pId].losses += 1;
      }
    });

    // Processa time B
    teamBPlayers.forEach(item => {
      const pId = typeof item === 'object' ? item.id : item;
      if (statsMap[pId]) {
        statsMap[pId].matchesPlayed += 1;
        if (teamBWon) statsMap[pId].wins += 1;
        else if (teamAWon) statsMap[pId].losses += 1;
      }
    });
  });

  // Calcula % de vitoria
  const statsList = Object.values(statsMap).map(s => {
    const rate = s.matchesPlayed > 0 ? (s.wins / s.matchesPlayed) * 100 : 0;
    return {
      ...s,
      winRate: parseFloat(rate.toFixed(1))
    };
  });

  // Ordena por vitorias DESC, winRate DESC, overall DESC
  statsList.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return (b.overall || 0) - (a.overall || 0);
  });

  return statsList;
}

// ==========================================
// FUNCAO 5: VOTACAO DE CRAQUES DA RODADA (MVP)
// ==========================================
async function getMvpVotes(peladaId, date = null, userId = null) {
  const numPelada = parseInt(peladaId, 10) || DEFAULT_PELADA_ID;
  const targetDate = date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const numUserId = userId ? parseInt(userId, 10) : null;

  let allVotes = [];
  if (isPostgres && MvpVote) {
    try {
      const records = await MvpVote.findAll({
        where: { peladaId: numPelada, date: targetDate }
      });
      allVotes = records.map(r => r.toJSON());
    } catch (err) {
      console.error('Erro ao buscar votos MVP no Sequelize:', err.message);
    }
  } else {
    const data = getFallbackData();
    data.mvp_votes = data.mvp_votes || [];
    allVotes = data.mvp_votes.filter(v => Number(v.pelada_id) === numPelada && v.date === targetDate);
  }

  // Identifica voto do usuário requisitante (mesmo formato camelCase para Postgres e fallback)
  const myRaw = numUserId ? allVotes.find(v => Number(v.userId || v.user_id) === numUserId) : null;
  const myVote = myRaw ? {
    mvpPlayerId: myRaw.mvpPlayerId || myRaw.mvp_player_id || null,
    defensePlayerId: myRaw.defensePlayerId || myRaw.defense_player_id || null,
    passPlayerId: myRaw.passPlayerId || myRaw.pass_player_id || null,
    funnyPlayerId: myRaw.funnyPlayerId || myRaw.funny_player_id || null
  } : null;

  // Contabiliza votos para cada categoria
  const counts = {
    mvp: {},
    defense: {},
    pass: {},
    funny: {}
  };

  allVotes.forEach(v => {
    const mvpId = v.mvpPlayerId || v.mvp_player_id;
    const defId = v.defensePlayerId || v.defense_player_id;
    const passId = v.passPlayerId || v.pass_player_id;
    const funId = v.funnyPlayerId || v.funny_player_id;

    if (mvpId) counts.mvp[mvpId] = (counts.mvp[mvpId] || 0) + 1;
    if (defId) counts.defense[defId] = (counts.defense[defId] || 0) + 1;
    if (passId) counts.pass[passId] = (counts.pass[passId] || 0) + 1;
    if (funId) counts.funny[funId] = (counts.funny[funId] || 0) + 1;
  });

  const players = await getPlayersWithRatings(numPelada);
  const playersMap = {};
  players.forEach(p => { playersMap[p.id] = p; });

  function getPodium(catDict) {
    return Object.entries(catDict)
      .map(([pId, voteCount]) => ({
        player: playersMap[pId] || { id: pId, name: 'Jogador #' + pId },
        voteCount
      }))
      .sort((a, b) => b.voteCount - a.voteCount);
  }

  return {
    date: targetDate,
    totalVoters: allVotes.length,
    myVote: myVote || null,
    podium: {
      mvp: getPodium(counts.mvp),
      defense: getPodium(counts.defense),
      pass: getPodium(counts.pass),
      funny: getPodium(counts.funny)
    }
  };
}

async function saveMvpVote(peladaId, date, userId, voterName, votes) {
  const numPelada = parseInt(peladaId, 10) || DEFAULT_PELADA_ID;
  const targetDate = date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const numUserId = parseInt(userId, 10);
  const cleanVoter = String(voterName || 'Atleta').trim();
  const { mvpPlayerId, defensePlayerId, passPlayerId, funnyPlayerId } = votes;

  if (isPostgres && MvpVote) {
    try {
      let vote = await MvpVote.findOne({
        where: { peladaId: numPelada, date: targetDate, userId: numUserId }
      });

      if (vote) {
        vote.voterName = cleanVoter;
        vote.mvpPlayerId = mvpPlayerId ? parseInt(mvpPlayerId, 10) : null;
        vote.defensePlayerId = defensePlayerId ? parseInt(defensePlayerId, 10) : null;
        vote.passPlayerId = passPlayerId ? parseInt(passPlayerId, 10) : null;
        vote.funnyPlayerId = funnyPlayerId ? parseInt(funnyPlayerId, 10) : null;
        await vote.save();
        return vote.toJSON();
      } else {
        vote = await MvpVote.create({
          peladaId: numPelada,
          date: targetDate,
          userId: numUserId,
          voterName: cleanVoter,
          mvpPlayerId: mvpPlayerId ? parseInt(mvpPlayerId, 10) : null,
          defensePlayerId: defensePlayerId ? parseInt(defensePlayerId, 10) : null,
          passPlayerId: passPlayerId ? parseInt(passPlayerId, 10) : null,
          funnyPlayerId: funnyPlayerId ? parseInt(funnyPlayerId, 10) : null
        });
        return vote.toJSON();
      }
    } catch (err) {
      console.error('Erro ao salvar voto MVP no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  data.mvp_votes = data.mvp_votes || [];
  let existingIdx = data.mvp_votes.findIndex(v => 
    Number(v.pelada_id) === numPelada && 
    v.date === targetDate && 
    Number(v.user_id) === numUserId
  );

  const voteObj = {
    id: Date.now(),
    pelada_id: numPelada,
    date: targetDate,
    user_id: numUserId,
    voter_name: cleanVoter,
    mvp_player_id: mvpPlayerId ? parseInt(mvpPlayerId, 10) : null,
    defense_player_id: defensePlayerId ? parseInt(defensePlayerId, 10) : null,
    pass_player_id: passPlayerId ? parseInt(passPlayerId, 10) : null,
    funny_player_id: funnyPlayerId ? parseInt(funnyPlayerId, 10) : null,
    created_at: new Date().toISOString()
  };

  if (existingIdx !== -1) {
    data.mvp_votes[existingIdx] = voteObj;
  } else {
    data.mvp_votes.push(voteObj);
  }
  saveFallbackData(data);
  return voteObj;
}


// Resumo publico do banco; os detalhes de conexao so sao incluidos para super administradores.
function getDbStatus(detailed = false) {
  const summary = {
    isPostgres,
    databaseEngine: isPostgres ? 'PostgreSQL' : 'JSON Fallback Local (NÃO PERSISTE APÓS REDEPLOY)',
    connectionStatus: isPostgres ? 'Conectado e gravando no PostgreSQL' : 'PostgreSQL indisponivel; usando fallback JSON local'
  };
  if (!detailed) return summary;

  const detectedUrl = getDatabaseUrl();
  let masked = null;
  if (detectedUrl) {
    try {
      const parsed = new URL(detectedUrl);
      masked = `${parsed.protocol}//${parsed.username}:****@${parsed.host}${parsed.pathname}`;
    } catch (e) {
      masked = 'URL detectada';
    }
  }

  const foundKey = Object.keys(process.env).find(key => process.env[key] === detectedUrl) || null;

  return {
    ...summary,
    detectedEnvVar: masked,
    envVarKey: foundKey || (process.env.PGHOST ? 'PGHOST' : 'NENHUMA_VARIAVEL_ENCONTRADA'),
    relatedEnvKeysInService: Object.keys(process.env).filter(k => /postgres|database|db_|pg/i.test(k)),
    dbConnectionError: dbConnectionError || null,
    instruction: isPostgres
      ? 'O banco PostgreSQL está conectado e os dados são permanentes!'
      : 'No Railway, clique no card do serviço web "placarchampions" -> aba "Variables" -> adicione a variável DATABASE_URL com o valor ${{Postgres.DATABASE_URL}}'
  };
}

module.exports = {
  DEFAULT_PELADA_ID,
  getDbStatus,
  initDb,
  getAuthSecret,
  createUser,
  authenticateUser,
  findOrCreateGoogleUser,
  getUserById,
  getUserByEmail,
  getUserRatingsMap,
  getUserWithHashByEmail,
  getUserWithHashById,
  resetUserPassword,
  getPeladas,
  getPeladasForUser,
  getPeladaById,
  createPelada,
  updatePelada,
  deletePelada,
  getPeladaRole,
  getManagedPeladaIds,
  getPeladaAdmins,
  addPeladaAdmin,
  removePeladaAdmin,
  getUserPeladaRole,
  canUserVote,
  getPeladaMembers,
  addPeladaMember,
  updatePeladaMemberRole,
  removePeladaMember,
  joinPeladaByCode,
  saveMatch,
  getMatches,
  getPlayersWithRatings,
  getPlayerById,
  addPlayer,
  updatePlayer,
  deletePlayer,
  addPlayerRating,
  removePlayerRating,
  getAttendance,
  getAttendanceById,
  toggleAttendance,
  removeAttendance,
  getPlayerStats,
  getMvpVotes,
  saveMvpVote
};
