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
  dismissalFielder: string; // ESPN-provided fielder name for catches/stumpings/run-outs
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
  pts: number;           // final pts after multiplier
  batPts: number;        // raw batting pts (pre-multiplier)
  bowlPts: number;       // raw bowling pts (pre-multiplier)
  fieldPts: number;      // raw fielding pts — catches/stumpings/run-outs (ESPN doesn't expose; always 0 in live)
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

// Known ESPN shortened names → pick name equivalents.
// ESPN sometimes uses a player's common nickname rather than their full registered name.
// Both directions are checked so either form can appear in either position.
const NAME_ALIASES: Record<string, string> = {
  'lungingidi': 'lungisaningidi',  // ESPN: "Lungi Ngidi" ↔ pick: "Lungisani Ngidi"
};

function nameMatches(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  // Check alias table in both directions
  if (NAME_ALIASES[na] === nb) return true;
  if (NAME_ALIASES[nb] === na) return true;
  return false;
}

function findPick(espnName: string, picks: PlayerPick[]): PlayerPick | null {
  return picks.find(p => nameMatches(espnName, p.playerName)) ?? null;
}

// Check if a player is in today's playing eleven by name.
// Players absent from ESPN's roster list are non-playing squad members → eligible for sub activation.
function isInPlayingEleven(espnName: string, playingEleven: string[]): boolean {
  return playingEleven.some(n => nameMatches(n, espnName));
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
      dismissalFielder: p.dismissalFielder ?? '',
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

// Build fielding credits map using ESPN's structured outDetails.fielders data.
// dismissalFielder is set by the live route from outDetails.fielders[0].athlete.displayName,
// which covers catches, stumpings, and run-outs. Falls back to parsing dismissal text.
function buildFieldingMap(allBatsmen: LiveBatsman[]): Map<string, number> {
  const map = new Map<string, number>();
  const add = (name: string) => {
    const k = normalizeName(name);
    if (k.length >= 3) map.set(k, (map.get(k) ?? 0) + 10);
  };
  for (const b of allBatsmen) {
    if (!b.isOut) continue;
    // Use ESPN's explicit fielder field (most reliable)
    if (b.dismissalFielder) {
      add(b.dismissalFielder);
      continue;
    }
    // Fallback: parse dismissal text (e.g. "c Bumrah b Ngidi")
    const d = (b.dismissal ?? '').trim();
    if (!d || d === 'not out') continue;
    const catchM = d.match(/^c\s+(?![&†])([^b]+?)\s+b\s+/i);
    if (catchM) { add(catchM[1].trim()); continue; }
    const stM = d.match(/^st\s+([^b]+?)\s+b\s+/i);
    if (stM) { add(stM[1].trim()); continue; }
    const roM = d.match(/run out\s*\(([^)]+)\)/i);
    if (roM) { add(roM[1].split('/')[0].trim()); continue; }
  }
  return map;
}

// Look up fielding points for a player by checking if the dismissal surname
// is contained within the full player name (handles "Bumrah" → "Jasprit Bumrah").
function lookupFieldingPts(playerName: string, fieldingMap: Map<string, number>): number {
  const norm = normalizeName(playerName);
  let pts = 0;
  for (const [key, val] of fieldingMap) {
    if (norm.includes(key) || key.includes(norm)) pts += val;
  }
  return pts;
}

export function calcLiveFantasyTotal(
  batsmen: LiveBatsman[],
  bowlers: LiveBowler[],
  picks: PlayerPick[],
  playingEleven: string[] = [],
): LiveFantasyTotal {
  const breakdown: BreakdownEntry[] = [];
  // Build fielding map once from all batsmen dismissal texts
  const fieldingMap = buildFieldingMap(batsmen);

  for (const pick of picks) {
    const subName = pick.substituteName;

    // Activate substitute only when the main player is NOT in the playing eleven.
    // A player can be in the XI without batting or bowling (fielder, lower-order not yet in, etc.)
    // so checking activity would incorrectly sub them out mid-game.
    const mainInXI = playingEleven.length === 0 || isInPlayingEleven(pick.playerName, playingEleven);
    const subInXI = !!subName && isInPlayingEleven(subName, playingEleven);
    const useSubstitute = !mainInXI && subInXI;

    const activeName = useSubstitute ? subName! : pick.playerName;
    const batter = batsmen.find(b => nameMatches(b.playerName, activeName));
    const bowler = bowlers.find(b => nameMatches(b.playerName, activeName));

    // Apply multiplier once to combined raw total (non-linear loss multiplier)
    const batPts = batter?.fantasyPoints ?? 0;
    const bowlPts = bowler?.fantasyPoints ?? 0;
    const fieldPts = lookupFieldingPts(activeName, fieldingMap);
    const combinedRaw = batPts + bowlPts + fieldPts;
    const finalPts = pick.multiplier ? applyMultiplier(combinedRaw, pick.multiplier) : combinedRaw;

    breakdown.push({
      name: pick.playerName,
      activeName,
      pts: finalPts,
      batPts,
      bowlPts,
      fieldPts,
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
  playingEleven: string[] = [],
): PlayerResult[] {
  // Flatten all batting and bowling records across all innings
  const allBatting = Object.values(innings).flatMap(inning => inning.batting);
  const allBowling = Object.values(innings).flatMap(inning => inning.bowling);

  // Build fielding credit map from dismissalFielder on each batting record
  const fieldingMap = new Map<string, number>();
  for (const b of allBatting) {
    const fielder = b.dismissalFielder ?? '';
    if (!fielder) continue;
    const k = normalizeName(fielder);
    if (k.length >= 3) fieldingMap.set(k, (fieldingMap.get(k) ?? 0) + 10);
  }

  return picks.map(pick => {
    // Use substitute only if main player is absent from the playing eleven entirely.
    const mainInXI = playingEleven.length === 0 || isInPlayingEleven(pick.playerName, playingEleven);
    const subInXI = !!pick.substituteName && isInPlayingEleven(pick.substituteName, playingEleven);
    const subName = (!mainInXI && subInXI) ? pick.substituteName! : null;
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

    // Fielding — look up fielding credits from dismissalFielder map
    const catches = 0;
    const stumpings = 0;
    const runOuts = 0;
    const normActive = normalizeName(activeName);
    let fieldingPoints = 0;
    for (const [k, v] of fieldingMap) {
      if (normActive.includes(k) || k.includes(normActive)) fieldingPoints += v;
    }

    const isMOM = false;
    const momPoints = 0;
    const predPoints = correctPrediction ? 50 : 0;

    const battingPoints = calcBattingPoints(runs, balls, dismissed, battingPosition);
    const bowlingPoints = calcBowlingPoints(wickets, overs, runsConceded, maidens);
    const rawTotal = battingPoints + bowlingPoints + fieldingPoints;
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
