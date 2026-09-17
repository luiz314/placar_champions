// Script do Placar Multi-Sessões, Cronômetro, Salas e Monetização
const socket = io();

// Estado da Sessão Atual
let currentRoomId = null;

// Elementos DOM - Cabeçalho e Salas
const roomPill = document.getElementById('roomPill');
const currentRoomCodeDisplay = document.getElementById('currentRoomCodeDisplay');
const btnHeaderNewSession = document.getElementById('btnHeaderNewSession');
const btnShareModal = document.getElementById('btnShareModal');
const btnTvMode = document.getElementById('btnTvMode');
const tvModeIcon = document.getElementById('tvModeIcon');
const tvModeText = document.getElementById('tvModeText');
const btnExitTvMode = document.getElementById('btnExitTvMode');

// Elementos DOM - Cronômetro e Partida
const timerDisplay = document.getElementById('timerDisplay');
const timerDot = document.getElementById('timerDot');
const btnTimerToggle = document.getElementById('btnTimerToggle');
const timerToggleIcon = document.getElementById('timerToggleIcon');
const timerToggleText = document.getElementById('timerToggleText');
const btnTimerRestart = document.getElementById('btnTimerRestart');
const btnFinishMatch = document.getElementById('btnFinishMatch');
const btnScoreReset = document.getElementById('btnScoreReset');
const btnFullscreen = document.getElementById('btnFullscreen');
const fullscreenIcon = document.getElementById('fullscreenIcon');
const fullscreenText = document.getElementById('fullscreenText');

// Elementos DOM - Menu Superior
const btnMenuToggle = document.getElementById('btnMenuToggle');
const menuDropdown = document.getElementById('menuDropdown');
const menuItemChangeRoom = document.getElementById('menuItemChangeRoom');
const menuItemHistory = document.getElementById('menuItemHistory');
const menuHistoryBadge = document.getElementById('menuHistoryBadge');
const menuItemMute = document.getElementById('menuItemMute');
const menuMuteIcon = document.getElementById('menuMuteIcon');
const menuMuteText = document.getElementById('menuMuteText');
const menuItemWakeLock = document.getElementById('menuItemWakeLock');
const menuWakeLockIcon = document.getElementById('menuWakeLockIcon');
const menuWakeLockText = document.getElementById('menuWakeLockText');
const menuItemPro = document.getElementById('menuItemPro');

// Indicador de cadeado na sala ativa
const roomPillLock = document.getElementById('roomPillLock');

// Elementos DOM - Modais de Sala e Senha
const roomSelectionModal = document.getElementById('roomSelectionModal');
const btnCloseRoomModal = document.getElementById('btnCloseRoomModal');
const btnCreateNewRoom = document.getElementById('btnCreateNewRoom');
const joinRoomForm = document.getElementById('joinRoomForm');
const inputRoomCode = document.getElementById('inputRoomCode');
const joinRoomError = document.getElementById('joinRoomError');

// Opção de Criar Sala com Senha
const toggleCreatePassword = document.getElementById('toggleCreatePassword');
const createPasswordBox = document.getElementById('createPasswordBox');
const inputCreatePassword = document.getElementById('inputCreatePassword');
const btnToggleCreateEye = document.getElementById('btnToggleCreateEye');

// Modal de Desbloqueio por Senha
const passwordPromptModal = document.getElementById('passwordPromptModal');
const passwordPromptRoomCode = document.getElementById('passwordPromptRoomCode');
const passwordPromptForm = document.getElementById('passwordPromptForm');
const inputPromptPassword = document.getElementById('inputPromptPassword');
const passwordPromptError = document.getElementById('passwordPromptError');
const btnSubmitPassword = document.getElementById('btnSubmitPassword');
const btnCancelPassword = document.getElementById('btnCancelPassword');
const btnClosePasswordModal = document.getElementById('btnClosePasswordModal');
const btnTogglePromptEye = document.getElementById('btnTogglePromptEye');

