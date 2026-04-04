/**
 * Reconstructs a Lads vs Gils points race chart from ESPN play-by-play data.
 *
 * Uses structured cumulative stats from the playbyplay endpoint instead of
 * text parsing. Each ball item contains cumulative batsman/bowler totals,
 * so we sample at the last ball of each over to get accurate point history.
 *
 * Fielding points (+10 per catch/stumping/run-out) are tracked via the
 * dismissal.fielder field on dismissal balls.
 */

import { seqToOverPos } from './espnSeq';
import { calcBattingPoints, calcBowlingPoints, applyMultiplier } from './scoring';
import type { PlayerPick } from './types';

export interface ReconstructedPoint {
  seq: number;
  lads: number;
  gils: number;
  events?: string[]; // notable events this over (milestones, wickets, dismissals, fielding)
}

export interface PlaybyPlayEntry {
  sequence: number;
  inningsNumber: number;    // innings.number
  overNumber: number;       // over.number
  ballNumber: number;       // over.ball
  isComplete: boolean;      // over.complete
  batsmanName: string;      // batsman.athlete.displayName
  batsmanRuns: number;      // batsman.totalRuns (cumulative)
  batsmanBalls: number;     // batsman.faced (cumulative)
  bowlerName: string;       // bowler.athlete.displayName
  bowlerLegalBalls: number; // bowler.balls (cumulative legal balls bowled)
  bowlerRuns: number;       // bowler.conceded (cumulative)
  bowlerWickets: number;    // bowler.wickets (cumulative)
  bowlerMaidens: number;    // bowler.maidens (cumulative)
  isDismissal: boolean;     // dismissal.dismissal
  fielderName?: string;     // dismissal.fielder.athlete.displayName (catch/stumping/run-out)
}

type InningsData = Record<string, {
  batting: Array<Record<string, string>>;
  bowling: Array<Record<string, string>>;
}>;

// ── Name helpers ──────────────────────────────────────────────────────────────
function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
const ALIASES: Record<string, string> = { 'lungingidi': 'lungisaningidi' };
function nameMatches(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  if (ALIASES[na] === nb || ALIASES[nb] === na) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}

function isInXI(name: string, xi: string[]) {
  return xi.length === 0 || xi.some(n => nameMatches(n, name));
}

// Shorten to last name for event labels
function shortName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
}

// ── Per-player current state trackers ────────────────────────────────────────
interface BatState { runs: number; balls: number; isOut: boolean; }
interface BowlState { legalBalls: number; runs: number; wickets: number; maidens: number; }

