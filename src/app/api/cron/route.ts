/**
 * GET /api/cron
 *
 * Vercel Cron Job — runs every 5 minutes.
 * For every match played today (or the one currently live), fetches ESPN data,
 * computes Lads/Gils fantasy totals using picks stored in Supabase, and appends
 * a snapshot to the chart history. This means the chart accumulates automatically
 * even when no browser is open.
 *
 * vercel.json schedules this every 5 minutes.
 */
import { NextRequest, NextResponse } from 'next/server';
import espnIds from '../../../../data/espn_ids.json';
import fixturesRaw from '../../../../data/fixtures.json';
import { getSeasonStateRow, upsertSeasonState } from '@/lib/supabase-server';
import { reconstructChartHistory, type PlaybyPlayEntry } from '@/lib/chartReconstruct';
import type { PlayerPick, SeasonState } from '@/lib/types';

// Guard: Vercel signs cron requests with CRON_SECRET — reject anything else in prod.
function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev — no secret configured
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const today = new Date();
  const fixtures = fixturesRaw as Array<{ match: number; date: string }>;

  // Load picks from Supabase first so we can check which matches have picks
  const row = await getSeasonStateRow();
  const state = (row?.state ?? {}) as SeasonState & Record<string, unknown>;
  const chartHistory = (state.chartHistory as Record<string, unknown> | undefined) ?? {};

  // Process all past matches that:
  //   1. Have already been played (date ≤ today)
  //   2. Have picks entered for at least one side
  //   3. Have no chart history yet (backfill) OR are from today/yesterday (keep current)
  const activeMatchIds = fixtures
    .filter(f => {
      const d = parseMatchDate(f.date);
      if (d > today) return false; // future match — skip
      const m = state.matches?.[f.match];
      const hasPicks = (m?.lads?.picks?.length ?? 0) > 0 || (m?.gils?.picks?.length ?? 0) > 0;
      if (!hasPicks) return false;
      const hasHistory = Array.isArray(chartHistory[String(f.match)]) &&
        (chartHistory[String(f.match)] as unknown[]).length > 0;
      // Always re-run today/yesterday (match may still be live or just finished)
      const isRecent = (today.getTime() - d.getTime()) < 2 * 24 * 60 * 60 * 1000;
      return isRecent || !hasHistory; // backfill old matches missing chart data
    })
    .map(f => f.match);

  if (activeMatchIds.length === 0) {
    return NextResponse.json({ skipped: 'no matches need processing' });
  }

  const results: Record<number, string> = {};

  for (const matchId of activeMatchIds) {
    const espnId = espnIds[String(matchId) as keyof typeof espnIds];
    if (!espnId) { results[matchId] = 'no espn id'; continue; }

    try {
      const picks = getPicksForMatch(state, matchId);
      if (!picks.ladsPicks.length && !picks.gilsPicks.length) {
        results[matchId] = 'no picks'; continue;
      }

      // Fetch ESPN summary for roster/innings data
      const summaryRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=${espnId}`,
        { next: { revalidate: 0 } }
      );
      const summary = await summaryRes.json();
      const { innings, playingEleven } = parseEspnSummary(summary);

      // Fetch all pages of playbyplay
      const playbyplay = await fetchAllPlaybyplay(espnId);
      if (playbyplay.length === 0) { results[matchId] = 'no playbyplay'; continue; }

      // Augment playbyplay dismissal balls with fielder from summary.
      // Primary: outDetails.fielders. Fallback: parse dismissal text ("c Archer b Khan").
      function normN(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
      function extractFielderFromText(dismissal: string): string {
        const catchM = dismissal.match(/^c\s+(?![&†])([^b]+?)\s+b\s+/i);
        if (catchM) return catchM[1].trim();
        const stM = dismissal.match(/^st\s+([^b]+?)\s+b\s+/i);
        if (stM) return stM[1].trim();
        const roM = dismissal.match(/run out\s*\(([^)]+)\)/i);
        if (roM) return roM[1].split('/')[0].trim();
        return '';
      }
      const batsmanToFielder = new Map<string, string>();
      for (const inn of Object.values(innings)) {
        for (const b of inn.batting) {
          if (!b.playerName) continue;
          const fielder = b.dismissalFielder || extractFielderFromText(b.dismissal ?? '');
          if (fielder) batsmanToFielder.set(normN(b.playerName), fielder);
        }
      }
      const augmentedPlaybyplay = playbyplay.map(ball => {
        if (!ball.isDismissal || ball.fielderName) return ball;
        const n = normN(ball.batsmanName);
        let fielder: string | undefined;
        for (const [k, v] of batsmanToFielder) {
          if (k === n || k.includes(n.slice(0, 6)) || n.includes(k.slice(0, 6))) {
            fielder = v; break;
          }
        }
        return fielder ? { ...ball, fielderName: fielder } : ball;
      });

      // Build chart via reconstruction (works for both live and completed)
      const reconstructed = reconstructChartHistory(
        augmentedPlaybyplay,
        innings,
        picks.ladsPicks,
        picks.gilsPicks,
        playingEleven,
      );
      if (reconstructed.length === 0) { results[matchId] = 'no data points'; continue; }

      // Merge: reconstruction always wins (fresh algorithm with fielding);
      // existing points only fill gaps not covered by reconstruction.
      const existingCh = (state.chartHistory as Record<string, typeof reconstructed> | undefined) ?? {};
      const existing = existingCh[String(matchId)] ?? [];
      const seqMap = new Map(existing.map(p => [p.seq, p]));
      for (const p of reconstructed) {
        const prev = seqMap.get(p.seq);
        seqMap.set(p.seq, { ...p, events: p.events ?? prev?.events });
      }
      const merged = Array.from(seqMap.values()).sort((a, b) => a.seq - b.seq);

      // Persist — update state in-place for next iteration
      (state as Record<string, unknown>).chartHistory = {
        ...existingCh,
        [String(matchId)]: merged,
      };

      results[matchId] = `ok (${merged.length} points)`;
    } catch (e) {
      results[matchId] = `error: ${String(e)}`;
    }
  }

  // Write all updates in a single upsert
  await upsertSeasonState(state as Record<string, unknown>);

  return NextResponse.json({ processed: activeMatchIds, results });
}

// ── Fetch all pages of ESPN playbyplay ───────────────────────────────────────
async function fetchAllPlaybyplay(espnId: string): Promise<PlaybyPlayEntry[]> {
  const all: PlaybyPlayEntry[] = [];
  let page = 1, pageCount = 1;
  while (page <= pageCount) {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/cricket/8048/playbyplay?event=${espnId}&page=${page}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) break;
    const data = await res.json();
    const comm = data?.commentary;
    if (!comm?.items) break;
    pageCount = comm.pageCount ?? 1;
    for (const item of comm.items) {
      const bat = item.batsman?.athlete?.displayName;
      const bowl = item.bowler?.athlete?.displayName;
      if (!bat || !bowl || !item.sequence) continue;
      all.push({
        sequence: item.sequence,
        inningsNumber: item.innings?.number ?? 1,
        overNumber: item.over?.number ?? 1,
        ballNumber: item.over?.ball ?? 1,
        isComplete: item.over?.complete ?? false,
        batsmanName: bat,
        batsmanRuns: item.batsman?.totalRuns ?? 0,
        batsmanBalls: item.batsman?.faced ?? 0,
        bowlerName: bowl,
        bowlerLegalBalls: item.bowler?.balls ?? 0,
        bowlerRuns: item.bowler?.conceded ?? 0,
        bowlerWickets: item.bowler?.wickets ?? 0,
        bowlerMaidens: item.bowler?.maidens ?? 0,
        isDismissal: item.dismissal?.dismissal === true,
        fielderName: item.dismissal?.fielder?.athlete?.displayName ?? undefined,
      });
    }
    page++;
  }
  return all;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMatchDate(dateStr: string): Date {
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const [day, mon, yr] = dateStr.split('-');
  return new Date(2000 + parseInt(yr), months[mon], parseInt(day));
}

function getPicksForMatch(state: SeasonState, matchId: number) {
  const m = state.matches?.[matchId];
  return {
    ladsPicks: (m?.lads?.picks ?? []) as PlayerPick[],
    gilsPicks: (m?.gils?.picks ?? []) as PlayerPick[],
  };
}

function extractStats(linescores: Array<{
  order: number;
  statistics?: { categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }> };
}>): Record<string, string> | null {
  const ls = linescores.find(l => l.order > 0);
  if (!ls) return null;
  const stats: Record<string, string> = {};
  for (const cat of ls.statistics?.categories ?? []) {
    for (const s of cat.stats ?? []) stats[s.name] = s.displayValue;
  }
  return Object.keys(stats).length > 0 ? stats : null;
}

function parseEspnSummary(summary: Record<string, unknown>) {
  const rosters = (summary.rosters ?? []) as Array<{
    team: { displayName: string };
    roster: Array<{ athlete: { displayName: string }; linescores?: Array<{ linescores?: Array<unknown> }> }>;
  }>;

  const playingEleven: string[] = rosters.flatMap(r =>
    (r.roster ?? []).map(p => p.athlete?.displayName ?? '').filter(Boolean)
  );

  const innings: Record<string, { batting: Array<Record<string,string>>; bowling: Array<Record<string,string>> }> = {};

  for (const roster of rosters) {
    const teamName = roster.team.displayName;
    innings[teamName] = { batting: [], bowling: [] };

    for (const player of roster.roster ?? []) {
      const playerName = player.athlete?.displayName ?? 'Unknown';
      for (const inn of (player.linescores ?? []) as Array<{ linescores?: Array<unknown> }>) {
        type LS = {
          order: number;
          statistics?: {
            categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }>;
            batting?: { outDetails?: { fielders?: Array<{ athlete?: { displayName?: string } }> } };
          };
        };
        const innerLs = (inn.linescores ?? []) as LS[];
        const stats = extractStats(innerLs);
        if (!stats) continue;
        if (stats.batted === '1') {
          const dc = [stats.dismissalText, stats.dismissalLong, stats.dismissalCard,
            stats.dismissalShort, stats.dismissal].filter(Boolean) as string[];
          const dismissal = dc.reduce<string>((a, b) => b.length > a.length ? b : a, dc[0] ?? 'not out');
          const mainLs = innerLs.find(l => l.order > 0);
          const dismissalFielder = mainLs?.statistics?.batting?.outDetails?.fielders?.[0]?.athlete?.displayName ?? '';
          innings[teamName].batting.push({
            playerName, runs: stats.runs ?? '0', ballsFaced: stats.ballsFaced ?? '0',
            dismissal, battingPosition: stats.battingPosition ?? '1', dismissalFielder,
          });
        } else if (stats.bowled === '1') {
          innings[teamName].bowling.push({
            playerName, overs: stats.overs ?? '0', conceded: stats.conceded ?? '0',
            wickets: stats.wickets ?? '0', maidens: stats.maidens ?? '0',
          });
        }
      }
    }
  }

  return { innings, playingEleven };
}
