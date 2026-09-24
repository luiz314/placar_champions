document.addEventListener('DOMContentLoaded', () => {
  // Verifica autenticação obrigatória do usuário
  let currentUser = null;
  try {
    const raw = localStorage.getItem('pelada_user');
    if (raw) currentUser = JSON.parse(raw);
  } catch(e) {
    currentUser = null;
  }

  const authLockCard = document.getElementById('authLockCard');
  const voterAuthName = document.getElementById('voterAuthName');
  const voterAvatarPill = document.getElementById('voterAvatarPill');

  if (!currentUser) {
    if (authLockCard) authLockCard.style.display = 'block';
    const formEl = document.getElementById('formRatePlayer');
    if (formEl) formEl.style.display = 'none';
  } else {
    if (authLockCard) authLockCard.style.display = 'none';
    if (voterAuthName) voterAuthName.textContent = currentUser.name || currentUser.username;
    if (voterAvatarPill) voterAvatarPill.textContent = (currentUser.name || currentUser.username || 'U').charAt(0).toUpperCase();
  }

  // Estado local
  let playersList = [];
  const currentRatings = {
    attack: 3,
    defense: 3,
    set_pass: 3,
    movement: 3
  };

  // Pesos para o cálculo da Média Ponderada
  const weights = {
    attack: 1.0,
    defense: 1.0,
    set_pass: 1.0,
    movement: 1.0
  };

  function computeWeightedOverall() {
    const totalWeight = weights.attack + weights.defense + weights.set_pass + weights.movement;
    const sum = (currentRatings.attack * weights.attack) +
                (currentRatings.defense * weights.defense) +
                (currentRatings.set_pass * weights.set_pass) +
                (currentRatings.movement * weights.movement);
    return Number((sum / totalWeight).toFixed(1));
  }

  // Elementos DOM
  const selectPlayer = document.getElementById('selectPlayer');
  const inputVoterName = document.getElementById('inputVoterName');
  const formRatePlayer = document.getElementById('formRatePlayer');
  const btnSubmitVote = document.getElementById('btnSubmitVote');
  const overallNumeric = document.getElementById('overallNumeric');
  const successScreen = document.getElementById('successScreen');
  const successPlayerText = document.getElementById('successPlayerText');
  const btnVoteAnother = document.getElementById('btnVoteAnother');

  // Elementos do Card de Foto do Atleta
  const voterPlayerCard = document.getElementById('voterPlayerCard');
  const voterPlayerPhoto = document.getElementById('voterPlayerPhoto');
  const voterPlayerInitial = document.getElementById('voterPlayerInitial');
  const voterPlayerName = document.getElementById('voterPlayerName');
  const voterPlayerPos = document.getElementById('voterPlayerPos');
  const voterPlayerNick = document.getElementById('voterPlayerNick');
  const voterPlayerOverall = document.getElementById('voterPlayerOverall');

  // Recupera parâmetros da URL (prioriza sala 733849 se não especificado)
  const urlParams = new URLSearchParams(window.location.search);
  const targetPlayerId = urlParams.get('p') || urlParams.get('player');
  const targetPeladaId = urlParams.get('pelada') || urlParams.get('sala') || urlParams.get('peladaId') || urlParams.get('roomId') || '733849';

  // Atualizar visualização das estrelas para um atributo
  function updateStars(attr, value) {
    currentRatings[attr] = value;
    const picker = document.querySelector(`.stars-picker[data-attr="${attr}"]`);
    if (picker) {
      const buttons = picker.querySelectorAll('.star-btn');
      buttons.forEach(btn => {
        const val = parseInt(btn.dataset.val, 10);
        if (val <= value) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Atualiza label numérico
    const displayMap = {
      attack: 'scoreDisplayAttack',
      defense: 'scoreDisplayDefense',
      set_pass: 'scoreDisplaySetPass',
      movement: 'scoreDisplayMovement'
    };
    const elId = displayMap[attr];
    if (elId) {
      const el = document.getElementById(elId);
      if (el) el.textContent = `${value}★`;
    }

    // Atualiza Overall
    if (overallNumeric) {
      overallNumeric.textContent = computeWeightedOverall().toFixed(1);
    }
  }

  // Configura cliques nos botões de estrela
  document.querySelectorAll('.stars-picker').forEach(picker => {
    const attr = picker.dataset.attr;
    const buttons = picker.querySelectorAll('.star-btn');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val, 10);
        updateStars(attr, val);
      });
    });
  });

  // Atualiza Card de Destaque com a Foto do Jogador Selecionado
  function updatePlayerProfileCard(playerId) {
    const player = playersList.find(p => String(p.id) === String(playerId));
    if (!player) return;

    const fullName = player.name || player.nickname || 'Jogador';
    const initial = fullName.trim().charAt(0).toUpperCase();

    if (voterPlayerName) voterPlayerName.textContent = fullName;
    if (voterPlayerPos) voterPlayerPos.textContent = player.position || 'Geral';

    if (player.nickname && player.nickname.trim() !== '' && player.nickname.toLowerCase() !== fullName.toLowerCase()) {
      if (voterPlayerNick) {
        voterPlayerNick.textContent = `"${player.nickname}"`;
        voterPlayerNick.style.display = 'inline-block';
      }
    } else {
      if (voterPlayerNick) voterPlayerNick.style.display = 'none';
    }

    const hasOverall = player.overall && Number(player.overall) > 0;
    if (voterPlayerOverall) {
      voterPlayerOverall.textContent = hasOverall ? `★ ${Number(player.overall).toFixed(1)}` : 'Sem estrelas';
    }

    // Foto do jogador
    if (player.photo_url && player.photo_url.trim() !== '') {
      if (voterPlayerPhoto) {
        voterPlayerPhoto.src = player.photo_url;
        voterPlayerPhoto.style.display = 'block';
      }
      if (voterPlayerInitial) voterPlayerInitial.style.display = 'none';
    } else {
      if (voterPlayerPhoto) {
        voterPlayerPhoto.src = '';
        voterPlayerPhoto.style.display = 'none';
      }
      if (voterPlayerInitial) {
        voterPlayerInitial.textContent = initial;
        voterPlayerInitial.style.display = 'block';
      }
    }
  }

  // Listener para mudança no select do jogador
  if (selectPlayer) {
    selectPlayer.addEventListener('change', (e) => {
      updatePlayerProfileCard(e.target.value);
    });
  }

  // Atualiza título da pelada se targetPeladaId existir
  async function loadPeladaInfo() {
    if (!targetPeladaId) return;
    try {
      const res = await fetch(`/api/peladas/${targetPeladaId}`);
      const data = await res.json();
      if (data.success && data.pelada) {
        const voteBadge = document.querySelector('.vote-badge');
        if (voteBadge) {
          voteBadge.innerHTML = `<span>🏐</span> Pelada: <strong>${data.pelada.name} (#${data.pelada.id})</strong>`;
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar detalhes da pelada:', err);
    }
  }

  // Carregar lista de jogadores da pelada/sala
  async function loadPlayers() {
    try {
      const url = targetPeladaId ? `/api/players?peladaId=${targetPeladaId}` : '/api/players';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.players)) {
        playersList = data.players;
        selectPlayer.innerHTML = '<option value="" disabled>Selecione um jogador...</option>';
        
        let selectedIndex = 1;
        playersList.forEach((p, idx) => {
          const starStatus = p.overall && p.overall > 0 ? `Atual: ★${Number(p.overall).toFixed(1)}` : 'Sem estrelas ainda';
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.name} (${p.position || 'Geral'}) - ${starStatus}`;
          
          if (targetPlayerId && String(p.id) === String(targetPlayerId)) {
            opt.selected = true;
            selectedIndex = idx + 1;
          }
          selectPlayer.appendChild(opt);
        });

        if (playersList.length > 0) {
          if (!targetPlayerId) {
            selectPlayer.selectedIndex = 1;
            updatePlayerProfileCard(playersList[0].id);
          } else {
            updatePlayerProfileCard(targetPlayerId);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar jogadores:', err);
    }
  }

  // Enviar Avaliação
  if (formRatePlayer) {
    formRatePlayer.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!currentUser) {
        alert('Apenas usuários logados podem avaliar outros jogadores!');
        window.location.href = '/login';
        return;
      }

      const playerId = selectPlayer.value;
      if (!playerId) {
        alert('Por favor, selecione um jogador.');
        return;
      }

      const voterName = currentUser.name || currentUser.username;
      btnSubmitVote.disabled = true;
      btnSubmitVote.innerHTML = `<span>⏳</span><span>Gravando no Banco...</span>`;

      try {
        const res = await fetch(`/api/players/${playerId}/rate`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': currentUser.id
          },
          body: JSON.stringify({
            userId: currentUser.id,
            voterName: voterName,
            attack: currentRatings.attack,
            defense: currentRatings.defense,
            setPass: currentRatings.set_pass,
            movement: currentRatings.movement
          })
        });

        const data = await res.json();
        if (data.success) {
          const selectedText = selectPlayer.options[selectPlayer.selectedIndex]?.textContent || 'O atleta';
          if (successPlayerText) {
            successPlayerText.textContent = `Sua avaliação de ${computeWeightedOverall()}★ para ${selectedText.split('(')[0].trim()} foi salva com sucesso!`;
          }
          formRatePlayer.style.display = 'none';
          successScreen.classList.add('active');
        } else {
          alert('Erro ao registrar avaliação: ' + (data.error || 'Erro no banco de dados'));
        }
      } catch (err) {
        alert('Falha na comunicação com o servidor: ' + err.message);
      } finally {
        btnSubmitVote.disabled = false;
        btnSubmitVote.innerHTML = `<span>⭐</span><span>Gravar Avaliação no Banco</span>`;
      }
    });
  }

  // Avaliar Outro Jogador
  if (btnVoteAnother) {
    btnVoteAnother.addEventListener('click', () => {
      successScreen.classList.remove('active');
      formRatePlayer.style.display = 'block';
      // Reseta notas para 3 estrelas padrão
      ['attack', 'defense', 'set_pass', 'movement'].forEach(a => updateStars(a, 3));
      loadPlayers();
    });
  }

  // Inicializa
  loadPeladaInfo();
  loadPlayers();
});
