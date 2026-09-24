// ============================================================
// PLACAR DE VÔLEI - SISTEMA MULTI-SESSÕES, OFFLINE-FIRST (PWA)
// Resiliente a quedas de internet e 100% funcional sem conexão
// ============================================================

// Registro do Service Worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('🏐 Service Worker registrado com sucesso:', reg.scope);
      })
      .catch((err) => {
        console.warn('Aviso: Falha ao registrar Service Worker:', err);
      });
  });
}

// Inicialização do Socket.IO (com fallback seguro caso offline)
let socket = null;
try {
  if (typeof io !== 'undefined') {
    socket = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });
  }
} catch (e) {
  console.warn('Socket.IO indisponível no momento:', e);
}

// ============================================================
// ELEMENTOS DO DOM
// ============================================================

// Cabeçalho e Salas
const headerTitleArea = document.querySelector('.title-area');
const btnGoHome = document.getElementById('btnGoHome');
const roomPill = document.getElementById('roomPill');
const currentRoomCodeDisplay = document.getElementById('currentRoomCodeDisplay');
const roomPillLock = document.getElementById('roomPillLock');
const connectionPill = document.getElementById('connectionPill');
const connectionStatusText = document.getElementById('connectionStatusText');
const offlineToastBanner = document.getElementById('offlineToastBanner');
const offlineToastIcon = document.getElementById('offlineToastIcon');
const offlineToastMsg = document.getElementById('offlineToastMsg');
const btnHeaderNewSession = document.getElementById('btnHeaderNewSession');
const btnShareModal = document.getElementById('btnShareModal');
const btnTvMode = document.getElementById('btnTvMode');
const tvModeIcon = document.getElementById('tvModeIcon');
const tvModeText = document.getElementById('tvModeText');
const btnExitTvMode = document.getElementById('btnExitTvMode');

// Cronômetro e Partida
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

// Menu Superior
const btnMenuToggle = document.getElementById('btnMenuToggle');
const menuDropdown = document.getElementById('menuDropdown');
const menuItemHome = document.getElementById('menuItemHome');
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

// Modais de Sala e Senha
const roomSelectionModal = document.getElementById('roomSelectionModal');
const btnCloseRoomModal = document.getElementById('btnCloseRoomModal');
const btnCreateNewRoom = document.getElementById('btnCreateNewRoom');
const joinRoomForm = document.getElementById('joinRoomForm');
const inputRoomCode = document.getElementById('inputRoomCode');
const joinRoomError = document.getElementById('joinRoomError');
const btnStartOfflineMode = document.getElementById('btnStartOfflineMode');

// Senha da Sala
const toggleCreatePassword = document.getElementById('toggleCreatePassword');
const createPasswordBox = document.getElementById('createPasswordBox');
const inputCreatePassword = document.getElementById('inputCreatePassword');
const btnToggleCreateEye = document.getElementById('btnToggleCreateEye');

const passwordPromptModal = document.getElementById('passwordPromptModal');
const passwordPromptRoomCode = document.getElementById('passwordPromptRoomCode');
const passwordPromptForm = document.getElementById('passwordPromptForm');
const inputPromptPassword = document.getElementById('inputPromptPassword');
const passwordPromptError = document.getElementById('passwordPromptError');
const btnSubmitPassword = document.getElementById('btnSubmitPassword');
const btnCancelPassword = document.getElementById('btnCancelPassword');
const btnClosePasswordModal = document.getElementById('btnClosePasswordModal');
const btnTogglePromptEye = document.getElementById('btnTogglePromptEye');

// Compartilhamento
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

// Histórico
const historyModalBackdrop = document.getElementById('historyModalBackdrop');
const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
const historyList = document.getElementById('historyList');
const historyCountBadge = document.getElementById('historyCountBadge');
const btnClearHistory = document.getElementById('btnClearHistory');

// Monetização PRO
const proModalBackdrop = document.getElementById('proModalBackdrop');
const btnCloseProModal = document.getElementById('btnCloseProModal');
const btnAdCta = document.getElementById('btnAdCta');
const btnContactPro = document.getElementById('btnContactPro');

