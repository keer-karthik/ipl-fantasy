/**
 * Reconstructs a Lads vs Gils points race chart from ESPN play-by-play data.
 *
 * Uses structured cumulative stats from the playbyplay endpoint instead of
 * text parsing. Each ball item contains cumulative batsman/bowler totals,
 * so we sample at the last ball of each over to get accurate point history.
 */

import { seqToOverPos } from './espnSeq';
import { calcBattingPoints, calcBowlingPoints, applyMultiplier } from './scoring';
import type { PlayerPick } from './types';

export interface ReconstructedPoint { seq: number; lads: number; gils: number }

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

// ── Per-player current state trackers ────────────────────────────────────────
interface BatState {
  runs: number;
  balls: number;
  isOut: boolean;
}

interface BowlState {
  legalBalls: number;
  runs: number;
  wickets: number;
  maidens: number;
}

// ── Main reconstruction ───────────────────────────────────────────────────────
export function reconstructChartHistory(
  playbyplay: PlaybyPlayEntry[],
  innings: InningsData,
  ladsPicks: PlayerPick[],
  gilsPicks: PlayerPick[],
  playingEleven: string[],
): ReconstructedPoint[] {

  if (playbyplay.length === 0) return [];

  // Sort all balls by sequence
  const sorted = [...playbyplay].sort((a, b) => a.sequence - b.sequence);

  // Resolve active name for each pick (sub logic)
  const allPicks = [...ladsPicks, ...gilsPicks];
  function activeName(pick: PlayerPick): string {
    const mainInXI = isInXI(pick.playerName, playingEleven);
    const subInXI = !!pick.substituteName && isInXI(pick.substituteName, playingEleven);
    return (!mainInXI && subInXI) ? pick.substituteName! : pick.playerName;
  }

  // Lookup batting position from innings data
  const batPosMap = new Map<string, number>();
  for (const inn of Object.values(innings)) {
    inn.batting.forEach((b, i) => {
      batPosMap.set(norm(b.playerName ?? ''), parseInt(b.battingPosition ?? String(i + 1)) || (i + 1));
    });
  }

  // Find batting position for a resolved player name
  function getBatPos(name: string): number {
    const key = norm(name);
    if (batPosMap.has(key)) return batPosMap.get(key)!;
    // Try fuzzy match
    for (const [k, v] of batPosMap) {
      if (nameMatches(k, key)) return v;
    }
    return 1;
  }

  // Per-player cumulative state maps (keyed by norm(name))
  const batState = new Map<string, BatState>();
  const bowlState = new Map<string, BowlState>();

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

  // Find the last ball of each over (group by inningsNumber*1000 + overNumber)
  // We need to walk balls in order and sample at each over boundary
  const overLastIndex = new Map<number, number>(); // overKey → index in sorted
  for (let i = 0; i < sorted.length; i++) {
    const ball = sorted[i];
    const key = ball.inningsNumber * 1000 + ball.overNumber;
    overLastIndex.set(key, i); // last one wins
  }
  const sampleKeys = Array.from(overLastIndex.keys()).sort((a, b) => a - b);

  const history: ReconstructedPoint[] = [];
  let ballIdx = 0;

  for (const sampleKey of sampleKeys) {
    const sampleIdx = overLastIndex.get(sampleKey)!;
    const sampleBall = sorted[sampleIdx];

    // Process all balls up to and including the sample ball
    while (ballIdx <= sampleIdx) {
      const ball = sorted[ballIdx++];

      // Update batsman state — ESPN gives cumulative totals, so just assign
      for (const pick of allPicks) {
        const an = activeName(pick);
        if (!nameMatches(an, ball.batsmanName)) continue;
        const s = getBatState(an);
        // Only update if not already out (once dismissed, stats are final)
        if (!s.isOut) {
          s.runs = ball.batsmanRuns;
          s.balls = ball.batsmanBalls;
          if (ball.isDismissal) s.isOut = true;
        }
        break;
      }

      // Update bowler state — ESPN gives cumulative totals
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
    }

    // Convert sample ball sequence to chart x-position
    const overPos = seqToOverPos(sampleBall.sequence);
    if (overPos === null) continue;

    // Compute fantasy points for each side at this over position
    const computeTotal = (picks: PlayerPick[]): number => {
      let total = 0;
      for (const pick of picks) {
        const an = activeName(pick);
        const normName = norm(an);

        // Find bat/bowl state for this player (fuzzy match against stored keys)
        let bat: BatState | undefined;
        for (const [k, v] of batState) {
          if (nameMatches(k, normName)) { bat = v; break; }
        }
        let bowl: BowlState | undefined;
        for (const [k, v] of bowlState) {
          if (nameMatches(k, normName)) { bowl = v; break; }
        }

        const batPos = getBatPos(an);
        const batPts = (bat && (bat.balls > 0 || bat.isOut))
          ? calcBattingPoints(bat.runs, bat.balls, bat.isOut, batPos)
          : 0;

        const overs = (bowl?.legalBalls ?? 0) / 6;
        const bowlPts = overs >= 0.1
          ? calcBowlingPoints(bowl!.wickets, overs, bowl!.runs, bowl!.maidens)
          : 0;

        const raw = batPts + bowlPts;
        total += pick.multiplier ? applyMultiplier(raw, pick.multiplier) : raw;
      }
      return total;
    };

    history.push({
      seq: overPos,
      lads: Math.round(computeTotal(ladsPicks)),
      gils: Math.round(computeTotal(gilsPicks)),
    });
  }

  return history;
}
