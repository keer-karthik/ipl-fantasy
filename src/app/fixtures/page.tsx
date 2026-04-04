'use client';
import Link from 'next/link';
import { fixtures, formatDate, isToday, isUpcoming } from '@/lib/data';
import { useSeasonState } from '@/lib/store';
import TeamBadge from '@/components/TeamBadge';
import type { TeamName } from '@/lib/types';

export default function FixturesPage() {
  const { state, loaded } = useSeasonState();

  if (!loaded) return <div className="text-gray-500 text-center py-20">Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-yellow-400">All Fixtures — IPL 2026</h1>
      <p className="text-gray-500 text-sm">70 matches · 28 Mar – 24 May 2026</p>

      <div className="space-y-2">
        {fixtures.map(f => {
          const m = state.matches[f.match];
          const done = m?.isComplete;
          const hasPicks = m?.lads.picks.length > 0;
          const today = isToday(f.date);
          const upcoming = isUpcoming(f.date);

          let statusDot = <span className="w-2 h-2 rounded-full bg-gray-700 inline-block" />;
          if (done) statusDot = <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
          else if (hasPicks) statusDot = <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />;
          else if (today) statusDot = <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />;

          return (
            <Link key={f.match} href={`/match/${f.match}`}
              className={`flex items-center justify-between rounded-xl p-3 border transition-colors ${
                today
                  ? 'bg-yellow-400/10 border-yellow-400/40 hover:border-yellow-400/70'
                  : done
                  ? 'bg-gray-900/50 border-gray-800 hover:border-gray-600'
                  : upcoming
                  ? 'bg-gray-900 border-gray-800 hover:border-gray-600'
                  : 'bg-gray-900/30 border-gray-800/50 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-gray-600 text-xs w-6 shrink-0">M{f.match}</span>
                {statusDot}
                <TeamBadge team={f.home as TeamName} />
                <span className="text-gray-600 text-xs">vs</span>
                <TeamBadge team={f.away as TeamName} />
                {done && m && (
                  <span className="text-xs text-gray-500 hidden sm:block">
                    Lads {m.lads.total} – {m.gils.total} Gils
                    {m.winner && <span className={`ml-2 font-semibold ${m.winner === 'lads' ? 'text-blue-400' : 'text-pink-400'}`}>
                      ({m.winner === 'lads' ? 'Lads' : 'Gils'} win)
                    </span>}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 shrink-0 ml-2 text-right">
                <div>{formatDate(f.date)}</div>
                <div className="text-gray-600">{f.time} · {f.venue}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex gap-4 text-xs text-gray-500 pt-2">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Completed</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Picks set</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-700 inline-block" /> Upcoming</span>
      </div>
    </div>
  );
}
