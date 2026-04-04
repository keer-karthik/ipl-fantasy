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
import { reconstructChartHistory } from '@/lib/chartReconstruct';
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
  // Accept matches from yesterday onwards (handles late-night games crossing midnight)
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 1);

  const fixtures = fixturesRaw as Array<{ match: number; date: string }>;

  // Determine which matches are "active" (today or yesterday)
  const activeMatchIds = fixtures
    .filter(f => {
      const d = parseMatchDate(f.date);
      return d >= cutoff && d <= today;
    })
    .map(f => f.match);

  if (activeMatchIds.length === 0) {
    return NextResponse.json({ skipped: 'no active matches today' });
  }

  // Load picks from Supabase once
  const row = await getSeasonStateRow();
  const state = (row?.state ?? {}) as SeasonState & Record<string, unknown>;

  const results: Record<number, string> = {};

  for (const matchId of activeMatchIds) {
    const espnId = espnIds[String(matchId) as keyof typeof espnIds];
    if (!espnId) { results[matchId] = 'no espn id'; continue; }

    try {
      const picks = getPicksForMatch(state, matchId);
      if (!picks.ladsPicks.length && !picks.gilsPicks.length) {
        results[matchId] = 'no picks'; continue;
      }

      // Fetch full ESPN summary for this match
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=${espnId}`,
        { next: { revalidate: 0 } }
      );
      const summary = await res.json();
      const { innings, commentaries, playingEleven } = parseEspnSummary(summary);

      // Build chart via reconstruction (works for both live and completed)
      const reconstructed = reconstructChartHistory(
        innings, commentaries,
        picks.ladsPicks, picks.gilsPicks,
        playingEleven,
      );
      if (reconstructed.length === 0) { results[matchId] = 'no commentary'; continue; }

      // Merge with existing snapshots (real-time snapshots win at their seq)
      const existingCh = (state.chartHistory as Record<string, typeof reconstructed> | undefined) ?? {};
      const existing = existingCh[String(matchId)] ?? [];
      const seqMap = new Map(reconstructed.map(p => [p.seq, p]));
      for (const p of existing) seqMap.set(p.seq, p);
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
        type LS = { order: number; statistics?: { categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }> } };
        const stats = extractStats((inn.linescores ?? []) as LS[]);
        if (!stats) continue;
        if (stats.batted === '1') {
          const dc = [stats.dismissalText, stats.dismissalLong, stats.dismissalCard,
            stats.dismissalShort, stats.dismissal].filter(Boolean) as string[];
          const dismissal = dc.reduce<string>((a, b) => b.length > a.length ? b : a, dc[0] ?? 'not out');
          innings[teamName].batting.push({
            playerName, runs: stats.runs ?? '0', ballsFaced: stats.ballsFaced ?? '0',
            dismissal, battingPosition: stats.battingPosition ?? '1',
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

  const hc = ((summary.header as Record<string,unknown>)?.competitions as unknown[])?.[0] as Record<string,unknown> ?? {};
  const commDict = (hc.commentaries ?? {}) as Record<string, { shortText?: string; sequence?: number }>;
  const commentaries = Object.values(commDict)
    .filter(c => c.shortText)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map(c => ({ text: c.shortText ?? '', sequence: c.sequence }));

  return { innings, commentaries, playingEleven };
}
