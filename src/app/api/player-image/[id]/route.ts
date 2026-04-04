/**
 * GET /api/player-image/[id]
 *
 * Proxy for IPL headshot images from documents.iplt20.com.
 * The CDN has hotlink protection — direct browser requests are blocked.
 * This route fetches server-side with the correct Referer header and
 * caches the result on Vercel's edge for 24 hours.
 *
 * Edge runtime: no cold starts, globally distributed — images load in ~100ms
 * instead of 1–3s per serverless cold start.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validate: only numeric IDs allowed
  if (!/^\d+$/.test(id)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `https://documents.iplt20.com/ipl/IPLHeadshot2026/${id}.png`,
      {
        headers: {
          Referer: 'https://www.iplt20.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        next: { revalidate: 86400 }, // cache 24h on Vercel edge
      },
    );

    if (!upstream.ok) {
      return new NextResponse(null, { status: 404 });
    }

    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
