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

export interface LiveFantasyTotal {
  rawTotal: number;
  picksFound: number;
  breakdown: { name: string; pts: number; multiplier: Multiplier | null }[];
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function findPick(espnName: string, picks: PlayerPick[]): PlayerPick | null {
  const normalized = normalizeName(espnName);
  return picks.find(p => {
    const pn = normalizeName(p.playerName);
    // Match on last name or substantial overlap
    return pn === normalized ||
      pn.includes(normalized) ||
      normalized.includes(pn) ||
      (normalized.length > 4 && pn.slice(-normalized.length) === normalized) ||
      (pn.length > 4 && normalized.slice(-pn.length) === pn);
  }) ?? null;
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
  const seen = new Set<string>();
  const breakdown: { name: string; pts: number; multiplier: Multiplier | null }[] = [];

  for (const b of batsmen.filter(b => b.isFantasyPick)) {
    if (!seen.has(b.playerName)) {
      seen.add(b.playerName);
      breakdown.push({ name: b.playerName, pts: b.finalPoints, multiplier: b.multiplier });
    }
  }
  for (const b of bowlers.filter(b => b.isFantasyPick)) {
    if (!seen.has(b.playerName)) {
      seen.add(b.playerName);
      breakdown.push({ name: b.playerName, pts: b.finalPoints, multiplier: b.multiplier });
    }
  }

  // Add picks that haven't batted/bowled yet (0 pts)
  for (const pick of picks) {
    if (!seen.has(pick.playerName)) {
      seen.add(pick.playerName);
      breakdown.push({ name: pick.playerName, pts: 0, multiplier: pick.multiplier });
    }
  }

  const rawTotal = breakdown.reduce((s, p) => s + p.pts, 0);
  return { rawTotal, picksFound: seen.size, breakdown };
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
    const batter = allBatting.find(b => {
      const bn = normalizeName(b.playerName ?? '');
      const pn = normalizeName(pick.playerName);
      return bn === pn || bn.includes(pn) || pn.includes(bn) ||
        (bn.length > 4 && pn.slice(-bn.length) === bn) ||
        (pn.length > 4 && bn.slice(-pn.length) === pn);
    }) ?? null;

    const bowler = allBowling.find(b => {
      const bn = normalizeName(b.playerName ?? '');
      const pn = normalizeName(pick.playerName);
      return bn === pn || bn.includes(pn) || pn.includes(bn) ||
        (bn.length > 4 && pn.slice(-bn.length) === bn) ||
        (pn.length > 4 && bn.slice(-pn.length) === pn);
    }) ?? null;

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
