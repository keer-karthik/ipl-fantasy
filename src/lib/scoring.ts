import type { Multiplier } from './types';

export function calcBattingPoints(
  runs: number,
  balls: number,
  dismissed: boolean,
  battingPosition: number
): number {
  const lowerOrder = battingPosition >= 7;

  // Lower-order batters (pos 7+): runs only + SR bonuses, zero deductions
  if (lowerOrder) {
    let pts = runs;
    if (balls > 0) {
      const sr = (runs / balls) * 100;
      if      (sr >= 300 && balls >= 25) pts += 50;
      else if (sr >= 250 && balls >= 20) pts += 35;
      else if (sr >= 200 && balls >= 10) pts += 20;
      else if (sr >= 175 && balls >= 10) pts += 5;
    }
    return pts;
  }

  // Positions 1–6

  // Duck: dismissed without scoring
  if (dismissed && runs === 0) return -30;

  // Score ≤ 10: flat penalty, no run points
  if (runs <= 10) return -20;

  // Base points: 1 per run
  let pts = runs;

  // Milestone bonuses (cumulative)
  if (runs >= 25) pts += 5;
  if (runs >= 40) pts += 15;
  if (runs >= 70) pts += 25;
  if (runs >= 90) pts += 35;

  // Strike rate (only one tier applies — highest met)
  if (balls > 0) {
    const sr = (runs / balls) * 100;
    if      (sr >= 300 && balls >= 25) pts += 50;
    else if (sr >= 250 && balls >= 20) pts += 35;
    else if (sr >= 200 && balls >= 10) pts += 20;
    else if (sr >= 175 && balls >= 10) pts += 5;
    else if (sr <= 75  && balls >= 10) pts -= 30;
    else if (sr <= 100 && balls >= 10) pts -= 20;
    else if (sr <= 125 && balls >= 10) pts -= 10;
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

  // Economy (only after 3+ overs)
  if (overs >= 3) {
    const eco = runsConceded / overs;
    if      (eco <= 4)  pts += 80;
    else if (eco <= 6)  pts += 60;
    else if (eco <= 8)  pts += 40;
    else if (eco <= 9)  pts += 20;
    else if (eco >= 14) pts -= 60;
    else if (eco >= 12) pts -= 40;
    else if (eco >= 10) pts -= 20;

    // Additional wicketless penalty when economy is also bad (tiered, not cumulative)
    if (wickets === 0) {
      if      (eco > 12) pts -= 20;
      else if (eco > 10) pts -= 10;
    }
  }

  // Wicket milestone bonuses
  if      (wickets >= 5) pts += 35;
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


export function multiplierLabel(m: Multiplier): string {
  return { yellow: 'Yellow (1×)', green: 'Green (2×)', purple: 'Purple (3×)', allin: 'All-in (5×)' }[m];
}

export function multiplierColor(m: Multiplier): string {
  return {
    yellow: 'bg-gray-200 text-gray-500',
    green: 'bg-green-600 text-white',
    purple: 'bg-violet-600 text-white',
    allin: 'bg-orange-500 text-white',
  }[m];
}

export function multiplierBadge(m: Multiplier): string {
  return { yellow: '1×', green: '2×', purple: '3×', allin: '5×' }[m];
}
