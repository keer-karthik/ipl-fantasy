import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sideForEmail } from '@/lib/auth';
import type { SeasonState } from '@/lib/types';

// Admin: manually mark a match as complete with a given winner.
// POST /api/admin/mark-complete  { matchId: number, winner: 'lads' | 'gils' | null }

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email || !sideForEmail(user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { matchId, winner } = await request.json() as { matchId: number; winner: 'lads' | 'gils' | null };
  if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service.from('season_state').select('state').eq('id', 1).single();
  if (error || !data) return NextResponse.json({ error: 'Failed to load state' }, { status: 500 });

  const state = data.state as SeasonState;
  const match = state.matches[matchId];
  if (!match) return NextResponse.json({ error: `Match ${matchId} not found` }, { status: 404 });

  const newState: SeasonState = {
    ...state,
    matches: {
      ...state.matches,
      [matchId]: { ...match, isComplete: true, winner: winner ?? null },
    },
  };

  const { error: saveErr } = await service
    .from('season_state')
    .upsert({ id: 1, state: newState, updated_at: new Date().toISOString() });

  if (saveErr) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  return NextResponse.json({ ok: true, matchId, winner });
}
