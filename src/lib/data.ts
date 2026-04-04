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
