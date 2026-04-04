/**
 * Reconstructs a Lads vs Gils points race chart from ESPN commentary.
 *
 * Instead of interpolating final stats, this parses each ball of commentary
 * text ("Bowler to Batter, result") to accumulate actual runs/wickets/overs
 * for every pick player ball by ball. This produces the real ups-and-downs
 * shape (wickets dropping, run milestones, SR penalties) rather than a
 * straight line.
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

// ── Name helpers ──────────────────────────────────────────────────────────────
function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
const ALIASES: Record<string, string> = { 'lungingidi': 'lungisaningidi' };
function nameMatches(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  if (ALIASES[na] === nb || ALIASES[nb] === na) return true;
  // Surname-only match (ESPN dismissal text often uses only surname)
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}
function isInXI(name: string, xi: string[]) {
  return xi.length === 0 || xi.some(n => nameMatches(n, name));
}

// ── Per-player live stat tracker ──────────────────────────────────────────────
interface LiveStats {
  // Batting
  runs: number;
  balls: number;
  dismissed: boolean;
  batPos: number;
  // Bowling
  legalBalls: number;   // legal deliveries bowled (for overs calc)
  runsConceded: number;
  wickets: number;
  currentOverRuns: number; // runs conceded in the current over (for maiden detection)
  maidens: number;
}

function emptyStats(): LiveStats {
  return { runs: 0, balls: 0, dismissed: false, batPos: 1,
           legalBalls: 0, runsConceded: 0, wickets: 0, currentOverRuns: 0, maidens: 0 };
}

// ── Parse one commentary ball ─────────────────────────────────────────────────
// Returns { bowler, batter, batterRuns, bowlerRuns, legalForBowler, isWicket }
function parseBall(text: string): {
  bowler: string; batter: string;
  batterRuns: number; bowlerRuns: number;
  legalForBowler: boolean; isWicket: boolean;
} | null {
  const toIdx = text.indexOf(' to ');
  const commaIdx = text.indexOf(',', toIdx + 1);
  if (toIdx === -1 || commaIdx === -1) return null;

  const bowler = text.slice(0, toIdx).trim();
  const batter  = text.slice(toIdx + 4, commaIdx).trim();
  const result  = text.slice(commaIdx + 1).trim().toLowerCase();

  const isWide   = result.includes('wide');
  const isNoBall = result.includes('no ball') || result.includes('no-ball');
  const isLegBye = result.includes('leg bye') || result.includes('leg-bye') || result.includes('leg byes');
  const isBye    = !isLegBye && result.includes(' bye');
  const isWicket = !isLegBye && !isBye && (
    result.includes('out') || result.includes('wicket') || result.includes('lbw') ||
    result.includes('caught') || result.includes('bowled') || result.includes('stumped') ||
    result.includes('run out')
  );

  // Runs scored by batter (not byes/leg-byes/wides)
  let batterRuns = 0;
  if (!isWide && !isLegBye && !isBye) {
    if (/\bsix\b/.test(result) || result.includes(', 6'))       batterRuns = 6;
    else if (/\bfour\b/.test(result) || result.includes(', 4')) batterRuns = 4;
    else { const m = result.match(/\b(\d+)\s+run/); if (m) batterRuns = parseInt(m[1]); }
  }

  // Runs charged to the bowler (batter runs + byes/leg-byes + wide penalty)
  let bowlerRuns = isWide ? 1 : batterRuns;
  if (isLegBye || isBye) {
    const m = result.match(/\b(\d+)\s+(leg\s+)?bye/);
    bowlerRuns = m ? parseInt(m[1]) : 1;
  }
  // No-balls add 1 extra to bowlerRuns
  if (isNoBall) bowlerRuns += 1;

  // Legal deliveries: not wides, not no-balls (for bowler's over count)
  const legalForBowler = !isWide && !isNoBall;
  // Batter does face no-balls but not wides
  const legalForBatter = !isWide;
  // Reuse batterRuns for batter facing, only increment balls if legal for batter
  void legalForBatter; // suppress unused warning — we handle it in caller

  return { bowler, batter, batterRuns, bowlerRuns, legalForBowler, isWicket };
}

// ── Main reconstruction ───────────────────────────────────────────────────────
export function reconstructChartHistory(
  innings: InningsData,
  commentaries: CommentaryEntry[],
  ladsPicks: PlayerPick[],
  gilsPicks: PlayerPick[],
  playingEleven: string[],
): ReconstructedPoint[] {

  // Decode and sort all commentary balls
  type DecodedBall = { text: string; overPos: number; inningsNum: number; over: number; ball: number };
  const balls: DecodedBall[] = [];
  for (const c of commentaries) {
    if (!c.sequence) continue;
    const d = decodeSeq(c.sequence);
    if (!d) continue;
    const overPos = seqToOverPos(c.sequence);
    if (overPos === null) continue;
    balls.push({ text: c.text, overPos, inningsNum: d.innings, over: d.over, ball: d.ball });
  }
  balls.sort((a, b) => a.overPos - b.overPos);
  if (balls.length < 2) return [];

  // Resolve active name for each pick (sub logic)
  const allPicks = [...ladsPicks, ...gilsPicks];
  function activeName(pick: PlayerPick): string {
    const mainInXI = isInXI(pick.playerName, playingEleven);
    const subInXI  = !!pick.substituteName && isInXI(pick.substituteName, playingEleven);
    return (!mainInXI && subInXI) ? pick.substituteName! : pick.playerName;
  }

  // Lookup batting position from final roster data (stays fixed)
  const batPosMap = new Map<string, number>();
  for (const inn of Object.values(innings)) {
    inn.batting.forEach((b, i) => {
      batPosMap.set(norm(b.playerName ?? ''), parseInt(b.battingPosition ?? String(i + 1)) || (i + 1));
    });
  }

  // Per-player cumulative stats (keys are norm(activeName))
  const statsMap = new Map<string, LiveStats>();
  function getStats(name: string): LiveStats {
    const key = norm(name);
    if (!statsMap.has(key)) {
      const s = emptyStats();
      s.batPos = batPosMap.get(key) ?? 1;
      statsMap.set(key, s);
    }
    return statsMap.get(key)!;
  }

  // Sample points: last ball of each over (per innings)
  const overLastBall = new Map<number, DecodedBall>(); // key = innings*1000+over
  for (const ball of balls) {
    const key = ball.inningsNum * 1000 + ball.over;
    const cur = overLastBall.get(key);
    if (!cur || ball.overPos > cur.overPos) overLastBall.set(key, ball);
  }
  const sampleKeys = Array.from(overLastBall.keys()).sort((a, b) => a - b);

  const history: ReconstructedPoint[] = [];
  let sampleIdx = 0;
  let ballIdx = 0;

  // Walk through all balls in order, emit a chart point at each over boundary
  for (const sampleKey of sampleKeys) {
    const sampleBall = overLastBall.get(sampleKey)!;

    // Process all balls up to and including the sample ball
    while (ballIdx < balls.length && balls[ballIdx].overPos <= sampleBall.overPos) {
      const ball = balls[ballIdx++];
      const parsed = parseBall(ball.text);
      if (!parsed) continue;

      const { bowler, batter, batterRuns, bowlerRuns, legalForBowler, isWicket } = parsed;

      // Find matching pick for batter
      for (const pick of allPicks) {
        const an = activeName(pick);
        if (!nameMatches(an, batter)) continue;
        const s = getStats(an);
        if (!s.dismissed) {
          s.runs += batterRuns;
          // Count ball faced (wides don't count but no-balls do)
          const isWide = ball.text.toLowerCase().includes('wide') && !ball.text.toLowerCase().includes('no ball');
          if (!isWide) s.balls++;
          if (isWicket) s.dismissed = true;
        }
        break;
      }

      // Find matching pick for bowler
      for (const pick of allPicks) {
        const an = activeName(pick);
        if (!nameMatches(an, bowler)) continue;
        const s = getStats(an);
        s.runsConceded += bowlerRuns;
        s.currentOverRuns += bowlerRuns;
        if (isWicket) {
          // Run-outs don't count toward bowler's wickets
          const isRunOut = ball.text.toLowerCase().includes('run out');
          if (!isRunOut) s.wickets++;
        }
        if (legalForBowler) {
          s.legalBalls++;
          // Maiden detection: over ends at ball 6 (or last ball of over)
          if (ball.ball >= 6 || ball.ball === sampleBall.ball) {
            if (s.currentOverRuns === 0 && s.legalBalls % 6 === 0) s.maidens++;
            s.currentOverRuns = 0;
          }
        }
        break;
      }
    }

    // Compute fantasy points at this over position for each side
    const computeTotal = (picks: PlayerPick[]): number => {
      let total = 0;
      for (const pick of picks) {
        const an = activeName(pick);
        const s = statsMap.get(norm(an));
        if (!s) continue; // player not yet in

        const overs = s.legalBalls / 6;
        const batPts  = s.balls > 0 || s.dismissed
          ? calcBattingPoints(s.runs, s.balls, s.dismissed, s.batPos)
          : 0;
        const bowlPts = overs >= 0.1
          ? calcBowlingPoints(s.wickets, overs, s.runsConceded, s.maidens)
          : 0;
        const raw = batPts + bowlPts;
        total += pick.multiplier ? applyMultiplier(raw, pick.multiplier) : raw;
      }
      return total;
    };

    history.push({
      seq: sampleBall.overPos,
      lads: Math.round(computeTotal(ladsPicks)),
      gils: Math.round(computeTotal(gilsPicks)),
    });

    sampleIdx++;
  }

  return history;
}
