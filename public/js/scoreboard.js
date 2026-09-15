// Script do Telão / Visualizador do Placar
const socket = io();

// Elementos DOM
const timerDisplay = document.getElementById('timerDisplay');
const timerDot = document.getElementById('timerDot');
const timerStatusText = document.getElementById('timerStatusText');

const leftCard = document.getElementById('leftCard');
const rightCard = document.getElementById('rightCard');
const leftTeamTag = document.getElementById('leftTeamTag');
const rightTeamTag = document.getElementById('rightTeamTag');
const leftTeamName = document.getElementById('leftTeamName');
const rightTeamName = document.getElementById('rightTeamName');
const leftScoreDigit = document.getElementById('leftScoreDigit');
const rightScoreDigit = document.getElementById('rightScoreDigit');
const leftServeIndicator = document.getElementById('leftServeIndicator');
const rightServeIndicator = document.getElementById('rightServeIndicator');
const leftSetsDots = document.getElementById('leftSetsDots');
const rightSetsDots = document.getElementById('rightSetsDots');
const leftTimeoutPills = document.getElementById('leftTimeoutPills');
const rightTimeoutPills = document.getElementById('rightTimeoutPills');

const currentSetTitle = document.getElementById('currentSetTitle');
const currentSetTarget = document.getElementById('currentSetTarget');
const courtSwapBadge = document.getElementById('courtSwapBadge');
const statusBanner = document.getElementById('statusBanner');
const setHistoryBar = document.getElementById('setHistoryBar');

const timeoutModal = document.getElementById('timeoutModal');
const timeoutTeamTitle = document.getElementById('timeoutTeamTitle');
const timeoutCountdownNumber = document.getElementById('timeoutCountdownNumber');

const victoryModal = document.getElementById('victoryModal');
const victoryTeamName = document.getElementById('victoryTeamName');

const btnSoundToggle = document.getElementById('btnSoundToggle');
const soundIcon = document.getElementById('soundIcon');
const btnFullscreen = document.getElementById('btnFullscreen');

// Cache do estado anterior para animação
let previousState = null;

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateTimerUI(timer) {
  timerDisplay.textContent = formatTime(timer.seconds);
  if (timer.running) {
    timerDot.classList.add('active');
    timerStatusText.textContent = 'EM ANDAMENTO';
    timerStatusText.style.color = '#4ade80';
  } else {
    timerDot.classList.remove('active');
    timerStatusText.textContent = timer.seconds > 0 ? 'PAUSADO' : 'CRONÔMETRO';
    timerStatusText.style.color = '#94a3b8';
  }
}

function renderSetDots(container, wonCount, maxSets) {
  const neededToWin = Math.ceil(maxSets / 2);
  let html = '';
  for (let i = 0; i < neededToWin; i++) {
    const isWon = i < wonCount;
    html += `<div class="set-dot ${isWon ? 'won' : ''}"></div>`;
  }
  container.innerHTML = html;
}

function renderTimeoutPills(container, usedCount) {
  let html = '';
  for (let i = 0; i < 2; i++) {
    const isUsed = i < usedCount;
    html += `<div class="timeout-pill ${isUsed ? 'used' : ''}"></div>`;
  }
  container.innerHTML = html;
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    setHistoryBar.innerHTML = '';
    return;
  }
  let html = '';
  history.forEach((item) => {
    html += `
      <div class="history-card">
        <span class="history-set-name">SET ${item.set}</span>
        <span class="history-score">
          <span class="team-a-hist">${item.scoreA}</span>
          <span style="color: #64748b; margin: 0 4px;">x</span>
          <span class="team-b-hist">${item.scoreB}</span>
        </span>
      </div>
    `;
  });
  setHistoryBar.innerHTML = html;
}