// ── Main reconstruction ───────────────────────────────────────────────────────
export function reconstructChartHistory(
  playbyplay: PlaybyPlayEntry[],
  innings: InningsData,
  ladsPicks: PlayerPick[],
  gilsPicks: PlayerPick[],
  playingEleven: string[],
): ReconstructedPoint[] {

  if (playbyplay.length === 0) return [];

  const allPicks = [...ladsPicks, ...gilsPicks];

  // Sort all balls by sequence
  const sorted = [...playbyplay].sort((a, b) => a.sequence - b.sequence);

  // Check if a player actually has batting or bowling records in the innings data.
  // More reliable than checking the squad list — a player can be "in XI" on the
  // squad roster without playing (e.g., rested, injured last-minute, impact sub).
  function didPlayInInnings(name: string): boolean {
    for (const inn of Object.values(innings)) {
      if (inn.batting.some(b => nameMatches(b.playerName ?? '', name))) return true;
      if (inn.bowling.some(b => nameMatches(b.playerName ?? '', name))) return true;
    }
    return false;
  }

  // Resolve active name for each pick: use substitute when the primary player
  // has no batting/bowling records in this match.
  function activeName(pick: PlayerPick): string {
    if (!pick.substituteName) return pick.playerName;
    const mainPlayed = didPlayInInnings(pick.playerName);
    if (!mainPlayed && didPlayInInnings(pick.substituteName)) return pick.substituteName!;
    // Fallback to squad-list check (e.g. early in a live match before innings data is full)
    const mainInXI = isInXI(pick.playerName, playingEleven);
    const subInXI = isInXI(pick.substituteName, playingEleven);
    return (!mainInXI && subInXI) ? pick.substituteName! : pick.playerName;
  }

  // Lookup batting position from innings data
  const batPosMap = new Map<string, number>();
  for (const inn of Object.values(innings)) {
    inn.batting.forEach((b, i) => {
      batPosMap.set(norm(b.playerName ?? ''), parseInt(b.battingPosition ?? String(i + 1)) || (i + 1));
    });
  }

  function getBatPos(name: string): number {
    const key = norm(name);
    if (batPosMap.has(key)) return batPosMap.get(key)!;
    for (const [k, v] of batPosMap) {
      if (nameMatches(k, key)) return v;
    }
    return 1;
  }

  // Per-player cumulative state maps (keyed by norm(name))
  const batState = new Map<string, BatState>();
  const bowlState = new Map<string, BowlState>();
  const fieldState = new Map<string, number>(); // norm(name) → cumulative fielding pts

  function getBatState(name: string): BatState {
    const key = norm(name);
    if (!batState.has(key)) batState.set(key, { runs: 0, balls: 0, isOut: false });
    return batState.get(key)!;
  }

  function getBowlState(name: string): BowlState {
    const key = norm(name);
    if (!bowlState.has(key)) bowlState.set(key, { legalBalls: 0, runs: 0, wickets: 0, maidens: 0 });
    return bowlState.get(key)!;
  }

  // Find the last ball of each over
  const overLastIndex = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    const ball = sorted[i];
    const key = ball.inningsNumber * 1000 + ball.overNumber;
    overLastIndex.set(key, i);
  }
  const sampleKeys = Array.from(overLastIndex.keys()).sort((a, b) => a - b);

  const history: ReconstructedPoint[] = [];
  let ballIdx = 0;

  // Helper: look up a player's value in a map by fuzzy name match
  function lookupBat(name: string): BatState | undefined {
    const n = norm(name);
    for (const [k, v] of batState) if (nameMatches(k, n)) return v;
    return undefined;
  }
  function lookupBatSnap(name: string, snap: Map<string, BatState>): BatState | undefined {
    const n = norm(name);
    for (const [k, v] of snap) if (nameMatches(k, n)) return v;
    return undefined;
  }
  function lookupBowl(name: string): BowlState | undefined {
    const n = norm(name);
    for (const [k, v] of bowlState) if (nameMatches(k, n)) return v;
    return undefined;
  }
  function lookupBowlSnap(name: string, snap: Map<string, BowlState>): BowlState | undefined {
    const n = norm(name);
    for (const [k, v] of snap) if (nameMatches(k, n)) return v;
    return undefined;
  }
  function lookupField(name: string): number {
    const n = norm(name);
    for (const [k, v] of fieldState) if (nameMatches(k, n)) return v;
    return 0;
  }
  function lookupFieldSnap(name: string, snap: Map<string, number>): number {
    const n = norm(name);
    for (const [k, v] of snap) if (nameMatches(k, n)) return v;
    return 0;
  }

  for (const sampleKey of sampleKeys) {
    const sampleIdx = overLastIndex.get(sampleKey)!;
    const sampleBall = sorted[sampleIdx];

    // Snapshot state before processing this over (for event detection)
    const batSnap = new Map<string, BatState>();
    const bowlSnap = new Map<string, BowlState>();
    const fieldSnap = new Map<string, number>();
    for (const [k, v] of batState) batSnap.set(k, { ...v });
    for (const [k, v] of bowlState) bowlSnap.set(k, { ...v });
    for (const [k, v] of fieldState) fieldSnap.set(k, v);

    // Process all balls up to and including the sample ball
    while (ballIdx <= sampleIdx) {
      const ball = sorted[ballIdx++];

      // Update batsman state (ESPN gives cumulative totals)
      for (const pick of allPicks) {
        const an = activeName(pick);
        if (!nameMatches(an, ball.batsmanName)) continue;
        const s = getBatState(an);
        if (!s.isOut) {
          s.runs = ball.batsmanRuns;
          s.balls = ball.batsmanBalls;
          if (ball.isDismissal) s.isOut = true;
        }
        break;
      }

      // Update bowler state (ESPN gives cumulative totals)
      for (const pick of allPicks) {
        const an = activeName(pick);
        if (!nameMatches(an, ball.bowlerName)) continue;
        const s = getBowlState(an);
        s.legalBalls = ball.bowlerLegalBalls;
        s.runs = ball.bowlerRuns;
        s.wickets = ball.bowlerWickets;
        s.maidens = ball.bowlerMaidens;
        break;
      }

      // Update fielding state: +10 per catch/stumping/run-out
      if (ball.isDismissal && ball.fielderName) {
        for (const pick of allPicks) {
          const an = activeName(pick);
          if (!nameMatches(an, ball.fielderName)) continue;
          const key = norm(an);
          fieldState.set(key, (fieldState.get(key) ?? 0) + 10);
          break;
        }
      }
    }

    // ── Generate events for this over ────────────────────────────────────────
    const overEvents: string[] = [];
    const MILESTONES = [25, 40, 50, 70, 90];

    for (const pick of allPicks) {
      const an = activeName(pick);
      const sn = shortName(an);

      const batCurr = lookupBat(an);
      const batPrev = lookupBatSnap(an, batSnap);
      const bowlCurr = lookupBowl(an);
      const bowlPrev = lookupBowlSnap(an, bowlSnap);
      const fieldCurr = lookupField(an);
      const fieldPrev = lookupFieldSnap(an, fieldSnap);

      // Dismissal
      if (batCurr?.isOut && !batPrev?.isOut) {
        overEvents.push(`${sn} ✗ ${batCurr.runs}(${batCurr.balls}b)`);
      }

      // Batting milestones (only while still batting)
      if (batCurr && !batCurr.isOut) {
        for (const m of MILESTONES) {
          if (batCurr.runs >= m && (batPrev?.runs ?? 0) < m) {
            overEvents.push(`${sn} ${m}★`);
          }
        }
      }
      // Also milestone if dismissed this over passing a threshold
      if (batCurr?.isOut && batPrev && !batPrev.isOut) {
        for (const m of MILESTONES) {
          if (batCurr.runs >= m && batPrev.runs < m) {
            overEvents.push(`${sn} ${m}★`);
          }
        }
      }

      // Bowling: wickets and maidens this over
      if (bowlCurr) {
        const wkts = bowlCurr.wickets - (bowlPrev?.wickets ?? 0);
        if (wkts > 0) overEvents.push(`${sn} ${wkts}w`);
        const maidens = bowlCurr.maidens - (bowlPrev?.maidens ?? 0);
        if (maidens > 0) overEvents.push(`${sn} maiden`);
      }

      // Fielding credit gained this over
      const fGain = fieldCurr - fieldPrev;
      if (fGain > 0) overEvents.push(`${sn} catch +${fGain}`);
    }

    // ── Compute fantasy points at this over position ──────────────────────────
    const overPos = seqToOverPos(sampleBall.sequence);
    if (overPos === null) continue;

    const computeTotal = (picks: PlayerPick[]): number => {
      let total = 0;
      for (const pick of picks) {
        const an = activeName(pick);
        const bat = lookupBat(an);
        const bowl = lookupBowl(an);
        const fieldPts = lookupField(an);

        const batPos = getBatPos(an);
        const batPts = (bat && (bat.balls > 0 || bat.isOut))
          ? calcBattingPoints(bat.runs, bat.balls, bat.isOut, batPos)
          : 0;

        const overs = (bowl?.legalBalls ?? 0) / 6;
        const bowlPts = overs >= 0.1
          ? calcBowlingPoints(bowl!.wickets, overs, bowl!.runs, bowl!.maidens)
          : 0;

        const raw = batPts + bowlPts + fieldPts;
        total += pick.multiplier ? applyMultiplier(raw, pick.multiplier) : raw;
      }
      return total;
    };

    history.push({
      seq: overPos,
      lads: Math.round(computeTotal(ladsPicks)),
      gils: Math.round(computeTotal(gilsPicks)),
      events: overEvents.length > 0 ? overEvents : undefined,
    });
  }

  return history;
}
