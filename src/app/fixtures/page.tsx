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

  // Group fixtures by date for section headers
  const groups: { date: string; items: { fixture: (typeof fixtures)[number]; globalIdx: number }[] }[] = [];
  let gIdx = 0;
  for (const f of fixtures) {
    const dateStr = formatDate(f.date);
    const last = groups[groups.length - 1];
    if (last && last.date === dateStr) {
      last.items.push({ fixture: f, globalIdx: gIdx++ });
    } else {
      groups.push({ date: dateStr, items: [{ fixture: f, globalIdx: gIdx++ }] });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-navy px-6 py-5 shadow-md relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 bottom-0 w-1.5 bg-ipl-orange" />
        <h1 className="text-2xl font-extrabold text-white tracking-tight">All Fixtures</h1>
        <p className="text-blue-300 text-sm mt-1">70 matches · 28 Mar – 24 May 2026</p>
      </motion.div>

      {/* Date-grouped fixture list */}
      <div>
        {groups.map(group => (
          <div key={group.date}>
            <div className="px-1 pt-5 pb-2 first:pt-0">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em]">{group.date}</span>
            </div>
            <div className="space-y-1.5">
              {group.items.map(({ fixture: f, globalIdx: idx }) => {
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
                else if (today) { dotColor = 'bg-red-500'; dotExtra = 'live-dot'; }

                return (
                  <motion.div
                    key={f.match}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.012, 0.18) }}
                    style={skipped ? { opacity: 0.35, filter: 'grayscale(1)' } : undefined}
                  >
                    <Link
                      href={`/match/${f.match}`}
                      className={`flex items-center justify-between rounded-xl p-3 border transition-transform duration-150 ease-sharp hover:-translate-y-0.5 will-change-transform ${
                        skipped
                          ? 'bg-gray-100 border-gray-200 pointer-events-none'
                          : today
                          ? 'bg-white border-gray-100 [box-shadow:inset_3px_0_0_var(--ipl-orange)]'
                          : done
                          ? 'bg-white border-gray-200'
                          : 'bg-white border-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-gray-300 text-xs w-10 shrink-0 font-bold tabular-nums">M{f.match}</span>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${dotExtra}`} />
                        <div className="flex items-center gap-2">
                          <TeamLogo team={f.home as TeamName} size={28} />
                          <span className="text-xs text-gray-400 font-medium">vs</span>
                          <TeamLogo team={f.away as TeamName} size={28} />
                        </div>
                        <div className="hidden sm:flex items-center min-w-0">
                          <span className="text-sm font-semibold text-gray-700 truncate">
                            {(f.home as string).split(' ').pop()} vs {(f.away as string).split(' ').pop()}
                          </span>
                          {done && m && (
                            <span className="inline-flex items-center gap-1 ml-3 shrink-0">
                              <span className={`tabular-nums font-bold text-xs ${m.winner === 'lads' ? 'text-ipl-orange' : 'text-gray-500'}`}>
                                {computeSideTotal(m, 'lads')}
                              </span>
                              <span className="text-gray-300 text-xs">–</span>
                              <span className={`tabular-nums font-bold text-xs ${m.winner === 'gils' ? 'text-ipl-orange' : 'text-gray-500'}`}>
                                {computeSideTotal(m, 'gils')}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs shrink-0 ml-2 text-right">
                        <div className="font-medium text-gray-600">{f.time}</div>
                        <div className="text-gray-400">{f.venue}</div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
