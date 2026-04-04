/**
 * GET /api/reconstruct/[matchId]
 *
 * Fetches ESPN match data + picks from Supabase, runs the chart reconstruction
 * algorithm, stores the result in Supabase, and returns it.
 *
 * Called automatically on LiveScorecard mount. For completed games this runs
 * once and the result is cached in Supabase. For live games the cron job calls
 * this repeatedly so the chart grows even when no browser is open.
 */
import { NextRequest, NextResponse } from 'next/server';
import espnIds from '../../../../../data/espn_ids.json';
import { getSeasonStateRow, upsertSeasonState } from '@/lib/supabase-server';
import { reconstructChartHistory } from '@/lib/chartReconstruct';
import type { PlayerPick, SeasonState } from '@/lib/types';
import type { ChartPoint } from '@/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const numId = parseInt(matchId);
  const espnId = espnIds[matchId as keyof typeof espnIds];

  if (!espnId) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  // ── Fetch ESPN data ──────────────────────────────────────────────────────────
  let espnData: {
    innings: Record<string, { batting: Array<Record<string,string>>; bowling: Array<Record<string,string>> }>;
    commentaries: Array<{ text: string; sequence?: number }>;
    playingEleven: string[];
    status: { isLive: boolean; isComplete: boolean };
  };

  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=${espnId}`,
      { next: { revalidate: 0 } }
    );
    const raw = await res.json();
    espnData = parseEspnSummary(raw);
  } catch (e) {
    return NextResponse.json({ error: 'ESPN fetch failed', detail: String(e) }, { status: 500 });
  }

  // ── Load picks from Supabase ─────────────────────────────────────────────────
  const row = await getSeasonStateRow();
  const state = (row?.state ?? {}) as SeasonState & Record<string, unknown>;
  const matchEntry = state.matches?.[numId];
  const ladsPicks: PlayerPick[] = matchEntry?.lads?.picks ?? [];
  const gilsPicks: PlayerPick[] = matchEntry?.gils?.picks ?? [];

  // ── No picks → return empty (graph won't render; no point storing zeros) ────
  if (ladsPicks.length === 0 && gilsPicks.length === 0) {
    return NextResponse.json([]);
  }

  // ── Run reconstruction ───────────────────────────────────────────────────────
  const reconstructed = reconstructChartHistory(
    espnData.innings,
    espnData.commentaries,
    ladsPicks,
    gilsPicks,
    espnData.playingEleven,
  );

  // ── Merge with existing Supabase chart history (real-time snapshots win) ─────
  const existingCh = (state.chartHistory as Record<string, ChartPoint[]> | undefined) ?? {};
  const existingPts: ChartPoint[] = existingCh[String(numId)] ?? [];

  // Build merged: reconstructed provides coverage; real snapshots override at their seq
  const seqMap = new Map<number, ChartPoint>();
  for (const p of reconstructed) seqMap.set(p.seq, p);
  for (const p of existingPts)    seqMap.set(p.seq, p); // real snapshots win
  const merged = Array.from(seqMap.values()).sort((a, b) => a.seq - b.seq);

  // ── Persist merged history to Supabase ───────────────────────────────────────
  await upsertSeasonState({
    ...state,
    chartHistory: { ...existingCh, [String(numId)]: merged },
  });

  return NextResponse.json(merged);
}

// ── ESPN summary parser (mirrors logic in /api/live/[matchId]) ───────────────
function extractStats(linescores: Array<{
  order: number;
  statistics?: { categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }> }
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
    roster: Array<{
      athlete: { displayName: string };
      linescores?: Array<{ linescores?: Array<unknown> }>;
    }>;
  }>;

  const playingEleven: string[] = rosters.flatMap(r =>
    (r.roster ?? []).map(p => p.athlete?.displayName ?? '').filter(Boolean)
  );

  const teamBatters: Record<string, Array<Record<string,string>>> = {};
  const teamBowlers: Record<string, Array<Record<string,string>>> = {};

  for (const roster of rosters) {
    const teamName = roster.team.displayName;
    teamBatters[teamName] = [];
    teamBowlers[teamName] = [];

    for (const player of roster.roster ?? []) {
      const playerName = player.athlete?.displayName ?? 'Unknown';
      for (const inn of (player.linescores ?? []) as Array<{ linescores?: Array<unknown> }>) {
        type LS = { order: number; statistics?: { categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }> } };
        const stats = extractStats((inn.linescores ?? []) as LS[]);
        if (!stats) continue;
        if (stats.batted === '1') {
          const dc = [stats.dismissalText, stats.dismissalLong, stats.dismissalCard,
            stats.dismissalShortText, stats.dismissalShort, stats.dismissal].filter(Boolean) as string[];
          const dismissal = dc.reduce<string>((a, b) => b.length > a.length ? b : a, dc[0] ?? 'not out');
          teamBatters[teamName].push({
            playerName, runs: stats.runs ?? '0', ballsFaced: stats.ballsFaced ?? '0',
            fours: stats.fours ?? '0', sixes: stats.sixes ?? '0',
            dismissal, battingPosition: stats.battingPosition ?? '1',
          });
        } else if (stats.bowled === '1') {
          teamBowlers[teamName].push({
            playerName, overs: stats.overs ?? '0', conceded: stats.conceded ?? '0',
            wickets: stats.wickets ?? '0', maidens: stats.maidens ?? '0',
            economyRate: stats.economyRate ?? '0',
          });
        }
      }
    }
  }

  // Build innings keyed by batting team (same as live route)
  const headerComp = (summary.header as Record<string,unknown>)?.competitions as unknown[];
  const hc = (Array.isArray(headerComp) ? headerComp[0] : {}) as Record<string,unknown>;
  const commDict = (hc.commentaries ?? {}) as Record<string, { shortText?: string; sequence?: number }>;
  const commentaries = Object.values(commDict)
    .filter(c => c.shortText)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map(c => ({ text: c.shortText ?? '', sequence: c.sequence }));

  // Status from header
  const status = { isLive: false, isComplete: false };

  // Build innings — just use teamBatters/Bowlers keyed by team name
  const innings: Record<string, { batting: Array<Record<string,string>>; bowling: Array<Record<string,string>> }> = {};
  for (const teamName of Object.keys(teamBatters)) {
    if (teamBatters[teamName].length > 0 || teamBowlers[teamName].length > 0) {
      innings[teamName] = {
        batting: teamBatters[teamName],
        bowling: teamBowlers[teamName],
      };
    }
  }

  return { innings, commentaries, playingEleven, status };
}
