'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { fixtures, formatDate, isToday, isUpcoming } from '@/lib/data';
import { useSeasonState } from '@/lib/store';
import { computeSideTotal } from '@/lib/stats';
import { TeamLogo } from '@/components/TeamBadge';
import type { TeamName } from '@/lib/types';

export default function FixturesPage() {
  const { state, loaded } = useSeasonState();

  if (!loaded) return <div className="text-gray-400 text-center py-20">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl px-6 py-5 shadow-md"
        style={{ background: 'linear-gradient(135deg, var(--ipl-navy) 0%, #0a4fa8 100%)' }}>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">All Fixtures</h1>
        <p className="text-blue-300 text-sm mt-1">70 matches · 28 Mar – 24 May 2026</p>
      </motion.div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500 px-1">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Completed</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Picks set</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" /> Today</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Upcoming</span>
        <span className="flex items-center gap-1.5" style={{ opacity: 0.35, filter: 'grayscale(1)' }}><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Skipped</span>
      </div>

      <div className="space-y-2">
        {fixtures.map((f, idx) => {
          const m = state.matches[f.match];
          const done = m?.isComplete;
          const hasPicks = m?.lads.picks.length > 0;
          const today = isToday(f.date);
          const upcoming = isUpcoming(f.date);
          const isPast = !today && !upcoming;
          const noPicks = !m?.lads.picks.length && !m?.gils.picks.length;
          const skipped = isPast && !done && noPicks;

          let dotColor = 'bg-gray-300';
          let dotExtra = '';
          if (done) { dotColor = 'bg-green-500'; }
          else if (hasPicks) { dotColor = 'bg-amber-400'; }
          else if (today) { dotColor = 'bg-red-500'; dotExtra = 'animate-pulse'; }

          return (
            <motion.div key={f.match}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.01 }}
              style={skipped ? { opacity: 0.35, filter: 'grayscale(1)' } : undefined}>
              <Link href={`/match/${f.match}`}
                className={`flex items-center justify-between rounded-xl p-3 border transition-all hover:shadow-md ${
                  skipped
                    ? 'bg-gray-100 border-gray-200 pointer-events-none'
                    : today
                    ? 'bg-orange-50 border-orange-200 hover:border-orange-300'
                    : done
                    ? 'bg-white border-gray-200 hover:border-gray-300'
                    : 'bg-white border-gray-100 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-400 text-xs w-8 shrink-0 font-mono">M{f.match}</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${dotExtra}`} />
                  <div className="flex items-center gap-2">
                    <TeamLogo team={f.home as TeamName} size={28} />
                    <span className="text-xs text-gray-400 font-medium">vs</span>
                    <TeamLogo team={f.away as TeamName} size={28} />
                  </div>
                  <div className="hidden sm:block min-w-0">
                    <span className="text-sm font-semibold text-gray-700 truncate">
                      {(f.home as string).split(' ').pop()} vs {(f.away as string).split(' ').pop()}
                    </span>
                    {done && m && (
                      <span className="text-xs text-gray-400 ml-3">
                        Lads {computeSideTotal(m, 'lads')} – {computeSideTotal(m, 'gils')} Gils
                        {m.winner && (
                          <span className={`ml-2 font-semibold ${m.winner === 'lads' ? 'text-blue-600' : 'text-pink-600'}`}>
                            ({m.winner === 'lads' ? 'Lads' : 'Gils'} win)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-400 shrink-0 ml-2 text-right">
                  <div className="font-medium text-gray-600">{formatDate(f.date)}</div>
                  <div className="text-gray-400">{f.time} · {f.venue}</div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
