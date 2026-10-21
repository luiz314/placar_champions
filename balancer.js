/**
 * Algoritmo Inteligente de Distribuição e Equilíbrio de Times de Vôlei
 * Considera: Overall (Média Ponderada), Ataque, Defesa, Passe, Movimentação e Posições
 */

function calculateTeamStats(players) {
  if (!players || players.length === 0) {
    return {
      avgOverall: '0.0',
      avgAttack: '0.0',
      avgDefense: '0.0',
      avgSetPass: '0.0',
      avgPass: '0.0',
      avgMovement: '0.0',
      totalPlayers: 0,
      ratedPlayers: 0
    };
  }

  // "Calcule apenas com o que tem": calcula média considerando estritamente jogadores que possuem nota (> 0)
  const ratedOverall = players.filter(p => Number(p.overall) > 0);
  const avgOverall = ratedOverall.length > 0
    ? (ratedOverall.reduce((acc, p) => acc + Number(p.overall), 0) / ratedOverall.length).toFixed(1)
    : '0.0';

  const ratedAttack = players.filter(p => Number(p.avg_attack) > 0);
  const avgAttack = ratedAttack.length > 0
    ? (ratedAttack.reduce((acc, p) => acc + Number(p.avg_attack), 0) / ratedAttack.length).toFixed(1)
    : '0.0';

  const ratedDefense = players.filter(p => Number(p.avg_defense) > 0);
  const avgDefense = ratedDefense.length > 0
    ? (ratedDefense.reduce((acc, p) => acc + Number(p.avg_defense), 0) / ratedDefense.length).toFixed(1)
    : '0.0';

  const ratedPass = players.filter(p => (Number(p.avg_set_pass) > 0 || Number(p.avg_pass) > 0));
  const avgSetPass = ratedPass.length > 0
    ? (ratedPass.reduce((acc, p) => acc + Number(p.avg_set_pass !== undefined ? p.avg_set_pass : p.avg_pass), 0) / ratedPass.length).toFixed(1)
    : '0.0';

  const ratedMovement = players.filter(p => Number(p.avg_movement) > 0);
  const avgMovement = ratedMovement.length > 0
    ? (ratedMovement.reduce((acc, p) => acc + Number(p.avg_movement), 0) / ratedMovement.length).toFixed(1)
    : '0.0';

  return {
    avgOverall,
    avgAttack,
    avgDefense,
    avgSetPass,
    avgPass: avgSetPass,
    avgMovement,
    totalPlayers: players.length,
    ratedPlayers: ratedOverall.length
  };
}

// Força média do time para comparar equilíbrio: jogador sem nota conta como 3.0 (mesma suposição
// usada na ordenação do sorteio) e o valor não é arredondado, para o otimizador enxergar pequenas melhorias.
// A média exibida ao usuário continua sendo a de calculateTeamStats (apenas jogadores avaliados).
function teamStrength(players, field) {
  if (!players.length) return 0;
  const sum = players.reduce((acc, p) => {
    const value = field === 'pass'
      ? Number(p.avg_set_pass !== undefined ? p.avg_set_pass : p.avg_pass)
      : Number(p[field]);
    return acc + (value > 0 ? value : 3.0);
  }, 0);
  return sum / players.length;
}

function evaluateFairness(teams) {
  if (teams.length < 2) return { cost: 0, overallDelta: 0 };

  const overalls = teams.map(t => teamStrength(t.players, 'overall'));
  const attacks = teams.map(t => teamStrength(t.players, 'avg_attack'));
  const passes = teams.map(t => teamStrength(t.players, 'pass'));

  const maxOverall = Math.max(...overalls);
  const minOverall = Math.min(...overalls);
  const overallDelta = maxOverall - minOverall;

  const maxAttack = Math.max(...attacks);
  const minAttack = Math.min(...attacks);
  const attackDelta = maxAttack - minAttack;

  const maxPass = Math.max(...passes);
  const minPass = Math.min(...passes);
  const passDelta = maxPass - minPass;

  // Penalidade de posições repetidas (ex: 2 levantadores no mesmo time enquanto outro time não tem nenhum)
  let positionPenalty = 0;
  const setterCounts = teams.map(t => t.players.filter(p => (p.position || '').toLowerCase().includes('levantador')).length);
  const maxSetters = Math.max(...setterCounts);
  const minSetters = Math.min(...setterCounts);
  if (maxSetters - minSetters > 1) {
    positionPenalty += 0.5 * (maxSetters - minSetters);
  }

  // Custo total: quanto menor, mais equilibrado
  const cost = (overallDelta * 3.0) + (attackDelta * 1.0) + (passDelta * 1.0) + positionPenalty;
  return { cost, overallDelta };
}

