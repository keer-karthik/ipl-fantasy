/**
 * GET /api/debug/espn/[matchId]
 *
 * Returns raw ESPN playbyplay page 1 for debugging field name discovery.
 * Remove this file after confirming field names are correct.
 */
import { NextRequest, NextResponse } from 'next/server';
import espnIds from '../../../../../../data/espn_ids.json';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const espnId = espnIds[matchId as keyof typeof espnIds];
  if (!espnId) return NextResponse.json({ error: 'no espn id' }, { status: 404 });

  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/cricket/8048/playbyplay?event=${espnId}&page=1`,
    { next: { revalidate: 0 } }
  );
  if (!res.ok) return NextResponse.json({ error: 'espn error', status: res.status }, { status: 502 });
  const data = await res.json();

  const comm = data?.commentary;
  const items: unknown[] = comm?.items ?? [];

  // Find first dismissal ball to inspect dismissal.text structure
  const dismissalBalls = (items as Array<Record<string,unknown>>)
    .filter((i: Record<string,unknown>) => (i.dismissal as Record<string,unknown>)?.dismissal === true)
    .slice(0, 3);

  // Also show raw summary stats for first batter to find all dismissal fields
  const summaryRes = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=${espnId}`,
    { next: { revalidate: 0 } }
  );
  const summary = await summaryRes.json();
  const rosters = (summary?.rosters ?? []) as Array<{roster: Array<{athlete:{displayName:string}; linescores?: unknown[]}>}>;
  const firstRoster = rosters[0]?.roster ?? [];
  // Find a player who batted (has linescores)
  const battedPlayer = firstRoster.find((p) => (p.linescores as unknown[] | undefined)?.length);
  const rawStats = battedPlayer ? { name: battedPlayer.athlete.displayName, linescores: battedPlayer.linescores } : null;

  return NextResponse.json({
    pageCount: comm?.pageCount,
    itemCount: items.length,
    dismissalBalls,
    summaryBatterSample: rawStats,
  });
}