// Modal de Compartilhamento
const shareModalBackdrop = document.getElementById('shareModalBackdrop');
const btnCloseShareModal = document.getElementById('btnCloseShareModal');
const qrCodeImage = document.getElementById('qrCodeImage');
const shareModalRoomCode = document.getElementById('shareModalRoomCode');
const shareModalLockBadge = document.getElementById('shareModalLockBadge');
const sharePasswordAlertTip = document.getElementById('sharePasswordAlertTip');
const shareUrlInput = document.getElementById('shareUrlInput');
const btnCopyShareUrl = document.getElementById('btnCopyShareUrl');
const copyBtnIcon = document.getElementById('copyBtnIcon');
const copyBtnText = document.getElementById('copyBtnText');
const btnShareWhatsapp = document.getElementById('btnShareWhatsapp');

let lastRoomState = null;
let pendingJoinRoomId = null;

const historyModalBackdrop = document.getElementById('historyModalBackdrop');
const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
const historyList = document.getElementById('historyList');
const historyCountBadge = document.getElementById('historyCountBadge');
const btnClearHistory = document.getElementById('btnClearHistory');

const proModalBackdrop = document.getElementById('proModalBackdrop');
const btnCloseProModal = document.getElementById('btnCloseProModal');
const btnAdCta = document.getElementById('btnAdCta');
const btnContactPro = document.getElementById('btnContactPro');

// Elementos DOM - Lado A
const nameA = document.getElementById('nameA');
const scoreDigitA = document.getElementById('scoreDigitA');
const clickAreaA = document.getElementById('clickAreaA');
const btnAddA = document.getElementById('btnAddA');
const btnSubA = document.getElementById('btnSubA');

// Elementos DOM - Lado B
const nameB = document.getElementById('nameB');
const scoreDigitB = document.getElementById('scoreDigitB');
const clickAreaB = document.getElementById('clickAreaB');
const btnAddB = document.getElementById('btnAddB');
const btnSubB = document.getElementById('btnSubB');

let previousScoreA = 0;
let previousScoreB = 0;

// Utilitário de formatação de código: 123456 -> "123 456"
function formatRoomCode(code) {
  if (!code) return '------';
  const clean = String(code).replace(/\D/g, '');
  if (clean.length === 6) {
    return `${clean.slice(0, 3)} ${clean.slice(3)}`;
  }
  return clean;
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateTimerUI(timer) {
  timerDisplay.textContent = formatTime(timer.seconds);
  if (timer.running) {
    timerDot.classList.add('running');
    btnTimerToggle.classList.add('running');
    timerToggleIcon.textContent = '⏸';
    timerToggleText.textContent = 'Pausar';
  } else {
    timerDot.classList.remove('running');
    btnTimerToggle.classList.remove('running');
    timerToggleIcon.textContent = '▶';
    timerToggleText.textContent = 'Iniciar';
  }
}

// Renderização do Histórico no Modal
function renderHistory(history) {
  const count = history ? history.length : 0;
  if (historyCountBadge) historyCountBadge.textContent = count;
  if (menuHistoryBadge) menuHistoryBadge.textContent = count;

  if (!historyList) return;

  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">Nenhuma partida finalizada ainda nesta sessão. Use "Encerrar Partida" para registrar o placar.</div>';
    return;
  }

  let html = '';
  history.forEach((match) => {
    html += `
      <div class="history-item">
        <div class="history-item-top">
          <span>Partida #${match.matchNumber} &bull; ${match.time}</span>
          <span>⏱️ Duração: ${formatTime(match.durationSeconds)}</span>
        </div>
        <div class="history-item-score">
          <div class="history-team team-a">
            <span>${match.nameA}</span>
          </div>
          <div class="history-score-digits">
            <span style="color: #60a5fa">${match.scoreA}</span>
            <span style="color: #64748b; font-size: 1.1rem; margin: 0 8px;">x</span>
            <span style="color: #f87171">${match.scoreB}</span>
          </div>
          <div class="history-team team-b">
            <span>${match.nameB}</span>
          </div>
        </div>
        <div class="history-winner-tag">
          <span>🏆 Vencedor:</span>
          <strong>${match.winner}</strong>
        </div>
      </div>
    `;
  });

  historyList.innerHTML = html;
}

