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

  // Return first 3 items so we can inspect field names without huge payload
  const comm = data?.commentary;
  const items = comm?.items?.slice(0, 3) ?? [];
  return NextResponse.json({
    pageCount: comm?.pageCount,
    itemCount: comm?.items?.length,
    topLevelKeys: Object.keys(data ?? {}),
    commKeys: Object.keys(comm ?? {}),
    firstItems: items,
  });
}