// Lado A
const nameA = document.getElementById('nameA');
const scoreDigitA = document.getElementById('scoreDigitA');
const clickAreaA = document.getElementById('clickAreaA');
const btnAddA = document.getElementById('btnAddA');
const btnSubA = document.getElementById('btnSubA');

// Lado B
const nameB = document.getElementById('nameB');
const scoreDigitB = document.getElementById('scoreDigitB');
const clickAreaB = document.getElementById('clickAreaB');
const btnAddB = document.getElementById('btnAddB');
const btnSubB = document.getElementById('btnSubB');

// ============================================================
// GERENCIAMENTO DE ESTADO LOCAL & OFFLINE-FIRST
// ============================================================

function createDefaultState(roomId = null) {
  return {
    roomId: roomId || 'LOCAL',
    hasPassword: false,
    scoreA: 0,
    nameA: 'LADO A',
    scoreB: 0,
    nameB: 'LADO B',
    timer: {
      seconds: 0,
      running: false
    },
    matchHistory: []
  };
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem('placar_saved_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          roomId: parsed.roomId || 'LOCAL',
          hasPassword: Boolean(parsed.hasPassword),
          scoreA: Number(parsed.scoreA) || 0,
          nameA: parsed.nameA || 'LADO A',
          scoreB: Number(parsed.scoreB) || 0,
          nameB: parsed.nameB || 'LADO B',
          timer: {
            seconds: Number(parsed.timer?.seconds) || 0,
            running: Boolean(parsed.timer?.running)
          },
          matchHistory: Array.isArray(parsed.matchHistory) ? parsed.matchHistory : []
        };
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar estado persistido:', e);
  }
  return createDefaultState();
}

let currentState = loadPersistedState();
let currentRoomId = currentState.roomId === 'LOCAL' ? null : currentState.roomId;
let lastRoomState = currentState;
let pendingJoinRoomId = null;
let previousScoreA = currentState.scoreA;
let previousScoreB = currentState.scoreB;

// Indicador se há alterações feitas enquanto desconectado que precisam ser enviadas ao reconectar
let hasOfflineChanges = localStorage.getItem('placar_has_offline_changes') === 'true';
let isSocketConnected = false;

function persistCurrentState() {
  try {
    localStorage.setItem('placar_saved_state', JSON.stringify(currentState));
    if (currentRoomId && currentRoomId !== 'LOCAL') {
      localStorage.setItem('placar_current_room', currentRoomId);
    }
  } catch (e) {
    console.warn('Erro ao persistir estado no localStorage:', e);
  }
}

function markOfflineChange() {
  if (!isSocketConnected) {
    hasOfflineChanges = true;
    localStorage.setItem('placar_has_offline_changes', 'true');
  }
}