// Atualização de Estado Completo da Sala
function updateState(state) {
  lastRoomState = state;
  if (state.roomId) {
    currentRoomId = state.roomId;
    localStorage.setItem('placar_current_room', state.roomId);
    if (currentRoomCodeDisplay) {
      currentRoomCodeDisplay.textContent = formatRoomCode(state.roomId);
    }
  }

  // Exibe ou oculta ícone de cadeado na sala ativa
  if (roomPillLock) {
    roomPillLock.style.display = state.hasPassword ? 'inline-block' : 'none';
  }

  if (document.activeElement !== nameA) nameA.value = state.nameA;
  if (document.activeElement !== nameB) nameB.value = state.nameB;

  // Animação Lado A
  if (previousScoreA !== state.scoreA) {
    scoreDigitA.classList.add('pop');
    setTimeout(() => scoreDigitA.classList.remove('pop'), 150);
  }
  scoreDigitA.textContent = state.scoreA;
  previousScoreA = state.scoreA;

  // Animação Lado B
  if (previousScoreB !== state.scoreB) {
    scoreDigitB.classList.add('pop');
    setTimeout(() => scoreDigitB.classList.remove('pop'), 150);
  }
  scoreDigitB.textContent = state.scoreB;
  previousScoreB = state.scoreB;

  // Cronômetro
  if (state.timer) {
    updateTimerUI(state.timer);
  }

  // Histórico
  renderHistory(state.matchHistory || []);
}

// ============================================================
// GERENCIAMENTO DE SESSÕES / SALAS (6 DÍGITOS E SENHA)
// ============================================================

// Utilitários de Senha na Sessão do Navegador
function getSavedRoomPassword(roomId) {
  try {
    return sessionStorage.getItem(`placar_pwd_${roomId}`) || '';
  } catch (e) {
    return '';
  }
}

function saveRoomPassword(roomId, password) {
  try {
    if (password) {
      sessionStorage.setItem(`placar_pwd_${roomId}`, password);
    }
  } catch (e) {}
}

function openRoomModal() {
  if (roomSelectionModal) {
    joinRoomError.textContent = '';
    inputRoomCode.value = '';
    if (toggleCreatePassword) toggleCreatePassword.checked = false;
    if (createPasswordBox) createPasswordBox.style.display = 'none';
    if (inputCreatePassword) {
      inputCreatePassword.value = '';
      inputCreatePassword.type = 'password';
    }
    if (btnToggleCreateEye) btnToggleCreateEye.textContent = '👁️';
    if (btnCloseRoomModal) {
      btnCloseRoomModal.style.display = currentRoomId ? 'block' : 'none';
    }
    roomSelectionModal.classList.add('show');
  }
  if (menuDropdown) menuDropdown.classList.remove('show');
}

function closeRoomModal() {
  if (roomSelectionModal) {
    roomSelectionModal.classList.remove('show');
  }
}

if (btnHeaderNewSession) btnHeaderNewSession.addEventListener('click', openRoomModal);
if (btnCloseRoomModal) btnCloseRoomModal.addEventListener('click', closeRoomModal);

if (roomSelectionModal) {
  roomSelectionModal.addEventListener('click', (e) => {
    if (e.target === roomSelectionModal && currentRoomId) {
      closeRoomModal();
    }
  });
}

function openPasswordPrompt(roomId, initialError = '') {
  pendingJoinRoomId = roomId;
  if (passwordPromptRoomCode) {
    passwordPromptRoomCode.textContent = formatRoomCode(roomId);
  }
  if (passwordPromptError) {
    passwordPromptError.textContent = initialError || '';
  }
  if (inputPromptPassword) {
    inputPromptPassword.value = '';
    inputPromptPassword.type = 'password';
  }
  if (btnTogglePromptEye) btnTogglePromptEye.textContent = '👁️';
  closeRoomModal();
  if (passwordPromptModal) {
    passwordPromptModal.classList.add('show');
    setTimeout(() => {
      if (inputPromptPassword) inputPromptPassword.focus();
    }, 100);
  }
}

function closePasswordPrompt() {
  if (passwordPromptModal) {
    passwordPromptModal.classList.remove('show');
  }
  pendingJoinRoomId = null;
}

// Alternar visualização da senha (olho)
if (btnToggleCreateEye && inputCreatePassword) {
  btnToggleCreateEye.addEventListener('click', () => {
    const isPass = inputCreatePassword.type === 'password';
    inputCreatePassword.type = isPass ? 'text' : 'password';
    btnToggleCreateEye.textContent = isPass ? '🙈' : '👁️';
  });
}

