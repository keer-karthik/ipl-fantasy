import { NextRequest, NextResponse } from 'next/server';
import espnIds from '../../../../../data/espn_ids.json';

// Extract flat stat map from ESPN linescore categories
function extractStats(linescores: Array<{ order: number; statistics?: { categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }> } }>): Record<string, string> | null {
  // Find the linescore entry with actual data (order > 0)
  const ls = linescores.find(l => l.order > 0);
  if (!ls) return null;
  const stats: Record<string, string> = {};
  for (const cat of ls.statistics?.categories ?? []) {
    for (const s of cat.stats ?? []) {
      stats[s.name] = s.displayValue;
    }
  }
  return Object.keys(stats).length > 0 ? stats : null;
}

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

    // ── Status ────────────────────────────────────────────────────────────────
    const sbEvent = scoreboard.events?.find((e: { id: string }) => e.id === espnId);
    const competition = sbEvent?.competitions?.[0] ?? {};
    const status = competition.status ?? {};

    // ── Scoreboard linescores (which team is batting per period) ──────────────
    const competitors: Array<{
      team: { displayName: string };
      linescores?: Array<{ period: number; isBatting: boolean; runs: number; wickets: number; overs: number; isCurrent?: number }>;
    }> = competition.competitors ?? [];

    // Build a map: period → { battingTeam, bowlingTeam, runs, wickets, overs }
    const periodInfo: Record<number, { battingTeam: string; bowlingTeam: string; runs: number; wickets: number; overs: number }> = {};
    for (const comp of competitors) {
      for (const ls of comp.linescores ?? []) {
        if (ls.isBatting) {
          const bowler = competitors.find(c => c.team.displayName !== comp.team.displayName);
          periodInfo[ls.period] = {
            battingTeam: comp.team.displayName,
            bowlingTeam: bowler?.team.displayName ?? '',
            runs: ls.runs ?? 0,
            wickets: ls.wickets ?? 0,
            overs: ls.overs ?? 0,
          };
        }
      }
    }

    // ── Parse rosters for batting/bowling stats ───────────────────────────────
    // rosters: [{team, roster: [{athlete, linescores, ...}]}]
    const rosters: Array<{
      team: { displayName: string };
      roster: Array<{
        athlete: { displayName: string };
        linescores?: Array<{ linescores?: Array<{ order: number; statistics?: { categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }> } }> }>;
      }>;
    }> = summary.rosters ?? [];

    // Per team, collect batting and bowling records
    const teamBatters: Record<string, Array<Record<string, string>>> = {};
    const teamBowlers: Record<string, Array<Record<string, string>>> = {};

    for (const roster of rosters) {
      const teamName = roster.team.displayName;
      teamBatters[teamName] = [];
      teamBowlers[teamName] = [];

      for (const player of roster.roster ?? []) {
        const playerName = player.athlete?.displayName ?? 'Unknown';
        const inningsLinescores = player.linescores ?? [];

        for (const inningsLs of inningsLinescores) {
          const stats = extractStats(inningsLs.linescores ?? []);
          if (!stats) continue;

          if (stats.batted === '1') {
            // Batting record — rename dismissalCard → dismissal for liveScoring.ts
            teamBatters[teamName].push({
              playerName,
              runs: stats.runs ?? '0',
              ballsFaced: stats.ballsFaced ?? '0',
              fours: stats.fours ?? '0',
              sixes: stats.sixes ?? '0',
              strikeRate: stats.strikeRate ?? '0',
              dismissal: stats.dismissalCard ?? 'not out',
              battingPosition: stats.battingPosition ?? '1',
            });
          } else if (stats.bowled === '1') {
            // Bowling record
            teamBowlers[teamName].push({
              playerName,
              overs: stats.overs ?? '0',
              conceded: stats.conceded ?? '0',
              wickets: stats.wickets ?? '0',
              maidens: stats.maidens ?? '0',
              economyRate: stats.economyRate ?? '0',
              bowlingPosition: stats.bowlingPosition ?? '1',
            });
          }
        }
      }

      // Sort batters by position, bowlers by position
      teamBatters[teamName].sort((a, b) => parseInt(a.battingPosition) - parseInt(b.battingPosition));
      teamBowlers[teamName].sort((a, b) => parseInt(a.bowlingPosition) - parseInt(b.bowlingPosition));
    }

    // ── Build innings grouped by batting team ─────────────────────────────────
    const innings: Record<string, {
      batting: Array<Record<string, string>>;
      bowling: Array<Record<string, string>>;
      total: string;
    }> = {};

    for (const [period, info] of Object.entries(periodInfo)) {
      const { battingTeam, bowlingTeam, runs, wickets, overs } = info;
      const oversDisplay = overs % 1 === 0 ? `${overs}` : `${Math.floor(overs)}.${Math.round((overs % 1) * 10)}`;
      innings[battingTeam] = {
        batting: teamBatters[battingTeam] ?? [],
        bowling: teamBowlers[bowlingTeam] ?? [],
        total: `${runs}/${wickets} (${oversDisplay} ov)`,
      };
    }

    // ── Commentary ────────────────────────────────────────────────────────────
    // commentaries is a dict keyed by ID, not an array
    const headerComp = summary.header?.competitions?.[0] ?? {};
    const commDict: Record<string, { shortText?: string; sequence?: number }> = headerComp.commentaries ?? {};
    const commentaries = Object.values(commDict)
      .sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))
      .slice(0, 15)
      .map(c => ({ over: '', text: c.shortText ?? '' }))
      .filter(c => c.text);

    return NextResponse.json({
      matchId,
      espnId,
      status: {
        state: status.type?.state ?? 'pre',
        description: status.type?.description ?? status.summary ?? 'Scheduled',
        isLive: status.type?.state === 'in',
        isComplete: status.type?.state === 'post',
      },
      teams: competitors.map(c => ({
        name: c.team?.displayName,
        linescores: c.linescores,
      })),
      innings,
      commentaries,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch live data', detail: String(e) }, { status: 500 });
  }
}