// Utilitários de Formatação
function formatRoomCode(code) {
  if (!code || code === 'LOCAL') return 'OFFLINE';
  const clean = String(code).replace(/\D/g, '');
  if (clean.length === 6) {
    return `${clean.slice(0, 3)} ${clean.slice(3)}`;
  }
  return clean || '------';
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ============================================================
// FEEDBACK VISUAL DE CONEXÃO & NOTIFICAÇÕES TOAST
// ============================================================

let toastTimeout = null;

function showToast(message, type = 'warning', autoHideMs = 0) {
  if (!offlineToastBanner) return;
  if (toastTimeout) clearTimeout(toastTimeout);

  offlineToastBanner.className = 'offline-toast-banner';
  if (type === 'online-restored') {
    offlineToastBanner.classList.add('online-restored');
    if (offlineToastIcon) offlineToastIcon.textContent = '✅';
  } else {
    if (offlineToastIcon) offlineToastIcon.textContent = '⚠️';
  }

  if (offlineToastMsg) offlineToastMsg.textContent = message;
  offlineToastBanner.style.display = 'flex';

  if (autoHideMs > 0) {
    toastTimeout = setTimeout(() => {
      offlineToastBanner.style.display = 'none';
      toastTimeout = null;
    }, autoHideMs);
  }
}

function hideToast() {
  if (offlineToastBanner) {
    offlineToastBanner.style.display = 'none';
  }
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
}

function updateConnectionUI(connected) {
  isSocketConnected = connected;

  if (connected) {
    if (connectionPill) {
      connectionPill.className = 'connection-status-pill online';
      connectionPill.title = 'Status da Conexão: Sincronizado em tempo real';
    }
    if (connectionStatusText) {
      connectionStatusText.textContent = 'Online';
    }
  } else {
    if (connectionPill) {
      connectionPill.className = 'connection-status-pill offline';
      connectionPill.title = 'Status da Conexão: Modo Offline (Pontuação e tempo continuam funcionando localmente)';
    }
    if (connectionStatusText) {
      connectionStatusText.textContent = 'Modo Offline';
    }
  }
}

// ============================================================
// CRONÔMETRO LOCAL AUTÔNOMO (NUNCA PARA SEM REDE)
// ============================================================

function updateTimerUI(timer) {
  if (!timerDisplay) return;
  timerDisplay.textContent = formatTime(timer.seconds);
  if (timer.running) {
    if (timerDot) timerDot.classList.add('running');
    if (btnTimerToggle) btnTimerToggle.classList.add('running');
    if (timerToggleIcon) timerToggleIcon.textContent = '⏸';
    if (timerToggleText) timerToggleText.textContent = 'Pausar';
  } else {
    if (timerDot) timerDot.classList.remove('running');
    if (btnTimerToggle) btnTimerToggle.classList.remove('running');
    if (timerToggleIcon) timerToggleIcon.textContent = '▶';
    if (timerToggleText) timerToggleText.textContent = 'Iniciar';
  }
  updateActionHighlights();
}

// Loop local de 1 segundo: garante que o cronômetro avance perfeitamente mesmo sem internet
let timerSaveCounter = 0;
setInterval(() => {
  if (currentState.timer && currentState.timer.running) {
    currentState.timer.seconds += 1;
    if (timerDisplay) {
      timerDisplay.textContent = formatTime(currentState.timer.seconds);
    }
    timerSaveCounter += 1;
    if (timerSaveCounter >= 5) {
      timerSaveCounter = 0;
      persistCurrentState();
    }
  }
}, 1000);

// ============================================================
// RENDERIZAÇÃO DA INTERFACE DO PLACAR & DESTAQUES
// ============================================================

// Destaques contextuais e intuitivos para os botões de ação
function updateActionHighlights() {
  // 1. Destaque do botão Iniciar antes de começar a pontuar (placar zerado e cronômetro parado/zerado)
  const isMatchZero = (currentState.scoreA === 0 && currentState.scoreB === 0);
  const isTimerZero = (!currentState.timer.running && currentState.timer.seconds === 0);

  if (btnTimerToggle) {
    if (isMatchZero && isTimerZero) {
      btnTimerToggle.classList.add('highlight-start-timer');
    } else {
      btnTimerToggle.classList.remove('highlight-start-timer');
    }
  }

  // 2. Destaque do botão Encerrar Partida quando algum dos times alcançar 15 pontos ou mais
  if (btnFinishMatch) {
    if (currentState.scoreA >= 15 || currentState.scoreB >= 15) {
      btnFinishMatch.classList.add('highlight-finish');
    } else {
      btnFinishMatch.classList.remove('highlight-finish');
    }
  }
}

function renderScoreUI() {
  if (scoreDigitA) {
    if (previousScoreA !== currentState.scoreA) {
      scoreDigitA.classList.add('pop');
      setTimeout(() => scoreDigitA.classList.remove('pop'), 150);
    }
    scoreDigitA.textContent = currentState.scoreA;
    previousScoreA = currentState.scoreA;
  }

  if (scoreDigitB) {
    if (previousScoreB !== currentState.scoreB) {
      scoreDigitB.classList.add('pop');
      setTimeout(() => scoreDigitB.classList.remove('pop'), 150);
    }
    scoreDigitB.textContent = currentState.scoreB;
    previousScoreB = currentState.scoreB;
  }

  updateActionHighlights();
}

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

function updateState(state, fromServer = false) {
  if (!state) return;

  if (fromServer) {
    // Se o cliente tem alterações offline pendentes, não sobrescreve cegamente
    if (hasOfflineChanges) {
      console.log('Alterações offline pendentes detectadas; preservando estado local para sync.');
      return;
    }
  }

  currentState = {
    ...currentState,
    ...state,
    timer: {
      ...currentState.timer,
      ...(state.timer || {})
    },
    matchHistory: Array.isArray(state.matchHistory) ? state.matchHistory : currentState.matchHistory
  };

  lastRoomState = currentState;

  if (state.roomId) {
    currentRoomId = state.roomId;
    if (currentRoomCodeDisplay) {
      currentRoomCodeDisplay.textContent = formatRoomCode(state.roomId);
    }
  }

  if (roomPillLock) {
    roomPillLock.style.display = state.hasPassword ? 'inline-block' : 'none';
  }

  if (nameA && document.activeElement !== nameA && state.nameA) nameA.value = state.nameA;
  if (nameB && document.activeElement !== nameB && state.nameB) nameB.value = state.nameB;

  renderScoreUI();

  if (currentState.timer) {
    updateTimerUI(currentState.timer);
  }

  renderHistory(currentState.matchHistory || []);
  persistCurrentState();
}

// Inicializa a UI imediatamente com o estado em cache (carregamento instantâneo)
updateState(currentState);

// ============================================================
// AÇÕES OTIMISTAS (RESPOSTA INSTANTÂNEA LOCAL + EMISSÃO)
// ============================================================

let lastSwipeTime = 0;

function triggerDigitAnimation(digitElement, direction) {
  if (!digitElement) return;
  const animClass = direction === 'up' ? 'slide-up' : 'slide-down';
  digitElement.classList.remove('slide-up', 'slide-down', 'pop');
  void digitElement.offsetWidth; // força reflow para reiniciar animação
  digitElement.classList.add(animClass);
  setTimeout(() => digitElement.classList.remove(animClass), 250);
}

function triggerHaptic(duration = 25) {
  if (navigator && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(duration); } catch (_) {}
  }
}

