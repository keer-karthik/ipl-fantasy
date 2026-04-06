import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sideForEmail } from '@/lib/auth';
import { computeSideTotal } from '@/lib/stats';
import type { SeasonState } from '@/lib/types';

// Recomputes winner for one or all completed matches from their stored results.
// POST /api/admin/fix-winner  { matchId?: number }
// Omit matchId to fix all completed matches.

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email || !sideForEmail(user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await request.json() as { matchId?: number };
  const service = createServiceClient();
  const { data, error } = await service.from('season_state').select('state').eq('id', 1).single();
  if (error || !data) return NextResponse.json({ error: 'Failed to load state' }, { status: 500 });

  const state = data.state as SeasonState;
  const fixes: { matchId: number; old: string | null; new: string | null }[] = [];

  const newMatches = Object.fromEntries(
    Object.entries(state.matches).map(([id, match]) => {
      const mid = Number(id);
      if (body.matchId && mid !== body.matchId) return [id, match];
      if (!match.isComplete) return [id, match];

      const lads = computeSideTotal(match, 'lads');
      const gils = computeSideTotal(match, 'gils');
      const newWinner = (lads > gils ? 'lads' : gils > lads ? 'gils' : null) as 'lads' | 'gils' | null;

      if (newWinner !== match.winner) {
        fixes.push({ matchId: mid, old: match.winner ?? null, new: newWinner });
      }
      return [id, { ...match, winner: newWinner }];
    })
  );

  const newState: SeasonState = { ...state, matches: newMatches };
  const { error: saveErr } = await service
    .from('season_state')
    .upsert({ id: 1, state: newState, updated_at: new Date().toISOString() });

  if (saveErr) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  return NextResponse.json({ ok: true, fixes });
}
