import { calcBattingPoints, calcBowlingPoints, calcFieldingPoints, applyMultiplier } from './scoring';
import type { PlayerPick, PlayerResult, Multiplier } from './types';
import type { LiveData } from '../hooks/useLiveScore';

export interface LiveBatsman {
  playerName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isOut: boolean;
  dismissal: string;
  fantasyPoints: number;
  multiplier: Multiplier | null;
  finalPoints: number;
  isFantasyPick: boolean;
}

export interface LiveBowler {
  playerName: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  fantasyPoints: number;
  multiplier: Multiplier | null;
  finalPoints: number;
  isFantasyPick: boolean;
}

export interface BreakdownEntry {
  name: string;          // original pick name
  activeName: string;    // substitute name if subbed in, else same as name
  pts: number;
  multiplier: Multiplier | null;
  isSubstituted: boolean;
}

export interface LiveFantasyTotal {
  rawTotal: number;
  picksFound: number;
  breakdown: BreakdownEntry[];
}

// ─── Name matching ────────────────────────────────────────────────────────────
// Exact full-name match only (normalised: lowercase, letters only).
// Fixes "Yadav" collision bug — common surnames no longer false-match.
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function nameMatches(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

function findPick(espnName: string, picks: PlayerPick[]): PlayerPick | null {
  return picks.find(p => nameMatches(espnName, p.playerName)) ?? null;
}

// Check if a player appeared in the game (used to decide whether to activate sub)
function hasActivity(
  espnName: string,
  batsmen: Array<{ playerName: string; balls: number; isOut: boolean }>,
  bowlers: Array<{ playerName: string; overs: number }>,
): boolean {
  const b = batsmen.find(x => nameMatches(x.playerName, espnName));
  const w = bowlers.find(x => nameMatches(x.playerName, espnName));
  return (!!b && (b.balls > 0 || b.isOut)) || (!!w && w.overs > 0);
}

export function calcLiveBatsmen(
  playerDetails: Array<Record<string, string>>,
  picks: PlayerPick[]
): LiveBatsman[] {
  return playerDetails.map((p, i) => {
    const runs = parseInt(p.runs ?? '0') || 0;
    const balls = parseInt(p.ballsFaced ?? '0') || 0;
    const isOut = !!p.dismissal && p.dismissal !== 'not out' && p.dismissal !== '';
    const sr = balls > 0 ? (runs / balls) * 100 : 0;
    const battingPos = i + 1;

    // Live scoring: don't apply failure penalty while batter is still in —
    // they may still build a score. Penalty locks in only on dismissal.
    const fantasyPoints = (!isOut && runs <= 10)
      ? 0
      : calcBattingPoints(runs, balls, isOut, battingPos);
    const pick = findPick(p.playerName, picks);
    const multiplier = pick?.multiplier ?? null;
    const finalPoints = multiplier ? applyMultiplier(fantasyPoints, multiplier) : fantasyPoints;

    return {
      playerName: p.playerName,
      runs,
      balls,
      fours: parseInt(p.fours ?? '0') || 0,
      sixes: parseInt(p.sixes ?? '0') || 0,
      strikeRate: Math.round(sr * 10) / 10,
      isOut,
      dismissal: p.dismissal ?? '',
      fantasyPoints,
      multiplier,
      finalPoints,
      isFantasyPick: !!pick,
    };
  });
}

export function calcLiveBowlers(
  playerDetails: Array<Record<string, string>>,
  picks: PlayerPick[]
): LiveBowler[] {
  return playerDetails.map(p => {
    const oversStr = p.overs ?? '0';
    const overs = parseFloat(oversStr) || 0;
    const runs = parseInt(p.conceded ?? '0') || 0;
    const wickets = parseInt(p.wickets ?? '0') || 0;
    const maidens = parseInt(p.maidens ?? '0') || 0;
    const economy = parseFloat(p.economyRate ?? '0') || 0;

    const fantasyPoints = calcBowlingPoints(wickets, overs, runs, maidens);
    const pick = findPick(p.playerName, picks);
    const multiplier = pick?.multiplier ?? null;
    const finalPoints = multiplier ? applyMultiplier(fantasyPoints, multiplier) : fantasyPoints;

    return {
      playerName: p.playerName,
      overs,
      maidens,
      runs,
      wickets,
      economy,
      fantasyPoints,
      multiplier,
      finalPoints,
      isFantasyPick: !!pick,
    };
  });
}

export function calcLiveFantasyTotal(
  batsmen: LiveBatsman[],
  bowlers: LiveBowler[],
  picks: PlayerPick[]
): LiveFantasyTotal {
  const breakdown: BreakdownEntry[] = [];

  for (const pick of picks) {
    // Determine which player's stats to use: main pick or substitute
    const mainActive = hasActivity(pick.playerName, batsmen, bowlers);
    const subName = pick.substituteName;

    // Activate substitute if: main player has zero activity AND substitute has appeared
    const useSubstitute = !mainActive && !!subName && hasActivity(subName, batsmen, bowlers);

    const activeName = useSubstitute ? subName! : pick.playerName;
    const batter = batsmen.find(b => nameMatches(b.playerName, activeName));
    const bowler = bowlers.find(b => nameMatches(b.playerName, activeName));

    // Apply multiplier once to combined raw total (non-linear loss multiplier)
    const combinedRaw = (batter?.fantasyPoints ?? 0) + (bowler?.fantasyPoints ?? 0);
    const finalPts = pick.multiplier ? applyMultiplier(combinedRaw, pick.multiplier) : combinedRaw;

    breakdown.push({
      name: pick.playerName,
      activeName,
      pts: finalPts,
      multiplier: pick.multiplier,
      isSubstituted: useSubstitute,
    });
  }

  const rawTotal = breakdown.reduce((s, p) => s + p.pts, 0);
  return { rawTotal, picksFound: picks.length, breakdown };
}

export function autoResultFromLive(
  innings: LiveData['innings'],
  picks: PlayerPick[],
  correctPrediction: boolean,
): PlayerResult[] {
  // Flatten all batting and bowling records across all innings
  const allBatting = Object.values(innings).flatMap(inning => inning.batting);
  const allBowling = Object.values(innings).flatMap(inning => inning.bowling);

  return picks.map(pick => {
    // Use substitute if main player never appeared
    const mainBat = allBatting.find(b => nameMatches(b.playerName ?? '', pick.playerName));
    const mainBowl = allBowling.find(b => nameMatches(b.playerName ?? '', pick.playerName));
    const mainActive = (mainBat && (parseInt(mainBat.ballsFaced ?? '0') > 0 || (mainBat.dismissal !== 'not out' && mainBat.dismissal !== ''))) ||
                       (mainBowl && parseFloat(mainBowl.overs ?? '0') > 0);
    const subName = (!mainActive && pick.substituteName) ? pick.substituteName : null;
    const activeName = subName ?? pick.playerName;

    const batter = allBatting.find(b => nameMatches(b.playerName ?? '', activeName)) ?? null;
    const bowler = allBowling.find(b => nameMatches(b.playerName ?? '', activeName)) ?? null;

    const didBat = !!batter && (
      parseInt(batter.ballsFaced ?? '0') > 0 ||
      (batter.dismissal !== 'not out' && batter.dismissal !== '')
    );
    const didBowl = !!bowler && parseFloat(bowler.overs ?? '0') > 0;

    // Batting stats
    const runs = didBat ? (parseInt(batter!.runs ?? '0') || 0) : 0;
    const balls = didBat ? (parseInt(batter!.ballsFaced ?? '0') || 0) : 0;
    const dismissed = didBat ? (batter!.dismissal !== 'not out' && batter!.dismissal !== '') : false;
    const battingPosition = didBat ? (parseInt(batter!.battingPosition ?? '1') || 1) : 1;

    // Bowling stats
    const overs = didBowl ? (parseFloat(bowler!.overs ?? '0') || 0) : 0;
    const runsConceded = didBowl ? (parseInt(bowler!.conceded ?? '0') || 0) : 0;
    const wickets = didBowl ? (parseInt(bowler!.wickets ?? '0') || 0) : 0;
    const maidens = didBowl ? (parseInt(bowler!.maidens ?? '0') || 0) : 0;

    // Fielding — not available per-player from ESPN
    const catches = 0;
    const stumpings = 0;
    const runOuts = 0;
    const fieldingPoints = 0;

    const isMOM = false;
    const momPoints = 0;
    const predPoints = correctPrediction ? 50 : 0;

    const battingPoints = calcBattingPoints(runs, balls, dismissed, battingPosition);
    const bowlingPoints = calcBowlingPoints(wickets, overs, runsConceded, maidens);
    const rawTotal = battingPoints + bowlingPoints;
    const finalTotal = applyMultiplier(rawTotal, pick.multiplier) + predPoints;

    return {
      playerName: pick.playerName,
      didBat,
      runs,
      balls,
      dismissed,
      battingPosition,
      didBowl,
      overs,
      runsConceded,
      wickets,
      maidens,
      catches,
      stumpings,
      runOuts,
      isMOM,
      battingPoints,
      bowlingPoints,
      fieldingPoints,
      momPoints,
      rawTotal,
      multiplier: pick.multiplier,
      finalTotal,
    };
  });
}
