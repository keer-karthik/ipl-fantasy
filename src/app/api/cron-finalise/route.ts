/**
 * GET /api/cron/finalise-matches
 *
 * Called every 15 minutes by cron-job.org.
 * Finds matches that have been over for 4+ hours, checks ESPN for completion,
 * and auto-finalises them (computes results + sets isComplete) without needing
 * anyone to open the match page.
 *
 * Protected by CRON_SECRET env var — set the same value in cron-job.org headers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSeasonStateRow, upsertSeasonState } from '@/lib/supabase-server';
import { autoResultFromLive } from '@/lib/liveScoring';
import { computeSideTotal } from '@/lib/stats';
import { fixtures, getMatchStartIST } from '@/lib/data';
import type { SeasonState, PlayerPick, TeamName } from '@/lib/types';

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev — no secret configured
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const row = await getSeasonStateRow();
  if (!row) return NextResponse.json({ error: 'Failed to load state' }, { status: 500 });

  const state = row.state as unknown as SeasonState;
  const now = Date.now();
  const FOUR_HOURS = 4 * 60 * 60 * 1000;

  // Find matches that started 4+ hours ago, aren't complete yet, and have picks on at least one side
  const candidates = fixtures.filter(f => {
    const start = getMatchStartIST(f).getTime();
    if (now < start + FOUR_HOURS) return false; // too early
    const m = state.matches?.[f.match];
    if (m?.isComplete) return false; // already done
    const hasPicks = (m?.lads?.picks?.length ?? 0) > 0 || (m?.gils?.picks?.length ?? 0) > 0;
    return hasPicks;
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, finalised: [] });
  }

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const finalised: number[] = [];
  const skipped: Record<number, string> = {};

  for (const fixture of candidates) {
    const matchId = fixture.match;
    try {
      const liveRes = await fetch(`${base}/api/live/${matchId}`, { cache: 'no-store' });
      if (!liveRes.ok) { skipped[matchId] = `live fetch ${liveRes.status}`; continue; }
      const liveData = await liveRes.json();

      if (!liveData.status?.isComplete) { skipped[matchId] = 'not complete yet'; continue; }

      const m = state.matches?.[matchId];
      const ladsPicks: PlayerPick[] = m?.lads?.picks ?? [];
      const gilsPicks: PlayerPick[] = m?.gils?.picks ?? [];

      // Need picks on at least one side to finalise
      if (ladsPicks.length === 0 && gilsPicks.length === 0) { skipped[matchId] = 'no picks'; continue; }

      const innings = liveData.innings ?? {};
      const playingEleven: string[] = liveData.playingEleven ?? [];
      const manOfTheMatch: string | null = liveData.manOfTheMatch ?? null;
      const actualWinner = (liveData.actualWinner ?? null) as TeamName | null;

      const ladsResults = ladsPicks.length > 0
        ? autoResultFromLive(innings, ladsPicks, playingEleven, manOfTheMatch)
        : m?.lads?.results ?? [];
      const gilsResults = gilsPicks.length > 0
        ? autoResultFromLive(innings, gilsPicks, playingEleven, manOfTheMatch)
        : m?.gils?.results ?? [];

      // Build updated match entry
      const updatedMatch = {
        ...(m ?? { matchId, isPicksLocked: true, lads: { picks: [], stats: [], results: [], predictedWinner: null, allInUsed: false, total: 0 }, gils: { picks: [], stats: [], results: [], predictedWinner: null, allInUsed: false, total: 0 }, winner: null, actualWinner: null }),
        isComplete: true,
        actualWinner,
        lads: { ...(m?.lads ?? {}), picks: ladsPicks, stats: [], results: ladsResults },
        gils: { ...(m?.gils ?? {}), picks: gilsPicks, stats: [], results: gilsResults },
      };

      // Compute winner from fresh results
      const tempState = { ...state, matches: { ...state.matches, [matchId]: updatedMatch } } as SeasonState;
      const ladsTotal = computeSideTotal(tempState.matches[matchId], 'lads');
      const gilsTotal = computeSideTotal(tempState.matches[matchId], 'gils');
      const winner = ladsTotal > gilsTotal ? 'lads' : gilsTotal > ladsTotal ? 'gils' : null;

      state.matches = {
        ...state.matches,
        [matchId]: { ...updatedMatch, winner } as typeof updatedMatch & { winner: typeof winner },
      };

      finalised.push(matchId);
    } catch (e) {
      skipped[matchId] = `error: ${String(e)}`;
    }
  }

  if (finalised.length > 0) {
    await upsertSeasonState(state as unknown as Record<string, unknown>);
  }

  return NextResponse.json({ ok: true, finalised, skipped });
}