if (btnTogglePromptEye && inputPromptPassword) {
  btnTogglePromptEye.addEventListener('click', () => {
    const isPass = inputPromptPassword.type === 'password';
    inputPromptPassword.type = isPass ? 'text' : 'password';
    btnTogglePromptEye.textContent = isPass ? '🙈' : '👁️';
  });
}

// Alternar campo de senha ao criar nova sala
if (toggleCreatePassword) {
  toggleCreatePassword.addEventListener('change', () => {
    if (toggleCreatePassword.checked) {
      createPasswordBox.style.display = 'flex';
      setTimeout(() => {
        if (inputCreatePassword) inputCreatePassword.focus();
      }, 50);
    } else {
      createPasswordBox.style.display = 'none';
      if (inputCreatePassword) inputCreatePassword.value = '';
    }
  });
}

// Formatação automática do input de 6 dígitos no modal (ex: 123 456)
if (inputRoomCode) {
  inputRoomCode.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (val.length > 3) {
      val = `${val.slice(0, 3)} ${val.slice(3)}`;
    }
    e.target.value = val;
    if (joinRoomError) joinRoomError.textContent = '';
  });
}

// Criar nova sala com opção de senha
if (btnCreateNewRoom) {
  btnCreateNewRoom.addEventListener('click', () => {
    let passwordToSet = null;
    if (toggleCreatePassword && toggleCreatePassword.checked) {
      const typed = inputCreatePassword ? inputCreatePassword.value.trim() : '';
      if (!typed) {
        alert('Por favor, digite uma senha para proteger a sala ou desmarque a opção.');
        if (inputCreatePassword) inputCreatePassword.focus();
        return;
      }
      passwordToSet = typed;
    }

    btnCreateNewRoom.disabled = true;
    socket.emit('room:create', { password: passwordToSet }, (res) => {
      btnCreateNewRoom.disabled = false;
      if (res && res.success) {
        currentRoomId = res.roomId;
        if (passwordToSet) {
          saveRoomPassword(res.roomId, passwordToSet);
        }
        localStorage.setItem('placar_current_room', res.roomId);
        updateUrlWithRoom(res.roomId);
        updateState(res.state);
        closeRoomModal();
        openShareModal();
      } else {
        alert('Erro ao criar sala. Tente novamente.');
      }
    });
  });
}

// Entrar com código de 6 dígitos
if (joinRoomForm) {
  joinRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const clean = inputRoomCode.value.replace(/\D/g, '');
    if (clean.length !== 6) {
      if (joinRoomError) joinRoomError.textContent = 'Digite os 6 números do código da sala.';
      return;
    }

    const btnSubmit = document.getElementById('btnSubmitJoin');
    if (btnSubmit) btnSubmit.disabled = true;

    const savedPwd = getSavedRoomPassword(clean);

    socket.emit('room:join', { roomId: clean, password: savedPwd }, (res) => {
      if (btnSubmit) btnSubmit.disabled = false;
      if (res && res.success) {
        currentRoomId = res.roomId;
        localStorage.setItem('placar_current_room', res.roomId);
        updateUrlWithRoom(res.roomId);
        updateState(res.state);
        closeRoomModal();
      } else if (res && res.requiresPassword) {
        openPasswordPrompt(clean, res.error);
      } else {
        if (joinRoomError) {
          joinRoomError.textContent = (res && res.error) || 'Sala não encontrada. Verifique o código.';
        }
      }
    });
  });
}

