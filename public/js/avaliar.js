document.addEventListener('DOMContentLoaded', () => {
  // Apenas usuários logados podem acessar as Avaliações e Craques. Visitantes só podem abrir o Placar.
  if (!Auth.requireLogin('avaliar')) return;
  window.addEventListener('auth:expired', () => Auth.requireLogin('avaliar'));

  const currentUser = Auth.getUser();
  const voterAuthName = document.getElementById('voterAuthName');
  const voterAvatarPill = document.getElementById('voterAvatarPill');
  const voterRoleBadge = document.getElementById('voterRoleBadge');
  const spectatorWarningBanner = document.getElementById('spectatorWarningBanner');
  const personalVoteStatusText = document.getElementById('personalVoteStatusText');

  if (voterAuthName) voterAuthName.textContent = Auth.displayName(currentUser);
  if (voterAvatarPill) voterAvatarPill.textContent = Auth.displayName(currentUser).charAt(0).toUpperCase();

  // Estado local
  let playersList = [];
  let userRatingsMap = {}; // Mapa dos votos já dados por este usuário { [playerId]: rating }
  let userCanVote = true;
  let userRoleInPelada = 'votante';

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

  // Recupera parâmetros da URL (prioriza sala ativa salva no localStorage)
  const urlParams = new URLSearchParams(window.location.search);
  const targetPlayerId = urlParams.get('p') || urlParams.get('player');
  const targetPeladaId = urlParams.get('pelada') || urlParams.get('sala') || urlParams.get('peladaId') || urlParams.get('roomId') || localStorage.getItem('activePeladaId') || '733849';

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

    // Atualiza Overall Pré-visualizado
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
        if (!userCanVote) return;
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
    const voteCount = player.vote_count || 0;
    if (voterPlayerOverall) {
      voterPlayerOverall.textContent = hasOverall
        ? `Média Ponderada: ★ ${Number(player.overall).toFixed(1)} (${voteCount} voto${voteCount === 1 ? '' : 's'})`
        : 'Sem estrelas ainda';
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

    // Carrega o voto específico deste usuário para o atleta selecionado
    const previousVote = userRatingsMap[player.id];
    if (previousVote) {
      updateStars('attack', Number(previousVote.attack) || 3);
      updateStars('defense', Number(previousVote.defense) || 3);
      updateStars('set_pass', Number(previousVote.set_pass) || 3);
      updateStars('movement', Number(previousVote.movement) || 3);

      if (personalVoteStatusText) {
        personalVoteStatusText.innerHTML = `✓ Você já avaliou <strong>${Auth.escapeHtml(player.name)}</strong> anteriormente (${Number(previousVote.overall).toFixed(1)}★). Você pode editar as estrelas abaixo quando quiser.`;
        personalVoteStatusText.style.display = 'block';
      }
      if (btnSubmitVote && userCanVote) {
        btnSubmitVote.innerHTML = `<span>✏️</span><span>Atualizar Minha Avaliação</span>`;
      }
    } else {
      updateStars('attack', 3);
      updateStars('defense', 3);
      updateStars('set_pass', 3);
      updateStars('movement', 3);

      if (personalVoteStatusText) personalVoteStatusText.style.display = 'none';
      if (btnSubmitVote && userCanVote) {
        btnSubmitVote.innerHTML = `<span>⭐</span><span>Gravar Minha Avaliação</span>`;
      }
    }
  }

  // Listener para mudança no select do jogador
  if (selectPlayer) {
    selectPlayer.addEventListener('change', (e) => {
      updatePlayerProfileCard(e.target.value);
    });
  }

  // Carregar detalhes da pelada e papel do usuário
  async function loadPeladaAndRoleInfo() {
    if (!targetPeladaId) return;
    try {
      // 1. Dados da pelada
      const res = await fetch(`/api/peladas/${targetPeladaId}`);
      const data = await res.json();
      if (data.success && data.pelada) {
        const voteBadge = document.querySelector('.vote-badge');
        if (voteBadge) {
          voteBadge.innerHTML = `<span>🏐</span> Pelada: <strong>${Auth.escapeHtml(data.pelada.name)} (#${Auth.escapeHtml(data.pelada.id)})</strong>`;
        }
      }

      // 2. Papel e permissão de voto do usuário nesta pelada
      const roleRes = await fetch(`/api/peladas/${targetPeladaId}/my-role`);
      const roleData = await roleRes.json();
      if (roleData.success) {
        userCanVote = Boolean(roleData.canVote);
        userRoleInPelada = roleData.role || 'votante';

        if (voterRoleBadge) {
          if (userRoleInPelada === 'admin') {
            voterRoleBadge.textContent = '⭐ Administrador';
            voterRoleBadge.style.background = 'rgba(251, 191, 36, 0.2)';
            voterRoleBadge.style.color = '#fbbf24';
            voterRoleBadge.style.borderColor = 'rgba(251, 191, 36, 0.4)';
          } else if (userCanVote) {
            voterRoleBadge.textContent = '🏐 Votante Autorizado';
            voterRoleBadge.style.background = 'rgba(16, 185, 129, 0.2)';
            voterRoleBadge.style.color = '#34d399';
            voterRoleBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          } else {
            voterRoleBadge.textContent = '👁️ Apenas Espectador';
            voterRoleBadge.style.background = 'rgba(239, 68, 68, 0.2)';
            voterRoleBadge.style.color = '#fca5a5';
            voterRoleBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          }
        }

        // Se for espectador, bloqueia a votação na interface
        if (!userCanVote) {
          if (spectatorWarningBanner) spectatorWarningBanner.style.display = 'block';
          if (btnSubmitVote) {
            btnSubmitVote.disabled = true;
            btnSubmitVote.innerHTML = `<span>🔒</span><span>Voto Bloqueado (Perfil Espectador)</span>`;
            btnSubmitVote.style.background = 'rgba(100, 116, 139, 0.4)';
            btnSubmitVote.style.color = '#94a3b8';
          }
          document.querySelectorAll('.stars-picker').forEach(p => {
            p.style.opacity = '0.6';
            p.style.pointerEvents = 'none';
          });
        } else {
          if (spectatorWarningBanner) spectatorWarningBanner.style.display = 'none';
          if (btnSubmitVote) {
            btnSubmitVote.disabled = false;
          }
          document.querySelectorAll('.stars-picker').forEach(p => {
            p.style.opacity = '1';
            p.style.pointerEvents = 'auto';
          });
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar detalhes e permissões da pelada:', err);
    }
  }

  // Carrega as avaliações individuais dadas por este usuário
  async function loadMyRatings() {
    try {
      const res = await fetch('/api/players/my-ratings');
      const data = await res.json();
      if (data.success && data.ratings) {
        userRatingsMap = data.ratings;
      }
    } catch (err) {
      console.warn('Erro ao carregar votos do usuário:', err);
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
          const starStatus = p.overall && p.overall > 0 ? `Média: ★${Number(p.overall).toFixed(1)}` : 'Sem estrelas';
          const myVoteTag = userRatingsMap[p.id] ? ` (Seu voto: ${Number(userRatingsMap[p.id].overall).toFixed(1)}★)` : '';
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.name} (${p.position || 'Geral'}) - ${starStatus}${myVoteTag}`;
          
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

      if (!userCanVote) {
        alert('Você está cadastrado como Espectador e não possui autorização para votar nesta pelada.');
        return;
      }

      const playerId = selectPlayer.value;
      if (!playerId) {
        alert('Por favor, selecione um jogador.');
        return;
      }

      btnSubmitVote.disabled = true;
      btnSubmitVote.innerHTML = `<span>⏳</span><span>Gravando no Banco...</span>`;

      try {
        const res = await fetch(`/api/players/${playerId}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attack: currentRatings.attack,
            defense: currentRatings.defense,
            setPass: currentRatings.set_pass,
            movement: currentRatings.movement
          })
        });

        const data = await res.json();
        if (data.success) {
          // Atualiza mapa local
          userRatingsMap[playerId] = {
            attack: currentRatings.attack,
            defense: currentRatings.defense,
            set_pass: currentRatings.set_pass,
            movement: currentRatings.movement,
            overall: computeWeightedOverall()
          };

          const selectedText = selectPlayer.options[selectPlayer.selectedIndex]?.textContent || 'O atleta';
          if (successPlayerText) {
            successPlayerText.textContent = `Sua avaliação individual de ${computeWeightedOverall()}★ para ${selectedText.split('(')[0].trim()} foi registrada com sucesso! O sistema computou a nova média ponderada geral.`;
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
        btnSubmitVote.innerHTML = `<span>⭐</span><span>Gravar Avaliação</span>`;
      }
    });
  }

  // Avaliar Outro Jogador
  if (btnVoteAnother) {
    btnVoteAnother.addEventListener('click', () => {
      successScreen.classList.remove('active');
      formRatePlayer.style.display = 'block';
      loadPlayers();
    });
  }

  // Inicializa a cédula de votação individual
  async function init() {
    await loadPeladaAndRoleInfo();
    await loadMyRatings();
    await loadPlayers();
  }

  init();
});
