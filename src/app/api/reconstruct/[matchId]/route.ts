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
import { reconstructChartHistory, type PlaybyPlayEntry } from '@/lib/chartReconstruct';
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

  // ── Fetch ESPN summary (roster/innings/playingEleven) ────────────────────────
  let espnData: {
    innings: Record<string, { batting: Array<Record<string,string>>; bowling: Array<Record<string,string>> }>;
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

  // ── Fetch all pages of playbyplay ────────────────────────────────────────────
  let playbyplay: PlaybyPlayEntry[];
  try {
    playbyplay = await fetchAllPlaybyplay(espnId);
  } catch (e) {
    return NextResponse.json({ error: 'ESPN playbyplay fetch failed', detail: String(e) }, { status: 500 });
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

  // ── Augment playbyplay with fielder info from summary ────────────────────────
  // ESPN's playbyplay often omits dismissal.fielder. Build a batsman→fielder map
  // from the innings summary. Primary: outDetails.fielders (structured). Fallback:
  // parse the dismissal text ("c Archer b Khan") just like liveScoring does.
  function normN(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
  function extractFielderFromText(dismissal: string): string {
    const catchM = dismissal.match(/^c\s+[↑†]?(?!&)(.+?)\s+b\s+/i);
    if (catchM) return catchM[1].trim();
    const stM = dismissal.match(/^st\s+[↑†]?(.+?)\s+b\s+/i);
    if (stM) return stM[1].trim();
    const roM = dismissal.match(/run out\s*\(([^)]+)\)/i);
    if (roM) return roM[1].split('/')[0].trim();
    return '';
  }
  const batsmanToFielder = new Map<string, string>();
  for (const inn of Object.values(espnData.innings)) {
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

  // ── Run reconstruction ───────────────────────────────────────────────────────
  const reconstructed = reconstructChartHistory(
    augmentedPlaybyplay,
    espnData.innings,
    ladsPicks,
    gilsPicks,
    espnData.playingEleven,
  );

  // ── Merge with existing Supabase chart history ─────────────────────────────
  // Reconstruction is the authoritative source (computed fresh from full playbyplay
  // with the latest algorithm including fielding). Existing points only fill any
  // gaps not covered by reconstruction; they do NOT override reconstructed totals.
  const existingCh = (state.chartHistory as Record<string, ChartPoint[]> | undefined) ?? {};
  const existingPts: ChartPoint[] = existingCh[String(numId)] ?? [];

  // Prune stale future points: only keep existing data up to the latest reconstructed
  // over so live matches don't accumulate stale chart data from previous runs.
  // If reconstruction returned nothing (match not started yet), return existing data unchanged.
  if (reconstructed.length === 0) {
    return NextResponse.json(existingPts);
  }
  const maxReconSeq = Math.max(...reconstructed.map(p => p.seq));
  const seqMap = new Map<number, ChartPoint>();
  for (const p of existingPts) {
    if (p.seq <= maxReconSeq) seqMap.set(p.seq, p);  // drop stale future points
  }
  for (const p of reconstructed) {                    // reconstruction always wins
    const existing = seqMap.get(p.seq);
    seqMap.set(p.seq, { ...p, events: p.events ?? existing?.events });
  }
  const merged = Array.from(seqMap.values()).sort((a, b) => a.seq - b.seq);

  // ── Persist merged history to Supabase ───────────────────────────────────────
  await upsertSeasonState({
    ...state,
    chartHistory: { ...existingCh, [String(numId)]: merged },
  });

  return NextResponse.json(merged);
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

// ── ESPN summary parser ───────────────────────────────────────────────────────
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
            stats.dismissalShortText, stats.dismissalShort, stats.dismissal].filter(Boolean) as string[];
          const dismissal = dc.reduce<string>((a, b) => b.length > a.length ? b : a, dc[0] ?? 'not out');
          // Extract fielder from outDetails (same source as live route)
          const mainLs = innerLs.find(l => l.order > 0);
          const dismissalFielder = mainLs?.statistics?.batting?.outDetails?.fielders?.[0]?.athlete?.displayName ?? '';
          teamBatters[teamName].push({
            playerName, runs: stats.runs ?? '0', ballsFaced: stats.ballsFaced ?? '0',
            fours: stats.fours ?? '0', sixes: stats.sixes ?? '0',
            dismissal, battingPosition: stats.battingPosition ?? '1', dismissalFielder,
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

  // Build innings keyed by batting team
  const innings: Record<string, { batting: Array<Record<string,string>>; bowling: Array<Record<string,string>> }> = {};
  for (const teamName of Object.keys(teamBatters)) {
    if (teamBatters[teamName].length > 0 || teamBowlers[teamName].length > 0) {
      innings[teamName] = {
        batting: teamBatters[teamName],
        bowling: teamBowlers[teamName],
      };
    }
  }

  const status = { isLive: false, isComplete: false };
  return { innings, playingEleven, status };
}
