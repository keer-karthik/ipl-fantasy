import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sideForEmail } from '@/lib/auth';
import { fixtures, hasMatchStarted } from '@/lib/data';
import type { SeasonState } from '@/lib/types';

const EMPTY_STATE: SeasonState = { matches: {}, ladsAllInUsed: 0, gilsAllInUsed: 0 };

async function getVerifiedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return null;
  const side = sideForEmail(user.email);
  if (!side) return null;
  return { user, side };
}

async function loadState(): Promise<SeasonState> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('season_state')
    .select('state')
    .eq('id', 1)
    .single();
  if (error || !data) return EMPTY_STATE;
  return data.state as SeasonState;
}

export async function GET() {
  const auth = await getVerifiedUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const state = await loadState();
  return NextResponse.json({ state, side: auth.side });
}

export async function PATCH(request: NextRequest) {
  const auth = await getVerifiedUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let newState: SeasonState;
  try {
    const body = await request.json();
    newState = body.state as SeasonState;
    if (!newState || typeof newState.matches !== 'object') throw new Error('Invalid state shape');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Server-enforced pick lock: reject if picks changed after match started
  const oldState = await loadState();
  for (const [id, newMatch] of Object.entries(newState.matches)) {
    const fixture = fixtures.find(f => f.match === Number(id));
    if (!fixture) continue;
    const oldMatch = oldState.matches[Number(id)];
    const picksChanged =
      JSON.stringify(newMatch.lads.picks) !== JSON.stringify(oldMatch?.lads?.picks) ||
      JSON.stringify(newMatch.gils.picks) !== JSON.stringify(oldMatch?.gils?.picks);
    if (picksChanged && hasMatchStarted(fixture)) {
      return NextResponse.json(
        { error: 'Picks are locked — match has started' },
        { status: 403 }
      );
    }
  }

  const service = createServiceClient();
  const { error } = await service
    .from('season_state')
    .update({ state: newState, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: 'Failed to save state' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
