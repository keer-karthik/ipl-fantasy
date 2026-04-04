// Server-side only — never import this from client components.
// Wraps createServiceClient() so cron/reconstruct/snapshots routes stay unchanged.

import { createServiceClient } from './supabase/service';

// ── season_state helpers ───────────────────────────────────────────────────────

export interface SeasonStateRow {
  id: number;
  state: Record<string, unknown>;
  updated_at: string;
}

export async function getSeasonStateRow(): Promise<SeasonStateRow | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('season_state')
    .select('*')
    .eq('id', 1)
    .single();
  if (error || !data) return null;
  return data as SeasonStateRow;
}

export async function upsertSeasonState(state: Record<string, unknown>): Promise<void> {
  const service = createServiceClient();
  await service
    .from('season_state')
    .upsert({ id: 1, state, updated_at: new Date().toISOString() });
}

// ── Chart history (stored under state.chartHistory[matchId]) ──────────────────

export interface ChartPoint { seq: number; lads: number; gils: number }

export async function getChartHistory(matchId: number): Promise<ChartPoint[]> {
  const row = await getSeasonStateRow();
  if (!row) return [];
  const ch = row.state.chartHistory as Record<string, ChartPoint[]> | undefined;
  return ch?.[String(matchId)] ?? [];
}

export async function appendChartPoint(matchId: number, point: ChartPoint): Promise<void> {
  const row = await getSeasonStateRow();
  const state = row?.state ?? { matches: {}, gilsAllInUsed: 0, ladsAllInUsed: 0 };
  const ch = (state.chartHistory as Record<string, ChartPoint[]> | undefined) ?? {};
  const existing = ch[String(matchId)] ?? [];

  // Deduplicate by seq — keep the incoming point if seq already exists
  const merged = [...existing.filter(p => p.seq !== point.seq), point];
  merged.sort((a, b) => a.seq - b.seq);

  await upsertSeasonState({ ...state, chartHistory: { ...ch, [String(matchId)]: merged } });
}
