document.addEventListener('DOMContentLoaded', () => {
  // Estado das notas (1 a 5)
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

  // Recupera parâmetro ?p=ID da URL
  const urlParams = new URLSearchParams(window.location.search);
  const targetPlayerId = urlParams.get('p') || urlParams.get('player');

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

    // Atualiza label
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

  // Carregar lista de jogadores
  async function loadPlayers() {
    try {
      const res = await fetch('/api/players');
      const data = await res.json();
      if (data.success && Array.isArray(data.players)) {
        selectPlayer.innerHTML = '<option value="" disabled>Selecione um jogador...</option>';
        data.players.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.nickname || p.name} (${p.position || 'Geral'}) - Atual: ★${Number(p.overall || 3.0).toFixed(1)}`;
          if (targetPlayerId && String(p.id) === String(targetPlayerId)) {
            opt.selected = true;
          }
          selectPlayer.appendChild(opt);
        });

        if (!targetPlayerId && data.players.length > 0) {
          selectPlayer.selectedIndex = 1; // Seleciona primeiro da lista se não veio parâmetro
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

      const playerId = selectPlayer.value;
      if (!playerId) {
        alert('Por favor, selecione um jogador.');
        return;
      }

      const voterName = inputVoterName.value.trim() || 'Anônimo';
      btnSubmitVote.disabled = true;
      btnSubmitVote.innerHTML = `<span>⏳</span><span>Gravando no Banco...</span>`;

      try {
        const res = await fetch(`/api/players/${playerId}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
            successPlayerText.textContent = `Sua avaliação de ${computeWeightedOverall()}★ para ${selectedText.split('(')[0].trim()} foi salva no PostgreSQL com sucesso!`;
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
  loadPlayers();
});