// Lado A
function addPointA(fromSwipe = false) {
  triggerHaptic(30);
  if (window.sound) window.sound.playPointAdd();
  if (fromSwipe) triggerDigitAnimation(scoreDigitA, 'up');
  currentState.scoreA += 1;
  renderScoreUI();
  persistCurrentState();

  if (socket && socket.connected) {
    socket.emit('point:add', 'A');
  } else {
    markOfflineChange();
  }
}

function subPointA(fromSwipe = false) {
  triggerHaptic(20);
  if (currentState.scoreA > 0) {
    if (window.sound) window.sound.playPointSub();
    if (fromSwipe) triggerDigitAnimation(scoreDigitA, 'down');
    currentState.scoreA -= 1;
    renderScoreUI();
    persistCurrentState();

    if (socket && socket.connected) {
      socket.emit('point:sub', 'A');
    } else {
      markOfflineChange();
    }
  }
}

// Lado B
function addPointB(fromSwipe = false) {
  triggerHaptic(30);
  if (window.sound) window.sound.playPointAdd();
  if (fromSwipe) triggerDigitAnimation(scoreDigitB, 'up');
  currentState.scoreB += 1;
  renderScoreUI();
  persistCurrentState();

  if (socket && socket.connected) {
    socket.emit('point:add', 'B');
  } else {
    markOfflineChange();
  }
}

function subPointB(fromSwipe = false) {
  triggerHaptic(20);
  if (currentState.scoreB > 0) {
    if (window.sound) window.sound.playPointSub();
    if (fromSwipe) triggerDigitAnimation(scoreDigitB, 'down');
    currentState.scoreB -= 1;
    renderScoreUI();
    persistCurrentState();

    if (socket && socket.connected) {
      socket.emit('point:sub', 'B');
    } else {
      markOfflineChange();
    }
  }
}

// Botões explícitos (+1 / -1)
if (btnAddA) btnAddA.addEventListener('click', () => addPointA(false));
if (btnSubA) btnSubA.addEventListener('click', () => subPointA(false));
if (btnAddB) btnAddB.addEventListener('click', () => addPointB(false));
if (btnSubB) btnSubB.addEventListener('click', () => subPointB(false));

