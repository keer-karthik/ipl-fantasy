import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sideForEmail } from '@/lib/auth';
import type { SeasonState, PlayerPick } from '@/lib/types';

// Admin: overwrite picks for a match on one or both sides, bypassing pick lock.
// POST /api/admin/patch-picks
// Body: {
//   matchId: number,
//   lads?: PlayerPick[],           // full replacement, or omit to leave unchanged
//   gilsPatches?: {                // per-player patches; other picks left unchanged
//     playerName: string;
//     multiplier?: string;
//     substituteName?: string | null;
//   }[]
// }

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email || !sideForEmail(user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await request.json() as {
    matchId: number;
    lads?: PlayerPick[];
    gilsPatches?: { playerName: string; multiplier?: string; substituteName?: string | null }[];
  };
  const { matchId, lads: newLadsPicks, gilsPatches } = body;
  if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service.from('season_state').select('state').eq('id', 1).single();
  if (error || !data) return NextResponse.json({ error: 'Failed to load state' }, { status: 500 });

  const state = data.state as SeasonState;
  const match = state.matches[matchId];
  if (!match) return NextResponse.json({ error: `Match ${matchId} not found in state` }, { status: 404 });

  // Apply lads picks replacement
  const updatedLads = newLadsPicks
    ? { ...match.lads, picks: newLadsPicks }
    : match.lads;

  // Apply gils patches (per-player multiplier/sub changes)
  let updatedGilsPicks = match.gils.picks;
  if (gilsPatches) {
    updatedGilsPicks = match.gils.picks.map(p => {
      const patch = gilsPatches.find(g => g.playerName === p.playerName);
      if (!patch) return p;
      return {
        ...p,
        ...(patch.multiplier !== undefined ? { multiplier: patch.multiplier as PlayerPick['multiplier'] } : {}),
        ...(patch.substituteName !== undefined ? { substituteName: patch.substituteName ?? undefined } : {}),
      };
    });
  }
  const updatedGils = { ...match.gils, picks: updatedGilsPicks };

  const newState: SeasonState = {
    ...state,
    matches: {
      ...state.matches,
      [matchId]: { ...match, lads: updatedLads, gils: updatedGils },
    },
  };

  const { error: saveErr } = await service
    .from('season_state')
    .upsert({ id: 1, state: newState, updated_at: new Date().toISOString() });

  if (saveErr) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  return NextResponse.json({ ok: true, lads: updatedLads.picks, gils: updatedGilsPicks });
}
