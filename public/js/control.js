// Script da Mesa de Controle / Operador
const socket = io();

// Elementos DOM - Time A
const nameInputA = document.getElementById('nameInputA');
const setsWonDisplayA = document.getElementById('setsWonDisplayA');
const controlScoreA = document.getElementById('controlScoreA');
const btnAddA = document.getElementById('btnAddA');
const btnSubA = document.getElementById('btnSubA');
const btnServeA = document.getElementById('btnServeA');
const btnTimeoutA = document.getElementById('btnTimeoutA');
const timeoutTextA = document.getElementById('timeoutTextA');

// Elementos DOM - Time B
const nameInputB = document.getElementById('nameInputB');
const setsWonDisplayB = document.getElementById('setsWonDisplayB');
const controlScoreB = document.getElementById('controlScoreB');
const btnAddB = document.getElementById('btnAddB');
const btnSubB = document.getElementById('btnSubB');
const btnServeB = document.getElementById('btnServeB');
const btnTimeoutB = document.getElementById('btnTimeoutB');
const timeoutTextB = document.getElementById('timeoutTextB');

// Elementos Cronômetro
const controlTimerDisplay = document.getElementById('controlTimerDisplay');
const btnTimerToggle = document.getElementById('btnTimerToggle');
const timerToggleIcon = document.getElementById('timerToggleIcon');
const timerToggleText = document.getElementById('timerToggleText');
const btnTimerReset = document.getElementById('btnTimerReset');

// Ações Gerais
const btnSwapCourt = document.getElementById('btnSwapCourt');
const btnManualFinishSet = document.getElementById('btnManualFinishSet');
const btnUndoSet = document.getElementById('btnUndoSet');
const btnCancelTimeout = document.getElementById('btnCancelTimeout');
const btnSoundWhistle = document.getElementById('btnSoundWhistle');
const btnSoundBuzzer = document.getElementById('btnSoundBuzzer');
const btnToggleSetsMode = document.getElementById('btnToggleSetsMode');
const setsModeText = document.getElementById('setsModeText');
const btnResetMatch = document.getElementById('btnResetMatch');

let currentState = null;

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateControlUI(state) {
  currentState = state;

  // Atualizar Nomes apenas se o usuário não estiver digitando
  if (document.activeElement !== nameInputA) {
    nameInputA.value = state.teamA.name;
  }
  if (document.activeElement !== nameInputB) {
    nameInputB.value = state.teamB.name;
  }

  // Pontos e Sets
  controlScoreA.textContent = state.teamA.score;
  controlScoreB.textContent = state.teamB.score;
  setsWonDisplayA.textContent = `Sets: ${state.teamA.setsWon}`;
  setsWonDisplayB.textContent = `Sets: ${state.teamB.setsWon}`;

  // Saque
  btnServeA.className = 'btn-serve-toggle' + (state.serving === 'A' ? ' active' : '');
  btnServeB.className = 'btn-serve-toggle' + (state.serving === 'B' ? ' active' : '');

  // Tempos Técnicos restantes
  const leftTimeoutsA = 2 - state.teamA.timeouts;
  timeoutTextA.textContent = `⏱️ Pedir Tempo (${leftTimeoutsA})`;
  btnTimeoutA.disabled = leftTimeoutsA <= 0 || state.timeoutModal.active;

  const leftTimeoutsB = 2 - state.teamB.timeouts;
  timeoutTextB.textContent = `⏱️ Pedir Tempo (${leftTimeoutsB})`;
  btnTimeoutB.disabled = leftTimeoutsB <= 0 || state.timeoutModal.active;

  // Botão Fechar Tempo
  btnCancelTimeout.style.opacity = state.timeoutModal.active ? '1' : '0.5';

  // Cronômetro
  controlTimerDisplay.textContent = formatTime(state.timer.seconds);
  if (state.timer.running) {
    btnTimerToggle.classList.add('running');
    timerToggleIcon.textContent = '⏸';
    timerToggleText.textContent = 'Pausar';
  } else {
    btnTimerToggle.classList.remove('running');
    timerToggleIcon.textContent = '▶';
    timerToggleText.textContent = 'Iniciar';
  }

  // Modo de Sets
  setsModeText.textContent = `Config: Melhor de ${state.maxSets} Sets`;
}

