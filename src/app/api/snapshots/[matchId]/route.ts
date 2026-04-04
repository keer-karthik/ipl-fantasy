import { NextRequest, NextResponse } from 'next/server';
import { getChartHistory, appendChartPoint } from '@/lib/supabase-server';
import type { ChartPoint } from '@/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const history = await getChartHistory(parseInt(matchId));
  return NextResponse.json(history);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const point = await req.json() as ChartPoint;
  await appendChartPoint(parseInt(matchId), point);
  return NextResponse.json({ ok: true });
}