function balanceTeams(playersList, options = {}) {
  const {
    numTeams = 2,
    maxPerTeam = null,
    teamNames = ['Time Azul 🔵', 'Time Laranja 🟠', 'Time Verde 🟢', 'Time Roxo 🟣', 'Time Branco ⚪', 'Time Amarelo 🟡']
  } = options;

  if (!playersList || playersList.length === 0) {
    return { teams: [], bench: [], fairnessScore: 100, delta: 0, maxOverallDelta: 0 };
  }

  const k = Math.max(2, Math.min(6, parseInt(numTeams, 10) || 2));
  
  // Ordena jogadores por overall decrescente (jogadores sem nota assumem mediana 3.0 para sorteio justo)
  const sorted = [...playersList].sort((a, b) => {
    const scoreB = Number(b.overall) > 0 ? Number(b.overall) : 3.0;
    const scoreA = Number(a.overall) > 0 ? Number(a.overall) : 3.0;
    return scoreB - scoreA;
  });

  // Determina quantos jogadores por time
  const total = sorted.length;
  let targetPerTeam = Math.floor(total / k);
  if (maxPerTeam && maxPerTeam > 0) {
    targetPerTeam = Math.min(targetPerTeam, maxPerTeam);
  }

  // Jogadores que entrarão nos times vs Banco de reservas
  const activeCount = targetPerTeam * k;
  const activePlayers = sorted.slice(0, activeCount);
  const bench = sorted.slice(activeCount);

  // Inicializa times
  const teams = Array.from({ length: k }, (_, i) => ({
    id: i + 1,
    name: teamNames[i] || `Time ${i + 1}`,
    players: []
  }));

  // Distribuição inicial Snake Draft (1, 2, ..., k, k, ..., 1)
  let direction = 1;
  let teamIdx = 0;
  for (let i = 0; i < activePlayers.length; i++) {
    teams[teamIdx].players.push(activePlayers[i]);
    if (direction === 1) {
      if (teamIdx === k - 1) {
        direction = -1;
      } else {
        teamIdx++;
      }
    } else {
      if (teamIdx === 0) {
        direction = 1;
      } else {
        teamIdx--;
      }
    }
  }

  // Otimização heurística (Local Swap Optimization)
  // Tenta trocar pares de jogadores entre times para minimizar a disparidade
  let bestScore = evaluateFairness(teams).cost;
  let improved = true;
  let iterations = 0;

  while (improved && iterations < 50) {
    improved = false;
    iterations++;

    for (let t1 = 0; t1 < k; t1++) {
      for (let t2 = t1 + 1; t2 < k; t2++) {
        for (let p1 = 0; p1 < teams[t1].players.length; p1++) {
          for (let p2 = 0; p2 < teams[t2].players.length; p2++) {
            // Simula troca
            const player1 = teams[t1].players[p1];
            const player2 = teams[t2].players[p2];

            teams[t1].players[p1] = player2;
            teams[t2].players[p2] = player1;

            const newCost = evaluateFairness(teams).cost;

            if (newCost < bestScore - 0.001) {
              bestScore = newCost;
              improved = true;
            } else {
              // Reverte troca
              teams[t1].players[p1] = player1;
              teams[t2].players[p2] = player2;
            }
          }
        }
      }
    }
  }

  // Adiciona estatísticas consolidadas para cada time
  const teamsWithStats = teams.map(t => {
    const stats = calculateTeamStats(t.players);
    return {
      id: t.id,
      name: t.name,
      players: t.players,
      avgOverall: stats.avgOverall,
      avgAttack: stats.avgAttack,
      avgDefense: stats.avgDefense,
      avgSetPass: stats.avgSetPass,
      avgPass: stats.avgPass,
      avgMovement: stats.avgMovement,
      stats: stats
    };
  });

  const { overallDelta } = evaluateFairness(teamsWithStats);
  // Escala de equilíbrio: se delta for 0 => 100%, se delta for 1.0 => ~70%
  const fairnessScore = Math.max(60, Math.min(100, Math.round(100 - (overallDelta * 25))));

  return {
    teams: teamsWithStats,
    bench: bench,
    delta: Number(overallDelta.toFixed(2)),
    maxOverallDelta: Number(overallDelta.toFixed(2)),
    fairnessScore: fairnessScore
  };
}

module.exports = {
  calculateTeamStats,
  balanceTeams
};
