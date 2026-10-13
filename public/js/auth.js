// Sessao do usuario compartilhada por todas as paginas (portal, placar, pelada e avaliar).
// Guarda o token emitido pelo servidor e o anexa automaticamente nas chamadas a /api/.
(function () {
  const TOKEN_KEY = 'pelada_token';
  const USER_KEY = 'pelada_user';

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function getToken() {
    return readStorage(TOKEN_KEY);
  }

  // Usuario so e considerado logado com token; sessoes antigas (sem token) sao descartadas
  function getUser() {
    const token = getToken();
    const raw = readStorage(USER_KEY);
    if (!token || !raw) {
      if (raw && !token) clearSession();
      return null;
    }
    try {
      const user = JSON.parse(raw);
      return user && user.username ? user : null;
    } catch (e) {
      clearSession();
      return null;
    }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {}
  }

  function isSuperAdmin(user) {
    return Boolean(user && user.role === 'admin');
  }

  function displayName(user) {
    return user ? (user.name || user.username) : '';
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Anexa "Authorization: Bearer <token>" nas requisicoes para a API do proprio site.
  // Se o servidor responder 401 a uma requisicao autenticada, a sessao expirou.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/');
    const token = getToken();
    if (!isApi || !token) return nativeFetch(input, init);

    const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
    if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
    const response = await nativeFetch(input, { ...init, headers });
    if (response.status === 401 && !url.includes('/api/auth/login')) {
      clearSession();
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    return response;
  };

  // Confirma a sessao no servidor e atualiza os dados guardados (nome, papel)
  async function refreshUser() {
    if (!getToken()) return null;
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return data.user;
      }
      if (data.success && !data.user) {
        // Token recusado pelo servidor (expirado ou invalido)
        clearSession();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    } catch (e) {
      // Sem rede: mantem a sessao local para nao deslogar quem esta offline
    }
    return getUser();
  }

  async function logout() {
    clearSession();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  // Redireciona para o portal quando a pagina exige login
  function requireLogin(reason) {
    if (getUser()) return true;
    window.location.replace('/?authRequired=' + encodeURIComponent(reason || '1'));
    return false;
  }

  window.Auth = {
    getToken,
    getUser,
    setSession,
    clearSession,
    refreshUser,
    logout,
    requireLogin,
    isSuperAdmin,
    displayName,
    escapeHtml
  };
})();
