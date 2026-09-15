// Script do Placar e Cronômetro
const socket = io();

// Elementos DOM - Cronômetro
const timerDisplay = document.getElementById('timerDisplay');
const timerDot = document.getElementById('timerDot');
const btnTimerToggle = document.getElementById('btnTimerToggle');
const timerToggleIcon = document.getElementById('timerToggleIcon');
const timerToggleText = document.getElementById('timerToggleText');
const btnTimerRestart = document.getElementById('btnTimerRestart');
const btnScoreReset = document.getElementById('btnScoreReset');

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
}

// Ouvir atualizações do servidor
socket.on('state:update', (state) => {
  updateState(state);
});

socket.on('timer:tick', (timer) => {
  timerDisplay.textContent = formatTime(timer.seconds);
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

// Resetar Placar Geral
btnScoreReset.addEventListener('click', () => {
  if (confirm('Deseja zerar o placar das duas equipes?')) {
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
