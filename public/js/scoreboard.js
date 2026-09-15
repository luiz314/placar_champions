// Script do Placar, Cronômetro e Histórico
const socket = io();

// Elementos DOM - Cronômetro e Ações Gerais
const timerDisplay = document.getElementById('timerDisplay');
const timerDot = document.getElementById('timerDot');
const btnTimerToggle = document.getElementById('btnTimerToggle');
const timerToggleIcon = document.getElementById('timerToggleIcon');
const timerToggleText = document.getElementById('timerToggleText');
const btnTimerRestart = document.getElementById('btnTimerRestart');
const btnFinishMatch = document.getElementById('btnFinishMatch');
const btnScoreReset = document.getElementById('btnScoreReset');
const btnMuteToggle = document.getElementById('btnMuteToggle');
const muteIcon = document.getElementById('muteIcon');
const muteText = document.getElementById('muteText');

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

// Elementos DOM - Histórico
const historyList = document.getElementById('historyList');
const historyCountBadge = document.getElementById('historyCountBadge');
const btnClearHistory = document.getElementById('btnClearHistory');

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

function renderHistory(history) {
  if (!historyCountBadge || !historyList) return;

  historyCountBadge.textContent = history.length;

  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">Nenhuma partida finalizada ainda. Use "Encerrar Partida" para salvar o placar atual.</div>';
    return;
  }

  let html = '';
  history.forEach((match) => {
    const isWinnerA = match.winner === match.nameA;
    const isWinnerB = match.winner === match.nameB;

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
            <span style="color: #64748b; font-size: 1.1rem; margin: 0 6px;">x</span>
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

function updateState(state) {
  // Atualiza Nomes se o campo não estiver em foco
  if (document.activeElement !== nameA) {
    nameA.value = state.nameA;
  }
  if (document.activeElement !== nameB) {
    nameB.value = state.nameB;
  }

  // Animação de pontuação no Lado A
  if (previousScoreA !== state.scoreA) {
    scoreDigitA.classList.add('pop');
    setTimeout(() => scoreDigitA.classList.remove('pop'), 150);
  }
  scoreDigitA.textContent = state.scoreA;
  previousScoreA = state.scoreA;

  // Animação de pontuação no Lado B
  if (previousScoreB !== state.scoreB) {
    scoreDigitB.classList.add('pop');
    setTimeout(() => scoreDigitB.classList.remove('pop'), 150);
  }
  scoreDigitB.textContent = state.scoreB;
  previousScoreB = state.scoreB;

  // Cronômetro
  updateTimerUI(state.timer);

  // Histórico de Partidas
  renderHistory(state.matchHistory || []);
}

// Ouvir atualizações do servidor
socket.on('state:update', (state) => {
  updateState(state);
});

socket.on('timer:tick', (timer) => {
  timerDisplay.textContent = formatTime(timer.seconds);
});

// Controle de Mudo
function updateMuteUI() {
  if (!window.sound) return;
  if (window.sound.muted) {
    muteIcon.textContent = '🔇';
    muteText.textContent = 'Mudo';
    btnMuteToggle.style.opacity = '0.6';
  } else {
    muteIcon.textContent = '🔊';
    muteText.textContent = 'Som';
    btnMuteToggle.style.opacity = '1';
  }
}

if (btnMuteToggle) {
  updateMuteUI();
  btnMuteToggle.addEventListener('click', () => {
    if (window.sound) {
      window.sound.toggleMute();
      updateMuteUI();
    }
  });
}

// Reprodução de áudio
socket.on('sound:play', ({ type }) => {
  if (!window.sound) return;
  if (type === 'whistle') window.sound.playWhistle();
  if (type === 'whistle_final') window.sound.playFinalWhistle();
  if (type === 'point_add') window.sound.playPointAdd();
  if (type === 'point_sub') window.sound.playPointSub();
});

// Ações do Lado A
function addPointA() { socket.emit('point:add', 'A'); }
function subPointA() { socket.emit('point:sub', 'A'); }

btnAddA.addEventListener('click', addPointA);
clickAreaA.addEventListener('click', addPointA);
btnSubA.addEventListener('click', subPointA);

nameA.addEventListener('change', () => {
  socket.emit('name:update', { team: 'A', name: nameA.value });
});

// Ações do Lado B
function addPointB() { socket.emit('point:add', 'B'); }
function subPointB() { socket.emit('point:sub', 'B'); }

btnAddB.addEventListener('click', addPointB);
clickAreaB.addEventListener('click', addPointB);
btnSubB.addEventListener('click', subPointB);

nameB.addEventListener('change', () => {
  socket.emit('name:update', { team: 'B', name: nameB.value });
});

// Ações do Cronômetro
btnTimerToggle.addEventListener('click', () => {
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
  }
});
