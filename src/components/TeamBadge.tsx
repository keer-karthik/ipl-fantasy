import { getTeamShort, getTeamColor } from '@/lib/data';
import type { TeamName } from '@/lib/types';

export default function TeamBadge({ team, size = 'sm' }: { team: TeamName; size?: 'sm' | 'md' }) {
  const color = getTeamColor(team);
  const short = getTeamShort(team);
  const cls = size === 'md' ? 'px-3 py-1 text-sm font-bold' : 'px-2 py-0.5 text-xs font-semibold';
  return (
    <span
      className={`${cls} rounded text-white inline-block`}
      style={{ backgroundColor: color }}
    >
      {short}
    </span>
  );
}
