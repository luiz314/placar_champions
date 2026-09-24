/**
 * Algoritmo Inteligente de Distribuição e Equilíbrio de Times de Vôlei
 * Considera: Overall (Média Ponderada), Ataque, Defesa, Passe, Movimentação e Posições
 */

function calculateTeamStats(players) {
  if (!players || players.length === 0) {
    return {
      avgOverall: 0,
      avgAttack: 0,
      avgDefense: 0,
      avgPass: 0,
      avgMovement: 0,
      totalPlayers: 0
    };
  }

  const n = players.length;
  const sumOverall = players.reduce((acc, p) => acc + (Number(p.overall) || 3.0), 0);
  const sumAttack = players.reduce((acc, p) => acc + (Number(p.avg_attack) || 3.0), 0);
  const sumDefense = players.reduce((acc, p) => acc + (Number(p.avg_defense) || 3.0), 0);
  const sumPass = players.reduce((acc, p) => acc + (Number(p.avg_set_pass) || 3.0), 0);
  const sumMovement = players.reduce((acc, p) => acc + (Number(p.avg_movement) || 3.0), 0);

  return {
    avgOverall: Number((sumOverall / n).toFixed(2)),
    avgAttack: Number((sumAttack / n).toFixed(2)),
    avgDefense: Number((sumDefense / n).toFixed(2)),
    avgPass: Number((sumPass / n).toFixed(2)),
    avgMovement: Number((sumMovement / n).toFixed(2)),
    totalPlayers: n
  };
}

function evaluateFairness(teams) {
  if (teams.length < 2) return { cost: 0, overallDelta: 0 };

  const overalls = teams.map(t => calculateTeamStats(t.players).avgOverall);
  const attacks = teams.map(t => calculateTeamStats(t.players).avgAttack);
  const passes = teams.map(t => calculateTeamStats(t.players).avgPass);

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
    return { teams: [], bench: [], fairnessScore: 100, delta: 0 };
  }

  const k = Math.max(2, Math.min(6, parseInt(numTeams, 10) || 2));
  
  // Ordena jogadores por overall decrescente
  const sorted = [...playersList].sort((a, b) => (Number(b.overall) || 3.0) - (Number(a.overall) || 3.0));

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
    fairnessScore: fairnessScore
  };
}

module.exports = {
  calculateTeamStats,
  balanceTeams
};
