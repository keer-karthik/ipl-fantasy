/**
 * POST /api/refinalize-all
 *
 * Re-scores every completed match using the current scoring rules in scoring.ts.
 * Call this after any rule change to propagate updated points across all past matches.
 *
 * For each match with picks:
 *   1. Fetches live ESPN data (innings + playingEleven + actualWinner)
 *   2. Re-runs autoResultFromLive() with current scoring.ts rules
 *   3. Recomputes totals + winner
 *   4. Writes updated results back to Supabase
 *
 * Auth: requires a valid logged-in session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sideForEmail } from '@/lib/auth';
import { autoResultFromLive } from '@/lib/liveScoring';
import { getSeasonStateRow, upsertSeasonState } from '@/lib/supabase-server';
import type { PlayerPick, TeamName } from '@/lib/types';
import type { LiveData } from '@/hooks/useLiveScore';

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sideForEmail(user.email)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { origin } = new URL(req.url);

  // ── Load current state ────────────────────────────────────────────────────────
  const row = await getSeasonStateRow();
  const state = (row?.state ?? {}) as Record<string, unknown>;
  const matches = (state.matches ?? {}) as Record<string, Record<string, unknown>>;

  const updatedMatches: Record<string, unknown> = {};
  let updated = 0, skipped = 0, failed = 0;

  for (const [matchIdStr, matchEntry] of Object.entries(matches)) {
    const ladsPicks = (matchEntry.lads as Record<string, unknown>)?.picks as PlayerPick[] ?? [];
    const gilsPicks = (matchEntry.gils as Record<string, unknown>)?.picks as PlayerPick[] ?? [];

    if (ladsPicks.length === 0 || gilsPicks.length === 0) {
      updatedMatches[matchIdStr] = matchEntry;
      skipped++;
      continue;
    }

    try {
      const liveRes = await fetch(`${origin}/api/live/${matchIdStr}`, {
        next: { revalidate: 0 },
      });

      if (!liveRes.ok) {
        updatedMatches[matchIdStr] = matchEntry;
        failed++;
        continue;
      }

      const liveData = await liveRes.json() as {
        innings: LiveData['innings'];
        playingEleven: string[];
        actualWinner: string | null;
        status: { isComplete: boolean };
      };

      // Skip matches that haven't completed yet
      if (!liveData.status.isComplete || Object.keys(liveData.innings).length === 0) {
        updatedMatches[matchIdStr] = matchEntry;
        skipped++;
        continue;
      }

      const actualWinner = liveData.actualWinner as TeamName | null;
      const ladsPrediction = (matchEntry.lads as Record<string, unknown>)?.predictedWinner as TeamName | null;
      const gilsPrediction = (matchEntry.gils as Record<string, unknown>)?.predictedWinner as TeamName | null;
      const ladsCorrect = !!ladsPrediction && ladsPrediction === actualWinner;
      const gilsCorrect = !!gilsPrediction && gilsPrediction === actualWinner;

      const ladsResults = autoResultFromLive(liveData.innings, ladsPicks, liveData.playingEleven ?? []);
      const gilsResults = autoResultFromLive(liveData.innings, gilsPicks, liveData.playingEleven ?? []);
      const ladsTotal = Math.round(ladsResults.reduce((s, r) => s + r.finalTotal, 0)) + (ladsCorrect ? 50 : 0);
      const gilsTotal = Math.round(gilsResults.reduce((s, r) => s + r.finalTotal, 0)) + (gilsCorrect ? 50 : 0);
      const winner = ladsTotal > gilsTotal ? 'lads' : gilsTotal > ladsTotal ? 'gils' : null;

      updatedMatches[matchIdStr] = {
        ...matchEntry,
        isComplete: true,
        actualWinner,
        winner,
        lads: { ...(matchEntry.lads as object), results: ladsResults, total: ladsTotal },
        gils: { ...(matchEntry.gils as object), results: gilsResults, total: gilsTotal },
      };
      updated++;
    } catch {
      updatedMatches[matchIdStr] = matchEntry;
      failed++;
    }
  }

  await upsertSeasonState({ ...state, matches: updatedMatches });

  return NextResponse.json({ ok: true, updated, skipped, failed });
}