// Envio do formulário de solicitação de senha (quando a sala tem senha)
if (passwordPromptForm) {
  passwordPromptForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pendingJoinRoomId) return;

    const enteredPassword = inputPromptPassword ? inputPromptPassword.value.trim() : '';
    if (!enteredPassword) {
      if (passwordPromptError) passwordPromptError.textContent = 'Por favor, digite a senha da sala.';
      return;
    }

    if (btnSubmitPassword) btnSubmitPassword.disabled = true;
    if (passwordPromptError) passwordPromptError.textContent = 'Verificando senha...';

    const targetRoom = pendingJoinRoomId;
    socket.emit('room:join', { roomId: targetRoom, password: enteredPassword }, (res) => {
      if (btnSubmitPassword) btnSubmitPassword.disabled = false;

      if (res && res.success) {
        saveRoomPassword(targetRoom, enteredPassword);
        currentRoomId = res.roomId;
        localStorage.setItem('placar_current_room', res.roomId);
        updateUrlWithRoom(res.roomId);
        updateState(res.state);
        closePasswordPrompt();
      } else {
        if (passwordPromptError) {
          passwordPromptError.textContent = (res && res.error) || 'Senha incorreta. Tente novamente.';
        }
        if (inputPromptPassword) {
          inputPromptPassword.select();
          inputPromptPassword.focus();
        }
      }
    });
  });
}

if (btnCancelPassword) {
  btnCancelPassword.addEventListener('click', () => {
    closePasswordPrompt();
    openRoomModal();
  });
}

if (btnClosePasswordModal) {
  btnClosePasswordModal.addEventListener('click', () => {
    closePasswordPrompt();
    openRoomModal();
  });
}

function updateUrlWithRoom(roomId) {
  const url = new URL(window.location);
  url.searchParams.set('sala', roomId);
  window.history.replaceState({}, '', url);
}

// Inicialização da Sala ao abrir a página
function initRoomConnection() {
  const params = new URLSearchParams(window.location.search);
  const paramRoom = params.get('sala') || params.get('room');
  const savedRoom = localStorage.getItem('placar_current_room');

  if (paramRoom && paramRoom.replace(/\D/g, '').length === 6) {
    const clean = paramRoom.replace(/\D/g, '');
    const savedPwd = getSavedRoomPassword(clean);

    socket.emit('room:join', { roomId: clean, password: savedPwd, autoCreate: false }, (res) => {
      if (res && res.success) {
        currentRoomId = res.roomId;
        localStorage.setItem('placar_current_room', res.roomId);
        updateUrlWithRoom(res.roomId);
        updateState(res.state);
      } else if (res && res.requiresPassword) {
        // Sala protegida: abre prompt de senha
        openPasswordPrompt(clean, res.error);
      } else {
        openRoomModal();
      }
    });
    return;
  }

  if (savedRoom && savedRoom.replace(/\D/g, '').length === 6) {
    const clean = savedRoom.replace(/\D/g, '');
    const savedPwd = getSavedRoomPassword(clean);

    socket.emit('room:join', { roomId: clean, password: savedPwd }, (res) => {
      if (res && res.success) {
        currentRoomId = res.roomId;
        updateUrlWithRoom(res.roomId);
        updateState(res.state);
      } else if (res && res.requiresPassword) {
        openPasswordPrompt(clean, res.error);
      } else {
        openRoomModal();
      }
    });
    return;
  }

  // Se não houver código na URL nem no cache, abre o modal de seleção
  openRoomModal();
}

