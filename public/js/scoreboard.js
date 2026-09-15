// Script do Placar, Cronômetro, Menu e Histórico
const socket = io();

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
const menuItemHistory = document.getElementById('menuItemHistory');
const menuHistoryBadge = document.getElementById('menuHistoryBadge');
const menuItemMute = document.getElementById('menuItemMute');
const menuMuteIcon = document.getElementById('menuMuteIcon');
const menuMuteText = document.getElementById('menuMuteText');

// Elementos DOM - Modal de Histórico
const historyModalBackdrop = document.getElementById('historyModalBackdrop');
const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
const historyList = document.getElementById('historyList');
const historyCountBadge = document.getElementById('historyCountBadge');
const btnClearHistory = document.getElementById('btnClearHistory');

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
    historyList.innerHTML = '<div class="history-empty">Nenhuma partida finalizada ainda. Use "Encerrar Partida" para registrar o placar.</div>';
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

// Controle do Modal de Histórico
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

function updateState(state) {
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
  updateTimerUI(state.timer);

  // Histórico
  renderHistory(state.matchHistory || []);
}

// Socket.io listeners
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

// Feedback tátil para dispositivos touch (smartphones e tablets)
function triggerHaptic() {
  if (navigator && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(25); } catch (_) {}
  }
}

// Ações do Lado A
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

// Ações do Lado B
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

// Ações do Cronômetro
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
    if (!confirm('Deseja encerrar a partida atual e salvar o resultado no histórico?')) return;
  }
  if (window.sound) window.sound.playFinalWhistle();
  socket.emit('match:finish');
});

// Limpar Histórico
btnClearHistory.addEventListener('click', () => {
  if (confirm('Deseja realmente apagar todo o histórico de partidas?')) {
    socket.emit('history:clear');
  }
});

// Resetar Placar Geral
btnScoreReset.addEventListener('click', () => {
  if (confirm('Deseja zerar o placar atual das duas equipes sem salvar no histórico?')) {
    socket.emit('score:reset');
  }
});

// Atalhos de teclado
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
  } else if (key === 'h') {
    e.preventDefault();
    if (historyModalBackdrop && historyModalBackdrop.classList.contains('show')) {
      closeHistoryModal();
    } else {
      openHistoryModal();
    }
  } else if (e.key === 'Escape') {
    closeHistoryModal();
    if (menuDropdown) menuDropdown.classList.remove('show');
  }
});
