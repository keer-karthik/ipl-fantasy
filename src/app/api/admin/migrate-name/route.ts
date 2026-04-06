import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sideForEmail } from '@/lib/auth';
import type { SeasonState } from '@/lib/types';

// One-time migration: rename a player across all stored picks and results.
// POST /api/admin/migrate-name  { from: "Old Name", to: "New Name" }
// Requires an authenticated session (same as state route).

export async function POST(request: Request) {
  // Auth check — must be a recognised user
  if (process.env.NODE_ENV !== 'development') {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email || !sideForEmail(user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { from: oldName, to: newName } = await request.json() as { from: string; to: string };
  if (!oldName || !newName) return NextResponse.json({ error: 'from and to required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service.from('season_state').select('state').eq('id', 1).single();
  if (error || !data) return NextResponse.json({ error: 'Failed to load state' }, { status: 500 });

  const state = data.state as SeasonState;
  let changes = 0;

  const rename = (name: string) => {
    if (name === oldName) { changes++; return newName; }
    return name;
  };

  const newMatches = Object.fromEntries(
    Object.entries(state.matches).map(([id, match]) => {
      const patchSide = (side: 'lads' | 'gils') => ({
        ...match[side],
        picks: match[side].picks.map(p => ({
          ...p,
          playerName: rename(p.playerName),
          substituteName: p.substituteName ? rename(p.substituteName) : p.substituteName,
        })),
        results: match[side].results.map(r => ({
          ...r,
          playerName: rename(r.playerName),
        })),
      });
      return [id, { ...match, lads: patchSide('lads'), gils: patchSide('gils') }];
    })
  );

  const newState: SeasonState = { ...state, matches: newMatches };
  const { error: saveErr } = await service
    .from('season_state')
    .upsert({ id: 1, state: newState, updated_at: new Date().toISOString() });

  if (saveErr) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  return NextResponse.json({ ok: true, changes });
}