function renderState(state) {
  // Define quem fica na esquerda e quem fica na direita
  const isSwapped = state.courtSwapped;
  const left = isSwapped ? state.teamB : state.teamA;
  const right = isSwapped ? state.teamA : state.teamB;

  courtSwapBadge.style.display = isSwapped ? 'flex' : 'none';

  // Classes de cor nos cartões
  leftCard.className = `team-card ${left.id === 'A' ? 'team-a' : 'team-b'}`;
  rightCard.className = `team-card ${right.id === 'A' ? 'team-a' : 'team-b'}`;

  leftTeamTag.textContent = left.id === 'A' ? 'TIME A (AZUL)' : 'TIME B (VERMELHO)';
  rightTeamTag.textContent = right.id === 'A' ? 'TIME A (AZUL)' : 'TIME B (VERMELHO)';

  leftTeamName.textContent = left.name;
  rightTeamName.textContent = right.name;

  // Animação de pontuação
  if (previousState) {
    const prevLeft = isSwapped ? previousState.teamB : previousState.teamA;
    const prevRight = isSwapped ? previousState.teamA : previousState.teamB;
    if (prevLeft && prevLeft.score !== left.score) {
      leftScoreDigit.classList.add('pop');
      setTimeout(() => leftScoreDigit.classList.remove('pop'), 200);
    }
    if (prevRight && prevRight.score !== right.score) {
      rightScoreDigit.classList.add('pop');
      setTimeout(() => rightScoreDigit.classList.remove('pop'), 200);
    }
  }

  leftScoreDigit.textContent = left.score;
  rightScoreDigit.textContent = right.score;

  // Indicador de Saque
  if (state.serving === left.id) {
    leftServeIndicator.classList.add('active');
    rightServeIndicator.classList.remove('active');
  } else {
    leftServeIndicator.classList.remove('active');
    rightServeIndicator.classList.add('active');
  }

  // Dots de sets vencidos e timeouts
  renderSetDots(leftSetsDots, left.setsWon, state.maxSets);
  renderSetDots(rightSetsDots, right.setsWon, state.maxSets);
  renderTimeoutPills(leftTimeoutPills, left.timeouts);
  renderTimeoutPills(rightTimeoutPills, right.timeouts);

  // Informações do Set
  const isTieBreak = (state.maxSets === 5 && state.currentSet === 5) || (state.maxSets === 3 && state.currentSet === 3);
  const targetPts = isTieBreak ? 15 : 25;
  currentSetTitle.textContent = `SET ${state.currentSet} / ${state.maxSets}`;
  currentSetTarget.textContent = isTieBreak ? `TIE-BREAK (ATÉ ${targetPts} PTS)` : `ATÉ ${targetPts} PONTOS (VANTAGEM 2)`;

  // Banner de Alerta (Set Point / Match Point)
  if (state.statusAlert) {
    statusBanner.textContent = state.statusAlert;
    statusBanner.className = 'status-banner active' + (state.statusAlert.includes('MATCH') ? ' match-point' : '');
  } else {
    statusBanner.textContent = '';
    statusBanner.className = 'status-banner';
  }

  // Cronômetro
  updateTimerUI(state.timer);

  // Histórico de sets
  renderHistory(state.setHistory);

  // Modal de Tempo Técnico
  if (state.timeoutModal && state.timeoutModal.active) {
    timeoutTeamTitle.textContent = state.timeoutModal.teamName;
    timeoutCountdownNumber.textContent = state.timeoutModal.secondsLeft;
    timeoutModal.classList.add('active');
  } else {
    timeoutModal.classList.remove('active');
  }

  // Modal de Vitória
  if (state.matchOver && state.winner) {
    const winnerObj = state.winner === 'A' ? state.teamA : state.teamB;
    victoryTeamName.textContent = winnerObj.name;
    victoryTeamName.style.color = winnerObj.id === 'A' ? '#60a5fa' : '#f87171';
    victoryModal.classList.add('active');
  } else {
    victoryModal.classList.remove('active');
  }

  previousState = JSON.parse(JSON.stringify(state));
}

// Ouvir atualizações de estado do Socket.io
socket.on('state:update', (state) => {
  renderState(state);
});

// Atualizações do cronômetro
socket.on('timer:tick', (data) => {
  if (data.timer) updateTimerUI(data.timer);
  if (data.timeoutModal && data.timeoutModal.active) {
    timeoutCountdownNumber.textContent = data.timeoutModal.secondsLeft;
  }
});

// Reprodução de efeitos sonoros
socket.on('sound:play', (data) => {
  if (window.soundSystem) {
    window.soundSystem.play(data.type);
  }
});

// Ações do Cabeçalho
btnSoundToggle.addEventListener('click', () => {
  if (!window.soundSystem) return;
  window.soundSystem.soundEnabled = !window.soundSystem.soundEnabled;
  soundIcon.textContent = window.soundSystem.soundEnabled ? '🔊' : '🔇';
});

btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn('Erro ao entrar em tela cheia:', err);
    });
  } else {
    document.exitFullscreen();
  }
});
