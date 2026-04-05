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

  // IPLT20 CDN match summary: IDs are sequential starting at 2417 for our match 1
  const iplt20Id = 2416 + parseInt(matchId, 10);
  const iplt20Url = `https://ipl-stats-sports-mechanic.s3.ap-south-1.amazonaws.com/ipl/feeds/${iplt20Id}-matchsummary.js`;

  try {
    const [summaryRes, scoreboardRes, iplt20Res] = await Promise.all([
      fetch(`https://site.api.espn.com/apis/site/v2/sports/cricket/8048/summary?event=${espnId}`, {
        next: { revalidate: 0 },
      }),
      fetch(`https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard`, {
        next: { revalidate: 0 },
      }),
      fetch(iplt20Url, { next: { revalidate: 0 } }).catch(() => null),
    ]);

    const summary = await summaryRes.json();
    const scoreboard = await scoreboardRes.json();

    // ── IPLT20 Man of the Match ───────────────────────────────────────────────
    // MOM field: "Sameer Rizvi (Delhi Capitals)" — strip team in parens
    let iplt20MOM: string | null = null;
    if (iplt20Res?.ok) {
      try {
        const iplt20Data = await iplt20Res.json();
        const momRaw: string | undefined = iplt20Data?.MatchSummary?.[0]?.MOM;
        if (momRaw) {
          iplt20MOM = momRaw.replace(/\s*\([^)]+\)\s*$/, '').trim() || null;
        }
      } catch { /* ignore parse errors */ }
    }

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
        athlete: { displayName: string; id?: string };
        linescores?: Array<{ linescores?: Array<{ order: number; statistics?: { categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }> }; batting?: { outDetails?: { shortText?: string; fielders?: Array<{ athlete?: { displayName?: string }; isKeeper?: number }> } } }> }>;
      }>;
    }> = summary.rosters ?? [];

    // All players who are in the playing eleven (appeared in rosters regardless of batting/bowling).
    // Players NOT in this list are non-playing squad members — eligible to be substituted.
    const playingEleven: string[] = rosters.flatMap(r =>
      (r.roster ?? []).map(p => p.athlete?.displayName ?? '').filter(Boolean)
    );

    // Build player image map: name → ESPN headshot URL (via athlete.id)
    const playerImageMap: Record<string, string> = {};
    for (const r of rosters) {
      for (const p of r.roster ?? []) {
        const name = p.athlete?.displayName;
        const id = p.athlete?.id;
        if (name && id) {
          playerImageMap[name] = `https://a.espncdn.com/i/headshots/cricket/players/full/${id}.png`;
        }
      }
    }

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
          const innerLinescores = (inningsLs.linescores ?? []) as Array<{
            order: number;
            statistics?: {
              categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }>;
              batting?: {
                outDetails?: {
                  shortText?: string;
                  dismissalCard?: string;
                  fielders?: Array<{ athlete?: { displayName?: string }; isKeeper?: number }>;
                };
              };
            };
          }>;
          const stats = extractStats(innerLinescores);
          if (!stats) continue;

          if (stats.batted === '1') {
            // Get outDetails from the nested statistics.batting for dismissal info
            const mainLs = innerLinescores.find(l => l.order > 0);
            const outDetails = mainLs?.statistics?.batting?.outDetails ?? null;

            // outDetails.shortText = "c †Rickelton b Chahar" or "run out (Bumrah)"
            const dismissalShort = outDetails?.shortText
              ? outDetails.shortText.replace(/&dagger;/g, '†').replace(/&amp;/g, '&')
              : null;
            // Fielder who took the catch/stumping/run-out
            const dismissalFielder = outDetails?.fielders?.[0]?.athlete?.displayName ?? '';

            const dismissal = dismissalShort ?? (stats.dismissal === '1' ? 'out' : 'not out');

            teamBatters[teamName].push({
              playerName,
              runs: stats.runs ?? '0',
              ballsFaced: stats.ballsFaced ?? '0',
              fours: stats.fours ?? '0',
              sixes: stats.sixes ?? '0',
              strikeRate: stats.strikeRate ?? '0',
              dismissal,
              dismissalFielder,
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

    for (const [, info] of Object.entries(periodInfo)) {
      const { battingTeam, bowlingTeam, runs, wickets, overs } = info;
      const oversDisplay = overs % 1 === 0 ? `${overs}` : `${Math.floor(overs)}.${Math.round((overs % 1) * 10)}`;
      innings[battingTeam] = {
        batting: teamBatters[battingTeam] ?? [],
        bowling: teamBowlers[bowlingTeam] ?? [],
        total: `${runs}/${wickets} (${oversDisplay} ov)`,
      };
    }

    // Fallback: scoreboard gone (completed match ESPN marks as "Scheduled").
    // Reconstruct innings from roster stats using inningsNumber.
    if (Object.keys(innings).length === 0) {
      // Find each team's batting innings number from their batters' stats
      const teamInningsNum: Record<string, number> = {};
      for (const roster of rosters) {
        const teamName = roster.team.displayName;
        outer: for (const player of roster.roster ?? []) {
          for (const inningsLs of player.linescores ?? []) {
            const innerLs = (inningsLs.linescores ?? []) as Array<{ order: number; statistics?: { categories?: Array<{ stats?: Array<{ name: string; displayValue: string }> }> } }>;
            const s = extractStats(innerLs);
            if (s?.batted === '1' && s.inningsNumber) {
              teamInningsNum[teamName] = parseInt(s.inningsNumber);
              break outer;
            }
          }
        }
      }
      // Sort teams by when they batted, pair each with the other team as bowlers
      const teams = Object.keys(teamInningsNum).sort((a, b) => teamInningsNum[a] - teamInningsNum[b]);
      for (let i = 0; i < teams.length; i++) {
        const battingTeam = teams[i];
        const bowlingTeam = teams[1 - i] ?? '';
        const batters = teamBatters[battingTeam] ?? [];
        if (batters.length === 0) continue;
        // Estimate total from batter records (sum runs, count dismissals for wickets)
        const runs = batters.reduce((s, b) => s + (parseInt(b.runs ?? '0') || 0), 0);
        const wickets = batters.filter(b => b.dismissal && b.dismissal !== 'not out').length;
        const totalBalls = batters.reduce((s, b) => s + (parseInt(b.ballsFaced ?? '0') || 0), 0);
        const oversDisplay = totalBalls > 0 ? `${Math.floor(totalBalls / 6)}.${totalBalls % 6}` : '20';
        innings[battingTeam] = {
          batting: batters,
          bowling: teamBowlers[bowlingTeam] ?? [],
          total: `${runs}/${wickets} (${oversDisplay} ov)`,
        };
      }
    }

    // ── Man of the Match ──────────────────────────────────────────────────────
    // Primary: IPLT20 CDN matchsummary (already parsed above as iplt20MOM).
    // Fallback: ESPN summary.header.competitions[0].awards (rarely populated).
    const headerComp = summary.header?.competitions?.[0] ?? {};

    let espnMOM: string | null = null;
    const awards: Array<Record<string, unknown>> = headerComp.awards ?? [];
    for (const award of awards) {
      const label = (
        (award.type as Record<string, string> | undefined)?.text ??
        (award.name as string | undefined) ?? ''
      ).toLowerCase();
      if (label.includes('player of the match') || label.includes('man of the match') || label.includes('player of match')) {
        const athletes = (award.athletes ?? award.players ?? []) as Array<Record<string, unknown>>;
        const first = athletes[0];
        if (first) {
          const athlete = (first.athlete as Record<string, string> | undefined) ?? first;
          espnMOM = (athlete.displayName as string | undefined) ?? null;
        }
        break;
      }
    }

    const manOfTheMatch: string | null = iplt20MOM ?? espnMOM;

    // ── Commentary ────────────────────────────────────────────────────────────
    // commentaries is a dict keyed by ID, not an array
    const commDict: Record<string, { shortText?: string; sequence?: number }> = headerComp.commentaries ?? {};
    // Return all commentary — no slice — so the client has the full ball-by-ball picture.
    const commentaries = Object.values(commDict)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map(c => ({ over: '', text: c.shortText ?? '', sequence: c.sequence }))
      .filter(c => c.text);

    return NextResponse.json({
      matchId,
      espnId,
      status: {
        state: status.type?.state ?? 'pre',
        description: status.type?.description ?? status.summary ?? 'Scheduled',
        isLive: status.type?.state === 'in',
        isComplete: status.type?.state === 'post' || status.type?.description === 'Result',
      },
      teams: competitors.map(c => ({
        name: c.team?.displayName,
        linescores: c.linescores,
      })),
      playingEleven,
      innings,
      commentaries,
      playerImageMap,
      actualWinner: (competitors as Array<{ winner?: boolean; team: { displayName: string } }>).find(c => c.winner)?.team?.displayName ?? null,
      manOfTheMatch,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch live data', detail: String(e) }, { status: 500 });
  }
}
