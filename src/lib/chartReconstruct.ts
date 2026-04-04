/**
 * Reconstructs a Lads vs Gils points race chart from ESPN match data.
 *
 * Properly separates innings 1 and 2:
 *  - Innings 1 sample points (overPos 0–19.6): only innings 1 contributions.
 *    Dismissed batters lock in at their dismissal seq. Non-dismissed interpolated
 *    against innings 1 duration only.
 *  - Innings 2 sample points (overPos 20–39.6): innings 1 fully settled +
 *    innings 2 progressing against innings 2 duration.
 *
 * Player ↔ innings assignment: a player is classed as "innings 1" if their name
 * appears in any innings 1 commentary ball (seqs 100xxx). This handles both
 * batters (mentioned on dismissal / run scoring balls) and bowlers (mentioned
 * in every ball they bowl).
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

// ── Name normalisation ────────────────────────────────────────────────────────
function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
const ALIASES: Record<string, string> = { 'lungingidi': 'lungisaningidi' };
function nameMatches(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  if (ALIASES[na] === nb || ALIASES[nb] === na) return true;
  return false;
}
function isInXI(name: string, xi: string[]) {
  return xi.length === 0 || xi.some(n => nameMatches(n, name));
}

// ── Dismissal timing ──────────────────────────────────────────────────────────
const WICKET_WORDS = ['wicket', ' out', 'lbw', 'caught', 'bowled', 'stumped', 'run out'];

function parseDismissalTimings(
  balls: Array<{ text: string; overPos: number; innings: number }>,
  inningsNum: 1 | 2,
  playerNames: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const ball of balls) {
    if (ball.innings !== inningsNum) continue;
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

// ── Build set of players active in a given innings ────────────────────────────
// A player is classed as innings-N if their name appears in any ball of that innings.
function buildInningsPlayers(
  balls: Array<{ text: string; innings: number }>,
  inningsNum: 1 | 2,
  allNames: string[],
): Set<string> {
  const inningsBalls = balls.filter(b => b.innings === inningsNum);
  const result = new Set<string>();
  for (const ball of inningsBalls) {
    const lower = ball.text.toLowerCase();
    for (const name of allNames) {
      const parts = name.toLowerCase().split(' ').filter(p => p.length >= 4);
      if (parts.some(p => lower.includes(p))) {
        result.add(norm(name));
      }
    }
  }
  return result;
}

// ── Estimate batting pts at a given overPos ───────────────────────────────────
function estimateBatPoints(
  batter: Record<string, string>,
  overPos: number,
  inningsStart: number,     // 0 for innings 1, 20 for innings 2
  inningsMaxPos: number,    // max overPos for this player's innings
  dismissalMap: Map<string, number>,
): number {
  const finalRuns  = parseInt(batter.runs       ?? '0') || 0;
  const finalBalls = parseInt(batter.ballsFaced ?? '0') || 0;
  const batPos     = parseInt(batter.battingPosition ?? '1') || 1;
  const isActuallyOut = !!batter.dismissal &&
    batter.dismissal !== 'not out' && batter.dismissal !== '';

  const playerKey   = norm(batter.playerName ?? '');
  const dismissedAt = dismissalMap.get(playerKey);
  const isLockedIn  = dismissedAt != null && dismissedAt <= overPos;

  if (isLockedIn) {
    return calcBattingPoints(finalRuns, finalBalls, isActuallyOut, batPos);
  }

  // Player hasn't started batting yet (overPos before their innings)
  if (overPos < inningsStart) return 0;

  if (finalRuns === 0 && finalBalls === 0) return 0;

  const elapsed  = overPos - inningsStart;
  const duration = inningsMaxPos - inningsStart;
  const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0;
  const estRuns  = Math.round(finalRuns  * progress);
  const estBalls = Math.round(finalBalls * progress);

  if (estRuns <= 10) return 0;
  return calcBattingPoints(estRuns, estBalls, false, batPos);
}

// ── Estimate bowling pts at a given overPos ───────────────────────────────────
function estimateBowlPoints(
  bowler: Record<string, string>,
  overPos: number,
  inningsStart: number,
  inningsMaxPos: number,
): number {
  const finalOvers   = parseFloat(bowler.overs    ?? '0') || 0;
  const finalWickets = parseInt(bowler.wickets    ?? '0') || 0;
  const finalRuns    = parseInt(bowler.conceded   ?? '0') || 0;
  const finalMaidens = parseInt(bowler.maidens    ?? '0') || 0;

  if (finalOvers === 0) return 0;
  if (overPos < inningsStart) return 0;

  const elapsed  = overPos - inningsStart;
  const duration = inningsMaxPos - inningsStart;
  const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0;

  return calcBowlingPoints(
    Math.round(finalWickets * progress),
    finalOvers   * progress,
    Math.round(finalRuns    * progress),
    Math.round(finalMaidens * progress),
  );
}

// ── Main reconstruction ───────────────────────────────────────────────────────
export function reconstructChartHistory(
  innings: InningsData,
  commentaries: CommentaryEntry[],
  ladsPicks: PlayerPick[],
  gilsPicks: PlayerPick[],
  playingEleven: string[],
): ReconstructedPoint[] {
  // Decode all commentary balls
  const balls = commentaries
    .filter(c => c.sequence != null && decodeSeq(c.sequence) !== null)
    .map(c => {
      const d = decodeSeq(c.sequence!)!;
      return { text: c.text, rawSeq: c.sequence!, overPos: seqToOverPos(c.sequence!)!, innings: d.innings };
    })
    .sort((a, b) => a.overPos - b.overPos);

  if (balls.length < 2) return [];

  // Split by innings
  const inn1Balls = balls.filter(b => b.innings === 1);
  const inn2Balls = balls.filter(b => b.innings === 2);
  const maxPos1   = inn1Balls.length > 0 ? inn1Balls[inn1Balls.length - 1].overPos : 19.6;
  const maxPos2   = inn2Balls.length > 0 ? inn2Balls[inn2Balls.length - 1].overPos : 39.6;

  // Flatten batting/bowling across all innings
  const allBatting = Object.values(innings).flatMap(inn => inn.batting);
  const allBowling = Object.values(innings).flatMap(inn => inn.bowling);

  const allPickNames = [...ladsPicks, ...gilsPicks].flatMap(p =>
    [p.playerName, p.substituteName].filter(Boolean) as string[]
  );

  // Determine which innings each pick player is active in
  const inn1Players = buildInningsPlayers(balls, 1, allPickNames);
  const inn2Players = buildInningsPlayers(balls, 2, allPickNames);

  // Dismissal maps per innings
  const dismissal1 = parseDismissalTimings(balls, 1, allPickNames);
  const dismissal2 = parseDismissalTimings(balls, 2, allPickNames);

  // Sample at the last ball of each over (per innings)
  const overLastPos = new Map<number, number>(); // innings*1000+over → overPos
  for (const ball of balls) {
    const d = decodeSeq(ball.rawSeq)!;
    const key = d.innings * 1000 + d.over;
    const cur = overLastPos.get(key) ?? 0;
    if (ball.overPos > cur) overLastPos.set(key, ball.overPos);
  }
  const samplePositions = Array.from(overLastPos.values()).sort((a, b) => a - b);

  // For each pick: compute their FINAL innings 1 pts (fully settled)
  // Used at innings 2 sample points so innings 1 contribution is fixed.
  function finalInn1Pts(activeName: string): number {
    const batter = allBatting.find(b => nameMatches(b.playerName ?? '', activeName));
    const bowler = allBowling.find(b => nameMatches(b.playerName ?? '', activeName));
    const batPts = batter ? estimateBatPoints(batter, maxPos1, 0, maxPos1, dismissal1) : 0;
    const bowlPts = bowler ? estimateBowlPoints(bowler, maxPos1, 0, maxPos1) : 0;
    return batPts + bowlPts;
  }

  const history: ReconstructedPoint[] = [];

  for (const overPos of samplePositions) {
    const isInnings2 = overPos >= 20;

    const computeTotal = (picks: PlayerPick[]): number => {
      let total = 0;
      for (const pick of picks) {
        const mainInXI = isInXI(pick.playerName, playingEleven);
        const subInXI  = !!pick.substituteName && isInXI(pick.substituteName, playingEleven);
        const activeName = (!mainInXI && subInXI) ? pick.substituteName! : pick.playerName;
        const activeNorm = norm(activeName);

        const inInn1 = inn1Players.has(activeNorm);
        const inInn2 = inn2Players.has(activeNorm);

        const batter = allBatting.find(b => nameMatches(b.playerName ?? '', activeName));
        const bowler = allBowling.find(b => nameMatches(b.playerName ?? '', activeName));

        let raw = 0;

        if (!isInnings2) {
          // Innings 1 sample: only innings 1 players contribute
          if (inInn1) {
            const batPts  = batter ? estimateBatPoints(batter,  overPos, 0, maxPos1, dismissal1) : 0;
            const bowlPts = bowler ? estimateBowlPoints(bowler, overPos, 0, maxPos1)             : 0;
            raw = batPts + bowlPts;
          }
          // innings 2 players contribute 0 at innings 1 sample points
        } else {
          // Innings 2 sample: innings 1 pts fully settled + innings 2 progressing
          const inn1Raw = inInn1 ? finalInn1Pts(activeName) : 0;

          let inn2Raw = 0;
          if (inInn2) {
            const batPts  = batter ? estimateBatPoints(batter,  overPos, 20, maxPos2, dismissal2) : 0;
            const bowlPts = bowler ? estimateBowlPoints(bowler, overPos, 20, maxPos2)             : 0;
            inn2Raw = batPts + bowlPts;
          }
          raw = inn1Raw + inn2Raw;
        }

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