// Clique direto no número gigante (com proteção contra clique acidental pós-swipe)
if (clickAreaA) {
  clickAreaA.addEventListener('click', () => {
    if (Date.now() - lastSwipeTime < 400) return;
    addPointA(false);
  });
}

if (clickAreaB) {
  clickAreaB.addEventListener('click', () => {
    if (Date.now() - lastSwipeTime < 400) return;
    addPointB(false);
  });
}

// ============================================================
// GESTOS TOUCH (DESLIZAR PARA CIMA: +1 | DESLIZAR PARA BAIXO: -1)
// Otimizado para tablets e smartphones
// ============================================================
function setupSwipeGestures(cardElement, onSwipeUp, onSwipeDown) {
  if (!cardElement) return;

  let startX = 0;
  let startY = 0;
  let gestureTriggered = false;

  cardElement.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    // Ignora se o toque começou num input ou botão explícito
    if (e.target.closest('input') || e.target.closest('button')) return;

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    gestureTriggered = false;
  }, { passive: true });

  cardElement.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1 || gestureTriggered) return;
    if (e.target.closest('input') || e.target.closest('button')) return;

    const touch = e.touches[0];
    const diffY = touch.clientY - startY;
    const diffX = touch.clientX - startX;

    // Detecta deslizamento vertical se mover mais de 28px e for predominantemente vertical
    if (Math.abs(diffY) >= 28 && Math.abs(diffY) > Math.abs(diffX) * 1.1) {
      gestureTriggered = true;
      lastSwipeTime = Date.now();

      if (diffY < 0) {
        // Deslizou para CIMA: aumenta ponto (+1)
        onSwipeUp(true);
      } else {
        // Deslizou para BAIXO: diminui ponto (-1)
        onSwipeDown(true);
      }
    }
  }, { passive: true });

  cardElement.addEventListener('touchend', () => {
    if (gestureTriggered) {
      lastSwipeTime = Date.now();
    }
  }, { passive: true });
}

// Roda de scroll do mouse / trackpad como bônus (Scroll Cima: +1, Scroll Baixo: -1)
function setupWheelGesture(element, onWheelUp, onWheelDown) {
  if (!element) return;
  let lastWheelTime = 0;
  element.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (Date.now() - lastWheelTime < 250) return;
    lastWheelTime = Date.now();
    if (e.deltaY < 0) {
      onWheelUp(true);
    } else if (e.deltaY > 0) {
      onWheelDown(true);
    }
  }, { passive: false });
}

// Inicializa os gestos nos cards das equipes e nas caixas de pontuação
const teamCardA = document.querySelector('.team-card.team-a');
const teamCardB = document.querySelector('.team-card.team-b');

setupSwipeGestures(teamCardA, addPointA, subPointA);
setupSwipeGestures(teamCardB, addPointB, subPointB);

setupWheelGesture(clickAreaA, addPointA, subPointA);
setupWheelGesture(clickAreaB, addPointB, subPointB);

// Edição de nomes das equipes
if (nameA) {
  nameA.addEventListener('change', () => {
    currentState.nameA = nameA.value.trim().slice(0, 20) || 'LADO A';
    persistCurrentState();
    if (socket && socket.connected) {
      socket.emit('name:update', { team: 'A', name: currentState.nameA });
    } else {
      markOfflineChange();
    }
  });
  nameA.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameA.blur();
    }
  });
}

if (nameB) {
  nameB.addEventListener('change', () => {
    currentState.nameB = nameB.value.trim().slice(0, 20) || 'LADO B';
    persistCurrentState();
    if (socket && socket.connected) {
      socket.emit('name:update', { team: 'B', name: currentState.nameB });
    } else {
      markOfflineChange();
    }
  });
  nameB.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameB.blur();
    }
  });
}

// Cronômetro
if (btnTimerToggle) {
  btnTimerToggle.addEventListener('click', () => {
    triggerHaptic();
    const wasRunning = currentState.timer.running;
    currentState.timer.running = !wasRunning;

    if (!wasRunning && window.sound) {
      window.sound.playWhistle();
    }

    updateTimerUI(currentState.timer);
    persistCurrentState();

    if (socket && socket.connected) {
      socket.emit('timer:toggle');
    } else {
      markOfflineChange();
    }
  });
}

