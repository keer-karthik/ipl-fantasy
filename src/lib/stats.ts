import type { MatchEntry, SeasonState } from './types';
import { fixtures } from './data';
import { applyMultiplier } from './scoring';

export interface SideStats {
  wins: number;
  losses: number;
  totalPoints: number;
  form: ('W' | 'L')[];
  currentStreak: number;
  longestStreak: number;
  purpleHits: number;
  allInUsed: number;
  orangeCapRuns: { player: string; runs: number } | null;
  purpleCapWickets: { player: string; wickets: number } | null;
}

export interface PlayerSeasonStat {
  name: string;
  team: string;
  matches: number;
  totalPoints: number;
  avgPoints: number;
  totalRuns: number;
  totalWickets: number;
  timesAs3x: number;
  timesAs2x: number;
  total3xPoints: number;
  total2xPoints: number;
  momCount: number;
}

function completedMatches(state: SeasonState): MatchEntry[] {
  return Object.values(state.matches).filter(m => m.isComplete);
}

// Single source of truth: recompute a side's total from stored PlayerResult[].
// Never reads the pre-stored `total` field — that can be stale.
export function computeSideTotal(match: MatchEntry, side: 'lads' | 'gils'): number {
  const sideData = match[side];
  const hasWinnerBonus = sideData.predictedWinner !== null && sideData.predictedWinner === match.actualWinner;
  const momBonus = sideData.results.filter(r => r.isMOM).length * 10;
  return sideData.results.reduce((s, r) => {
    const raw = r.battingPoints + r.bowlingPoints + r.fieldingPoints;
    return s + Math.round(applyMultiplier(raw, r.multiplier));
  }, 0) + (hasWinnerBonus ? 50 : 0) + momBonus;
}

// Player's points contribution for a single result entry.
export function computePlayerTotal(r: { battingPoints: number; bowlingPoints: number; fieldingPoints: number; multiplier: import('./types').Multiplier; isMOM: boolean }): number {
  const raw = r.battingPoints + r.bowlingPoints + r.fieldingPoints;
  return Math.round(applyMultiplier(raw, r.multiplier)) + (r.isMOM ? 10 : 0);
}

export function computeSideStats(state: SeasonState, side: 'lads' | 'gils'): SideStats {
  const done = completedMatches(state).sort((a, b) => a.matchId - b.matchId);

  let wins = 0, losses = 0, totalPoints = 0;
  const form: ('W' | 'L')[] = [];
  let currentStreak = 0, longestStreak = 0, streak = 0;
  let purpleHits = 0;

  const runTotals: Record<string, number> = {};
  const wicketTotals: Record<string, number> = {};

  for (const match of done) {
    const sideData = match[side];
    totalPoints += computeSideTotal(match, side);

    const won = match.winner === side;
    if (won) { wins++; form.push('W'); streak++; }
    else      { losses++; form.push('L'); streak = 0; }
    if (streak > longestStreak) longestStreak = streak;

    // Purple hits: 3x player had the highest base points among all 5 picks (before multipliers)
    const purplePick = sideData.picks.find(p => p.multiplier === 'purple');
    const purpleResult = sideData.results.find(r => r.playerName === purplePick?.playerName);
    if (purpleResult && sideData.results.length > 0) {
      const maxRaw = Math.max(...sideData.results.map(r => r.rawTotal));
      if (purpleResult.rawTotal === maxRaw && maxRaw > 0) purpleHits++;
    }

    // Runs / wickets per player
    for (const r of sideData.results) {
      if (r.didBat) runTotals[r.playerName] = (runTotals[r.playerName] ?? 0) + r.runs;
      if (r.didBowl) wicketTotals[r.playerName] = (wicketTotals[r.playerName] ?? 0) + r.wickets;
    }
  }

  // Current streak (from end of form)
  currentStreak = 0;
  if (form.length > 0) {
    const last = form[form.length - 1];
    for (let i = form.length - 1; i >= 0 && form[i] === last; i--) currentStreak++;
    if (last === 'L') currentStreak = -currentStreak;
  }

  const topRuns = Object.entries(runTotals).sort((a, b) => b[1] - a[1])[0];
  const topWickets = Object.entries(wicketTotals).sort((a, b) => b[1] - a[1])[0];

  return {
    wins, losses, totalPoints, form: form.slice(-10),
    currentStreak, longestStreak, purpleHits,
    allInUsed: side === 'lads' ? state.ladsAllInUsed : state.gilsAllInUsed,
    orangeCapRuns: topRuns ? { player: topRuns[0], runs: topRuns[1] } : null,
    purpleCapWickets: topWickets ? { player: topWickets[0], wickets: topWickets[1] } : null,
  };
}

export function computePlayerStats(state: SeasonState, side: 'lads' | 'gils'): PlayerSeasonStat[] {
  const done = completedMatches(state);
  const playerMap: Record<string, PlayerSeasonStat> = {};

  for (const match of done) {
    const fixture = fixtures.find(f => f.match === match.matchId);
    for (const result of match[side].results) {
      if (!playerMap[result.playerName]) {
        playerMap[result.playerName] = {
          name: result.playerName,
          team: fixture?.home ?? '',
          matches: 0, totalPoints: 0, avgPoints: 0,
          totalRuns: 0, totalWickets: 0,
          timesAs3x: 0, timesAs2x: 0,
          total3xPoints: 0, total2xPoints: 0,
          momCount: 0,
        };
      }
      const p = playerMap[result.playerName];
      const playerPts = computePlayerTotal(result);
      p.matches++;
      p.totalPoints += playerPts;
      if (result.didBat) p.totalRuns += result.runs;
      if (result.didBowl) p.totalWickets += result.wickets;
      if (result.multiplier === 'purple') { p.timesAs3x++; p.total3xPoints += playerPts; }
      if (result.multiplier === 'green')  { p.timesAs2x++; p.total2xPoints += playerPts; }
      if (result.isMOM) p.momCount++;
    }
  }

  return Object.values(playerMap)
    .map(p => ({ ...p, avgPoints: p.matches > 0 ? Math.round(p.totalPoints / p.matches) : 0 }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}
