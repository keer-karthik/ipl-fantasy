import fixturesRaw from '../../data/fixtures.json';
import teamsRaw from '../../data/teams.json';
import type { Fixture, Player, TeamName } from './types';

export const fixtures: Fixture[] = fixturesRaw as Fixture[];

export const teams = teamsRaw as Record<TeamName, { shortName: string; color: string; players: Player[] }>;

export const teamNames = Object.keys(teams) as TeamName[];

export function getTeamShort(team: TeamName): string {
  return teams[team]?.shortName ?? team;
}

export function getTeamColor(team: TeamName): string {
  return teams[team]?.color ?? '#888';
}

export function getFixture(matchId: number): Fixture | undefined {
  return fixtures.find(f => f.match === matchId);
}

export function getPlayersForTeams(team1: TeamName, team2: TeamName): Player[] {
  const p1 = teams[team1]?.players ?? [];
  const p2 = teams[team2]?.players ?? [];
  return [
    ...p1.map(p => ({ ...p, team: team1 })),
    ...p2.map(p => ({ ...p, team: team2 })),
  ] as (Player & { team: TeamName })[];
}

export function parseMatchDate(dateStr: string): Date {
  // Format: "28-MAR-26"
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const [day, mon, yr] = dateStr.split('-');
  return new Date(2000 + parseInt(yr), months[mon], parseInt(day));
}

export function formatDate(dateStr: string): string {
  const d = parseMatchDate(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function isUpcoming(dateStr: string): boolean {
  return parseMatchDate(dateStr) >= new Date(new Date().setHours(0, 0, 0, 0));
}

export function isToday(dateStr: string): boolean {
  const d = parseMatchDate(dateStr);
  const today = new Date();
  return d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
}

const IST_MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

export function getMatchStartIST(fixture: Fixture): Date {
  const [day, mon, yr] = fixture.date.split('-');
  const [time, period] = fixture.time.split(' ');
  const [h, m] = time.split(':').map(Number);
  let hours = h;
  if (period === 'PM' && h !== 12) hours += 12;
  if (period === 'AM' && h === 12) hours = 0;
  return new Date(
    `20${yr}-${IST_MONTHS[mon]}-${day.padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`
  );
}

export function hasMatchStarted(fixture: Fixture): boolean {
  return new Date() >= getMatchStartIST(fixture);
}
