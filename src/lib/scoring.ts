import type { PlayerStats, PlayerResult, Multiplier } from './types';

export function calcBattingPoints(
  runs: number,
  balls: number,
  dismissed: boolean,
  battingPosition: number
): number {
  // Lower-order rule: position 7+ gets no batting rules unless they score 10+
  if (battingPosition >= 7 && runs < 10) return 0;

  // Duck: dismissed without scoring
  if (dismissed && runs === 0) return -30;

  // Score <= 10: no run points, only penalty
  if (runs <= 10) return -20;

  // Base points: 1 per run
  let pts = runs;

  // Milestone bonuses (all cumulative)
  if (runs >= 25) pts += 5;
  if (runs >= 40) pts += 15;
  if (runs >= 70) pts += 25;
  if (runs >= 90) pts += 35;

  // Strike rate (only one tier applies — highest met)
  if (balls > 0) {
    const sr = (runs / balls) * 100;
    if (sr >= 300 && balls >= 25)      pts += 50;
    else if (sr >= 250 && balls >= 20) pts += 25;
    else if (sr >= 200 && balls >= 10) pts += 10;
    else if (sr <= 100 && balls >= 10) pts -= 20;
  }

  return pts;
}

export function calcBowlingPoints(
  wickets: number,
  overs: number,
  runsConceded: number,
  maidens: number
): number {
  if (overs === 0) return 0;

  let pts = wickets * 25;
  pts += maidens * 40;

  // Economy only counts after 3+ overs
  if (overs >= 3) {
    const eco = runsConceded / overs;
    if (eco <= 4)       pts += 80;
    else if (eco <= 6)  pts += 60;
    else if (eco <= 8)  pts += 30;
    else if (eco >= 14) pts -= 40;
    else if (eco >= 12) pts -= 30;
    else if (eco >= 10) pts -= 20;
  }

  // Wicketless penalty after 2+ overs
  if (wickets === 0 && overs >= 2) pts -= 20;

  // Wicket milestone bonuses
  if (wickets >= 5)      pts += 35;
  else if (wickets >= 3) pts += 20;

  return pts;
}

export function calcFieldingPoints(catches: number, stumpings: number, runOuts: number): number {
  return (catches + stumpings + runOuts) * 10;
}

export function applyMultiplier(rawTotal: number, multiplier: Multiplier): number {
  if (rawTotal >= 0) {
    const gainMult = { yellow: 1, green: 2, purple: 3, allin: 5 }[multiplier];
    return rawTotal * gainMult;
  } else {
    const lossMult = { yellow: 1, green: 1, purple: 1.5, allin: 2.5 }[multiplier];
    return rawTotal * lossMult;
  }
}

export function calcPlayerResult(
  stats: PlayerStats,
  multiplier: Multiplier,
  winnersChoiceCorrect: boolean
): PlayerResult {
  const battingPoints = stats.didBat
    ? calcBattingPoints(stats.runs, stats.balls, stats.dismissed, stats.battingPosition)
    : 0;

  const bowlingPoints = stats.didBowl
    ? calcBowlingPoints(stats.wickets, stats.overs, stats.runsConceded, stats.maidens)
    : 0;

  const fieldingPoints = calcFieldingPoints(stats.catches, stats.stumpings, stats.runOuts);
  const momPoints = stats.isMOM ? 10 : 0;
  const winnersChoicePoints = winnersChoiceCorrect ? 50 : 0;

  const rawTotal = battingPoints + bowlingPoints + fieldingPoints + momPoints + winnersChoicePoints;
  const finalTotal = applyMultiplier(rawTotal, multiplier);

  return {
    ...stats,
    battingPoints,
    bowlingPoints,
    fieldingPoints,
    momPoints,
    rawTotal,
    multiplier,
    finalTotal,
  };
}

export function multiplierLabel(m: Multiplier): string {
  return { yellow: 'Yellow (1×)', green: 'Green (2×)', purple: 'Purple (3×)', allin: 'All-in (5×)' }[m];
}

export function multiplierColor(m: Multiplier): string {
  return {
    yellow: 'bg-yellow-400 text-yellow-900',
    green: 'bg-green-500 text-white',
    purple: 'bg-purple-600 text-white',
    allin: 'bg-red-600 text-white',
  }[m];
}

export function multiplierBadge(m: Multiplier): string {
  return { yellow: '1×', green: '2×', purple: '3×', allin: '5×' }[m];
}
