import { NextRequest, NextResponse } from 'next/server';
import espnIds from '../../../../../data/espn_ids.json';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const espnId = espnIds[matchId as keyof typeof espnIds];

  if (!espnId) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  }

  try {
    const [summaryRes, scoreboardRes] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=${espnId}`, {
        next: { revalidate: 0 },
      }),
      fetch(`https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard`, {
        next: { revalidate: 0 },
      }),
    ]);

    const summary = await summaryRes.json();
    const scoreboard = await scoreboardRes.json();

    // Find this event in scoreboard
    const event = scoreboard.events?.find((e: { id: string }) => e.id === espnId);
    const competition = event?.competitions?.[0] ?? {};
    const status = competition.status ?? {};

    // Parse matchcards for batting (typeID 11) and bowling (typeID 12)
    const matchcards: Array<{
      typeID: number;
      teamName: string;
      total: string;
      runs: string;
      extras: string;
      playerDetails: Array<Record<string, string>>;
    }> = summary.matchcards ?? [];

    const innings = matchcards
      .filter(c => c.typeID === 11 || c.typeID === 12)
      .reduce((acc: Record<string, { batting: Array<Record<string, string>>; bowling: Array<Record<string, string>>; total: string; runs: string }>, card) => {
        const key = card.teamName;
        if (!acc[key]) acc[key] = { batting: [], bowling: [], total: '', runs: '' };
        if (card.typeID === 11) {
          acc[key].batting = card.playerDetails ?? [];
          acc[key].total = card.total ?? '';
          acc[key].runs = card.runs ?? '';
        }
        if (card.typeID === 12) {
          acc[key].bowling = card.playerDetails ?? [];
        }
        return acc;
      }, {});

    // Commentary (latest 10)
    const commentaries = competition.commentaries?.slice(0, 10) ?? [];

    return NextResponse.json({
      matchId,
      espnId,
      status: {
        state: status.type?.state ?? 'pre',
        description: status.type?.description ?? 'Scheduled',
        isLive: status.type?.state === 'in',
        isComplete: status.type?.state === 'post',
      },
      teams: (competition.competitors ?? []).map((c: { homeAway: string; team: { displayName: string; abbreviation: string }; score: string }) => ({
        homeAway: c.homeAway,
        name: c.team?.displayName,
        abbr: c.team?.abbreviation,
        score: c.score,
      })),
      innings,
      commentaries,
      headline: competition.description ?? '',
    });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch live data', detail: String(e) }, { status: 500 });
  }
}
