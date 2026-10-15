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
    const activeAttrs = ['attack', 'defense', 'set_pass', 'movement'].filter(k => currentRatings[k] > 0);
    if (activeAttrs.length === 0) return 0.0;
    const totalWeight = activeAttrs.reduce((sum, k) => sum + weights[k], 0);
    const sum = activeAttrs.reduce((acc, k) => acc + (currentRatings[k] * weights[k]), 0);
    return Number((sum / totalWeight).toFixed(1));
  }

  // Elementos DOM
  const selectPlayer = document.getElementById('selectPlayer');
  const formRatePlayer = document.getElementById('formRatePlayer');
  const btnSubmitVote = document.getElementById('btnSubmitVote');
  const btnRemoveVote = document.getElementById('btnRemoveVote');
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
  const voterPlayerVoteCount = document.getElementById('voterPlayerVoteCount');

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
        if (value > 0 && val <= value) {
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
      if (el) el.textContent = value > 0 ? `${value}★` : '-';
    }

    // Atualiza Overall Pré-visualizado
    if (overallNumeric) {
      const ov = computeWeightedOverall();
      overallNumeric.textContent = ov > 0 ? ov.toFixed(1) : '0.0';
    }
  }

  // Configura cliques nos botões de estrela (clicar na mesma estrela remove)
  document.querySelectorAll('.stars-picker').forEach(picker => {
    const attr = picker.dataset.attr;
    const buttons = picker.querySelectorAll('.star-btn');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!userCanVote) return;
        const val = parseInt(btn.dataset.val, 10);
        if (currentRatings[attr] === val) {
          // Desmarca
          updateStars(attr, 0);
        } else {
          updateStars(attr, val);
        }
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
    const voteCount = Number(player.vote_count) || 0;
    if (voterPlayerOverall) {
      voterPlayerOverall.textContent = hasOverall
        ? `Média: ★ ${Number(player.overall).toFixed(1)}`
        : 'Sem estrelas';
    }

    if (voterPlayerVoteCount) {
      if (voteCount === 0) {
        voterPlayerVoteCount.textContent = '👥 Nenhum voto ainda';
        voterPlayerVoteCount.style.background = 'rgba(148, 163, 184, 0.12)';
        voterPlayerVoteCount.style.color = '#94a3b8';
        voterPlayerVoteCount.style.borderColor = 'rgba(148, 163, 184, 0.25)';
      } else if (voteCount === 1) {
        voterPlayerVoteCount.textContent = '👥 1 pessoa já avaliou';
        voterPlayerVoteCount.style.background = 'rgba(56, 189, 248, 0.15)';
        voterPlayerVoteCount.style.color = '#38bdf8';
        voterPlayerVoteCount.style.borderColor = 'rgba(56, 189, 248, 0.35)';
      } else {
        voterPlayerVoteCount.textContent = `👥 ${voteCount} pessoas já avaliaram`;
        voterPlayerVoteCount.style.background = 'rgba(56, 189, 248, 0.15)';
        voterPlayerVoteCount.style.color = '#38bdf8';
        voterPlayerVoteCount.style.borderColor = 'rgba(56, 189, 248, 0.35)';
      }
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
    if (btnRemoveVote) {
      btnRemoveVote.style.display = previousVote ? 'inline-flex' : 'none';
    }

    if (previousVote) {
      updateStars('attack', Number(previousVote.attack) || 3);
      updateStars('defense', Number(previousVote.defense) || 3);
      updateStars('set_pass', Number(previousVote.set_pass) || 3);
      updateStars('movement', Number(previousVote.movement) || 3);

      if (personalVoteStatusText) {
        personalVoteStatusText.innerHTML = `🔒 <strong>Sua avaliação individual:</strong> Você avaliou <strong>${Auth.escapeHtml(player.name)}</strong> com ${Number(previousVote.overall).toFixed(1)}★. Cada usuário possui 1 voto próprio contabilizado na média e inviolável por outros usuários. Altere as estrelas abaixo para atualizar a sua nota quando desejar.`;
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
          const starStatus = p.overall && p.overall > 0 ? `★${Number(p.overall).toFixed(1)}` : 'Sem estrelas';
          const voteCount = Number(p.vote_count) || 0;
          const voteCountText = voteCount === 0 ? '0 votos' : (voteCount === 1 ? '1 voto' : `${voteCount} votos`);
          const myVoteTag = userRatingsMap[p.id] ? ` | Seu voto: ★${Number(userRatingsMap[p.id].overall).toFixed(1)}` : '';
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.name} (${p.position || 'Geral'}) — Média: ${starStatus} (${voteCountText})${myVoteTag}`;
          
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

      // Se todas as notas forem 0, remove o voto
      const isRemoval = (currentRatings.attack === 0 && currentRatings.defense === 0 && currentRatings.set_pass === 0 && currentRatings.movement === 0);

      btnSubmitVote.disabled = true;
      btnSubmitVote.innerHTML = `<span>⏳</span><span>${isRemoval ? 'Removendo voto...' : 'Gravando no Banco...'}</span>`;

      try {
        const res = await fetch(`/api/players/${playerId}/rate`, {
          method: isRemoval ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: isRemoval ? undefined : JSON.stringify({
            attack: currentRatings.attack,
            defense: currentRatings.defense,
            setPass: currentRatings.set_pass,
            movement: currentRatings.movement
          })
        });

        const data = await res.json();
        if (data.success) {
          const selectedText = selectPlayer.options[selectPlayer.selectedIndex]?.textContent || 'O atleta';
          const playerName = selectedText.split('(')[0].trim();

          if (data.player) {
            const pIndex = playersList.findIndex(p => String(p.id) === String(playerId));
            if (pIndex !== -1) {
              playersList[pIndex].overall = data.player.overall;
              playersList[pIndex].vote_count = data.player.vote_count;
              playersList[pIndex].avg_attack = data.player.avg_attack;
              playersList[pIndex].avg_defense = data.player.avg_defense;
              playersList[pIndex].avg_set_pass = data.player.avg_set_pass;
              playersList[pIndex].avg_movement = data.player.avg_movement;
            }
          }

          if (isRemoval) {
            delete userRatingsMap[playerId];
            const remainingCount = data.player ? (data.player.vote_count || 0) : 0;
            if (successPlayerText) {
              successPlayerText.textContent = `Seu voto em ${playerName} foi removido com sucesso! O atleta possui agora ${remainingCount} ${remainingCount === 1 ? 'voto registrado' : 'votos registrados'}.`;
            }
          } else {
            userRatingsMap[playerId] = {
              attack: currentRatings.attack,
              defense: currentRatings.defense,
              set_pass: currentRatings.set_pass,
              movement: currentRatings.movement,
              overall: computeWeightedOverall()
            };
            const totalVoters = data.player ? (data.player.vote_count || 1) : 1;
            const newOverall = data.player ? Number(data.player.overall).toFixed(1) : computeWeightedOverall();
            if (successPlayerText) {
              successPlayerText.textContent = `Sua avaliação individual de ${computeWeightedOverall()}★ para ${playerName} foi registrada com sucesso! Agora ${playerName} conta com ${totalVoters} ${totalVoters === 1 ? 'pessoa votante' : 'pessoas votantes'} (Média Geral: ★${newOverall}).`;
            }
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

  // Botão explícito de remoção de voto
  if (btnRemoveVote) {
    btnRemoveVote.addEventListener('click', async () => {
      const playerId = selectPlayer.value;
      if (!playerId) return;

      if (!confirm('Deseja realmente remover seu voto neste atleta?')) return;

      btnRemoveVote.disabled = true;
      try {
        const res = await fetch(`/api/players/${playerId}/rate`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
          delete userRatingsMap[playerId];
          const selectedText = selectPlayer.options[selectPlayer.selectedIndex]?.textContent || 'O atleta';
          const playerName = selectedText.split('(')[0].trim();
          if (successPlayerText) {
            successPlayerText.textContent = `Seu voto em ${playerName} foi removido com sucesso!`;
          }
          formRatePlayer.style.display = 'none';
          successScreen.classList.add('active');
        } else {
          alert('Erro ao remover voto: ' + (data.error || 'Erro no banco'));
        }
      } catch (err) {
        alert('Falha na comunicação: ' + err.message);
      } finally {
        btnRemoveVote.disabled = false;
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