if (btnTimerRestart) {
  btnTimerRestart.addEventListener('click', () => {
    const timerSeconds = (currentState.timer && currentState.timer.seconds) || 0;
    const isRunning = Boolean(currentState.timer && currentState.timer.running);

    let confirmMsg = 'Deseja realmente reiniciar o cronômetro para 00:00?';
    if (timerSeconds > 0 || isRunning) {
      confirmMsg = `Deseja realmente reiniciar o cronômetro (tempo atual: ${formatTime(timerSeconds)}) de volta para 00:00?`;
    }

    if (!confirm(confirmMsg)) return;

    currentState.timer.seconds = 0;
    currentState.timer.running = false;
    updateTimerUI(currentState.timer);
    persistCurrentState();

    if (socket && socket.connected) {
      socket.emit('timer:restart');
    } else {
      markOfflineChange();
    }
  });
}

// Encerrar Partida
if (btnFinishMatch) {
  btnFinishMatch.addEventListener('click', () => {
    const ptsA = currentState.scoreA || 0;
    const ptsB = currentState.scoreB || 0;
    const timerSeconds = (currentState.timer && currentState.timer.seconds) || 0;

    let confirmMsg = `Deseja realmente encerrar a partida?\n\nPlacar atual: ${currentState.nameA} ${ptsA} x ${ptsB} ${currentState.nameB}\nDuração: ${formatTime(timerSeconds)}\n\nO resultado será salvo no histórico e o placar voltará para 0 x 0.`;
    if (ptsA === 0 && ptsB === 0) {
      confirmMsg = 'O placar ainda está em 0 x 0. Deseja realmente encerrar a partida mesmo assim?';
    }

    if (!confirm(confirmMsg)) return;

    if (window.sound) window.sound.playFinalWhistle();

    let winner = 'Empate';
    if (currentState.scoreA > currentState.scoreB) winner = currentState.nameA;
    else if (currentState.scoreB > currentState.scoreA) winner = currentState.nameB;

    const matchRecord = {
      id: Date.now(),
      matchNumber: (currentState.matchHistory ? currentState.matchHistory.length : 0) + 1,
      nameA: currentState.nameA,
      scoreA: currentState.scoreA,
      nameB: currentState.nameB,
      scoreB: currentState.scoreB,
      winner: winner,
      durationSeconds: currentState.timer.seconds,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    if (!currentState.matchHistory) currentState.matchHistory = [];
    currentState.matchHistory.unshift(matchRecord);

    currentState.scoreA = 0;
    currentState.scoreB = 0;
    currentState.timer.running = false;
    currentState.timer.seconds = 0;

    renderScoreUI();
    updateTimerUI(currentState.timer);
    renderHistory(currentState.matchHistory);
    persistCurrentState();

    if (socket && socket.connected) {
      socket.emit('match:finish');
    } else {
      markOfflineChange();
    }
  });
}

// Resetar Placar
if (btnScoreReset) {
  btnScoreReset.addEventListener('click', () => {
    const ptsA = currentState.scoreA || 0;
    const ptsB = currentState.scoreB || 0;

    let confirmMsg = 'Deseja realmente zerar o placar das duas equipes?';
    if (ptsA > 0 || ptsB > 0) {
      confirmMsg = `Atenção: O placar atual está ${currentState.nameA} ${ptsA} x ${ptsB} ${currentState.nameB}.\n\nDeseja realmente ZERAR o placar para 0 x 0 sem salvar no histórico? Esta ação não pode ser desfeita.`;
    }

    if (!confirm(confirmMsg)) return;

    currentState.scoreA = 0;
    currentState.scoreB = 0;
    renderScoreUI();
    persistCurrentState();

    if (socket && socket.connected) {
      socket.emit('score:reset');
    } else {
      markOfflineChange();
    }
  });
}

// Limpar Histórico
if (btnClearHistory) {
  btnClearHistory.addEventListener('click', () => {
    if (confirm('Deseja realmente apagar o histórico de partidas desta sala?')) {
      currentState.matchHistory = [];
      renderHistory(currentState.matchHistory);
      persistCurrentState();

      if (socket && socket.connected) {
        socket.emit('history:clear');
      } else {
        markOfflineChange();
      }
    }
  });
}

// ============================================================
// GERENCIAMENTO DE SALAS, SENHAS E MODO OFFLINE DIRETO
// ============================================================

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
  window.location.href = '/?chooseSession=1';
}

