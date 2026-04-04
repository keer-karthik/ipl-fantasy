/**
 * Reconstructs a Lads vs Gils points race chart from ESPN match data.
 *
 * For COMPLETED matches: samples at every over boundary using final player stats +
 * commentary-derived dismissal timings. Batting/bowling points are interpolated
 * from 0 → final proportionally to match progress; once a batter is dismissed
 * (detected from wicket commentary) their points lock in at that seq.
 *
 * For LIVE matches the cron job calls this on every poll, so the chart builds
 * in real time without any browser being open.
 */

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
// Returns a map: norm(playerName) → seq at which they were dismissed.
const WICKET_WORDS = ['wicket', ' out', 'lbw', 'caught', 'bowled', 'stumped', 'run out'];

function parseDismissalTimings(
  balls: CommentaryEntry[],
  playerNames: string[],
): Map<string, number> {
  const result = new Map<string, number>();

  for (const ball of balls) {
    if (!ball.sequence) continue;
    const lower = ball.text.toLowerCase();
    if (!WICKET_WORDS.some(w => lower.includes(w))) continue;

    // Look for any pick player's name parts in the commentary text
    for (const name of playerNames) {
      const parts = name.toLowerCase().split(' ').filter(p => p.length >= 4); // skip short words
      if (parts.some(p => lower.includes(p))) {
        const key = norm(name);
        if (!result.has(key)) result.set(key, ball.sequence);
        break;
      }
    }
  }

  return result;
}

// ── Estimate batting points for a player at a given seq ──────────────────────
function estimateBatPoints(
  batter: Record<string, string>,
  seq: number,
  maxSeq: number,
  dismissalSeq: Map<string, number>,
): number {
  const finalRuns  = parseInt(batter.runs       ?? '0') || 0;
  const finalBalls = parseInt(batter.ballsFaced ?? '0') || 0;
  const batPos     = parseInt(batter.battingPosition ?? '1') || 1;
  const isActuallyOut = !!batter.dismissal &&
    batter.dismissal !== 'not out' && batter.dismissal !== '';

  const playerKey = norm(batter.playerName ?? '');
  const dismissedAt = dismissalSeq.get(playerKey);

  // Locked-in: player was dismissed before this sample point
  const isLockedIn = dismissedAt != null && dismissedAt <= seq;

  if (isLockedIn) {
    // Use actual final stats (we know the complete innings)
    return calcBattingPoints(finalRuns, finalBalls, isActuallyOut, batPos);
  }

  // Still batting (or not yet in): interpolate linearly
  if (finalRuns === 0 && finalBalls === 0) return 0; // never batted
  const progress = maxSeq > 0 ? Math.min(seq / maxSeq, 1) : 0;
  const estRuns  = Math.round(finalRuns  * progress);
  const estBalls = Math.round(finalBalls * progress);

  // For in-progress batters, don't apply failure penalty yet (may still score)
  if (estRuns <= 10) return 0;
  return calcBattingPoints(estRuns, estBalls, false /* not out yet */, batPos);
}

// ── Estimate bowling points for a player at a given seq ──────────────────────
function estimateBowlPoints(
  bowler: Record<string, string>,
  seq: number,
  maxSeq: number,
): number {
  const finalOvers   = parseFloat(bowler.overs    ?? '0') || 0;
  const finalWickets = parseInt(bowler.wickets    ?? '0') || 0;
  const finalRuns    = parseInt(bowler.conceded   ?? '0') || 0;
  const finalMaidens = parseInt(bowler.maidens    ?? '0') || 0;

  if (finalOvers === 0) return 0;
  const progress = maxSeq > 0 ? Math.min(seq / maxSeq, 1) : 0;

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
  // Sort all commentary with a valid sequence
  const balls = commentaries
    .filter(c => c.sequence != null && c.sequence > 0)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  if (balls.length < 2) return [];

  const maxSeq = balls[balls.length - 1].sequence ?? 0;

  // Flatten all batting/bowling records across both innings
  const allBatting = Object.values(innings).flatMap(inn => inn.batting);
  const allBowling = Object.values(innings).flatMap(inn => inn.bowling);

  // All pick player names (for dismissal detection)
  const allPickNames = [...ladsPicks, ...gilsPicks].flatMap(p =>
    [p.playerName, p.substituteName].filter(Boolean) as string[]
  );

  const dismissalSeq = parseDismissalTimings(balls, allPickNames);

  // Sample at the last ball of each over
  const overLastBall = new Map<number, number>(); // over → max seq in that over
  for (const ball of balls) {
    const over = Math.floor(ball.sequence ?? 0);
    const cur = overLastBall.get(over) ?? 0;
    if ((ball.sequence ?? 0) > cur) overLastBall.set(over, ball.sequence ?? 0);
  }
  const sampleSeqs = Array.from(overLastBall.values()).sort((a, b) => a - b);

  // Compute estimated totals at each sample point
  const history: ReconstructedPoint[] = [];

  for (const seq of sampleSeqs) {
    const computeTotal = (picks: PlayerPick[]): number => {
      let total = 0;

      for (const pick of picks) {
        // Sub logic: same as liveScoring — main out of XI → use sub
        const mainInXI = isInXI(pick.playerName, playingEleven);
        const subInXI = !!pick.substituteName && isInXI(pick.substituteName, playingEleven);
        const activeName = (!mainInXI && subInXI) ? pick.substituteName! : pick.playerName;

        const batter = allBatting.find(b => nameMatches(b.playerName ?? '', activeName));
        const bowler = allBowling.find(b => nameMatches(b.playerName ?? '', activeName));

        const batPts  = batter ? estimateBatPoints(batter,  seq, maxSeq, dismissalSeq) : 0;
        const bowlPts = bowler ? estimateBowlPoints(bowler, seq, maxSeq)               : 0;
        const raw     = batPts + bowlPts;
        total += pick.multiplier ? applyMultiplier(raw, pick.multiplier) : raw;
      }

      return total;
    };

    history.push({
      seq,
      lads: Math.round(computeTotal(ladsPicks)),
      gils: Math.round(computeTotal(gilsPicks)),
    });
  }

  return history;
}
