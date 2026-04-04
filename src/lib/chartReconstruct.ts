/**
 * Reconstructs a Lads vs Gils points race chart from ESPN match data.
 *
 * Samples at the last ball of each over. For each sample point:
 *  - Batting pts: locked in at dismissal, interpolated while still batting
 *  - Bowling pts: linearly interpolated by progress through the innings
 *
 * Output seq values are over-positions in 0–39.6 range (seqToOverPos).
 * This matches the chart domain in LiveScorecard.
 */

import { decodeSeq, seqToOverPos } from './espnSeq';
import { calcBattingPoints, calcBowlingPoints, applyMultiplier } from './scoring';
import type { PlayerPick } from './types';

export interface ReconstructedPoint { seq: number; lads: number; gils: number }

type InningsData = Record<string, {
  batting: Array<Record<string, string>>;
  bowling: Array<Record<string, string>>;
}>;
type CommentaryEntry = { text: string; sequence?: number };

// ── Name normalisation (same as liveScoring.ts) ───────────────────────────────
function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
const ALIASES: Record<string, string> = { 'lungingidi': 'lungisaningidi' };
function nameMatches(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  if (ALIASES[na] === nb || ALIASES[nb] === na) return true;
  return false;
}
function isInXI(name: string, xi: string[]) { return xi.length === 0 || xi.some(n => nameMatches(n, name)); }

// ── Parse dismissal timings from wicket commentary ───────────────────────────
// Returns map: norm(playerName) → over-position at which they were dismissed.
const WICKET_WORDS = ['wicket', ' out', 'lbw', 'caught', 'bowled', 'stumped', 'run out'];

function parseDismissalTimings(
  balls: Array<{ text: string; overPos: number }>,
  playerNames: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const ball of balls) {
    const lower = ball.text.toLowerCase();
    if (!WICKET_WORDS.some(w => lower.includes(w))) continue;
    for (const name of playerNames) {
      const parts = name.toLowerCase().split(' ').filter(p => p.length >= 4);
      if (parts.some(p => lower.includes(p))) {
        const key = norm(name);
        if (!result.has(key)) result.set(key, ball.overPos);
        break;
      }
    }
  }
  return result;
}

// ── Estimate batting points for a player at a given over-position ─────────────
function estimateBatPoints(
  batter: Record<string, string>,
  overPos: number,
  maxOverPos: number,
  dismissalMap: Map<string, number>,
): number {
  const finalRuns  = parseInt(batter.runs       ?? '0') || 0;
  const finalBalls = parseInt(batter.ballsFaced ?? '0') || 0;
  const batPos     = parseInt(batter.battingPosition ?? '1') || 1;
  const isActuallyOut = !!batter.dismissal &&
    batter.dismissal !== 'not out' && batter.dismissal !== '';

  const playerKey  = norm(batter.playerName ?? '');
  const dismissedAt = dismissalMap.get(playerKey);
  const isLockedIn  = dismissedAt != null && dismissedAt <= overPos;

  if (isLockedIn) {
    return calcBattingPoints(finalRuns, finalBalls, isActuallyOut, batPos);
  }

  if (finalRuns === 0 && finalBalls === 0) return 0;
  const progress = maxOverPos > 0 ? Math.min(overPos / maxOverPos, 1) : 0;
  const estRuns  = Math.round(finalRuns  * progress);
  const estBalls = Math.round(finalBalls * progress);

  if (estRuns <= 10) return 0;
  return calcBattingPoints(estRuns, estBalls, false, batPos);
}

// ── Estimate bowling points for a player at a given over-position ─────────────
function estimateBowlPoints(
  bowler: Record<string, string>,
  overPos: number,
  maxOverPos: number,
): number {
  const finalOvers   = parseFloat(bowler.overs    ?? '0') || 0;
  const finalWickets = parseInt(bowler.wickets    ?? '0') || 0;
  const finalRuns    = parseInt(bowler.conceded   ?? '0') || 0;
  const finalMaidens = parseInt(bowler.maidens    ?? '0') || 0;

  if (finalOvers === 0) return 0;
  const progress = maxOverPos > 0 ? Math.min(overPos / maxOverPos, 1) : 0;

  const estOvers   = finalOvers   * progress;
  const estWickets = Math.round(finalWickets * progress);
  const estRuns    = Math.round(finalRuns    * progress);
  const estMaidens = Math.round(finalMaidens * progress);

  return calcBowlingPoints(estWickets, estOvers, estRuns, estMaidens);
}

// ── Main reconstruction ───────────────────────────────────────────────────────
export function reconstructChartHistory(
  innings: InningsData,
  commentaries: CommentaryEntry[],
  ladsPicks: PlayerPick[],
  gilsPicks: PlayerPick[],
  playingEleven: string[],
): ReconstructedPoint[] {
  // Decode all commentary balls — skip any with unrecognised sequence format
  const balls = commentaries
    .filter(c => c.sequence != null && decodeSeq(c.sequence) !== null)
    .map(c => ({
      text: c.text,
      rawSeq: c.sequence!,
      overPos: seqToOverPos(c.sequence!)!,
    }))
    .sort((a, b) => a.overPos - b.overPos);

  if (balls.length < 2) return [];

  const maxOverPos = balls[balls.length - 1].overPos;

  // Flatten batting/bowling across all innings
  const allBatting = Object.values(innings).flatMap(inn => inn.batting);
  const allBowling = Object.values(innings).flatMap(inn => inn.bowling);

  const allPickNames = [...ladsPicks, ...gilsPicks].flatMap(p =>
    [p.playerName, p.substituteName].filter(Boolean) as string[]
  );

  const dismissalMap = parseDismissalTimings(balls, allPickNames);

  // Sample at the last ball of each over (keyed by innings*1000+over)
  const overLastPos = new Map<number, number>(); // key → max overPos in that over
  for (const ball of balls) {
    const d = decodeSeq(ball.rawSeq)!;
    const key = d.innings * 1000 + d.over;
    const cur = overLastPos.get(key) ?? 0;
    if (ball.overPos > cur) overLastPos.set(key, ball.overPos);
  }
  const samplePositions = Array.from(overLastPos.values()).sort((a, b) => a - b);

  // Compute estimated totals at each sample over-position
  const history: ReconstructedPoint[] = [];

  for (const overPos of samplePositions) {
    const computeTotal = (picks: PlayerPick[]): number => {
      let total = 0;
      for (const pick of picks) {
        const mainInXI = isInXI(pick.playerName, playingEleven);
        const subInXI = !!pick.substituteName && isInXI(pick.substituteName, playingEleven);
        const activeName = (!mainInXI && subInXI) ? pick.substituteName! : pick.playerName;

        const batter = allBatting.find(b => nameMatches(b.playerName ?? '', activeName));
        const bowler = allBowling.find(b => nameMatches(b.playerName ?? '', activeName));

        const batPts  = batter ? estimateBatPoints(batter,  overPos, maxOverPos, dismissalMap) : 0;
        const bowlPts = bowler ? estimateBowlPoints(bowler, overPos, maxOverPos)               : 0;
        const raw     = batPts + bowlPts;
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
