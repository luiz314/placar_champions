const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FALLBACK_DB_FILE = path.join(DATA_DIR, 'db_fallback.json');

// Pesos para o cálculo da Média Ponderada
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
let Player = null;
let PlayerRating = null;
let PeladaSession = null;
let isPostgres = false;

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
    // DEFINIÇÃO DOS MODELOS AUTÔNOMOS (SEQUELIZE)
    // ==========================================

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

    // Modelo de Jogadores
    Player = sequelize.define('Player', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
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

    // Modelo de Avaliações com Estrelas (1 a 5)
    PlayerRating = sequelize.define('PlayerRating', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      playerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'players', key: 'id' },
        onDelete: 'CASCADE'
      },
      voterName: { type: DataTypes.STRING(100), defaultValue: 'Anônimo' },
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

    // Modelo de Sessões de Pelada / Escalações
    PeladaSession = sequelize.define('PeladaSession', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(150), defaultValue: 'Pelada do Dia' },
      format: { type: DataTypes.STRING(50), defaultValue: '6x6' },
      teams: { type: DataTypes.JSONB },
      bench: { type: DataTypes.JSONB }
    }, {
      tableName: 'pelada_sessions',
      timestamps: true,
      underscored: true
    });

    // Relações
    Player.hasMany(PlayerRating, { foreignKey: 'playerId', as: 'ratings', onDelete: 'CASCADE' });
    PlayerRating.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });

    isPostgres = true;
    console.log('🐘 Sequelize ORM configurado com PostgreSQL (Railway).');
  } catch (err) {
    console.error('❌ Erro ao inicializar Sequelize com PostgreSQL:', err.message);
    isPostgres = false;
  }
} else {
  console.log('ℹ️ DATABASE_URL não definida. Modo fallback para JSON local ativo (data/db_fallback.json).');
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

  const defaultPlayers = INITIAL_PELADA_PLAYERS.map((name, idx) => ({
    id: idx + 1,
    name: name,
    nickname: name,
    position: 'Geral',
    active: true,
    createdAt: new Date().toISOString()
  }));

  if (!fs.existsSync(FALLBACK_DB_FILE)) {
    const initial = {
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
    // Se ainda tiver os jogadores antigos de exemplo, atualiza para os 12 novos
    const hasOldExamples = (parsed.players || []).some(p => p.name === 'Lucas Silva' || p.name === 'Gabriel Souza');
    if (hasOldExamples || !parsed.players || parsed.players.length === 0) {
      parsed.players = defaultPlayers;
      parsed.player_ratings = [];
      saveFallbackData(parsed);
    }
    return parsed;
  } catch (err) {
    return { matches: [], players: defaultPlayers, player_ratings: [], pelada_sessions: [] };
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
// SINCRONIZAÇÃO AUTOMÁTICA E AUTÔNOMA DO ESQUEMA
// Cria tabelas e adiciona novas colunas automaticamente
// ==========================================
async function initDb() {
  if (!isPostgres || !sequelize) {
    getFallbackData(); // Garante inicialização do fallback com os 12 jogadores
    return;
  }

  try {
    console.log('🔄 Executando sincronização autônoma do banco (Sequelize auto-alter)...');
    // { alter: true } cria tabelas ausentes e adiciona novas colunas automaticamente
    await sequelize.sync({ alter: true });
    console.log('✅ Banco de dados PostgreSQL 100% sincronizado de forma autônoma!');

    // Remove jogadores de exemplo antigos se existirem
    const oldExampleNames = ['Lucas Silva', 'Gabriel Souza', 'Matheus Costa', 'Rafael Dias', 'Bruno Lima', 'Carlos Eduardo', 'Thiago Alves'];
    await Player.destroy({
      where: {
        name: oldExampleNames
      }
    });

    // Insere os 12 novos jogadores solicitados (sem estrelas) caso ainda não existam
    for (const name of INITIAL_PELADA_PLAYERS) {
      const exists = await Player.findOne({ where: { name } });
      if (!exists) {
        await Player.create({
          name: name,
          nickname: name,
          position: 'Geral',
          active: true
        });
        console.log(`➕ Jogador "${name}" adicionado ao PostgreSQL.`);
      }
    }
    console.log('🏐 Elenco inicial de 12 jogadores pronto no PostgreSQL (sem estrelas).');
  } catch (err) {
    console.error('❌ Erro na sincronização autônoma do Sequelize:', err.message);
  }
}

// ==========================================
// MÉTODOS DE PARTIDAS (MATCHES)
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
// MÉTODOS DE JOGADORES (PLAYERS)
// ==========================================
async function getPlayersWithRatings() {
  if (isPostgres && Player) {
    try {
      const players = await Player.findAll({
        include: [{
          model: PlayerRating,
          as: 'ratings'
        }],
        order: [['name', 'ASC']]
      });

      return players.map(p => {
        const raw = p.toJSON();
        const ratings = raw.ratings || [];
        const count = ratings.length;

        if (count === 0) {
          return {
            id: raw.id,
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
  const players = data.players || [];
  const ratings = data.player_ratings || [];

  return players.map(p => {
    const pRatings = ratings.filter(r => r.player_id === p.id);
    const count = pRatings.length;
    if (count === 0) {
      return {
        ...p,
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
      vote_count: count,
      avg_attack: Number((sumA / count).toFixed(1)),
      avg_defense: Number((sumD / count).toFixed(1)),
      avg_set_pass: Number((sumP / count).toFixed(1)),
      avg_movement: Number((sumM / count).toFixed(1)),
      overall: Number((sumO / count).toFixed(1))
    };
  }).sort((a, b) => (b.overall - a.overall) || a.name.localeCompare(b.name));
}

async function addPlayer(name, nickname = '', position = 'Geral', photoUrl = '') {
  const cleanName = String(name || '').trim();
  const cleanNick = String(nickname || '').trim() || cleanName;
  const cleanPos = String(position || 'Geral').trim();

  if (!cleanName) throw new Error('O nome do jogador é obrigatório.');

  if (isPostgres && Player) {
    try {
      const p = await Player.create({
        name: cleanName,
        nickname: cleanNick,
        position: cleanPos,
        photoUrl: photoUrl || null,
        active: true
      });
      return p.toJSON();
    } catch (err) {
      console.error('Erro ao adicionar jogador no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  const newPlayer = {
    id: Date.now(),
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
// MÉTODOS DE AVALIAÇÃO DE JOGADORES (RATINGS)
// ==========================================
async function addPlayerRating(playerId, voterName, attack, defense, setPass, movement) {
  const pId = parseInt(playerId, 10);
  const cleanVoter = String(voterName || 'Anônimo').trim().slice(0, 50);

  const numA = Math.max(1, Math.min(5, parseFloat(attack) || 3));
  const numD = Math.max(1, Math.min(5, parseFloat(defense) || 3));
  const numP = Math.max(1, Math.min(5, parseFloat(setPass) || 3));
  const numM = Math.max(1, Math.min(5, parseFloat(movement) || 3));
  const overall = calculateOverall(numA, numD, numP, numM);

  if (isPostgres && PlayerRating) {
    try {
      const r = await PlayerRating.create({
        playerId: pId,
        voterName: cleanVoter,
        attack: numA,
        defense: numD,
        setPass: numP,
        movement: numM,
        overall: overall
      });
      return r.toJSON();
    } catch (err) {
      console.error('Erro ao inserir avaliação no Sequelize:', err.message);
      throw err;
    }
  }

  // Fallback
  const data = getFallbackData();
  const newRating = {
    id: Date.now(),
    player_id: pId,
    voter_name: cleanVoter,
    attack: numA,
    defense: numD,
    set_pass: numP,
    movement: numM,
    overall: overall,
    created_at: new Date().toISOString()
  };
  if (!data.player_ratings) data.player_ratings = [];
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
      console.error('Erro ao buscar avaliações no Sequelize:', err.message);
    }
  }
  const data = getFallbackData();
  return (data.player_ratings || []).filter(r => r.player_id === pId).reverse();
}

// ==========================================
// SALVAR SESSÕES DE PELADA
// ==========================================
async function savePeladaSession(title, format, teams, bench = []) {
  if (isPostgres && PeladaSession) {
    try {
      const session = await PeladaSession.create({
        title: title || 'Pelada do Dia',
        format: format || '6x6',
        teams: teams,
        bench: bench
      });
      return session.toJSON();
    } catch (err) {
      console.error('Erro ao salvar sessão de pelada no Sequelize:', err.message);
    }
  }

  const data = getFallbackData();
  const session = {
    id: Date.now(),
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
  models: { Match, Player, PlayerRating, PeladaSession },
  isPostgres: () => isPostgres,
  initDb,
  saveMatch,
  getMatches,
  getPlayersWithRatings,
  addPlayer,
  deletePlayer,
  addPlayerRating,
  getPlayerRatings,
  savePeladaSession,
  calculateOverall
};