// Ouvir atualizações de estado
socket.on('state:update', (state) => {
  updateControlUI(state);
});

socket.on('timer:tick', (data) => {
  if (data.timer) {
    controlTimerDisplay.textContent = formatTime(data.timer.seconds);
  }
});

// Ações de Pontuação
btnAddA.addEventListener('click', () => socket.emit('point:add', { team: 'A' }));
btnSubA.addEventListener('click', () => socket.emit('point:sub', { team: 'A' }));
btnAddB.addEventListener('click', () => socket.emit('point:add', { team: 'B' }));
btnSubB.addEventListener('click', () => socket.emit('point:sub', { team: 'B' }));

// Ações de Saque
btnServeA.addEventListener('click', () => socket.emit('serve:set', { team: 'A' }));
btnServeB.addEventListener('click', () => socket.emit('serve:set', { team: 'B' }));

// Ações de Tempo Técnico
btnTimeoutA.addEventListener('click', () => socket.emit('timeout:call', { team: 'A' }));
btnTimeoutB.addEventListener('click', () => socket.emit('timeout:call', { team: 'B' }));
btnCancelTimeout.addEventListener('click', () => socket.emit('timeout:cancel'));

// Cronômetro
btnTimerToggle.addEventListener('click', () => socket.emit('timer:toggle'));
btnTimerReset.addEventListener('click', () => socket.emit('timer:reset'));

// Trocar de Quadra
btnSwapCourt.addEventListener('click', () => socket.emit('court:swap'));

// Atualização dos Nomes das Equipes
function saveNames() {
  const teamAName = nameInputA.value.trim() || 'LADO A';
  const teamBName = nameInputB.value.trim() || 'LADO B';
  socket.emit('match:update_config', { teamAName, teamBName });
}

nameInputA.addEventListener('blur', saveNames);
nameInputB.addEventListener('blur', saveNames);
nameInputA.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInputA.blur(); });
nameInputB.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInputB.blur(); });

// Finalizar Set Manual
btnManualFinishSet.addEventListener('click', () => {
  if (!currentState) return;
  const choice = prompt(`Quem venceu o Set ${currentState.currentSet}?\nDigite "A" para ${currentState.teamA.name} ou "B" para ${currentState.teamB.name}:`);
  if (choice) {
    const winner = choice.trim().toUpperCase();
    if (winner === 'A' || winner === 'B') {
      socket.emit('set:manual_finish', { winner });
    } else {
      alert('Opção inválida. Digite apenas "A" ou "B".');
    }
  }
});

// Desfazer Set
btnUndoSet.addEventListener('click', () => {
  if (confirm('Deseja realmente desfazer o último set concluído?')) {
    socket.emit('set:undo');
  }
});

// Alternar Modo Melhor de 3 ou Melhor de 5 Sets
btnToggleSetsMode.addEventListener('click', () => {
  if (!currentState) return;
  const newMax = currentState.maxSets === 5 ? 3 : 5;
  socket.emit('match:update_config', { maxSets: newMax });
});

// Sons instantâneos
btnSoundWhistle.addEventListener('click', () => socket.emit('sound:trigger', { type: 'whistle' }));
btnSoundBuzzer.addEventListener('click', () => socket.emit('sound:trigger', { type: 'buzzer' }));

// Reiniciar Partida
btnResetMatch.addEventListener('click', () => {
  if (confirm('Tem certeza que deseja REINICIAR a partida do zero? Todos os pontos e sets serão zerados.')) {
    socket.emit('match:reset');
  }
});

// Atalhos de teclado convenientes (apenas se não estiver digitando em campos de texto)
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  if (e.key === '1') {
    e.preventDefault();
    socket.emit('point:add', { team: 'A' });
  } else if (e.key === '2') {
    e.preventDefault();
    socket.emit('point:add', { team: 'B' });
  } else if (e.code === 'Space') {
    e.preventDefault();
    socket.emit('timer:toggle');
  } else if (e.key.toLowerCase() === 't') {
    e.preventDefault();
    socket.emit('court:swap');
  }
});
