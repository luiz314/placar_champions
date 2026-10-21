const crypto = require('crypto');

// ==========================================
// SENHAS (PBKDF2 com custo atual + compatibilidade com hashes antigos)
// ==========================================
const PBKDF2_ITERATIONS = 210000;
const LEGACY_ITERATIONS = 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), 'hex');
  const bufB = Buffer.from(String(b), 'hex');
  return bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB);
}

// Retorna { valid, needsRehash }. Hashes antigos ("salt:hash", 1000 iteracoes) continuam aceitos
// e devem ser regravados no formato novo apos um login bem-sucedido.
function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return { valid: false, needsRehash: false };

  if (storedHash.startsWith('pbkdf2$')) {
    const [, iterStr, salt, hash] = storedHash.split('$');
    const iterations = parseInt(iterStr, 10);
    if (!iterations || !salt || !hash) return { valid: false, needsRehash: false };
    const computed = crypto.pbkdf2Sync(String(password), salt, iterations, 64, 'sha512').toString('hex');
    const valid = safeEqualHex(computed, hash);
    return { valid, needsRehash: valid && iterations < PBKDF2_ITERATIONS };
  }

  if (storedHash.includes(':')) {
    const [salt, hash] = storedHash.split(':');
    const computed = crypto.pbkdf2Sync(String(password), salt, LEGACY_ITERATIONS, 64, 'sha512').toString('hex');
    const valid = safeEqualHex(computed, hash);
    return { valid, needsRehash: valid };
  }

  return { valid: false, needsRehash: false };
}

// ==========================================
// TOKENS DE SESSAO (HMAC-SHA256, sem dependencias externas)
// ==========================================
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let tokenSecret = null;

function setTokenSecret(secret) {
  tokenSecret = String(secret);
}

function sign(data) {
  if (!tokenSecret) throw new Error('Segredo de autenticacao nao inicializado.');
  return crypto.createHmac('sha256', tokenSecret).update(data).digest('base64url');
}

// Todo token assinado carrega "typ" (session, reset ou invite) para que um tipo
// nunca possa ser usado no lugar de outro (ex: link de redefinicao como login).
function signTyped(typ, data) {
  const payload = Buffer.from(JSON.stringify({ ...data, typ })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

// Valida assinatura e expiracao e devolve o conteudo do token (ou null)
function readSigned(token) {
  if (!token || typeof token !== 'string' || !tokenSecret) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(sign(payload));
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || !data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function issueToken(userId) {
  return signTyped('session', { uid: Number(userId), exp: Date.now() + TOKEN_TTL_MS });
}

// Retorna o id do usuario se o token de SESSAO for valido e nao expirado; caso contrario, null.
// Sessoes emitidas antes do campo "typ" continuam aceitas, mas tokens de reset/convite
// antigos (que tem email/fp/pid) sao recusados.
function verifyToken(token) {
  const data = readSigned(token);
  if (!data || !data.uid) return null;
  const isSession = data.typ === 'session' || (!data.typ && !data.email && !data.fp && !data.pid);
  return isSession ? Number(data.uid) : null;
}

// ==========================================
// TOKENS DE RECUPERAÇÃO DE SENHA (1 hora)
// ==========================================
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function passwordFingerprint(user) {
  return String(user.passwordHash || user.password_hash || 'no-pass').slice(-16);
}

function issuePasswordResetToken(user) {
  return signTyped('reset', {
    uid: Number(user.id),
    email: String(user.username).toLowerCase(),
    fp: passwordFingerprint(user),
    exp: Date.now() + RESET_TOKEN_TTL_MS
  });
}

// Com "user", confirma tambem que o token e dele e que a senha nao mudou desde a emissao (uso unico)
function verifyPasswordResetToken(token, user) {
  const data = readSigned(token);
  if (!data || data.typ !== 'reset' || !data.uid) return null;
  if (user) {
    if (Number(user.id) !== Number(data.uid)) return null;
    if (data.fp !== passwordFingerprint(user)) return null;
  }
  return data;
}

// ==========================================
// TOKENS DE CONVITE PARA PELADA (7 dias)
// ==========================================
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function issuePeladaInviteToken({ peladaId, email, role, inviterId }) {
  return signTyped('invite', {
    pid: Number(peladaId),
    email: String(email).toLowerCase().trim(),
    role: role || 'votante',
    inviter: Number(inviterId || 0),
    exp: Date.now() + INVITE_TOKEN_TTL_MS
  });
}

// Convite so vale para a conta com o mesmo e-mail para o qual foi enviado
function verifyPeladaInviteToken(token, user) {
  const data = readSigned(token);
  if (!data || data.typ !== 'invite' || !data.pid || !data.email) return null;
  if (user && String(user.username || '').toLowerCase() !== data.email) return null;
  return data;
}

// ==========================================
// SUPER ADMINISTRADORES (definidos pela variavel SUPER_ADMIN_EMAILS)
// ==========================================
const SUPER_ADMIN_EMAILS = String(process.env.SUPER_ADMIN_EMAILS || 'luix314@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

function isSuperAdmin(user) {
  return Boolean(user && user.username && SUPER_ADMIN_EMAILS.includes(String(user.username).toLowerCase()));
}

// ==========================================
// LIMITE DE TENTATIVAS DE LOGIN (memoria, por IP + e-mail)
// ==========================================
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const loginFailures = new Map();

function loginKey(ip, email) {
  return `${ip}|${String(email || '').toLowerCase()}`;
}

function isLoginBlocked(ip, email) {
  const entry = loginFailures.get(loginKey(ip, email));
  if (!entry) return false;
  if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginFailures.delete(loginKey(ip, email));
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function registerLoginFailure(ip, email) {
  const key = loginKey(ip, email);
  const entry = loginFailures.get(key);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearLoginFailures(ip, email) {
  loginFailures.delete(loginKey(ip, email));
}

setInterval(() => {
  const now = Date.now();
  loginFailures.forEach((entry, key) => {
    if (now - entry.first > LOGIN_WINDOW_MS) loginFailures.delete(key);
  });
}, LOGIN_WINDOW_MS).unref();

// ==========================================
// LOGIN COM GOOGLE (verificacao do ID token emitido pelo Google Identity Services)
// ==========================================
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();

async function verifyGoogleCredential(credential) {
  if (!GOOGLE_CLIENT_ID) throw new Error('Login com Google nao esta configurado neste servidor.');
  if (!credential || typeof credential !== 'string') throw new Error('Credencial do Google ausente.');

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) throw new Error('Credencial do Google invalida ou expirada.');
  const info = await res.json();

  const validIssuer = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  const emailVerified = info.email_verified === true || info.email_verified === 'true';
  if (info.aud !== GOOGLE_CLIENT_ID || !validIssuer) throw new Error('Credencial do Google nao pertence a este aplicativo.');
  if (Number(info.exp) * 1000 < Date.now()) throw new Error('Credencial do Google expirada.');
  if (!info.email || !emailVerified) throw new Error('O e-mail da conta Google nao esta verificado.');

  return {
    googleId: String(info.sub),
    email: String(info.email).toLowerCase(),
    name: String(info.name || info.email.split('@')[0])
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  setTokenSecret,
  issueToken,
  verifyToken,
  issuePasswordResetToken,
  verifyPasswordResetToken,
  issuePeladaInviteToken,
  verifyPeladaInviteToken,
  isSuperAdmin,
  isLoginBlocked,
  registerLoginFailure,
  clearLoginFailures,
  verifyGoogleCredential,
  GOOGLE_CLIENT_ID
};
