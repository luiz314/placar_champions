const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FALLBACK_DB_FILE = path.join(DATA_DIR, 'db_fallback.json');

// Pesos padrão para o cálculo da Média Ponderada
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

// Configuração do PostgreSQL Pool
let pool = null;
let isPostgres = false;

if (process.env.DATABASE_URL) {
  try {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL.includes('railway');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false
    });
    isPostgres = true;
    console.log('🐘 PostgreSQL Pool configurado usando DATABASE_URL.');
  } catch (err) {
    console.error('❌ Erro ao configurar Pool do PostgreSQL:', err.message);
    pool = null;
    isPostgres = false;
  }
} else {
  console.log('ℹ️ DATABASE_URL não definida. Modo fallback para JSON local ativo (data/db_fallback.json).');
}

// Helper para banco de dados fallback local JSON
function getFallbackData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FALLBACK_DB_FILE)) {
    const initial = {
      matches: [],
      players: [
        { id: 1, name: 'Lucas Silva', nickname: 'Lucão', position: 'Ponteiro', active: true, createdAt: new Date().toISOString() },
        { id: 2, name: 'Gabriel Souza', nickname: 'Gabi', position: 'Levantador', active: true, createdAt: new Date().toISOString() },
        { id: 3, name: 'Matheus Costa', nickname: 'Theus', position: 'Central', active: true, createdAt: new Date().toISOString() },
        { id: 4, name: 'Rafael Dias', nickname: 'Rafa', position: 'Oposto', active: true, createdAt: new Date().toISOString() },
        { id: 5, name: 'Bruno Lima', nickname: 'Bruninho', position: 'Líbero', active: true, createdAt: new Date().toISOString() },
        { id: 6, name: 'Carlos Eduardo', nickname: 'Cadu', position: 'Ponteiro', active: true, createdAt: new Date().toISOString() }
      ],
      player_ratings: [
        { id: 1, player_id: 1, voter_name: 'Organizador', attack: 4.5, defense: 3.5, set_pass: 3.5, movement: 4.0, overall: 3.88, created_at: new Date().toISOString() },
        { id: 2, player_id: 2, voter_name: 'Organizador', attack: 3.0, defense: 4.0, set_pass: 5.0, movement: 4.5, overall: 4.12, created_at: new Date().toISOString() },
        { id: 3, player_id: 3, voter_name: 'Organizador', attack: 4.5, defense: 4.5, set_pass: 3.0, movement: 3.5, overall: 3.88, created_at: new Date().toISOString() },
        { id: 4, player_id: 4, voter_name: 'Organizador', attack: 5.0, defense: 3.0, set_pass: 3.0, movement: 4.0, overall: 3.75, created_at: new Date().toISOString() },
        { id: 5, player_id: 5, voter_name: 'Organizador', attack: 2.0, defense: 5.0, set_pass: 4.5, movement: 5.0, overall: 4.12, created_at: new Date().toISOString() },
        { id: 6, player_id: 6, voter_name: 'Organizador', attack: 3.5, defense: 3.5, set_pass: 3.5, movement: 3.5, overall: 3.50, created_at: new Date().toISOString() }
      ],
      pelada_sessions: []
    };
    fs.writeFileSync(FALLBACK_DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(FALLBACK_DB_FILE, 'utf8'));
  } catch (err) {
    return { matches: [], players: [], player_ratings: [], pelada_sessions: [] };
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

// Inicialização das tabelas no PostgreSQL
async function initDb() {
  if (!isPostgres || !pool) return;

  const client = await pool.connect();
  try {
    console.log('🔄 Verificando e criando tabelas no PostgreSQL...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(50),
        team_a VARCHAR(100),
        score_a INT,
        team_b VARCHAR(100),
        score_b INT,
        winner VARCHAR(100),
        duration_seconds INT,
        match_number INT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        nickname VARCHAR(50),
        position VARCHAR(50) DEFAULT 'Geral',
        photo_url TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS player_ratings (
        id SERIAL PRIMARY KEY,
        player_id INT REFERENCES players(id) ON DELETE CASCADE,
        voter_name VARCHAR(100) NOT NULL,
        attack NUMERIC(3,2) NOT NULL,
        defense NUMERIC(3,2) NOT NULL,
        set_pass NUMERIC(3,2) NOT NULL,
        movement NUMERIC(3,2) NOT NULL,
        overall NUMERIC(3,2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pelada_sessions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(150),
        format VARCHAR(50),
        teams JSONB,
        bench JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabelas do PostgreSQL inicializadas com sucesso (matches, players, player_ratings, pelada_sessions)!');
  } catch (err) {
    console.error('❌ Falha ao inicializar tabelas no PostgreSQL:', err.message);
  } finally {
    client.release();
  }
}

// ==========================================
// MÉTODOS DE PARTIDAS (MATCHES)
// ==========================================
async function saveMatch(matchData) {
  const { roomId, teamA, scoreA, teamB, scoreB, winner, durationSeconds, matchNumber } = matchData;
  if (isPostgres && pool) {
    try {
      const res = await pool.query(
        `INSERT INTO matches (room_id, team_a, score_a, team_b, score_b, winner, duration_seconds, match_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [roomId || 'DEFAULT', teamA || 'LADO A', scoreA || 0, teamB || 'LADO B', scoreB || 0, winner || 'Empate', durationSeconds || 0, matchNumber || 1]
      );
      return res.rows[0];
    } catch (err) {
      console.error('Erro ao salvar partida no Postgres:', err.message);
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
  if (isPostgres && pool) {
    try {
      const res = await pool.query(
        `SELECT * FROM matches ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return res.rows;
    } catch (err) {
      console.error('Erro ao buscar partidas no Postgres:', err.message);
    }
  }
  const data = getFallbackData();
  return (data.matches || []).slice(0, limit);
}

// ==========================================
// MÉTODOS DE JOGADORES (PLAYERS)
// ==========================================
async function getPlayersWithRatings() {
  if (isPostgres && pool) {
    try {
      const query = `
        SELECT 
          p.id,
          p.name,
          p.nickname,
          p.position,
          p.photo_url,
          p.active,
          p.created_at,
          COUNT(r.id)::int AS vote_count,
          COALESCE(ROUND(AVG(r.attack), 1), 3.0) AS avg_attack,
          COALESCE(ROUND(AVG(r.defense), 1), 3.0) AS avg_defense,
          COALESCE(ROUND(AVG(r.set_pass), 1), 3.0) AS avg_set_pass,
          COALESCE(ROUND(AVG(r.movement), 1), 3.0) AS avg_movement,
          COALESCE(ROUND(AVG(r.overall), 1), 3.0) AS overall
        FROM players p
        LEFT JOIN player_ratings r ON p.id = r.player_id
        GROUP BY p.id
        ORDER BY overall DESC, p.name ASC;
      `;
      const res = await pool.query(query);
      return res.rows.map(r => ({
        ...r,
        avg_attack: Number(r.avg_attack),
        avg_defense: Number(r.avg_defense),
        avg_set_pass: Number(r.avg_set_pass),
        avg_movement: Number(r.avg_movement),
        overall: Number(r.overall)
      }));
    } catch (err) {
      console.error('Erro ao buscar jogadores no Postgres:', err.message);
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
        avg_attack: 3.0,
        avg_defense: 3.0,
        avg_set_pass: 3.0,
        avg_movement: 3.0,
        overall: 3.0
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
  }).sort((a, b) => b.overall - a.overall);
}

async function addPlayer(name, nickname = '', position = 'Geral', photoUrl = '') {
  const cleanName = String(name || '').trim();
  const cleanNick = String(nickname || '').trim() || cleanName;
  const cleanPos = String(position || 'Geral').trim();

  if (!cleanName) throw new Error('O nome do jogador é obrigatório.');

  if (isPostgres && pool) {
    try {
      const res = await pool.query(
        `INSERT INTO players (name, nickname, position, photo_url)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [cleanName, cleanNick, cleanPos, photoUrl || null]
      );
      return res.rows[0];
    } catch (err) {
      console.error('Erro ao adicionar jogador no Postgres:', err.message);
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
  if (isPostgres && pool) {
    try {
      await pool.query(`DELETE FROM players WHERE id = $1`, [numId]);
      return { success: true };
    } catch (err) {
      console.error('Erro ao excluir jogador no Postgres:', err.message);
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

  if (isPostgres && pool) {
    try {
      const res = await pool.query(
        `INSERT INTO player_ratings (player_id, voter_name, attack, defense, set_pass, movement, overall)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [pId, cleanVoter, numA, numD, numP, numM, overall]
      );
      return res.rows[0];
    } catch (err) {
      console.error('Erro ao inserir avaliação no Postgres:', err.message);
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
  if (isPostgres && pool) {
    try {
      const res = await pool.query(
        `SELECT * FROM player_ratings WHERE player_id = $1 ORDER BY created_at DESC`,
        [pId]
      );
      return res.rows;
    } catch (err) {
      console.error('Erro ao buscar avaliações no Postgres:', err.message);
    }
  }
  const data = getFallbackData();
  return (data.player_ratings || []).filter(r => r.player_id === pId).reverse();
}

// ==========================================
// SALVAR SESSÕES DE PELADA
// ==========================================
async function savePeladaSession(title, format, teams, bench = []) {
  if (isPostgres && pool) {
    try {
      const res = await pool.query(
        `INSERT INTO pelada_sessions (title, format, teams, bench)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [title || 'Pelada do Dia', format || '6x6', JSON.stringify(teams), JSON.stringify(bench)]
      );
      return res.rows[0];
    } catch (err) {
      console.error('Erro ao salvar sessão de pelada no Postgres:', err.message);
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
  pool,
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