function closeRoomModal() {}

// Navegação direta: botão Início ou título "Placar Champions" voltam para o portal inicial
const headerAppTitle = document.getElementById('headerAppTitle');
if (headerAppTitle) headerAppTitle.addEventListener('click', () => { window.location.href = '/'; });
if (btnGoHome) btnGoHome.addEventListener('click', () => { window.location.href = '/'; });
if (menuItemHome) menuItemHome.addEventListener('click', () => { window.location.href = '/'; });

// Nova sessão leva ao seletor/criador de sessões na tela inicial
if (btnHeaderNewSession) btnHeaderNewSession.addEventListener('click', () => { window.location.href = '/?chooseSession=1'; });
if (menuItemChangeRoom) menuItemChangeRoom.addEventListener('click', () => { window.location.href = '/?chooseSession=1'; });

// Modo Offline Rápido (Inicia imediatamente sem depender de rede)
function startOfflineMode() {
  currentRoomId = 'LOCAL';
  currentState.roomId = 'LOCAL';
  closeRoomModal();
  updateUrlWithRoom(null);
  updateState(currentState);
  updateConnectionUI(false);
  showToast('⚡ Modo Offline ativo: pontuação e cronômetro funcionam direto no seu aparelho!', 'warning', 4000);
}

if (btnStartOfflineMode) {
  btnStartOfflineMode.addEventListener('click', startOfflineMode);
}

// Modal de Desbloqueio por Senha
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

