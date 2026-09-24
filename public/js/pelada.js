document.addEventListener('DOMContentLoaded', () => {
  // Estado local
  let playersList = [];
  let selectedPlayerIds = new Set();
  let lastBalancedResult = null;

  // Elementos DOM
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
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

  // Jogadores Tab
  const playersTableBody = document.getElementById('playersTableBody');
  const btnModalAddPlayer = document.getElementById('btnModalAddPlayer');
  const btnModalAddPlayer2 = document.getElementById('btnModalAddPlayer2');
  const modalAddPlayer = document.getElementById('modalAddPlayer');
  const btnCancelAddPlayer = document.getElementById('btnCancelAddPlayer');
  const formAddPlayer = document.getElementById('formAddPlayer');

  // Histórico Tab
  const matchesHistoryBody = document.getElementById('matchesHistoryBody');
  const btnRefreshMatches = document.getElementById('btnRefreshMatches');

  // Banner link de votação
  const publicVoteUrlInput = document.getElementById('publicVoteUrlInput');
  const btnCopyVoteLink = document.getElementById('btnCopyVoteLink');
  const peladaToast = document.getElementById('peladaToast');

  // Preenche URL pública de votação
  const origin = window.location.origin;
  const publicVoteUrl = `${origin}/avaliar`;
  if (publicVoteUrlInput) {
    publicVoteUrlInput.value = publicVoteUrl;
  }

  // Notificação Toast
  function showToast(message) {
    if (!peladaToast) return;
    peladaToast.textContent = message;
    peladaToast.classList.add('show');
    setTimeout(() => {
      peladaToast.classList.remove('show');
    }, 2800);
  }

  // Alternar Abas
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');

      if (targetId === 'tab-jogadores') {
        loadPlayers();
      } else if (targetId === 'tab-historico') {
        loadMatches();
      }
    });
  });

  // Copiar Link Geral de Votação
  if (btnCopyVoteLink) {
    btnCopyVoteLink.addEventListener('click', () => {
      navigator.clipboard.writeText(publicVoteUrl).then(() => {
        showToast('Link de votação copiado! Cole no WhatsApp da galera.');
      }).catch(() => {
        publicVoteUrlInput.select();
        document.execCommand('copy');
        showToast('Link copiado!');
      });
    });
  }

  // Carregar Jogadores da API
  async function loadPlayers() {
    try {
      const res = await fetch('/api/players');
      const data = await res.json();
      if (data.success && Array.isArray(data.players)) {
        playersList = data.players;
        renderPlayerSelectionGrid();
        renderPlayersTable();
        if (totalRegisteredCount) totalRegisteredCount.textContent = playersList.length;
      }
    } catch (err) {
      console.error('Erro ao carregar jogadores:', err);
    }
  }

  // Renderizar Grid de Seleção (Aba Sorteador)
  function renderPlayerSelectionGrid() {
    if (!playerSelectGrid) return;
    playerSelectGrid.innerHTML = '';

    if (playersList.length === 0) {
      playerSelectGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 30px;">
          Nenhum jogador cadastrado no banco de dados ainda.<br>
          Clique em <strong>➕ Cadastrar Jogador</strong> para começar!
        </div>
      `;
      return;
    }

    playersList.forEach(player => {
      const isSelected = selectedPlayerIds.has(Number(player.id));
      const card = document.createElement('div');
      card.className = `player-card-pick ${isSelected ? 'selected' : ''}`;
      card.dataset.id = player.id;

      const initial = (player.nickname || player.name || 'J').charAt(0).toUpperCase();

      card.innerHTML = `
        <div class="check-indicator">✓</div>
        <div class="player-avatar">${initial}</div>
        <div class="player-info">
          <div class="player-name">${escapeHtml(player.nickname || player.name)}</div>
          <div class="player-sub">
            <span class="player-pos-badge">${escapeHtml(player.position || 'Geral')}</span>
          </div>
        </div>
        <div class="player-overall-pill" title="Média Ponderada das Avaliações">
          <span>★</span>
          <span>${Number(player.overall || 3.0).toFixed(1)}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        const id = Number(player.id);
        if (selectedPlayerIds.has(id)) {
          selectedPlayerIds.delete(id);
          card.classList.remove('selected');
        } else {
          selectedPlayerIds.add(id);
          card.classList.add('selected');
        }
        updateSelectionCount();
      });

      playerSelectGrid.appendChild(card);
    });

    updateSelectionCount();
  }

  function updateSelectionCount() {
    if (selectedCountBadge) {
      selectedCountBadge.textContent = `${selectedPlayerIds.size} Selecionados`;
    }
  }

  // Marcar / Desmarcar Todos
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      playersList.forEach(p => selectedPlayerIds.add(Number(p.id)));
      document.querySelectorAll('.player-card-pick').forEach(el => el.classList.add('selected'));
      updateSelectionCount();
    });
  }

  if (btnDeselectAll) {
    btnDeselectAll.addEventListener('click', () => {
      selectedPlayerIds.clear();
      document.querySelectorAll('.player-card-pick').forEach(el => el.classList.remove('selected'));
      updateSelectionCount();
    });
  }

  // Executar Equilíbrio de Times
  if (btnRunBalance) {
    btnRunBalance.addEventListener('click', async () => {
      if (selectedPlayerIds.size < 2) {
        alert('Selecione pelo menos 2 jogadores presentes para realizar a divisão dos times.');
        return;
      }

      const numTeams = parseInt(selectNumTeams.value, 10) || 2;
      const formatVal = selectTeamFormat.value;
      const maxPerTeam = formatVal === 'all' ? null : parseInt(formatVal, 10);

      btnRunBalance.disabled = true;
      btnRunBalance.innerHTML = `<span>⏳</span><span>Calculando...</span>`;

      try {
        const res = await fetch('/api/pelada/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerIds: Array.from(selectedPlayerIds),
            numTeams: numTeams,
            maxPerTeam: maxPerTeam
          })
        });

        const data = await res.json();
        if (data.success) {
          lastBalancedResult = data;
          renderBalancedTeams(data);
          balanceResultArea.classList.add('active');
          balanceResultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          alert('Erro ao balancear times: ' + (data.error || 'Erro desconhecido'));
        }
      } catch (err) {
        alert('Falha na comunicação com o servidor: ' + err.message);
      } finally {
        btnRunBalance.disabled = false;
        btnRunBalance.innerHTML = `<span>⚡</span><span>Equilibrar Times Agora</span>`;
      }
    });
  }

  // Renderizar Resultados dos Times
  function renderBalancedTeams(result) {
    if (!teamsResultGrid) return;
    teamsResultGrid.innerHTML = '';

    if (fairnessScoreDisplay) {
      fairnessScoreDisplay.textContent = `${result.fairnessScore || 95}%`;
    }
    if (fairnessDeltaDisplay) {
      fairnessDeltaDisplay.textContent = `Diferença de apenas ${result.delta}★ entre as equipes. Distribuição altamente competitiva!`;
    }

    result.teams.forEach((team, idx) => {
      const card = document.createElement('div');
      card.className = `team-card team-${(idx % 4) + 1}`;

      const playersHtml = team.players.map(p => `
        <div class="roster-player-item">
          <div class="roster-player-name">
            <span>👤</span>
            <span>${escapeHtml(p.nickname || p.name)}</span>
            <span class="player-pos-badge" style="font-size: 0.7rem;">${escapeHtml(p.position || 'Geral')}</span>
          </div>
          <div class="star-rating-display" style="font-size: 0.8rem;">
            ★ ${Number(p.overall || 3.0).toFixed(1)}
          </div>
        </div>
      `).join('');

      card.innerHTML = `
        <div class="team-header">
          <h3 class="team-title">${escapeHtml(team.name)}</h3>
          <div class="team-overall-badge">
            ★ ${team.stats.avgOverall}
          </div>
        </div>

        <div class="team-attributes-summary">
          <div>
            <div class="attr-stat-label">Ataque</div>
            <div class="attr-stat-val">💥 ${team.stats.avgAttack}</div>
          </div>
          <div>
            <div class="attr-stat-label">Defesa</div>
            <div class="attr-stat-val">🛡️ ${team.stats.avgDefense}</div>
          </div>
          <div>
            <div class="attr-stat-label">Passe</div>
            <div class="attr-stat-val">🎯 ${team.stats.avgPass}</div>
          </div>
          <div>
            <div class="attr-stat-label">Movim.</div>
            <div class="attr-stat-val">⚡ ${team.stats.avgMovement}</div>
          </div>
        </div>

        <div class="team-roster">
          ${playersHtml}
        </div>
      `;

      teamsResultGrid.appendChild(card);
    });

    // Banco de reservas se houver
    if (result.bench && result.bench.length > 0) {
      benchContainer.style.display = 'block';
      benchRoster.innerHTML = result.bench.map(p => `
        <div class="roster-player-item" style="display: inline-flex; min-width: 140px;">
          <span>👤 ${escapeHtml(p.nickname || p.name)}</span>
          <span style="color: var(--pelada-gold); font-size: 0.75rem; margin-left: 6px;">★${Number(p.overall || 3.0).toFixed(1)}</span>
        </div>
      `).join('');
    } else {
      benchContainer.style.display = 'none';
    }
  }

  // Copiar Escalação Formatada para o WhatsApp
  if (btnCopyWhatsappLineup) {
    btnCopyWhatsappLineup.addEventListener('click', () => {
      if (!lastBalancedResult || !lastBalancedResult.teams) return;

      let text = `🏐 *ESCALAÇÃO DA PELADA DE VÔLEI* 🏐\n`;
      text += `⚖️ *Equilíbrio das equipes: ${lastBalancedResult.fairnessScore}%*\n\n`;

      lastBalancedResult.teams.forEach(t => {
        text += `*${t.name}* (Média: ★ ${t.stats.avgOverall})\n`;
        t.players.forEach(p => {
          text += `  • ${p.nickname || p.name} (${p.position || 'Geral'}) - ★${p.overall}\n`;
        });
        text += `  _💥 Atq: ${t.stats.avgAttack} | 🛡️ Def: ${t.stats.avgDefense} | 🎯 Passe: ${t.stats.avgPass}_\n\n`;
      });

      if (lastBalancedResult.bench && lastBalancedResult.bench.length > 0) {
        text += `🛋️ *Próximos / Banco de Espera:*\n`;
        lastBalancedResult.bench.forEach(p => {
          text += `  • ${p.nickname || p.name}\n`;
        });
        text += `\n`;
      }

      text += `Acompanhe o placar ao vivo: ${window.location.origin}\n`;
      text += `Vote nos jogadores: ${publicVoteUrl}`;

      navigator.clipboard.writeText(text).then(() => {
        showToast('Escalação copiada com sucesso para o WhatsApp!');
      }).catch(() => {
        prompt('Copie a mensagem abaixo:', text);
      });
    });
  }

  // Renderizar Tabela de Jogadores (Aba Jogadores)
  function renderPlayersTable() {
    if (!playersTableBody) return;
    playersTableBody.innerHTML = '';

    if (playersList.length === 0) {
      playersTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; color: #94a3b8; padding: 30px;">
            Nenhum jogador cadastrado no momento.
          </td>
        </tr>
      `;
      return;
    }

    playersList.forEach(p => {
      const tr = document.createElement('tr');
      const shareUrl = `${origin}/avaliar?p=${p.id}`;

      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; color: #f8fafc;">${escapeHtml(p.nickname || p.name)}</div>
          <div style="font-size: 0.75rem; color: #94a3b8;">${escapeHtml(p.name)}</div>
        </td>
        <td>
          <span class="player-pos-badge">${escapeHtml(p.position || 'Geral')}</span>
        </td>
        <td>
          <div class="star-rating-display" style="font-size: 1.05rem;">
            <span>★</span>
            <span>${Number(p.overall || 3.0).toFixed(1)}</span>
          </div>
        </td>
        <td>💥 ${Number(p.avg_attack || 3.0).toFixed(1)}</td>
        <td>🛡️ ${Number(p.avg_defense || 3.0).toFixed(1)}</td>
        <td>🎯 ${Number(p.avg_set_pass || 3.0).toFixed(1)}</td>
        <td>⚡ ${Number(p.avg_movement || 3.0).toFixed(1)}</td>
        <td>
          <span style="font-size: 0.8rem; background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 999px;">
            ${p.vote_count || 0} voto(s)
          </span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <a href="/avaliar?p=${p.id}" target="_blank" class="btn-pelada" style="padding: 4px 10px; font-size: 0.75rem;" title="Avaliar este jogador">
            ⭐ Avaliar
          </a>
          <button type="button" class="btn-pelada btn-copy-player-link" data-url="${shareUrl}" style="padding: 4px 10px; font-size: 0.75rem;" title="Copiar link de avaliação exclusivo">
            🔗 Link
          </button>
          <button type="button" class="btn-pelada btn-delete-player" data-id="${p.id}" style="padding: 4px 8px; font-size: 0.75rem; color: #f87171;" title="Excluir Jogador">
            🗑️
          </button>
        </td>
      `;

      playersTableBody.appendChild(tr);
    });

    // Eventos de cópia e exclusão
    document.querySelectorAll('.btn-copy-player-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.currentTarget.getAttribute('data-url');
        navigator.clipboard.writeText(url).then(() => {
          showToast('Link do jogador copiado!');
        });
      });
    });

    document.querySelectorAll('.btn-delete-player').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (!confirm('Tem certeza que deseja remover este jogador e suas avaliações?')) return;

        try {
          const res = await fetch(`/api/players/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            selectedPlayerIds.delete(Number(id));
            loadPlayers();
            showToast('Jogador removido.');
          }
        } catch (err) {
          alert('Erro ao excluir: ' + err.message);
        }
      });
    });
  }

  // Modal de Adicionar Jogador
  const openModal = () => { if (modalAddPlayer) modalAddPlayer.classList.add('active'); };
  const closeModal = () => { if (modalAddPlayer) modalAddPlayer.classList.remove('active'); };

  if (btnModalAddPlayer) btnModalAddPlayer.addEventListener('click', openModal);
  if (btnModalAddPlayer2) btnModalAddPlayer2.addEventListener('click', openModal);
  if (btnCancelAddPlayer) btnCancelAddPlayer.addEventListener('click', closeModal);

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
          body: JSON.stringify({ name, nickname, position })
        });
        const data = await res.json();
        if (data.success) {
          closeModal();
          formAddPlayer.reset();
          showToast(`Jogador "${nickname || name}" cadastrado com sucesso!`);
          loadPlayers();
        } else {
          alert('Erro ao salvar: ' + (data.error || 'Erro no banco'));
        }
      } catch (err) {
        alert('Falha na requisição: ' + err.message);
      }
    });
  }

  // Carregar Histórico de Partidas
  async function loadMatches() {
    if (!matchesHistoryBody) return;
    try {
      matchesHistoryBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">Carregando partidas do PostgreSQL...</td></tr>`;
      const res = await fetch('/api/matches');
      const data = await res.json();
      if (data.success && Array.isArray(data.matches)) {
        renderMatchesTable(data.matches);
      }
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
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

  // Utilitário de escape
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Inicialização
  loadPlayers();
});