// ============================================================
// COMPARTILHAMENTO & QR CODE
// ============================================================
function openShareModal() {
  if (!currentRoomId) return;

  const url = `${window.location.origin}/?sala=${currentRoomId}`;
  if (shareUrlInput) shareUrlInput.value = url;
  if (shareModalRoomCode) shareModalRoomCode.textContent = formatRoomCode(currentRoomId);

  // Exibe aviso e badge caso a sala tenha senha
  const isProtected = Boolean(lastRoomState && lastRoomState.hasPassword);
  if (shareModalLockBadge) shareModalLockBadge.style.display = isProtected ? 'inline-block' : 'none';
  if (sharePasswordAlertTip) sharePasswordAlertTip.style.display = isProtected ? 'block' : 'none';

  if (qrCodeImage) {
    // Gera QR Code nítido e veloz usando endpoint padrão
    qrCodeImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(url)}`;
  }

  if (shareModalBackdrop) shareModalBackdrop.classList.add('show');
  if (menuDropdown) menuDropdown.classList.remove('show');
}

function closeShareModal() {
  if (shareModalBackdrop) shareModalBackdrop.classList.remove('show');
}

if (btnShareModal) btnShareModal.addEventListener('click', openShareModal);
if (roomPill) roomPill.addEventListener('click', openShareModal);
if (btnCloseShareModal) btnCloseShareModal.addEventListener('click', closeShareModal);

if (shareModalBackdrop) {
  shareModalBackdrop.addEventListener('click', (e) => {
    if (e.target === shareModalBackdrop) closeShareModal();
  });
}

if (btnCopyShareUrl) {
  btnCopyShareUrl.addEventListener('click', async () => {
    const url = shareUrlInput.value;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        shareUrlInput.select();
        document.execCommand('copy');
      }
      copyBtnIcon.textContent = '✅';
      copyBtnText.textContent = 'Copiado!';
      setTimeout(() => {
        copyBtnIcon.textContent = '📋';
        copyBtnText.textContent = 'Copiar URL';
      }, 2000);
    } catch (err) {
      console.warn('Erro ao copiar link:', err);
    }
  });
}

// Compartilhamento direto no WhatsApp
if (btnShareWhatsapp) {
  btnShareWhatsapp.addEventListener('click', () => {
    if (!currentRoomId) return;
    const url = `${window.location.origin}/?sala=${currentRoomId}`;
    let msg = `🏐 *Placar de Vôlei Online* 🏐\n\n`;
    msg += `Acesse para acompanhar o placar e cronômetro em tempo real:\n${url}\n`;

    const savedPwd = getSavedRoomPassword(currentRoomId);
    if (lastRoomState && lastRoomState.hasPassword) {
      if (savedPwd) {
        msg += `\n🔒 *Senha de acesso:* ${savedPwd}\n`;
      } else {
        msg += `\n🔒 *Aviso:* Esta sala é protegida por senha.\n`;
      }
    }

    msg += `\n📺 Abra no navegador do celular, tablet ou Smart TV!`;

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, '_blank');
  });
}

// ============================================================
// MODO TELÃO / SMART TV
// ============================================================
let tvModeActive = false;

function toggleTvMode(forcedState) {
  tvModeActive = typeof forcedState === 'boolean' ? forcedState : !tvModeActive;

  if (tvModeActive) {
    document.body.classList.add('body-tv-mode');
    if (tvModeText) tvModeText.textContent = 'Sair Telão';
    if (tvModeIcon) tvModeIcon.textContent = '✖';
  } else {
    document.body.classList.remove('body-tv-mode');
    if (tvModeText) tvModeText.textContent = 'Modo Telão';
    if (tvModeIcon) tvModeIcon.textContent = '📺';
  }
}

if (btnTvMode) btnTvMode.addEventListener('click', () => toggleTvMode());
if (btnExitTvMode) btnExitTvMode.addEventListener('click', () => toggleTvMode(false));

// ============================================================
// MODAL DE HISTÓRICO
// ============================================================
function openHistoryModal() {
  if (historyModalBackdrop) historyModalBackdrop.classList.add('show');
  if (menuDropdown) menuDropdown.classList.remove('show');
}

function closeHistoryModal() {
  if (historyModalBackdrop) historyModalBackdrop.classList.remove('show');
}

if (menuItemHistory) menuItemHistory.addEventListener('click', openHistoryModal);
if (btnCloseHistoryModal) btnCloseHistoryModal.addEventListener('click', closeHistoryModal);

if (historyModalBackdrop) {
  historyModalBackdrop.addEventListener('click', (e) => {
    if (e.target === historyModalBackdrop) closeHistoryModal();
  });
}

// ============================================================
// MODAL DE PLANOS PRO & MONETIZAÇÃO
// ============================================================
function openProModal() {
  if (proModalBackdrop) proModalBackdrop.classList.add('show');
  if (menuDropdown) menuDropdown.classList.remove('show');
}

function closeProModal() {
  if (proModalBackdrop) proModalBackdrop.classList.remove('show');
}

if (menuItemPro) menuItemPro.addEventListener('click', openProModal);
if (btnAdCta) btnAdCta.addEventListener('click', openProModal);
if (btnCloseProModal) btnCloseProModal.addEventListener('click', closeProModal);

if (proModalBackdrop) {
  proModalBackdrop.addEventListener('click', (e) => {
    if (e.target === proModalBackdrop) closeProModal();
  });
}

if (btnContactPro) {
  btnContactPro.addEventListener('click', () => {
    const text = encodeURIComponent('Olá! Tenho interesse nos planos PRO do Placar de Vôlei para minha arena/torneio.');
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  });
}

if (menuItemChangeRoom) {
  menuItemChangeRoom.addEventListener('click', openRoomModal);
}

// Controle do Menu Dropdown
if (btnMenuToggle && menuDropdown) {
  btnMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!menuDropdown.contains(e.target) && e.target !== btnMenuToggle) {
      menuDropdown.classList.remove('show');
    }
  });
}

// Controle de Mudo
function updateMuteUI() {
  if (!window.sound) return;
  if (window.sound.muted) {
    if (menuMuteIcon) menuMuteIcon.textContent = '🔇';
    if (menuMuteText) menuMuteText.textContent = 'Som: Mudo';
  } else {
    if (menuMuteIcon) menuMuteIcon.textContent = '🔊';
    if (menuMuteText) menuMuteText.textContent = 'Som: Ativado';
  }
}

if (menuItemMute) {
  updateMuteUI();
  menuItemMute.addEventListener('click', () => {
    if (window.sound) {
      window.sound.toggleMute();
      updateMuteUI();
    }
  });
}

// Gerenciamento de Screen Wake Lock
let wakeLockSentinel = null;
let wakeLockEnabled = localStorage.getItem('placar_wakelock') !== 'false';

async function requestWakeLock() {
  if (!wakeLockEnabled) return;
  if ('wakeLock' in navigator) {
    try {
      if (!wakeLockSentinel || wakeLockSentinel.released) {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          updateWakeLockUI();
        });
      }
    } catch (err) {
      console.warn('Wake Lock request:', err);
    }
  }
  updateWakeLockUI();
}

async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch (_) {}
    wakeLockSentinel = null;
  }
  updateWakeLockUI();
}

function updateWakeLockUI() {
  if (!menuWakeLockText || !menuWakeLockIcon) return;
  if (!('wakeLock' in navigator)) {
    menuWakeLockIcon.textContent = '⚠️';
    menuWakeLockText.textContent = 'Tela Sempre Ativa: Não Suportado';
    return;
  }

  const isActive = wakeLockSentinel && !wakeLockSentinel.released;
  if (wakeLockEnabled) {
    menuWakeLockIcon.textContent = isActive ? '💡' : '🟡';
    menuWakeLockText.textContent = isActive ? 'Tela Sempre Ativa: Ligada' : 'Tela Ativa: Em Espera';
  } else {
    menuWakeLockIcon.textContent = '🔌';
    menuWakeLockText.textContent = 'Tela Sempre Ativa: Desligada';
  }
}

if (menuItemWakeLock) {
  updateWakeLockUI();
  menuItemWakeLock.addEventListener('click', async () => {
    wakeLockEnabled = !wakeLockEnabled;
    localStorage.setItem('placar_wakelock', wakeLockEnabled);
    if (wakeLockEnabled) {
      await requestWakeLock();
    } else {
      await releaseWakeLock();
    }
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLockEnabled) {
    requestWakeLock();
  }
});

['click', 'pointerdown', 'touchstart'].forEach((evt) => {
  window.addEventListener(evt, () => {
    if (wakeLockEnabled && (!wakeLockSentinel || wakeLockSentinel.released)) {
      requestWakeLock();
    }
  }, { passive: true });
});

requestWakeLock();

// Controle de Tela Cheia
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn('Erro ao entrar em tela cheia:', err);
    });
  } else {
    document.exitFullscreen().catch((err) => {
      console.warn('Erro ao sair de tela cheia:', err);
    });
  }
}

function updateFullscreenUI() {
  const isFull = !!document.fullscreenElement;
  if (fullscreenIcon) fullscreenIcon.textContent = isFull ? '🗗' : '⛶';
  if (fullscreenText) fullscreenText.textContent = isFull ? 'Sair' : 'Tela Cheia';
}

if (btnFullscreen) {
  btnFullscreen.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenUI);
}

// ============================================================
// SOCKET.IO LISTENERS
// ============================================================
socket.on('connect', () => {
  initRoomConnection();
});

socket.on('state:update', (state) => {
  updateState(state);
});

socket.on('timer:tick', (timer) => {
  timerDisplay.textContent = formatTime(timer.seconds);
});

socket.on('sound:play', ({ type }) => {
  if (!window.sound) return;
  if (type === 'whistle') window.sound.playWhistle();
  if (type === 'whistle_final') window.sound.playFinalWhistle();
  if (type === 'point_add') window.sound.playPointAdd();
  if (type === 'point_sub') window.sound.playPointSub();
});

// Feedback tátil
function triggerHaptic() {
  if (navigator && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(25); } catch (_) {}
  }
}

// Ações Lado A
function addPointA() {
  triggerHaptic();
  if (window.sound) window.sound.playPointAdd();
  socket.emit('point:add', 'A');
}

function subPointA() {
  triggerHaptic();
  const current = parseInt(scoreDigitA.textContent) || 0;
  if (current > 0 && window.sound) window.sound.playPointSub();
  socket.emit('point:sub', 'A');
}

btnAddA.addEventListener('click', addPointA);
clickAreaA.addEventListener('click', addPointA);
btnSubA.addEventListener('click', subPointA);

nameA.addEventListener('change', () => {
  socket.emit('name:update', { team: 'A', name: nameA.value });
});
nameA.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nameA.blur();
  }
});

// Ações Lado B
function addPointB() {
  triggerHaptic();
  if (window.sound) window.sound.playPointAdd();
  socket.emit('point:add', 'B');
}

function subPointB() {
  triggerHaptic();
  const current = parseInt(scoreDigitB.textContent) || 0;
  if (current > 0 && window.sound) window.sound.playPointSub();
  socket.emit('point:sub', 'B');
}

btnAddB.addEventListener('click', addPointB);
clickAreaB.addEventListener('click', addPointB);
btnSubB.addEventListener('click', subPointB);

nameB.addEventListener('change', () => {
  socket.emit('name:update', { team: 'B', name: nameB.value });
});
nameB.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nameB.blur();
  }
});

// Ações Cronômetro
btnTimerToggle.addEventListener('click', () => {
  triggerHaptic();
  if (!btnTimerToggle.classList.contains('running') && window.sound) {
    window.sound.playWhistle();
  }
  socket.emit('timer:toggle');
});

btnTimerRestart.addEventListener('click', () => {
  socket.emit('timer:restart');
});

// Encerrar Partida
btnFinishMatch.addEventListener('click', () => {
  const currentPtsA = parseInt(scoreDigitA.textContent) || 0;
  const currentPtsB = parseInt(scoreDigitB.textContent) || 0;
  if (currentPtsA === 0 && currentPtsB === 0) {
    if (!confirm('O placar ainda está em 0 x 0. Deseja encerrar mesmo assim?')) return;
  } else {
    if (!confirm('Deseja encerrar a partida atual e salvar o resultado no histórico desta sala?')) return;
  }
  if (window.sound) window.sound.playFinalWhistle();
  socket.emit('match:finish');
});

// Limpar Histórico
btnClearHistory.addEventListener('click', () => {
  if (confirm('Deseja realmente apagar o histórico de partidas desta sala?')) {
    socket.emit('history:clear');
  }
});

// Resetar Placar Geral
btnScoreReset.addEventListener('click', () => {
  if (confirm('Deseja zerar o placar atual das duas equipes sem salvar no histórico?')) {
    socket.emit('score:reset');
  }
});

// Atalhos de Teclado
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  const key = e.key.toLowerCase();
  if (key === '1' || key === 'a') {
    e.preventDefault();
    addPointA();
  } else if (key === '2' || key === 'b') {
    e.preventDefault();
    addPointB();
  } else if (e.code === 'Space') {
    e.preventDefault();
    socket.emit('timer:toggle');
  } else if (key === 'f') {
    e.preventDefault();
    toggleFullscreen();
  } else if (key === 't') {
    e.preventDefault();
    toggleTvMode();
  } else if (key === 'h') {
    e.preventDefault();
    if (historyModalBackdrop && historyModalBackdrop.classList.contains('show')) {
      closeHistoryModal();
    } else {
      openHistoryModal();
    }
  } else if (e.key === 'Escape') {
    closeHistoryModal();
    closeShareModal();
    closeProModal();
    if (menuDropdown) menuDropdown.classList.remove('show');
  }
});
