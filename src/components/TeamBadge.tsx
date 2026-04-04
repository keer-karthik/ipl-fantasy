import { getTeamShort, getTeamColor } from '@/lib/data';
import type { TeamName } from '@/lib/types';

const LOGOS: Record<string, string> = {
  'Chennai Super Kings': 'https://scores.iplt20.com/ipl/teamlogos/CSK.png',
  'Mumbai Indians': 'https://scores.iplt20.com/ipl/teamlogos/MI.png',
  'Royal Challengers Bengaluru': 'https://scores.iplt20.com/ipl/teamlogos/RCB.png',
  'Kolkata Knight Riders': 'https://scores.iplt20.com/ipl/teamlogos/KKR.png',
  'Delhi Capitals': 'https://scores.iplt20.com/ipl/teamlogos/DC.png',
  'Punjab Kings': 'https://scores.iplt20.com/ipl/teamlogos/PBKS.png',
  'Rajasthan Royals': 'https://scores.iplt20.com/ipl/teamlogos/RR.png',
  'Sunrisers Hyderabad': 'https://scores.iplt20.com/ipl/teamlogos/SRH.png',
  'Gujarat Titans': 'https://scores.iplt20.com/ipl/teamlogos/GT.png',
  'Lucknow Super Giants': 'https://scores.iplt20.com/ipl/teamlogos/LSG.png',
};

export function TeamLogo({ team, size = 40 }: { team: TeamName; size?: number }) {
  const color = getTeamColor(team);
  const short = getTeamShort(team);
  const logo = LOGOS[team];
  return (
    <div className="rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow"
      style={{ width: size, height: size, background: color, flexShrink: 0 }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={short} width={size} height={size}
          style={{ objectFit: 'contain', padding: 2 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <span className="text-white font-bold" style={{ fontSize: size * 0.32 }}>{short}</span>
      )}
    </div>
  );
}

export default function TeamBadge({ team, size = 'sm' }: { team: TeamName; size?: 'sm' | 'md' }) {
  const color = getTeamColor(team);
  const short = getTeamShort(team);
  const cls = size === 'md' ? 'px-3 py-1 text-sm font-bold' : 'px-2 py-0.5 text-xs font-semibold';
  return (
    <span className={`${cls} rounded text-white inline-block`} style={{ backgroundColor: color }}>
      {short}
    </span>
  );
}
