document.addEventListener('DOMContentLoaded', () => {
  // Estado local
  let peladasList = [];
  let activePeladaId = null;
  let playersList = [];
  let selectedPlayerIds = new Set();
  let lastBalancedResult = null;
  let currentUser = null; // { id, username, name, role }
  let userRatingsMap = {}; // { [playerId]: { attack, defense, set_pass, movement, overall } }

  // Elementos DOM - Topo & Pelada Ativa
  const activePeladaIdBadge = document.getElementById('activePeladaIdBadge');
  const activePeladaNameHeading = document.getElementById('activePeladaNameHeading');
  const selectActivePeladaDropdown = document.getElementById('selectActivePeladaDropdown');
  const btnQuickNewPelada = document.getElementById('btnQuickNewPelada');

  // Elementos DOM - Abas
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Elementos DOM - Sorteador
  const playerSelectGrid = document.getElementById('playerSelectGrid');
  const totalRegisteredCount = document.getElementById('totalRegisteredCount');
  const selectedCountBadge = document.getElementById('selectedCountBadge');
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnDeselectAll = document.getElementById('btnDeselectAll');
  const btnRunBalance = document.getElementById('btnRunBalance');
  const selectNumTeams = document.getElementById('selectNumTeams');
  const selectTeamFormat = document.getElementById('selectTeamFormat');
  const balanceResultArea = document.getElementById('balanceResultArea');
  const fairnessScoreDisplay = document.getElementById('fairnessScoreDisplay');
  const fairnessDeltaDisplay = document.getElementById('fairnessDeltaDisplay');
  const teamsResultGrid = document.getElementById('teamsResultGrid');
  const benchContainer = document.getElementById('benchContainer');
  const benchRoster = document.getElementById('benchRoster');
  const btnCopyWhatsappLineup = document.getElementById('btnCopyWhatsappLineup');

  // Elementos DOM - Tabela de Peladas & Modais de Pelada
  const peladasTableBody = document.getElementById('peladasTableBody');
  const btnOpenModalAddPelada = document.getElementById('btnOpenModalAddPelada');
  const modalAddPelada = document.getElementById('modalAddPelada');
  const btnCancelAddPelada = document.getElementById('btnCancelAddPelada');
  const formAddPelada = document.getElementById('formAddPelada');
  const inputPeladaName = document.getElementById('inputPeladaName');
  const inputPeladaAdmin = document.getElementById('inputPeladaAdmin');

  const modalEditPelada = document.getElementById('modalEditPelada');
  const btnCancelEditPelada = document.getElementById('btnCancelEditPelada');
  const formEditPelada = document.getElementById('formEditPelada');
  const inputEditPeladaId = document.getElementById('inputEditPeladaId');
  const inputEditPeladaName = document.getElementById('inputEditPeladaName');

  // Elementos DOM - Jogadores Tab & Modal Jogador
  const playersTableBody = document.getElementById('playersTableBody');
  const btnModalAddPlayer = document.getElementById('btnModalAddPlayer');
  const btnModalAddPlayer2 = document.getElementById('btnModalAddPlayer2');
  const modalAddPlayer = document.getElementById('modalAddPlayer');
  const btnCancelAddPlayer = document.getElementById('btnCancelAddPlayer');
  const formAddPlayer = document.getElementById('formAddPlayer');

  // Elementos DOM - Histórico Tab
  const matchesHistoryBody = document.getElementById('matchesHistoryBody');
  const btnRefreshMatches = document.getElementById('btnRefreshMatches');

  // Banner link de votação
  const publicVoteUrlInput = document.getElementById('publicVoteUrlInput');
  const btnCopyVoteLink = document.getElementById('btnCopyVoteLink');
  const peladaToast = document.getElementById('peladaToast');

  // Notificação Toast
  function showToast(message) {
    if (!peladaToast) return;
    peladaToast.textContent = message;
    peladaToast.classList.add('show');
    setTimeout(() => {
      peladaToast.classList.remove('show');
    }, 2800);
  }

  // Atualiza link de votação pública para a pelada ativa
  function updateVotingLink() {
    const origin = window.location.origin;
    const url = activePeladaId ? `${origin}/avaliar?pelada=${activePeladaId}&sala=${activePeladaId}` : `${origin}/avaliar`;
    if (publicVoteUrlInput) {
      publicVoteUrlInput.value = url;
    }
    const btnOpenPublicVote = document.getElementById('btnOpenPublicVote');
    if (btnOpenPublicVote) {
      btnOpenPublicVote.href = url;
    }
    const bannerTitle = document.querySelector('.voting-link-banner strong');
    if (bannerTitle) {
      bannerTitle.innerHTML = `<span>📲</span> Link de Votação da Galera (${escapeHtml(getActivePeladaName())} #${activePeladaId || ''})`;
    }
  }

  // Copiar Link Geral de Votação
  if (btnCopyVoteLink) {
    btnCopyVoteLink.addEventListener('click', () => {
      const url = publicVoteUrlInput ? publicVoteUrlInput.value : window.location.origin + '/avaliar';
      navigator.clipboard.writeText(url).then(() => {
        showToast('Link de votação copiado! Cole no WhatsApp da galera.');
      }).catch(() => {
        if (publicVoteUrlInput) {
          publicVoteUrlInput.select();
          document.execCommand('copy');
        }
        showToast('Link copiado!');
      });
    });
  }

  // Alternar Abas
  function switchTab(targetId) {
    tabButtons.forEach(b => {
      if (b.getAttribute('data-tab') === targetId) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    tabContents.forEach(c => {
      if (c.id === targetId) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    if (targetId === 'tab-peladas') {
      renderPeladasTable();
    } else if (targetId === 'tab-jogadores') {
      loadPlayers(activePeladaId);
    } else if (targetId === 'tab-historico') {
      loadMatches();
    }
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  // ==========================================
  // GESTÃO DE PELADAS / SESSÕES
  // ==========================================

  function getActivePelada() {
    return peladasList.find(p => Number(p.id) === Number(activePeladaId)) || null;
  }

  function getActivePeladaName() {
    const p = getActivePelada();
    return p ? p.name : 'Pelada Principal';
  }

  // Atualiza elementos de UI que mostram a pelada ativa
  function updatePeladaUI() {
    const cur = getActivePelada();
    const idText = cur ? `#${cur.id}` : '#1';
    const nameText = cur ? cur.name : 'Pelada Principal';

    if (activePeladaIdBadge) activePeladaIdBadge.textContent = idText;
    if (activePeladaNameHeading) activePeladaNameHeading.textContent = nameText;

    // Atualiza Dropdown do topo
    if (selectActivePeladaDropdown) {
      selectActivePeladaDropdown.innerHTML = '';
      peladasList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `#${p.id} - ${p.name} (${p.player_count || 0} jogadores)`;
        if (Number(p.id) === Number(activePeladaId)) {
          opt.selected = true;
        }
        selectActivePeladaDropdown.appendChild(opt);
      });
    }

    updateVotingLink();
  }

  // Trocar de pelada ativa
  async function switchActivePelada(newId, shouldSwitchTab = false) {
    activePeladaId = parseInt(newId, 10);
    localStorage.setItem('activePeladaId', String(activePeladaId));
    selectedPlayerIds.clear();
    lastBalancedResult = null;
    if (balanceResultArea) balanceResultArea.classList.remove('active');

    updatePeladaUI();
    renderPeladasTable();
    await loadPlayers(activePeladaId);

    showToast(`Sessão alterada para: ${getActivePeladaName()}`);
    if (shouldSwitchTab) {
      switchTab('tab-sorteador');
    }
  }

  // Listener para o dropdown do topo
  if (selectActivePeladaDropdown) {
    selectActivePeladaDropdown.addEventListener('change', (e) => {
      switchActivePelada(e.target.value);
    });
  }

  // Carregar peladas da API
  async function loadPeladas() {
    try {
      const res = await fetch('/api/peladas');
      const data = await res.json();
      if (data.success && Array.isArray(data.peladas)) {
        peladasList = data.peladas;
        if (peladasList.length > 0) {
          const savedId = localStorage.getItem('activePeladaId');
          const found733849 = peladasList.find(p => String(p.id) === '733849');
          const foundSaved = peladasList.find(p => String(p.id) === String(savedId));

          // Prioriza a sala 733849 criada pelo usuário
          if (found733849 && (!savedId || savedId === '1' || savedId === '733849')) {
            activePeladaId = 733849;
          } else if (foundSaved) {
            activePeladaId = foundSaved.id;
          } else {
            activePeladaId = found733849 ? 733849 : peladasList[0].id;
          }
          localStorage.setItem('activePeladaId', String(activePeladaId));
        } else {
          activePeladaId = null;
        }
        updatePeladaUI();
        renderPeladasTable();
      }
    } catch (err) {
      console.error('Erro ao carregar peladas:', err);
    }
  }

  // Renderizar a tabela organizada de Peladas / Sessões com ID e Nome
  function renderPeladasTable() {
    if (!peladasTableBody) return;
    peladasTableBody.innerHTML = '';

    if (peladasList.length === 0) {
      peladasTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: #94a3b8; padding: 30px;">
            Nenhuma pelada encontrada. Clique em <strong>"Cadastrar Nova Pelada"</strong> para começar!
          </td>
        </tr>
      `;
      return;
    }

    peladasList.forEach(pelada => {
      const tr = document.createElement('tr');
      const isActive = Number(pelada.id) === Number(activePeladaId);
      const dateStr = pelada.created_at ? new Date(pelada.created_at).toLocaleDateString('pt-BR') : '-';

      tr.innerHTML = `
        <td>
          <span class="pelada-id-badge">#${pelada.id}</span>
        </td>
        <td>
          <strong style="color: #ffffff; font-size: 0.95rem;">${escapeHtml(pelada.name)}</strong>
        </td>
        <td style="color: #cbd5e1; font-size: 0.85rem;">
          👤 ${escapeHtml(pelada.admin_name || 'Administrador')}
        </td>
        <td>
          <span class="player-overall-pill" style="display: inline-flex;">
            👥 ${pelada.player_count || 0} atleta${(pelada.player_count === 1) ? '' : 's'}
          </span>
        </td>
        <td>
          ${isActive 
            ? '<span class="status-tag-active">✓ Ativa</span>' 
            : '<span style="color: #64748b; font-size: 0.8rem; font-weight: 600;">Inativa</span>'}
        </td>
        <td style="color: #94a3b8; font-size: 0.8rem;">
          ${dateStr}
        </td>
        <td>
          <div class="table-actions-cell">
            ${!isActive ? `
              <button type="button" class="btn-action-small btn-action-select btn-select-pelada" data-id="${pelada.id}">
                Abrir Pelada
              </button>
            ` : `
              <button type="button" class="btn-action-small" style="background: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.4); color: #34d399;" disabled>
                Em Uso
              </button>
            `}
            <button type="button" class="btn-action-small btn-edit-pelada" data-id="${pelada.id}" data-name="${escapeHtml(pelada.name)}" title="Renomear Pelada">
              ✏️ Renomear
            </button>
            ${peladasList.length > 1 ? `
              <button type="button" class="btn-action-small btn-action-delete btn-delete-pelada" data-id="${pelada.id}" data-name="${escapeHtml(pelada.name)}" title="Excluir Pelada">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      `;

      peladasTableBody.appendChild(tr);
    });

    // Event listeners dos botões da tabela
    peladasTableBody.querySelectorAll('.btn-select-pelada').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        switchActivePelada(id, true);
      });
    });

    peladasTableBody.querySelectorAll('.btn-edit-pelada').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        if (inputEditPeladaId) inputEditPeladaId.value = id;
        if (inputEditPeladaName) inputEditPeladaName.value = name;
        if (modalEditPelada) modalEditPelada.classList.add('show');
      });
    });

    peladasTableBody.querySelectorAll('.btn-delete-pelada').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        if (confirm(`Tem certeza que deseja excluir a pelada "${name}" (ID #${id}) e todos os seus jogadores?`)) {
          await deletePelada(id);
        }
      });
    });
  }

  // Modais de Pelada: Abrir/Fechar
  function openAddPeladaModal() {
    if (formAddPelada) formAddPelada.reset();
    if (modalAddPelada) modalAddPelada.classList.add('show');
  }

  if (btnOpenModalAddPelada) btnOpenModalAddPelada.addEventListener('click', openAddPeladaModal);
  if (btnQuickNewPelada) btnQuickNewPelada.addEventListener('click', openAddPeladaModal);

  if (btnCancelAddPelada && modalAddPelada) {
    btnCancelAddPelada.addEventListener('click', () => {
      modalAddPelada.classList.remove('show');
    });
  }

  if (btnCancelEditPelada && modalEditPelada) {
    btnCancelEditPelada.addEventListener('click', () => {
      modalEditPelada.classList.remove('show');
    });
  }

  // Submissão do Formulário de Criação de Pelada
  if (formAddPelada) {
    formAddPelada.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = inputPeladaName ? inputPeladaName.value.trim() : '';
      const admin = inputPeladaAdmin ? inputPeladaAdmin.value.trim() : 'Administrador';

      if (!name) return;

      try {
        const res = await fetch('/api/peladas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, adminName: admin })
        });
        const data = await res.json();
        if (data.success && data.pelada) {
          showToast(`Pelada "${name}" cadastrada com sucesso!`);
          if (modalAddPelada) modalAddPelada.classList.remove('show');
          formAddPelada.reset();
          await loadPeladas();
          await switchActivePelada(data.pelada.id, false);
          switchTab('tab-jogadores');
        } else {
          alert(data.error || 'Erro ao cadastrar pelada.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao conectar ao servidor para criar pelada.');
      }
    });
  }

  // Submissão do Formulário de Edição de Pelada
  if (formEditPelada) {
    formEditPelada.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = inputEditPeladaId ? inputEditPeladaId.value : null;
      const name = inputEditPeladaName ? inputEditPeladaName.value.trim() : '';

      if (!id || !name) return;

      try {
        const res = await fetch(`/api/peladas/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Pelada renomeada para "${name}"!`);
          if (modalEditPelada) modalEditPelada.classList.remove('show');
          await loadPeladas();
        } else {
          alert(data.error || 'Erro ao renomear pelada.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao conectar ao servidor para atualizar pelada.');
      }
    });
  }

  // Excluir pelada
  async function deletePelada(id) {
    try {
      const res = await fetch(`/api/peladas/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Pelada excluída com sucesso.');
        await loadPeladas();
        if (Number(activePeladaId) === Number(id)) {
          if (peladasList.length > 0) {
            await switchActivePelada(peladasList[0].id);
          }
        }
      } else {
        alert(data.error || 'Erro ao excluir pelada.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao excluir pelada.');
    }
  }

  // ==========================================
  // GESTÃO DE JOGADORES (VINCULADOS À PELADA ATIVA)
  // ==========================================

  async function loadPlayers(peladaId = activePeladaId) {
    try {
      const url = peladaId ? `/api/players?peladaId=${peladaId}` : '/api/players';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.players)) {
        playersList = data.players;
        renderPlayerSelectionGrid();
        renderPlayersTable();
        updateSelectedCount();
      }
    } catch (err) {
      console.error('Erro ao buscar jogadores:', err);
    }
  }

  // Renderiza Grid de Seleção para o Sorteador
  function renderPlayerSelectionGrid() {
    if (!playerSelectGrid) return;
    playerSelectGrid.innerHTML = '';

    if (totalRegisteredCount) {
      totalRegisteredCount.textContent = playersList.length;
    }

    if (playersList.length === 0) {
      playerSelectGrid.innerHTML = `
        <div style="color: #94a3b8; font-size: 0.95rem; grid-column: 1/-1; padding: 30px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
          Nenhum jogador cadastrado na <strong>${escapeHtml(getActivePeladaName())}</strong>.<br>
          <button type="button" class="btn-pelada btn-pelada-primary" style="margin-top: 14px;" onclick="document.getElementById('btnModalAddPlayer').click();">
            ➕ Cadastrar Primeiro Jogador
          </button>
        </div>
      `;
      return;
    }

    playersList.forEach(player => {
      const card = document.createElement('div');
      card.className = 'player-card-pick';
      card.dataset.id = player.id;

      if (selectedPlayerIds.has(player.id)) {
        card.classList.add('selected');
      }

      // Nome completo do jogador (sem abreviação)
      const fullName = player.name || player.nickname || 'Jogador';
      const hasNickname = player.nickname && player.nickname.trim() !== '' && player.nickname.toLowerCase() !== fullName.toLowerCase();
      const initial = fullName.trim().charAt(0).toUpperCase();
      const hasRatings = player.overall && Number(player.overall) > 0;

      const avatarContent = player.photo_url 
        ? `<img src="${escapeHtml(player.photo_url)}" alt="${escapeHtml(fullName)}" class="player-avatar-img">`
        : initial;

      card.innerHTML = `
        <div class="check-indicator">✓</div>
        <button type="button" class="btn-player-quick-share btn-quick-rate-card" data-id="${player.id}" title="Avaliar habilidades de ${escapeHtml(fullName)}">
          ${userRatingsMap[player.id] ? `★ ${Number(userRatingsMap[player.id].overall).toFixed(1)} (Meu Voto)` : `⭐ Avaliar`}
        </button>
        <div class="player-avatar">${avatarContent}</div>
        <div class="player-info">
          <div class="player-name" title="${escapeHtml(fullName)}">${escapeHtml(fullName)}</div>
          <div class="player-sub">
            <span class="player-pos-badge">${escapeHtml(player.position || 'Geral')}</span>
            ${hasRatings ? `
              <span class="player-stars-badge" title="Média de Habilidades">★ ${Number(player.overall).toFixed(1)}</span>
            ` : `
              <span class="player-stars-badge empty" title="Sem avaliações registradas">Sem estrelas</span>
            `}
            ${hasNickname ? `<span class="player-nickname-tag">"${escapeHtml(player.nickname)}"</span>` : ''}
          </div>
        </div>
      `;

      const quickRateBtn = card.querySelector('.btn-quick-rate-card');
      if (quickRateBtn) {
        quickRateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openDirectRateModal(player);
        });
      }

      card.addEventListener('click', () => {
        togglePlayerSelection(player.id, card);
      });

      playerSelectGrid.appendChild(card);
    });
  }

  function togglePlayerSelection(playerId, cardEl) {
    if (selectedPlayerIds.has(playerId)) {
      selectedPlayerIds.delete(playerId);
      cardEl.classList.remove('selected');
    } else {
      selectedPlayerIds.add(playerId);
      cardEl.classList.add('selected');
    }
    updateSelectedCount();
  }

  function updateSelectedCount() {
    if (selectedCountBadge) {
      selectedCountBadge.textContent = `${selectedPlayerIds.size} Selecionados`;
    }
  }

  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      playersList.forEach(p => selectedPlayerIds.add(p.id));
      document.querySelectorAll('.player-card-pick').forEach(c => c.classList.add('selected'));
      updateSelectedCount();
    });
  }

  if (btnDeselectAll) {
    btnDeselectAll.addEventListener('click', () => {
      selectedPlayerIds.clear();
      document.querySelectorAll('.player-card-pick').forEach(c => c.classList.remove('selected'));
      updateSelectedCount();
    });
  }

  
  // Construtor de HTML das estrelinhas interativas (1 a 5 estrelas)
  function buildInlineStarPickerHtml(playerId, skill, value, hasMyVote) {
    const val = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    const starsHtml = [1, 2, 3, 4, 5].map(n => `
      <span class="star-btn ${n <= val ? 'active' : ''}" data-val="${n}" title="${n} estrela${n > 1 ? 's' : ''}">★</span>
    `).join('');

    return `
      <div class="inline-star-picker ${hasMyVote ? 'user-voted' : ''}" 
           data-player-id="${playerId}" 
           data-skill="${skill}" 
           data-current="${val}" 
           title="Clique na estrela para alterar a nota (1 a 5)">
        <div class="stars-track">${starsHtml}</div>
        <span class="star-numeric">${val > 0 ? val : '-'}</span>
      </div>
    `;
  }

  // Renderiza Tabela de Jogadores e Habilidades com Estrelinhas Interativas
  function renderPlayersTable() {
    if (!playersTableBody) return;
    playersTableBody.innerHTML = '';

    if (playersList.length === 0) {
      playersTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; color: #94a3b8; padding: 30px;">
            Nenhum jogador cadastrado nesta pelada (${escapeHtml(getActivePeladaName())}).
          </td>
        </tr>
      `;
      return;
    }

    playersList.forEach(p => {
      const tr = document.createElement('tr');
      const initial = (p.nickname || p.name).trim().charAt(0).toUpperCase();

      const myVote = userRatingsMap[p.id];
      const curAttack = myVote ? Math.round(Number(myVote.attack) || 0) : (Math.round(Number(p.avg_attack) || 0));
      const curDefense = myVote ? Math.round(Number(myVote.defense) || 0) : (Math.round(Number(p.avg_defense) || 0));
      const curSetPass = myVote ? Math.round(Number(myVote.set_pass) || 0) : (Math.round(Number(p.avg_set_pass) || 0));
      const curMovement = myVote ? Math.round(Number(myVote.movement) || 0) : (Math.round(Number(p.avg_movement) || 0));

      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            ${p.photo_url ? `
              <img src="${escapeHtml(p.photo_url)}" alt="${escapeHtml(p.name)}" class="player-table-avatar">
            ` : `
              <div style="width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #1e293b, #334155); display: flex; align-items: center; justify-content: center; font-weight: 800; color: #38bdf8; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;">
                ${initial}
              </div>
            `}
            <div>
              <strong style="color: #ffffff; font-size: 0.95rem;">${escapeHtml(p.name)}</strong>
              ${p.nickname && p.nickname !== p.name ? `<div style="font-size: 0.75rem; color: #94a3b8;">"${escapeHtml(p.nickname)}"</div>` : ''}
              ${myVote ? `<div style="font-size: 0.7rem; color: #fbbf24; font-weight: 700; margin-top: 1px;">✓ Seu Voto Gravado</div>` : ''}
            </div>
          </div>
        </td>
        <td>
          <span style="background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 6px; font-size: 0.8rem;">
            ${escapeHtml(p.position || 'Geral')}
          </span>
        </td>
        <td>
          <div class="player-overall-pill" id="overall-pill-${p.id}" style="display: inline-flex;">
            ⭐ ${Number(p.overall || 0).toFixed(1)}
          </div>
          ${myVote ? `<div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Você deu: ⭐${Number(myVote.overall).toFixed(1)}</div>` : ''}
        </td>
        <td>${buildInlineStarPickerHtml(p.id, 'attack', curAttack, !!myVote)}</td>
        <td>${buildInlineStarPickerHtml(p.id, 'defense', curDefense, !!myVote)}</td>
        <td>${buildInlineStarPickerHtml(p.id, 'set_pass', curSetPass, !!myVote)}</td>
        <td>${buildInlineStarPickerHtml(p.id, 'movement', curMovement, !!myVote)}</td>
        <td>
          <span style="color: #94a3b8; font-size: 0.85rem;" id="vote-count-${p.id}">
            ${p.vote_count || 0} voto${p.vote_count === 1 ? '' : 's'}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="table-actions-cell">
            <button type="button" class="btn-action-small btn-edit-photo" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-photo="${escapeHtml(p.photo_url || '')}" title="Adicionar / Alterar Foto">
              📷 Foto
            </button>
            <button type="button" class="btn-action-small btn-action-delete btn-delete-player" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="Excluir Jogador">
              🗑️
            </button>
          </div>
        </td>
      `;

      playersTableBody.appendChild(tr);
    });

    attachPhotoEventListeners();
    attachInlineStarEvents();

    playersTableBody.querySelectorAll('.btn-delete-player').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        if (confirm(`Deseja realmente remover o jogador "${name}" desta pelada?`)) {
          await deletePlayer(id);
        }
      });
    });
  }

  // Ativa eventos das estrelinhas inline
  function attachInlineStarEvents() {
    if (!playersTableBody) return;

    playersTableBody.querySelectorAll('.inline-star-picker').forEach(picker => {
      const pId = parseInt(picker.getAttribute('data-player-id'), 10);
      const skill = picker.getAttribute('data-skill');
      const starBtns = picker.querySelectorAll('.star-btn');
      const numericSpan = picker.querySelector('.star-numeric');

      starBtns.forEach(btn => {
        // Efeito de passar o mouse por cima (hover)
        btn.addEventListener('mouseenter', () => {
          const hoverVal = parseInt(btn.getAttribute('data-val'), 10);
          starBtns.forEach(b => {
            const bVal = parseInt(b.getAttribute('data-val'), 10);
            b.classList.toggle('hover-active', bVal <= hoverVal);
          });
          if (numericSpan) numericSpan.textContent = hoverVal;
        });

        // Clique para salvar a nota
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!currentUser) {
            if (modalAuth) modalAuth.classList.add('show');
            showToast('Entre na sua conta para salvar suas avaliações!');
            return;
          }
          const chosenVal = parseInt(btn.getAttribute('data-val'), 10);
          await submitInlineStarRating(pId, skill, chosenVal, picker);
        });
      });

      // Restaurar estado ao retirar o mouse
      picker.addEventListener('mouseleave', () => {
        starBtns.forEach(b => b.classList.remove('hover-active'));
        const currentVal = parseInt(picker.getAttribute('data-current'), 10) || 0;
        starBtns.forEach(b => {
          const bVal = parseInt(b.getAttribute('data-val'), 10);
          b.classList.toggle('active', bVal <= currentVal);
        });
        if (numericSpan) numericSpan.textContent = currentVal > 0 ? currentVal : '-';
      });
    });
  }

  // Enviar Avaliação Direta ao Clicar na Estrelinha
  async function submitInlineStarRating(playerId, skill, chosenVal, picker) {
    if (!currentUser) return;
    const player = playersList.find(p => Number(p.id) === Number(playerId));
    if (!player) return;

    // Recupera ou cria voto do usuário
    let myVote = userRatingsMap[playerId];
    if (!myVote) {
      myVote = {
        attack: Math.round(Number(player.avg_attack)) || 3,
        defense: Math.round(Number(player.avg_defense)) || 3,
        set_pass: Math.round(Number(player.avg_set_pass)) || 3,
        movement: Math.round(Number(player.avg_movement)) || 3
      };
    }

    // Atualiza o atributo clicado
    myVote[skill] = chosenVal;

    // Feedback visual imediato
    picker.setAttribute('data-current', chosenVal);
    const starBtns = picker.querySelectorAll('.star-btn');
    starBtns.forEach(b => {
      const bVal = parseInt(b.getAttribute('data-val'), 10);
      b.classList.toggle('active', bVal <= chosenVal);
    });
    const numSpan = picker.querySelector('.star-numeric');
    if (numSpan) numSpan.textContent = chosenVal;

    picker.classList.add('user-voted', 'saved-pulse');
    setTimeout(() => picker.classList.remove('saved-pulse'), 600);

    // Calcula previsão do Overall
    const calculatedOverall = (
      myVote.attack * 0.35 +
      myVote.defense * 0.25 +
      myVote.set_pass * 0.25 +
      myVote.movement * 0.15
    ).toFixed(1);
    myVote.overall = parseFloat(calculatedOverall);
    userRatingsMap[playerId] = myVote;

    // Atualiza pílula de overall do jogador
    const overallPill = document.getElementById(`overall-pill-${playerId}`);
    if (overallPill) {
      overallPill.innerHTML = `⭐ ${calculatedOverall}`;
    }

    try {
      const res = await fetch(`/api/players/${playerId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          userId: currentUser.id,
          voterName: currentUser.name || currentUser.username,
          attack: myVote.attack,
          defense: myVote.defense,
          setPass: myVote.set_pass,
          movement: myVote.movement
        })
      });

      const data = await res.json();
      if (data.success && data.rating) {
        showToast(`⭐ ${player.name}: ${skillToLabel(skill)} alterado para ${chosenVal}★!`);
        if (data.rating.overall) player.overall = data.rating.overall;
        userRatingsMap[playerId].overall = data.rating.overall;
        // Atualiza contagem de votos
        const voteCountSpan = document.getElementById(`vote-count-${playerId}`);
        if (voteCountSpan && player.vote_count !== undefined) {
          voteCountSpan.textContent = `${player.vote_count} votos`;
        }
      } else {
        alert(data.error || 'Erro ao registrar voto.');
      }
    } catch (err) {
      console.error('Erro ao enviar voto inline:', err);
      showToast('Erro de conexão ao salvar voto.');
    }
  }

  function skillToLabel(s) {
    if (s === 'attack') return 'Ataque';
    if (s === 'defense') return 'Defesa';
    if (s === 'set_pass') return 'Passe';
    if (s === 'movement') return 'Movimentação';
    return s;
  }

    async function deletePlayer(id) {
    try {
      const res = await fetch(`/api/players/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Jogador removido.');
        selectedPlayerIds.delete(parseInt(id, 10));
        await loadPlayers(activePeladaId);
        await loadPeladas();
      } else {
        alert(data.error || 'Erro ao remover jogador.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao remover jogador.');
    }
  }

  // Modais de Cadastro de Jogador
  function openAddPlayerModal() {
    if (formAddPlayer) formAddPlayer.reset();
    if (modalAddPlayer) modalAddPlayer.classList.add('show');
  }

  if (btnModalAddPlayer) btnModalAddPlayer.addEventListener('click', openAddPlayerModal);
  if (btnModalAddPlayer2) btnModalAddPlayer2.addEventListener('click', openAddPlayerModal);

  if (btnCancelAddPlayer && modalAddPlayer) {
    btnCancelAddPlayer.addEventListener('click', () => {
      modalAddPlayer.classList.remove('show');
    });
  }

  if (formAddPlayer) {
    formAddPlayer.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('inputPlayerName').value.trim();
      const nickname = document.getElementById('inputPlayerNickname').value.trim();
      const position = document.getElementById('selectPlayerPosition').value;

      if (!name) return;

      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            nickname,
            position,
            peladaId: activePeladaId
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Jogador "${name}" cadastrado na pelada!`);
          modalAddPlayer.classList.remove('show');
          formAddPlayer.reset();
          await loadPlayers(activePeladaId);
          await loadPeladas();
        } else {
          alert(data.error || 'Erro ao cadastrar jogador.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro de conexão ao salvar jogador.');
      }
    });
  }

  // ==========================================
  // ALGORITMO DE EQUILÍBRIO & SORTEIO DE TIMES
  // ==========================================

  if (btnRunBalance) {
    btnRunBalance.addEventListener('click', async () => {
      if (selectedPlayerIds.size < 2) {
        alert('Selecione pelo menos 2 jogadores presentes para sortear e equilibrar as equipes.');
        return;
      }

      const numTeams = parseInt(selectNumTeams ? selectNumTeams.value : 2, 10);
      const format = selectTeamFormat ? selectTeamFormat.value : 'all';
      let maxPerTeam = null;

      if (format === '6') maxPerTeam = 6;
      else if (format === '4') maxPerTeam = 4;
      else if (format === '2') maxPerTeam = 2;

      try {
        btnRunBalance.disabled = true;
        btnRunBalance.textContent = 'Calculando Equilíbrio...';

        const res = await fetch('/api/pelada/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerIds: Array.from(selectedPlayerIds),
            numTeams,
            maxPerTeam,
            peladaId: activePeladaId
          })
        });

        const data = await res.json();
        if (data.success) {
          lastBalancedResult = data;
          renderBalancedTeams(data);
          showToast('Times sorteados e perfeitamente equilibrados!');
        } else {
          alert(data.error || 'Erro ao equilibrar times.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao calcular equipes equilibradas.');
      } finally {
        btnRunBalance.disabled = false;
        btnRunBalance.innerHTML = '<span>⚡</span><span>Equilibrar Times Agora</span>';
      }
    });
  }

  function renderBalancedTeams(result) {
    if (!balanceResultArea || !teamsResultGrid) return;
    balanceResultArea.classList.add('active');

    if (fairnessScoreDisplay) {
      fairnessScoreDisplay.textContent = `${result.fairnessScore || 95}%`;
    }
    if (fairnessDeltaDisplay) {
      fairnessDeltaDisplay.textContent = `Diferença máxima de apenas ${(result.maxOverallDelta || 0).toFixed(2)} estrelas de Overall entre as equipes. Jogo justo garantido!`;
    }

    teamsResultGrid.innerHTML = '';

    (result.teams || []).forEach((team, idx) => {
      const card = document.createElement('div');
      card.className = `team-card team-${(idx % 4) + 1}`;

      const rosterHtml = team.players.map(p => {
        const fullName = p.name || p.nickname || 'Jogador';
        const hasNick = p.nickname && p.nickname.trim() !== '' && p.nickname.toLowerCase() !== fullName.toLowerCase();
        return `
        <div class="roster-player-item">
          <span class="roster-player-name">
            <span style="color: #94a3b8; font-size: 0.8rem;">#${p.id}</span>
            <strong style="color: #ffffff;">${escapeHtml(fullName)}</strong>
            ${hasNick ? `<span style="font-size: 0.75rem; color: #94a3b8;">("${escapeHtml(p.nickname)}")</span>` : ''}
            <span style="font-size: 0.75rem; color: #64748b;">(${escapeHtml(p.position || 'Geral')})</span>
          </span>
          <span class="player-overall-pill" style="font-size: 0.75rem; padding: 2px 6px;">
            ★ ${Number(p.overall || 0).toFixed(1)}
          </span>
        </div>
      `;
      }).join('');

      card.innerHTML = `
        <div class="team-header">
          <h3 class="team-title">${escapeHtml(team.name)}</h3>
          <span class="team-overall-badge">★ ${team.avgOverall} Média</span>
        </div>
        <div class="team-attributes-summary">
          <div>
            <div class="attr-stat-label">Ataque</div>
            <div class="attr-stat-val">★ ${team.avgAttack}</div>
          </div>
          <div>
            <div class="attr-stat-label">Defesa</div>
            <div class="attr-stat-val">★ ${team.avgDefense}</div>
          </div>
          <div>
            <div class="attr-stat-label">Passe</div>
            <div class="attr-stat-val">★ ${team.avgSetPass}</div>
          </div>
          <div>
            <div class="attr-stat-label">Mov.</div>
            <div class="attr-stat-val">★ ${team.avgMovement}</div>
          </div>
        </div>
        <div class="team-roster">
          ${rosterHtml}
        </div>
      `;

      teamsResultGrid.appendChild(card);
    });

    // Banco de reservas / Espera
    if (benchContainer && benchRoster) {
      if (result.bench && result.bench.length > 0) {
        benchContainer.style.display = 'block';
        benchRoster.innerHTML = result.bench.map(p => `
          <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 6px 12px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600;">${escapeHtml(p.nickname || p.name)}</span>
            <span style="color: var(--pelada-gold); font-size: 0.75rem;">★ ${Number(p.overall || 0).toFixed(1)}</span>
          </div>
        `).join('');
      } else {
        benchContainer.style.display = 'none';
      }
    }

    balanceResultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Copiar Escalação para WhatsApp
  if (btnCopyWhatsappLineup) {
    btnCopyWhatsappLineup.addEventListener('click', () => {
      if (!lastBalancedResult || !lastBalancedResult.teams) return;

      const peladaName = getActivePeladaName();
      let text = `🏐 *ESCALAÇÃO EQUILIBRADA - ${peladaName.toUpperCase()}*\n`;
      text += `⚖️ *Índice de Equilíbrio:* ${lastBalancedResult.fairnessScore}%\n`;
      text += `📅 *Data:* ${new Date().toLocaleDateString('pt-BR')}\n\n`;

      lastBalancedResult.teams.forEach(t => {
        text += `*${t.name.toUpperCase()}* (★ Overall: ${t.avgOverall})\n`;
        t.players.forEach((p, idx) => {
          text += `  ${idx + 1}. ${p.nickname || p.name} (${p.position || 'Geral'}) - ★ ${Number(p.overall || 0).toFixed(1)}\n`;
        });
        text += '\n';
      });

      if (lastBalancedResult.bench && lastBalancedResult.bench.length > 0) {
        text += `*BANCO DE RESERVAS / PRÓXIMA RODADA:*\n`;
        lastBalancedResult.bench.forEach((p, idx) => {
          text += `  ${idx + 1}. ${p.nickname || p.name} (★ ${Number(p.overall || 0).toFixed(1)})\n`;
        });
        text += '\n';
      }

      text += `⭐ Avalie suas notas e confira o placar no link da pelada!`;

      navigator.clipboard.writeText(text).then(() => {
        showToast('Escalação copiada para colar no WhatsApp!');
      }).catch(() => {
        showToast('Escalação gerada!');
      });
    });
  }

  // ==========================================
  // HISTÓRICO DE PARTIDAS
  // ==========================================

  async function loadMatches() {
    try {
      const res = await fetch('/api/matches');
      const data = await res.json();
      if (data.success && Array.isArray(data.matches)) {
        renderMatchesTable(data.matches);
      }
    } catch (err) {
      console.error('Erro ao buscar partidas:', err);
    }
  }

  function renderMatchesTable(matches) {
    if (!matchesHistoryBody) return;
    matchesHistoryBody.innerHTML = '';

    if (matches.length === 0) {
      matchesHistoryBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: #94a3b8; padding: 30px;">
            Nenhuma partida finalizada registrada no banco de dados ainda.<br>
            Ao clicar em <strong>"Encerrar Partida"</strong> no placar, ela será gravada aqui automaticamente!
          </td>
        </tr>
      `;
      return;
    }

    matches.forEach(m => {
      const tr = document.createElement('tr');
      const dateStr = m.created_at ? new Date(m.created_at).toLocaleString('pt-BR') : '-';
      const mins = Math.floor((m.duration_seconds || 0) / 60);
      const secs = (m.duration_seconds || 0) % 60;
      const durationStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      tr.innerHTML = `
        <td><strong>#${m.match_number || 1}</strong></td>
        <td><span style="font-family: monospace; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">${escapeHtml(m.room_id || 'DEFAULT')}</span></td>
        <td style="font-weight: 600;">${escapeHtml(m.team_a || 'LADO A')}</td>
        <td>
          <span style="font-weight: 800; font-size: 1.1rem; color: #38bdf8;">${m.score_a}</span>
          <span style="color: #64748b; margin: 0 4px;">x</span>
          <span style="font-weight: 800; font-size: 1.1rem; color: #f97316;">${m.score_b}</span>
        </td>
        <td style="font-weight: 600;">${escapeHtml(m.team_b || 'LADO B')}</td>
        <td>
          <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; font-weight: 700; padding: 2px 8px; border-radius: 6px;">
            🏆 ${escapeHtml(m.winner || 'Empate')}
          </span>
        </td>
        <td>⏱️ ${durationStr}</td>
        <td style="font-size: 0.8rem; color: #94a3b8;">${dateStr}</td>
      `;

      matchesHistoryBody.appendChild(tr);
    });
  }

  if (btnRefreshMatches) {
    btnRefreshMatches.addEventListener('click', loadMatches);
  }

  // Utilitário de escape de HTML
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  // ==========================================
  // GESTÃO DE FOTOS DOS JOGADORES
  // ==========================================
  const modalEditPlayerPhoto = document.getElementById('modalEditPlayerPhoto');
  const formEditPlayerPhoto = document.getElementById('formEditPlayerPhoto');
  const editPhotoPlayerId = document.getElementById('editPhotoPlayerId');
  const editPhotoPlayerNameDisplay = document.getElementById('editPhotoPlayerNameDisplay');
  const editPhotoPreviewImg = document.getElementById('editPhotoPreviewImg');
  const editPhotoPreviewPlaceholder = document.getElementById('editPhotoPreviewPlaceholder');
  const btnRemovePlayerPhoto = document.getElementById('btnRemovePlayerPhoto');
  const inputPlayerPhotoFile = document.getElementById('inputPlayerPhotoFile');
  const inputPlayerPhotoUrl = document.getElementById('inputPlayerPhotoUrl');
  const btnCancelEditPlayerPhoto = document.getElementById('btnCancelEditPlayerPhoto');

  let currentPhotoData = '';

  // Função auxiliar para comprimir imagem no navegador via Canvas (máx 400x400)
  function compressImageFile(file, maxWidth = 400, maxHeight = 400, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function updatePhotoPreview(url, name = 'J') {
    currentPhotoData = url || '';
    if (currentPhotoData) {
      if (editPhotoPreviewImg) {
        editPhotoPreviewImg.src = currentPhotoData;
        editPhotoPreviewImg.style.display = 'block';
      }
      if (editPhotoPreviewPlaceholder) editPhotoPreviewPlaceholder.style.display = 'none';
      if (btnRemovePlayerPhoto) btnRemovePlayerPhoto.style.display = 'inline-block';
    } else {
      if (editPhotoPreviewImg) {
        editPhotoPreviewImg.src = '';
        editPhotoPreviewImg.style.display = 'none';
      }
      if (editPhotoPreviewPlaceholder) {
        editPhotoPreviewPlaceholder.textContent = name.trim().charAt(0).toUpperCase();
        editPhotoPreviewPlaceholder.style.display = 'block';
      }
      if (btnRemovePlayerPhoto) btnRemovePlayerPhoto.style.display = 'none';
    }
  }

  // Abrir Modal de Foto ao clicar no botão na tabela
  function attachPhotoEventListeners() {
    document.querySelectorAll('.btn-edit-photo').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const photo = btn.getAttribute('data-photo') || '';

        if (editPhotoPlayerId) editPhotoPlayerId.value = id;
        if (editPhotoPlayerNameDisplay) editPhotoPlayerNameDisplay.textContent = name;
        if (inputPlayerPhotoUrl) inputPlayerPhotoUrl.value = photo.startsWith('data:') ? '' : photo;
        if (inputPlayerPhotoFile) inputPlayerPhotoFile.value = '';

        updatePhotoPreview(photo, name);
        if (modalEditPlayerPhoto) modalEditPlayerPhoto.classList.add('show');
      });
    });
  }

  // Preview ao escolher arquivo
  if (inputPlayerPhotoFile) {
    inputPlayerPhotoFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const compressed = await compressImageFile(file);
          const name = editPhotoPlayerNameDisplay ? editPhotoPlayerNameDisplay.textContent : 'J';
          updatePhotoPreview(compressed, name);
        } catch (err) {
          console.error('Erro ao processar imagem:', err);
          alert('Não foi possível processar a imagem selecionada.');
        }
      }
    });
  }

  // Preview ao digitar URL
  if (inputPlayerPhotoUrl) {
    inputPlayerPhotoUrl.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      const name = editPhotoPlayerNameDisplay ? editPhotoPlayerNameDisplay.textContent : 'J';
      if (url) {
        updatePhotoPreview(url, name);
      }
    });
  }

  // Botão Remover Foto
  if (btnRemovePlayerPhoto) {
    btnRemovePlayerPhoto.addEventListener('click', () => {
      if (inputPlayerPhotoFile) inputPlayerPhotoFile.value = '';
      if (inputPlayerPhotoUrl) inputPlayerPhotoUrl.value = '';
      const name = editPhotoPlayerNameDisplay ? editPhotoPlayerNameDisplay.textContent : 'J';
      updatePhotoPreview('', name);
    });
  }

  // Fechar modal de foto
  if (btnCancelEditPlayerPhoto && modalEditPlayerPhoto) {
    btnCancelEditPlayerPhoto.addEventListener('click', () => {
      modalEditPlayerPhoto.classList.remove('show');
    });
  }

  // Salvar foto do jogador
  if (formEditPlayerPhoto) {
    formEditPlayerPhoto.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = editPhotoPlayerId.value;
      if (!id) return;

      const photoUrl = currentPhotoData || (inputPlayerPhotoUrl ? inputPlayerPhotoUrl.value.trim() : '');

      try {
        const btnSave = document.getElementById('btnSavePlayerPhoto');
        if (btnSave) {
          btnSave.disabled = true;
          btnSave.textContent = 'Salvando...';
        }

        const res = await fetch(`/api/players/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoUrl })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Foto do jogador atualizada com sucesso!');
          if (modalEditPlayerPhoto) modalEditPlayerPhoto.classList.remove('show');
          await loadPlayers(activePeladaId);
        } else {
          alert(data.error || 'Erro ao salvar foto.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao salvar foto no servidor.');
      } finally {
        const btnSave = document.getElementById('btnSavePlayerPhoto');
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.textContent = 'Salvar Foto';
        }
      }
    });
  }


  // ==========================================
  // AUTENTICAÇÃO E CONTROLE DE ACESSO (LOGIN / CADASTRO)
  // ==========================================
  const btnOpenAuthModal = document.getElementById('btnOpenAuthModal');
  const userLoggedInfo = document.getElementById('userLoggedInfo');
  const userAvatarMini = document.getElementById('userAvatarMini');
  const userDisplayName = document.getElementById('userDisplayName');
  const userRoleTag = document.getElementById('userRoleTag');
  const btnLogout = document.getElementById('btnLogout');

  const modalAuth = document.getElementById('modalAuth');
  const btnAuthTabLogin = document.getElementById('btnAuthTabLogin');
  const btnAuthTabRegister = document.getElementById('btnAuthTabRegister');
  const formLogin = document.getElementById('formLogin');
  const formRegister = document.getElementById('formRegister');
  const btnCancelLogin = document.getElementById('btnCancelLogin');
  const btnCancelRegister = document.getElementById('btnCancelRegister');

  // Inicializa usuário logado do localStorage
  function initUserAuth() {
    try {
      const saved = localStorage.getItem('pelada_user');
      if (saved) {
        currentUser = JSON.parse(saved);
      }
    } catch (e) {
      currentUser = null;
    }
    updateAuthUI();
    if (currentUser) {
      loadUserRatings();
    }
  }

  function updateAuthUI() {
    if (currentUser) {
      if (btnOpenAuthModal) btnOpenAuthModal.style.display = 'none';
      if (userLoggedInfo) {
        userLoggedInfo.style.display = 'flex';
        if (userAvatarMini) userAvatarMini.textContent = (currentUser.name || currentUser.username || 'U').charAt(0).toUpperCase();
        if (userDisplayName) userDisplayName.textContent = currentUser.name || currentUser.username;
        if (userRoleTag) {
          const isLuixAdmin = currentUser.role === 'admin' || (currentUser.username && currentUser.username.toLowerCase() === 'luix314@gmail.com');
          userRoleTag.textContent = isLuixAdmin ? '👑 Administrador (Sala 733849)' : '👤 Votante';
          userRoleTag.style.color = isLuixAdmin ? '#fbbf24' : '#38bdf8';
        }
        const inlineRateUserBadge = document.getElementById('inlineRateUserBadge');
        if (inlineRateUserBadge) {
          inlineRateUserBadge.innerHTML = `👤 Votando como: <strong style="color: #fbbf24;">${escapeHtml(currentUser.name || currentUser.username)}</strong>`;
        }
      }
    } else {
      if (btnOpenAuthModal) btnOpenAuthModal.style.display = 'inline-flex';
      if (userLoggedInfo) userLoggedInfo.style.display = 'none';
    }
  }

  // Carregar os votos já dados pelo usuário logado
  async function loadUserRatings() {
    if (!currentUser || !currentUser.id) {
      userRatingsMap = {};
      return;
    }
    try {
      const res = await fetch(`/api/players/my-ratings?userId=${currentUser.id}`);
      const data = await res.json();
      if (data.success && data.ratings) {
        userRatingsMap = data.ratings;
        renderPlayersTable();
        renderPlayerSelectionGrid();
      }
    } catch (err) {
      console.warn('Erro ao carregar votos do usuário:', err);
    }
  }

  if (btnOpenAuthModal) {
    btnOpenAuthModal.addEventListener('click', () => {
      if (modalAuth) modalAuth.classList.add('show');
    });
  }

  if (btnCancelLogin && modalAuth) {
    btnCancelLogin.addEventListener('click', () => modalAuth.classList.remove('show'));
  }
  if (btnCancelRegister && modalAuth) {
    btnCancelRegister.addEventListener('click', () => modalAuth.classList.remove('show'));
  }

  if (btnAuthTabLogin && btnAuthTabRegister) {
    btnAuthTabLogin.addEventListener('click', () => {
      btnAuthTabLogin.classList.add('active');
      btnAuthTabRegister.classList.remove('active');
      if (formLogin) formLogin.style.display = 'block';
      if (formRegister) formRegister.style.display = 'none';
    });
    btnAuthTabRegister.addEventListener('click', () => {
      btnAuthTabRegister.classList.add('active');
      btnAuthTabLogin.classList.remove('active');
      if (formRegister) formRegister.style.display = 'block';
      if (formLogin) formLogin.style.display = 'none';
    });
  }

  // Login
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('inputLoginUsername').value.trim();
      const password = document.getElementById('inputLoginPassword').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success && data.user) {
          currentUser = data.user;
          localStorage.setItem('pelada_user', JSON.stringify(currentUser));
          updateAuthUI();
          if (modalAuth) modalAuth.classList.remove('show');
          formLogin.reset();
          showToast(`Bem-vindo, ${currentUser.name}!`);
          await loadUserRatings();
        } else {
          alert(data.error || 'Usuário ou senha incorretos.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro de conexão ao fazer login.');
      }
    });
  }

  // Cadastro
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('inputRegisterName').value.trim();
      const username = document.getElementById('inputRegisterUsername').value.trim();
      const password = document.getElementById('inputRegisterPassword').value;
      const role = document.getElementById('selectRegisterRole').value;

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, username, password, role })
        });
        const data = await res.json();
        if (data.success && data.user) {
          currentUser = data.user;
          localStorage.setItem('pelada_user', JSON.stringify(currentUser));
          updateAuthUI();
          if (modalAuth) modalAuth.classList.remove('show');
          formRegister.reset();
          showToast(`Conta criada com sucesso! Bem-vindo, ${currentUser.name}!`);
          await loadUserRatings();
        } else {
          alert(data.error || 'Erro ao criar conta.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro de conexão ao cadastrar usuário.');
      }
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      currentUser = null;
      userRatingsMap = {};
      localStorage.removeItem('pelada_user');
      updateAuthUI();
      renderPlayersTable();
      renderPlayerSelectionGrid();
      showToast('Você saiu da sua conta.');
    });
  }

  // ==========================================
  // MODAL DE AVALIAÇÃO DIRETA NA PÁGINA (1 VOTO POR USUÁRIO COM EDIÇÃO)
  // ==========================================
  const modalRatePlayerDirect = document.getElementById('modalRatePlayerDirect');
  const formDirectRatePlayer = document.getElementById('formDirectRatePlayer');
  const directRatePlayerId = document.getElementById('directRatePlayerId');
  const directRatePlayerName = document.getElementById('directRatePlayerName');
  const directRatePlayerPos = document.getElementById('directRatePlayerPos');
  const directRatePlayerNick = document.getElementById('directRatePlayerNick');
  const directRatePlayerPhoto = document.getElementById('directRatePlayerPhoto');
  const directRatePlayerInitial = document.getElementById('directRatePlayerInitial');
  const directRateOverallBadge = document.getElementById('directRateOverallBadge');
  const directRateUserVoteStatus = document.getElementById('directRateUserVoteStatus');
  const btnCancelDirectRate = document.getElementById('btnCancelDirectRate');
  const btnSubmitDirectRate = document.getElementById('btnSubmitDirectRate');

  const directRatings = {
    attack: 3,
    defense: 3,
    set_pass: 3,
    movement: 3
  };

  function updateDirectStarUI(attr, val) {
    directRatings[attr] = val;
    const picker = document.querySelector(`.direct-rating-stars[data-attr="${attr}"]`);
    if (picker) {
      picker.querySelectorAll('.direct-star-btn').forEach(btn => {
        const v = parseInt(btn.dataset.val, 10);
        if (v <= val) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    }

    const displayMap = {
      attack: 'scoreDisplayAttackDirect',
      defense: 'scoreDisplayDefenseDirect',
      set_pass: 'scoreDisplaySetPassDirect',
      movement: 'scoreDisplayMovementDirect'
    };
    const el = document.getElementById(displayMap[attr]);
    if (el) el.textContent = `${val}★`;

    // Atualiza Overall estimado do voto
    const avg = Number(((directRatings.attack + directRatings.defense + directRatings.set_pass + directRatings.movement) / 4).toFixed(1));
    if (directRateOverallBadge) {
      directRateOverallBadge.textContent = `★ ${avg} Nota`;
    }
  }

  // Configura cliques nas estrelas do modal direto
  document.querySelectorAll('.direct-rating-stars').forEach(picker => {
    const attr = picker.dataset.attr;
    picker.querySelectorAll('.direct-star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val, 10);
        updateDirectStarUI(attr, val);
      });
    });
  });

  if (btnCancelDirectRate && modalRatePlayerDirect) {
    btnCancelDirectRate.addEventListener('click', () => {
      modalRatePlayerDirect.classList.remove('show');
    });
  }

  function openDirectRateModal(player) {
    if (!currentUser) {
      if (modalAuth) modalAuth.classList.add('show');
      showToast('Entre ou crie uma conta rápida para votar!');
      return;
    }

    const playerId = Number(player.id);
    if (directRatePlayerId) directRatePlayerId.value = playerId;
    if (directRatePlayerName) directRatePlayerName.textContent = player.name;
    if (directRatePlayerPos) directRatePlayerPos.textContent = player.position || 'Geral';
    
    if (directRatePlayerNick) {
      if (player.nickname && player.nickname !== player.name) {
        directRatePlayerNick.textContent = `("${player.nickname}")`;
      } else {
        directRatePlayerNick.textContent = '';
      }
    }

    // Foto ou Inicial
    if (player.photo_url) {
      if (directRatePlayerPhoto) {
        directRatePlayerPhoto.src = player.photo_url;
        directRatePlayerPhoto.style.display = 'block';
      }
      if (directRatePlayerInitial) directRatePlayerInitial.style.display = 'none';
    } else {
      if (directRatePlayerPhoto) directRatePlayerPhoto.style.display = 'none';
      if (directRatePlayerInitial) {
        directRatePlayerInitial.textContent = player.name.charAt(0).toUpperCase();
        directRatePlayerInitial.style.display = 'block';
      }
    }

    // Se o usuário já votou neste jogador, recupera suas notas anteriores
    const myVote = userRatingsMap[playerId];
    if (myVote) {
      updateDirectStarUI('attack', Math.round(myVote.attack || 3));
      updateDirectStarUI('defense', Math.round(myVote.defense || 3));
      updateDirectStarUI('set_pass', Math.round(myVote.set_pass || 3));
      updateDirectStarUI('movement', Math.round(myVote.movement || 3));
      if (directRateUserVoteStatus) {
        directRateUserVoteStatus.innerHTML = `✏️ <strong>Você já avaliou este atleta (Overall anterior: ★${myVote.overall}).</strong> Ajuste as notas abaixo para editar seu voto!`;
      }
      if (btnSubmitDirectRate) btnSubmitDirectRate.textContent = 'Atualizar Meu Voto';
    } else {
      updateDirectStarUI('attack', 3);
      updateDirectStarUI('defense', 3);
      updateDirectStarUI('set_pass', 3);
      updateDirectStarUI('movement', 3);
      if (directRateUserVoteStatus) {
        directRateUserVoteStatus.innerHTML = `💡 Você está votando como <strong>${escapeHtml(currentUser.name)}</strong>. Cada pessoa tem 1 voto por jogador e pode editar a qualquer momento!`;
      }
      if (btnSubmitDirectRate) btnSubmitDirectRate.textContent = 'Salvar Avaliação';
    }

    if (modalRatePlayerDirect) modalRatePlayerDirect.classList.add('show');
  }

  // Enviar Avaliação Direta
  if (formDirectRatePlayer) {
    formDirectRatePlayer.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pId = directRatePlayerId.value;
      if (!pId || !currentUser) return;

      try {
        if (btnSubmitDirectRate) {
          btnSubmitDirectRate.disabled = true;
          btnSubmitDirectRate.textContent = 'Salvando voto...';
        }

        const res = await fetch(`/api/players/${pId}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            voterName: currentUser.name || currentUser.username,
            attack: directRatings.attack,
            defense: directRatings.defense,
            setPass: directRatings.set_pass,
            movement: directRatings.movement
          })
        });

        const data = await res.json();
        if (data.success) {
          showToast(`Avaliação salva com sucesso!`);
          if (modalRatePlayerDirect) modalRatePlayerDirect.classList.remove('show');
          await loadUserRatings();
          await loadPlayers(activePeladaId);
        } else {
          alert(data.error || 'Erro ao registrar avaliação.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao enviar avaliação.');
      } finally {
        if (btnSubmitDirectRate) {
          btnSubmitDirectRate.disabled = false;
        }
      }
    });
  }

  // Inicialização
  initUserAuth();
  loadPeladas();
});
