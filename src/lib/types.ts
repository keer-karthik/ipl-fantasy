export type Multiplier = 'yellow' | 'green' | 'purple' | 'allin';

export type TeamName =
  | 'Chennai Super Kings'
  | 'Mumbai Indians'
  | 'Royal Challengers Bengaluru'
  | 'Kolkata Knight Riders'
  | 'Delhi Capitals'
  | 'Punjab Kings'
  | 'Rajasthan Royals'
  | 'Sunrisers Hyderabad'
  | 'Gujarat Titans'
  | 'Lucknow Super Giants';

export interface Player {
  name: string;
  role: 'Batter' | 'Bowler' | 'All-rounder' | 'Wicketkeeper/Batter';
}

export interface Fixture {
  match: number;
  date: string;
  time: string;
  home: TeamName;
  away: TeamName;
  venue: string;
}

export interface PlayerPick {
  playerName: string;
  team: TeamName;
  multiplier: Multiplier;
  substituteName?: string;
  substituteTeam?: TeamName;
}

export interface PlayerStats {
  playerName: string;
  // Batting
  didBat: boolean;
  runs: number;
  balls: number;
  dismissed: boolean;
  battingPosition: number; // 1-11
  // Bowling
  didBowl: boolean;
  overs: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  // Fielding
  catches: number;
  stumpings: number;
  runOuts: number;
  // MOM
  isMOM: boolean;
}

export interface PlayerResult extends PlayerStats {
  battingPoints: number;
  bowlingPoints: number;
  fieldingPoints: number;
  momPoints: number;
  rawTotal: number;
  multiplier: Multiplier;
  finalTotal: number;
}

export interface SideEntry {
  picks: PlayerPick[];
  stats: PlayerStats[];
  results: PlayerResult[];
  predictedWinner: TeamName | null;
  allInUsed: boolean;
  total: number;
}

export interface MatchEntry {
  matchId: number;
  isPicksLocked: boolean;
  isComplete: boolean;
  lads: SideEntry;
  gils: SideEntry;
  winner: 'lads' | 'gils' | null;
  actualWinner: TeamName | null;
}

export interface SeasonState {
  matches: Record<number, MatchEntry>;
  ladsAllInUsed: number; // count of all-in uses this season
  gilsAllInUsed: number;
}
