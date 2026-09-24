const crypto = require('crypto');
const { Sequelize, DataTypes, Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

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
let PeladaSession = null;
let isPostgres = false;

// ==========================================
// SEGURANÇA E HASHING DE SENHAS
// ==========================================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(String(password), salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}


// Inicializa Sequelize se DATABASE_URL estiver configurada (ex: Railway)
if (process.env.DATABASE_URL) {
  try {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL.includes('railway');
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      dialectOptions: isProduction ? {
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
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      role: { type: DataTypes.STRING(20), defaultValue: 'user' } // 'admin' ou 'user'
    }, {
      tableName: 'users',
      timestamps: true,
      underscored: true
    });

    // Modelo de Partidas
    Match = sequelize.define('Match', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      roomId: { type: DataTypes.STRING, defaultValue: 'DEFAULT' },
      teamA: { type: DataTypes.STRING, defaultValue: 'LADO A' },
      scoreA: { type: DataTypes.INTEGER, defaultValue: 0 },
      teamB: { type: DataTypes.STRING, defaultValue: 'LADO B' },
      scoreB: { type: DataTypes.INTEGER, defaultValue: 0 },
      winner: { type: DataTypes.STRING, defaultValue: 'Empate' },
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
      adminName: { type: DataTypes.STRING(100), defaultValue: 'Administrador' }
    }, {
      tableName: 'peladas',
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
      underscored: true
    });

    // Modelo de Sessoes de Pelada / Escalacoes
    PeladaSession = sequelize.define('PeladaSession', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      peladaId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'peladas', key: 'id' },
        onDelete: 'SET NULL'
      },
      title: { type: DataTypes.STRING(150), defaultValue: 'Pelada do Dia' },
      format: { type: DataTypes.STRING(50), defaultValue: '6x6' },
      teams: { type: DataTypes.JSONB },
      bench: { type: DataTypes.JSONB }
    }, {
      tableName: 'pelada_sessions',
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
    Pelada.hasMany(PeladaSession, { foreignKey: 'peladaId', as: 'sessions' });
    PeladaSession.belongsTo(Pelada, { foreignKey: 'peladaId', as: 'pelada' });

    isPostgres = true;
    console.log('Sequelize ORM configurado com PostgreSQL (Railway).');
  } catch (err) {
    console.error('Erro ao inicializar Sequelize com PostgreSQL:', err.message);
    isPostgres = false;
  }
} else {
  console.log('DATABASE_URL nao definida. Modo fallback para JSON local ativo (data/db_fallback.json).');
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

// Helper para banco de dados fallback local JSON
function getFallbackData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const defaultPeladas = [
    {
      id: 1,
      name: 'Pelada Principal',
      admin_name: 'Administrador',
      created_at: new Date().toISOString()
    }
  ];

  const defaultPlayers = INITIAL_PELADA_PLAYERS.map((name, idx) => ({
    id: idx + 1,
    pelada_id: 1,
    name: name,
    nickname: name,
    position: 'Geral',
    active: true,
    createdAt: new Date().toISOString()
  }));

  if (!fs.existsSync(FALLBACK_DB_FILE)) {
    const initial = {
      users: [
        {
          id: 1,
          username: 'admin',
          password_hash: hashPassword('admin123'),
          name: 'Administrador Principal',
          role: 'admin',
          created_at: new Date().toISOString()
        }
      ],
      peladas: defaultPeladas,
      matches: [],
      players: defaultPlayers,
      player_ratings: [],
      pelada_sessions: []
    };
    fs.writeFileSync(FALLBACK_DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(FALLBACK_DB_FILE, 'utf8'));

    if (!parsed.users || parsed.users.length === 0) {
      parsed.users = [
        {
          id: 1,
          username: 'admin',
          password_hash: hashPassword('admin123'),
          name: 'Administrador Principal',
          role: 'admin',
          created_at: new Date().toISOString()
        }
      ];
      saveFallbackData(parsed);
    }
    // Garante que peladas exista
    if (!parsed.peladas || parsed.peladas.length === 0) {
      parsed.peladas = defaultPeladas;
    }

    // Se ainda tiver os jogadores antigos de exemplo, atualiza para os 12 novos
    const hasOldExamples = (parsed.players || []).some(p => p.name === 'Lucas Silva' || p.name === 'Gabriel Souza');
    if (hasOldExamples || !parsed.players || parsed.players.length === 0) {
      parsed.players = defaultPlayers;
      parsed.player_ratings = [];
      saveFallbackData(parsed);
    } else {
      // Garante pelada_id nos jogadores existentes
      let updated = false;
      const defaultPeladaId = parsed.peladas[0].id;
      parsed.players.forEach(p => {
        if (!p.pelada_id) {
          p.pelada_id = defaultPeladaId;
          updated = true;
        }
      });
      if (updated) saveFallbackData(parsed);
    }
    return parsed;
  } catch (err) {
    return { peladas: defaultPeladas, matches: [], players: defaultPlayers, player_ratings: [], pelada_sessions: [] };
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

// ==========================================
// SINCRONIZACAO AUTOMATICA E AUTONOMA DO ESQUEMA
// ==========================================
async function initDb() {
  if (!isPostgres || !sequelize) {
    getFallbackData(); // Garante inicializacao do fallback
    return;
  }

  try {
    console.log('Executando sincronizacao autonoma do banco (Sequelize auto-alter)...');
    await sequelize.sync({ alter: true });
    console.log('Banco de dados PostgreSQL 100% sincronizado de forma autonoma!');
    // Garante usuario admin inicial no Postgres
    const adminUser = await User.findOne({ where: { username: 'admin' } });
    if (!adminUser) {
      await User.create({
        username: 'admin',
        passwordHash: hashPassword('admin123'),
        name: 'Administrador Principal',
        role: 'admin'
      });
      console.log('👤 Usuario admin padrao criado no PostgreSQL.');
    }

    // Garante que a Sala 733849 solicitada pelo usuario exista
    let sala733849 = await Pelada.findByPk(733849);
    if (!sala733849) {
      sala733849 = await Pelada.create({
        id: 733849,
        name: 'Sala 733849',
        adminName: 'Administrador'
      });
      console.log('🏐 Sala 733849 (#733849) criada no PostgreSQL.');
    }

    // Migra todos os jogadores cadastrados para a sala 733849
    await Player.update(
      { peladaId: 733849 },
      { where: { [Op.or]: [{ peladaId: 1 }, { peladaId: null }] } }
    );

    // Remove jogadores de exemplo antigos se existirem
    const oldExampleNames = ['Lucas Silva', 'Gabriel Souza', 'Matheus Costa', 'Rafael Dias', 'Bruno Lima', 'Carlos Eduardo', 'Thiago Alves'];
    await Player.destroy({
      where: {
        name: oldExampleNames
      }
    });

    // Insere os 12 novos jogadores solicitados na pelada padrao caso ainda nao existam
    for (const name of INITIAL_PELADA_PLAYERS) {
      const exists = await Player.findOne({ where: { name, peladaId: defaultPelada.id } });
      if (!exists) {
        await Player.create({
          peladaId: defaultPelada.id,
          name: name,
          nickname: name,
          position: 'Geral',
          active: true
        });
        console.log('Jogador ' + name + ' adicionado a Pelada #' + defaultPelada.id + ' no PostgreSQL.');
      }
    }
  } catch (err) {
    console.error('Erro na sincronizacao autonoma do Sequelize:', err.message);
  }
}


// ==========================================
// METODOS DE AUTENTICACAO & USUARIOS
// ==========================================

async function createUser(username, password, name, role = 'user') {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  const cleanRole = role === 'admin' ? 'admin' : 'user';

  if (!cleanUsername || cleanUsername.length < 3) {
    throw new Error('O nome de usuario deve ter pelo menos 3 caracteres.');
  }
  if (!password || String(password).length < 4) {
    throw new Error('A senha deve ter pelo menos 4 caracteres.');
  }
  if (!cleanName) {
    throw new Error('O nome do usuario e obrigatorio.');
  }

  const passHash = hashPassword(password);

  if (isPostgres && User) {
    try {
      const exists = await User.findOne({ where: { username: cleanUsername } });
      if (exists) throw new Error('Este nome de usuario ja esta em uso.');

      const user = await User.create({
        username: cleanUsername,
        passwordHash: passHash,
        name: cleanName,
        role: cleanRole
      });
      const raw = user.toJSON();
      return { id: raw.id, username: raw.username, name: raw.name, role: raw.role, created_at: raw.createdAt };
    } catch (err) {
      console.error('Erro ao criar usuario no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback JSON
  const data = getFallbackData();
  if (!data.users) data.users = [];
  const exists = data.users.find(u => u.username.toLowerCase() === cleanUsername);
  if (exists) throw new Error('Este nome de usuario ja esta em uso.');

  const nextId = data.users.length > 0 ? Math.max(...data.users.map(u => Number(u.id))) + 1 : 1;
  const newUser = {
    id: nextId,
    username: cleanUsername,
    password_hash: passHash,
    name: cleanName,
    role: cleanRole,
    created_at: new Date().toISOString()
  };
  data.users.push(newUser);
  saveFallbackData(data);
  return { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role, created_at: newUser.created_at };
}

async function authenticateUser(username, password) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!cleanUsername || !password) {
    throw new Error('Usuario e senha sao obrigatorios.');
  }

  if (isPostgres && User) {
    try {
      const user = await User.findOne({ where: { username: cleanUsername } });
      if (!user) throw new Error('Usuario ou senha incorretos.');
      const valid = verifyPassword(password, user.passwordHash);
      if (!valid) throw new Error('Usuario ou senha incorretos.');
      const raw = user.toJSON();
      return { id: raw.id, username: raw.username, name: raw.name, role: raw.role };
    } catch (err) {
      throw err;
    }
  }

  // Fallback JSON
  const data = getFallbackData();
  const user = (data.users || []).find(u => u.username.toLowerCase() === cleanUsername);
  if (!user) throw new Error('Usuario ou senha incorretos.');
  const valid = verifyPassword(password, user.password_hash);
  if (!valid) throw new Error('Usuario ou senha incorretos.');
  return { id: user.id, username: user.username, name: user.name, role: user.role };
}

async function getUserById(id) {
  const numId = parseInt(id, 10);
  if (isPostgres && User) {
    try {
      const user = await User.findByPk(numId);
      if (!user) return null;
      const raw = user.toJSON();
      return { id: raw.id, username: raw.username, name: raw.name, role: raw.role };
    } catch (err) {
      console.error('Erro ao buscar usuario por ID:', err.message);
      return null;
    }
  }

  const data = getFallbackData();
  const user = (data.users || []).find(u => Number(u.id) === numId);
  if (!user) return null;
  return { id: user.id, username: user.username, name: user.name, role: user.role };
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
async function getPeladas() {
  if (isPostgres && Pelada) {
    try {
      const peladas = await Pelada.findAll({
        order: [['id', 'ASC']],
        include: [{
          model: Player,
          as: 'players',
          attributes: ['id']
        }]
      });

      return peladas.map(p => {
        const raw = p.toJSON();
        return {
          id: raw.id,
          name: raw.name,
          admin_name: raw.adminName || 'Administrador',
          player_count: (raw.players || []).length,
          created_at: raw.createdAt
        };
      });
    } catch (err) {
      console.error('Erro ao buscar peladas no Sequelize:', err.message);
    }
  }

  // Fallback
  const data = getFallbackData();
  const peladas = data.peladas || [];
  const players = data.players || [];

  return peladas.map(p => ({
    id: p.id,
    name: p.name,
    admin_name: p.admin_name || 'Administrador',
    player_count: players.filter(pl => Number(pl.pelada_id) === Number(p.id)).length,
    created_at: p.created_at
  }));
}

async function getPeladaById(id) {
  const numId = parseInt(id, 10);
  if (isPostgres && Pelada) {
    try {
      const pelada = await Pelada.findByPk(numId);
      if (pelada) {
        const raw = pelada.toJSON();
        return {
          id: raw.id,
          name: raw.name,
          admin_name: raw.adminName || 'Administrador',
          created_at: raw.createdAt
        };
      }
      return null;
    } catch (err) {
      console.error('Erro ao buscar pelada por ID no Sequelize:', err.message);
    }
  }

  const data = getFallbackData();
  return (data.peladas || []).find(p => Number(p.id) === numId) || null;
}

async function createPelada(name, adminName = 'Administrador') {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('O nome da pelada e obrigatorio.');

  if (isPostgres && Pelada) {
    try {
      const pelada = await Pelada.create({
        name: cleanName,
        adminName: String(adminName || 'Administrador').trim()
      });
      const raw = pelada.toJSON();
      return {
        id: raw.id,
        name: raw.name,
        admin_name: raw.adminName,
        player_count: 0,
        created_at: raw.createdAt
      };
    } catch (err) {
      console.error('Erro ao criar pelada no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  if (!data.peladas) data.peladas = [];
  const nextId = data.peladas.length > 0 ? Math.max(...data.peladas.map(p => Number(p.id))) + 1 : 1;
  const newPelada = {
    id: nextId,
    name: cleanName,
    admin_name: String(adminName || 'Administrador').trim(),
    created_at: new Date().toISOString()
  };
  data.peladas.push(newPelada);
  saveFallbackData(data);
  return { ...newPelada, player_count: 0 };
}

async function updatePelada(id, name, adminName) {
  const numId = parseInt(id, 10);
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('O nome da pelada nao pode ser vazio.');

  if (isPostgres && Pelada) {
    try {
      const pelada = await Pelada.findByPk(numId);
      if (!pelada) throw new Error('Pelada nao encontrada.');
      pelada.name = cleanName;
      if (adminName !== undefined) pelada.adminName = adminName;
      await pelada.save();
      return {
        id: pelada.id,
        name: pelada.name,
        admin_name: pelada.adminName,
        created_at: pelada.createdAt
      };
    } catch (err) {
      console.error('Erro ao atualizar pelada no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  const pelada = (data.peladas || []).find(p => Number(p.id) === numId);
  if (!pelada) throw new Error('Pelada nao encontrada.');
  pelada.name = cleanName;
  if (adminName !== undefined) pelada.admin_name = adminName;
  saveFallbackData(data);
  return pelada;
}

async function deletePelada(id) {
  const numId = parseInt(id, 10);
  if (isPostgres && Pelada) {
    try {
      await Pelada.destroy({ where: { id: numId } });
      return { success: true };
    } catch (err) {
      console.error('Erro ao excluir pelada no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  data.peladas = (data.peladas || []).filter(p => Number(p.id) !== numId);
  data.players = (data.players || []).filter(p => Number(p.pelada_id) !== numId);
  saveFallbackData(data);
  return { success: true };
}

// ==========================================
// METODOS DE PARTIDAS (MATCHES)
// ==========================================
async function saveMatch(matchData) {
  const { roomId, teamA, scoreA, teamB, scoreB, winner, durationSeconds, matchNumber } = matchData;
  if (isPostgres && Match) {
    try {
      const match = await Match.create({
        roomId: roomId || 'DEFAULT',
        teamA: teamA || 'LADO A',
        scoreA: scoreA || 0,
        teamB: teamB || 'LADO B',
        scoreB: scoreB || 0,
        winner: winner || 'Empate',
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
    team_a: teamA || 'LADO A',
    score_a: scoreA || 0,
    team_b: teamB || 'LADO B',
    score_b: scoreB || 0,
    winner: winner || 'Empate',
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

      return players.map(p => {
        const raw = p.toJSON();
        const ratings = raw.ratings || [];
        const count = ratings.length;

        if (count === 0) {
          return {
            id: raw.id,
            pelada_id: raw.peladaId,
            name: raw.name,
            nickname: raw.nickname,
            position: raw.position,
            photo_url: raw.photoUrl,
            active: raw.active,
            created_at: raw.createdAt,
            vote_count: 0,
            avg_attack: 0,
            avg_defense: 0,
            avg_set_pass: 0,
            avg_movement: 0,
            overall: 0
          };
        }

        const sumA = ratings.reduce((acc, cur) => acc + Number(cur.attack || 0), 0);
        const sumD = ratings.reduce((acc, cur) => acc + Number(cur.defense || 0), 0);
        const sumP = ratings.reduce((acc, cur) => acc + Number(cur.setPass || 0), 0);
        const sumM = ratings.reduce((acc, cur) => acc + Number(cur.movement || 0), 0);
        const sumO = ratings.reduce((acc, cur) => acc + Number(cur.overall || 0), 0);

        return {
          id: raw.id,
          pelada_id: raw.peladaId,
          name: raw.name,
          nickname: raw.nickname,
          position: raw.position,
          photo_url: raw.photoUrl,
          active: raw.active,
          created_at: raw.createdAt,
          vote_count: count,
          avg_attack: Number((sumA / count).toFixed(1)),
          avg_defense: Number((sumD / count).toFixed(1)),
          avg_set_pass: Number((sumP / count).toFixed(1)),
          avg_movement: Number((sumM / count).toFixed(1)),
          overall: Number((sumO / count).toFixed(1))
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

  return players.map(p => {
    const pRatings = ratings.filter(r => r.player_id === p.id);
    const count = pRatings.length;
    if (count === 0) {
      return {
        ...p,
        pelada_id: p.pelada_id || 1,
        vote_count: 0,
        avg_attack: 0,
        avg_defense: 0,
        avg_set_pass: 0,
        avg_movement: 0,
        overall: 0
      };
    }
    const sumA = pRatings.reduce((acc, cur) => acc + Number(cur.attack), 0);
    const sumD = pRatings.reduce((acc, cur) => acc + Number(cur.defense), 0);
    const sumP = pRatings.reduce((acc, cur) => acc + Number(cur.set_pass), 0);
    const sumM = pRatings.reduce((acc, cur) => acc + Number(cur.movement), 0);
    const sumO = pRatings.reduce((acc, cur) => acc + Number(cur.overall), 0);

    return {
      ...p,
      pelada_id: p.pelada_id || 1,
      vote_count: count,
      avg_attack: Number((sumA / count).toFixed(1)),
      avg_defense: Number((sumD / count).toFixed(1)),
      avg_set_pass: Number((sumP / count).toFixed(1)),
      avg_movement: Number((sumM / count).toFixed(1)),
      overall: Number((sumO / count).toFixed(1))
    };
  }).sort((a, b) => (b.overall - a.overall) || a.name.localeCompare(b.name));
}

async function addPlayer(name, nickname = '', position = 'Geral', photoUrl = '', peladaId = null) {
  const cleanName = String(name || '').trim();
  const cleanNick = String(nickname || '').trim() || cleanName;
  const cleanPos = String(position || 'Geral').trim();
  let numPeladaId = peladaId ? parseInt(peladaId, 10) : null;

  if (!cleanName) throw new Error('O nome do jogador e obrigatorio.');

  if (isPostgres && Player) {
    try {
      if (!numPeladaId) {
        const first = await Pelada.findOne({ order: [['id', 'ASC']] });
        numPeladaId = first ? first.id : 1;
      }
      const p = await Player.create({
        peladaId: numPeladaId,
        name: cleanName,
        nickname: cleanNick,
        position: cleanPos,
        photoUrl: photoUrl || null,
        active: true
      });
      return { ...p.toJSON(), pelada_id: numPeladaId };
    } catch (err) {
      console.error('Erro ao adicionar jogador no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  if (!numPeladaId) {
    numPeladaId = (data.peladas && data.peladas.length > 0) ? data.peladas[0].id : 1;
  }
  const newPlayer = {
    id: Date.now(),
    pelada_id: numPeladaId,
    name: cleanName,
    nickname: cleanNick,
    position: cleanPos,
    photo_url: photoUrl || '',
    active: true,
    created_at: new Date().toISOString()
  };
  data.players.push(newPlayer);
  saveFallbackData(data);
  return newPlayer;
}

async function updatePlayer(id, updates = {}) {
  const numId = parseInt(id, 10);
  if (isPostgres && Player) {
    try {
      const player = await Player.findByPk(numId);
      if (!player) throw new Error('Jogador nao encontrado.');
      if (updates.name !== undefined) player.name = String(updates.name).trim();
      if (updates.nickname !== undefined) player.nickname = String(updates.nickname).trim();
      if (updates.position !== undefined) player.position = String(updates.position).trim();
      if (updates.photoUrl !== undefined) player.photoUrl = updates.photoUrl;
      if (updates.photo_url !== undefined) player.photoUrl = updates.photo_url;
      if (updates.peladaId !== undefined) player.peladaId = parseInt(updates.peladaId, 10);
      if (updates.pelada_id !== undefined) player.peladaId = parseInt(updates.pelada_id, 10);
      if (updates.active !== undefined) player.active = Boolean(updates.active);
      await player.save();
      const raw = player.toJSON();
      return { ...raw, photo_url: raw.photoUrl, pelada_id: raw.peladaId };
    } catch (err) {
      console.error('Erro ao atualizar jogador no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  const player = (data.players || []).find(p => Number(p.id) === numId);
  if (!player) throw new Error('Jogador nao encontrado.');
  if (updates.name !== undefined) player.name = String(updates.name).trim();
  if (updates.nickname !== undefined) player.nickname = String(updates.nickname).trim();
  if (updates.position !== undefined) player.position = String(updates.position).trim();
  if (updates.photoUrl !== undefined) player.photo_url = updates.photoUrl;
  if (updates.photo_url !== undefined) player.photo_url = updates.photo_url;
  if (updates.peladaId !== undefined) player.pelada_id = parseInt(updates.peladaId, 10);
  if (updates.pelada_id !== undefined) player.pelada_id = parseInt(updates.pelada_id, 10);
  if (updates.active !== undefined) player.active = Boolean(updates.active);
  saveFallbackData(data);
  return player;
}

async function deletePlayer(id) {
  const numId = parseInt(id, 10);
  if (isPostgres && Player) {
    try {
      await Player.destroy({ where: { id: numId } });
      return { success: true };
    } catch (err) {
      console.error('Erro ao excluir jogador no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  data.players = (data.players || []).filter(p => p.id !== numId);
  data.player_ratings = (data.player_ratings || []).filter(r => r.player_id !== numId);
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

async function getPlayerRatings(playerId) {
  const pId = parseInt(playerId, 10);
  if (isPostgres && PlayerRating) {
    try {
      const ratings = await PlayerRating.findAll({
        where: { playerId: pId },
        order: [['created_at', 'DESC']]
      });
      return ratings.map(r => r.toJSON());
    } catch (err) {
      console.error('Erro ao buscar avaliacoes no Sequelize:', err.message);
    }
  }
  const data = getFallbackData();
  return (data.player_ratings || []).filter(r => r.player_id === pId).reverse();
}

// ==========================================
// SALVAR SESSOES DE PELADA
// ==========================================
async function savePeladaSession(title, format, teams, bench = [], peladaId = null) {
  const numPeladaId = peladaId ? parseInt(peladaId, 10) : null;
  if (isPostgres && PeladaSession) {
    try {
      const session = await PeladaSession.create({
        peladaId: numPeladaId,
        title: title || 'Pelada do Dia',
        format: format || '6x6',
        teams: teams,
        bench: bench
      });
      return session.toJSON();
    } catch (err) {
      console.error('Erro ao salvar sessao de pelada no Sequelize:', err.message);
    }
  }

  const data = getFallbackData();
  const session = {
    id: Date.now(),
    pelada_id: numPeladaId,
    title: title || 'Pelada do Dia',
    format: format || '6x6',
    teams,
    bench,
    created_at: new Date().toISOString()
  };
  if (!data.pelada_sessions) data.pelada_sessions = [];
  data.pelada_sessions.unshift(session);
  saveFallbackData(data);
  return session;
}

module.exports = {
  sequelize,
  models: { Match, User, Pelada, Player, PlayerRating, PeladaSession },
  isPostgres: () => isPostgres,
  initDb,
  createUser,
  authenticateUser,
  getUserById,
  getUserRatingsMap,
  getPeladas,
  getPeladaById,
  createPelada,
  updatePelada,
  deletePelada,
  saveMatch,
  getMatches,
  getPlayersWithRatings,
  addPlayer,
  updatePlayer,
  deletePlayer,
  addPlayerRating,
  getPlayerRatings,
  savePeladaSession,
  calculateOverall
};