// Criar nova sala com o servidor
if (btnCreateNewRoom) {
  btnCreateNewRoom.addEventListener('click', () => {
    if (!socket || !socket.connected) {
      if (confirm('Você está sem conexão com o servidor. Deseja jogar no Modo Offline agora?')) {
        startOfflineMode();
      }
      return;
    }

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
        hasOfflineChanges = false;
        localStorage.removeItem('placar_has_offline_changes');
        updateUrlWithRoom(res.roomId);
        updateState(res.state);
        closeRoomModal();
        openShareModal();
      } else {
        alert('Erro ao criar sala. Verifique sua conexão e tente novamente.');
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

    if (!socket || !socket.connected) {
      if (joinRoomError) {
        joinRoomError.textContent = 'Sem conexão no momento. Use o Modo Offline abaixo.';
      }
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
        hasOfflineChanges = false;
        localStorage.removeItem('placar_has_offline_changes');
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

// Prompt de senha para sala protegida
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
        hasOfflineChanges = false;
        localStorage.removeItem('placar_has_offline_changes');
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
  if (roomId && roomId !== 'LOCAL') {
    url.searchParams.set('sala', roomId);
  } else {
    url.searchParams.delete('sala');
    url.searchParams.delete('room');
  }
  window.history.replaceState({}, '', url);
}

// ============================================================
// CONEXÃO & SINCRONIZAÇÃO INTELIGENTE COM O SERVIDOR
// ============================================================

function initRoomConnection() {
  if (!socket) return;

  const params = new URLSearchParams(window.location.search);
  const paramRoom = (params.get('sala') || params.get('room') || '').trim();
  const savedRoom = (localStorage.getItem('volei_current_room') || localStorage.getItem('placar_current_room') || '').trim();

  let targetRoom = paramRoom || savedRoom || '733849';
  targetRoom = targetRoom.replace(/\s+/g, '').toUpperCase();

  if (targetRoom) {
    localStorage.setItem('volei_current_room', targetRoom);
    localStorage.setItem('placar_current_room', targetRoom);
    const savedPwd = getSavedRoomPassword(targetRoom);

    socket.emit('room:join', { roomId: targetRoom, password: savedPwd, autoCreate: true }, (res) => {
      if (res && res.success) {
        currentRoomId = res.roomId;
        updateUrlWithRoom(res.roomId);

        if (hasOfflineChanges) {
          socket.emit('room:sync', currentState, (syncRes) => {
            if (syncRes && syncRes.success) {
              hasOfflineChanges = false;
              localStorage.removeItem('placar_has_offline_changes');
              showToast('✅ Conectado ao placar da Sala #' + res.roomId, 'online-restored', 3000);
            }
          });
        } else {
          updateState(res.state, true);
        }
      } else if (res && res.requiresPassword) {
        openPasswordPrompt(targetRoom, res.error);
      } else {
        currentRoomId = targetRoom;
        updateUrlWithRoom(targetRoom);
      }
    });
  }
}

// ============================================================
// LISTENERS DO SOCKET.IO E DO NAVEGADOR (ONLINE / OFFLINE)
// ============================================================

if (socket) {
  socket.on('connect', () => {
    updateConnectionUI(true);
    if (hasOfflineChanges) {
      showToast('🔄 Conectando... Sincronizando dados offline com o servidor...', 'warning', 2500);
    } else {
      hideToast();
    }
    initRoomConnection();
  });

  socket.on('disconnect', (reason) => {
    updateConnectionUI(false);
    showToast('⚠️ Desconectado do servidor. O placar continua funcionando offline!', 'warning');
  });

  socket.on('connect_error', () => {
    updateConnectionUI(false);
  });

  socket.on('state:update', (state) => {
    updateState(state, true);
  });

  socket.on('timer:tick', (timer) => {
    // Calibra o cronômetro local com o tempo do servidor para evitar desvio entre múltiplos aparelhos
    if (currentState.timer) {
      currentState.timer.seconds = timer.seconds;
      currentState.timer.running = timer.running;
      updateTimerUI(timer);
    }
  });

  socket.on('sound:play', ({ type }) => {
    if (!window.sound) return;
    if (type === 'whistle') window.sound.playWhistle();
    if (type === 'whistle_final') window.sound.playFinalWhistle();
    if (type === 'point_add') window.sound.playPointAdd();
    if (type === 'point_sub') window.sound.playPointSub();
  });
}

// Detecção nativa do navegador
window.addEventListener('online', () => {
  if (socket && !socket.connected) {
    socket.connect();
  }
  showToast('✅ Internet restabelecida! Conectando...', 'online-restored', 3000);
});

window.addEventListener('offline', () => {
  updateConnectionUI(false);
  showToast('⚠️ Você está sem internet. O placar continua funcionando normalmente!', 'warning');
});

// Checagem inicial de rede ao abrir a página
if (!navigator.onLine) {
  updateConnectionUI(false);
  showToast('⚠️ Modo Offline: O placar funciona 100% mesmo sem internet!', 'warning');
}

// ============================================================
// COMPARTILHAMENTO & QR CODE
// ============================================================
function openShareModal() {
  if (!currentRoomId || currentRoomId === 'LOCAL') {
    alert('Esta partida está em Modo Offline (apenas neste dispositivo). Para conectar outros celulares ou Smart TVs, crie uma Sessão Online.');
    openRoomModal();
    return;
  }

  const url = `${window.location.origin}/?sala=${currentRoomId}`;
  if (shareUrlInput) shareUrlInput.value = url;
  if (shareModalRoomCode) shareModalRoomCode.textContent = formatRoomCode(currentRoomId);

  const isProtected = Boolean(lastRoomState && lastRoomState.hasPassword);
  if (shareModalLockBadge) shareModalLockBadge.style.display = isProtected ? 'inline-block' : 'none';
  if (sharePasswordAlertTip) sharePasswordAlertTip.style.display = isProtected ? 'block' : 'none';

  if (qrCodeImage) {
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

if (btnShareWhatsapp) {
  btnShareWhatsapp.addEventListener('click', () => {
    if (!currentRoomId || currentRoomId === 'LOCAL') return;
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
    if (btnTimerToggle) btnTimerToggle.click();
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
