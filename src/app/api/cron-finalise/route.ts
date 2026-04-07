/**
 * GET /api/cron-finalise
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
import { applyMultiplier } from '@/lib/scoring';
import { fixtures, getMatchStartIST } from '@/lib/data';
import type { SeasonState, PlayerPick, MatchEntry, TeamName } from '@/lib/types';

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function computeTotal(match: MatchEntry, side: 'lads' | 'gils'): number {
  const sideData = match[side];
  const hasWinnerBonus = sideData.predictedWinner !== null && sideData.predictedWinner === match.actualWinner;
  const momBonus = sideData.results.filter(r => r.isMOM).length * 10;
  return sideData.results.reduce((s, r) => {
    const raw = r.battingPoints + r.bowlingPoints + r.fieldingPoints;
    return s + Math.round(applyMultiplier(raw, r.multiplier));
  }, 0) + (hasWinnerBonus ? 50 : 0) + momBonus;
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

  const candidates = fixtures.filter(f => {
    const start = getMatchStartIST(f).getTime();
    if (now < start + FOUR_HOURS) return false;
    const m = state.matches?.[f.match];
    if (m?.isComplete) return false;
    return (m?.lads?.picks?.length ?? 0) > 0 || (m?.gils?.picks?.length ?? 0) > 0;
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, finalised: [], skipped: {} });
  }

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const finalised: number[] = [];
  const skipped: Record<number, string> = {};
  let changed = false;

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

      if (ladsPicks.length === 0 && gilsPicks.length === 0) { skipped[matchId] = 'no picks'; continue; }

      const innings = liveData.innings ?? {};
      const playingEleven: string[] = liveData.playingEleven ?? [];
      const manOfTheMatch: string | null = liveData.manOfTheMatch ?? null;
      const actualWinner = (liveData.actualWinner ?? null) as TeamName | null;

      const ladsResults = ladsPicks.length > 0
        ? autoResultFromLive(innings, ladsPicks, playingEleven, manOfTheMatch)
        : (m?.lads?.results ?? []);
      const gilsResults = gilsPicks.length > 0
        ? autoResultFromLive(innings, gilsPicks, playingEleven, manOfTheMatch)
        : (m?.gils?.results ?? []);

      const updatedMatch: MatchEntry = {
        matchId,
        isPicksLocked: true,
        isComplete: true,
        actualWinner,
        winner: null,
        lads: {
          picks: ladsPicks,
          stats: [],
          results: ladsResults,
          predictedWinner: m?.lads?.predictedWinner ?? null,
          allInUsed: m?.lads?.allInUsed ?? false,
          total: 0,
        },
        gils: {
          picks: gilsPicks,
          stats: [],
          results: gilsResults,
          predictedWinner: m?.gils?.predictedWinner ?? null,
          allInUsed: m?.gils?.allInUsed ?? false,
          total: 0,
        },
      };

      const ladsTotal = computeTotal(updatedMatch, 'lads');
      const gilsTotal = computeTotal(updatedMatch, 'gils');
      updatedMatch.winner = ladsTotal > gilsTotal ? 'lads' : gilsTotal > ladsTotal ? 'gils' : null;

      state.matches = { ...state.matches, [matchId]: updatedMatch };
      finalised.push(matchId);
      changed = true;
    } catch (e) {
      skipped[matchId] = `error: ${String(e)}`;
    }
  }

  if (changed) {
    await upsertSeasonState(state as unknown as Record<string, unknown>);
  }

  return NextResponse.json({ ok: true, finalised, skipped });
}
