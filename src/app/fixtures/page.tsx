'use client';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Link from 'next/link';
import { fixtures, formatDate, isToday, isUpcoming, getTeamColor } from '@/lib/data';
import { useSeasonState } from '@/lib/store';
import { computeSideTotal } from '@/lib/stats';
import { TeamLogo } from '@/components/TeamBadge';
import type { TeamName } from '@/lib/types';

function DiscountToggle({ matchId, discounted, onToggle }: { matchId: number; discounted: boolean; onToggle: (id: number) => void }) {
  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle(matchId); }}
      title={discounted ? 'Click to include in season totals' : 'Click to exclude from season totals'}
      className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors duration-150 ${
        discounted
          ? 'bg-gray-100 border-gray-300 text-gray-400'
          : 'bg-white border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-400'
      }`}
    >
      {discounted ? 'excluded' : '✕'}
    </button>
  );
}

type FilterTab = 'all' | 'upcoming' | 'completed';

const LADS_COLOR = '#f59e0b';
const GILS_COLOR = '#7c3aed';

export default function FixturesPage() {
  const { state, setState, loaded } = useSeasonState();
  const [tab, setTab] = useState<FilterTab>('all');

  const discountedSet = useMemo(() => new Set(state.discountedMatches ?? []), [state.discountedMatches]);

  function toggleDiscount(matchId: number) {
    setState(prev => {
      const current = new Set(prev.discountedMatches ?? []);
      if (current.has(matchId)) current.delete(matchId);
      else current.add(matchId);
      return { ...prev, discountedMatches: Array.from(current) };
    });
  }

  const counts = useMemo(() => {
    let upcoming = 0, completed = 0;
    for (const f of fixtures) {
      const m = state.matches[f.match];
      if (m?.isComplete) completed++;
      else if (isUpcoming(f.date) || isToday(f.date)) upcoming++;
    }
    return { all: fixtures.length, upcoming, completed };
  }, [state.matches]);

  const filtered = useMemo(() => {
    return fixtures.filter(f => {
      if (tab === 'all') return true;
      const m = state.matches[f.match];
      if (tab === 'completed') return !!m?.isComplete;
      if (tab === 'upcoming') return isUpcoming(f.date) || isToday(f.date);
      return true;
    });
  }, [tab, state.matches]);

  // Group filtered fixtures by date
  const groups = useMemo(() => {
    const result: { date: string; items: { fixture: (typeof fixtures)[number]; globalIdx: number }[] }[] = [];
    let gIdx = 0;
    for (const f of filtered) {
      const dateStr = formatDate(f.date);
      const last = result[result.length - 1];
      if (last && last.date === dateStr) {
        last.items.push({ fixture: f, globalIdx: gIdx++ });
      } else {
        result.push({ date: dateStr, items: [{ fixture: f, globalIdx: gIdx++ }] });
      }
    }
    return result;
  }, [filtered]);

  if (!loaded) return <div className="text-gray-400 text-center py-20">Loading...</div>;

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'completed', label: 'Completed' },
  ];

  const listVariants: Variants = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.65, 0.05, 0, 1] } },
    exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
  };

  return (
    <div className="space-y-5">
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

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="relative px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors duration-150"
          >
            {tab === t.id && (
              <motion.div
                layoutId="fixture-tab"
                className="absolute inset-0 rounded-lg bg-navy"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className={`relative z-10 flex items-center gap-1.5 transition-colors duration-150 ${tab === t.id ? 'text-white' : 'text-gray-500'}`}>
              {t.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {counts[t.id]}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Date-grouped fixture list */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          variants={listVariants}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          {groups.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              No fixtures in this category.
            </div>
          ) : (
            groups.map(group => (
              <div key={group.date}>
                {/* Date group header */}
                <div className="flex items-center gap-3 px-1 pt-5 pb-2 first:pt-0">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 shrink-0">
                    {group.date}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    · {group.items.length} {group.items.length === 1 ? 'match' : 'matches'}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                <div className="space-y-1.5">
                  {group.items.map(({ fixture: f, globalIdx: idx }) => {
                    const m = state.matches[f.match];
                    const done = m?.isComplete;
                    const hasPicks = (m?.lads.picks.length ?? 0) > 0;
                    const today = isToday(f.date);
                    const upcoming = isUpcoming(f.date);
                    const isPast = !today && !upcoming;
                    const noPicks = !m?.lads.picks.length && !m?.gils.picks.length;
                    const skipped = isPast && !done && noPicks;
                    const isDiscounted = discountedSet.has(f.match);

                    const homeColor = getTeamColor(f.home as TeamName);
                    const awayColor = getTeamColor(f.away as TeamName);

                    const ladsTotal = done && m ? computeSideTotal(m, 'lads') : 0;
                    const gilsTotal = done && m ? computeSideTotal(m, 'gils') : 0;
                    const totalPts = ladsTotal + gilsTotal;
                    const ladsPct = totalPts > 0 ? (ladsTotal / totalPts) * 100 : 50;

                    return (
                      <motion.div
                        key={f.match}
                        initial={{ opacity: 0, x: -6, y: 2 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.012, 0.18), duration: 0.25, ease: [0.65, 0.05, 0, 1] }}
                        className="relative"
                        style={(skipped || isDiscounted) ? { opacity: 0.35, filter: 'grayscale(1)' } : undefined}
                      >
                        <Link
                          href={`/match/${f.match}`}
                          className={`flex flex-col rounded-xl border transition-transform duration-150 ease-sharp hover:-translate-y-0.5 will-change-transform relative overflow-hidden ${
                            skipped
                              ? 'bg-gray-50 border-gray-200 pointer-events-none'
                              : today
                              ? 'bg-white border-gray-200 shadow-sm'
                              : done
                              ? 'bg-white border-gray-200'
                              : 'bg-white border-gray-100'
                          }`}
                          style={today ? { boxShadow: '0 0 0 1px rgba(232,70,17,0.2), 0 2px 12px rgba(232,70,17,0.08)' } : undefined}
                        >
                          {/* Split team color strip — top half home, bottom half away */}
                          <div className="absolute left-0 top-0 bottom-0 w-1 overflow-hidden rounded-l-xl">
                            <div className="h-1/2 w-full" style={{ background: homeColor }} />
                            <div className="h-1/2 w-full" style={{ background: awayColor }} />
                          </div>

                          {/* Main row */}
                          <div className="flex items-center justify-between p-3 pl-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-gray-300 text-xs w-10 shrink-0 font-bold tabular-nums">M{f.match}</span>
                              <div className="flex items-center gap-2">
                                <TeamLogo team={f.home as TeamName} size={28} />
                                <span className="text-xs text-gray-400 font-medium">vs</span>
                                <TeamLogo team={f.away as TeamName} size={28} />
                              </div>
                              <div className="hidden sm:block min-w-0">
                                <span className="text-sm font-semibold text-gray-700 truncate">
                                  {(f.home as string).split(' ').pop()} vs {(f.away as string).split(' ').pop()}
                                </span>
                                {today && (
                                  <span className="ml-2 text-[10px] font-black uppercase tracking-wide text-ipl-orange">
                                    Today
                                  </span>
                                )}
                                {hasPicks && !done && !today && (
                                  <span className="ml-2 text-[10px] font-semibold text-amber-500">Picks set</span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs shrink-0 ml-2 text-right">
                              <div className="font-medium text-gray-600">{f.time}</div>
                              <div className="text-gray-400 text-[11px]">{f.venue}</div>
                            </div>
                          </div>

                          {/* Score bar for completed matches */}
                          {done && m && totalPts > 0 && (
                            <div className="px-4 pb-3 pl-4">
                              <div className="flex items-center gap-2">
                                <span className={`tabular-nums text-xs font-bold w-10 ${m.winner === 'lads' ? 'text-ipl-orange' : 'text-gray-400'}`}>
                                  {ladsTotal}
                                </span>
                                <div className="flex-1 h-1 rounded-full overflow-hidden bg-gray-100 relative">
                                  <motion.div
                                    className="h-full rounded-full absolute left-0 top-0"
                                    style={{ background: LADS_COLOR }}
                                    initial={{ width: '50%' }}
                                    animate={{ width: `${ladsPct}%` }}
                                    transition={{ duration: 0.6, ease: [0.65, 0.05, 0, 1], delay: Math.min(idx * 0.012, 0.18) + 0.1 }}
                                  />
                                  <motion.div
                                    className="h-full rounded-full absolute right-0 top-0"
                                    style={{ background: GILS_COLOR }}
                                    initial={{ width: '50%' }}
                                    animate={{ width: `${100 - ladsPct}%` }}
                                    transition={{ duration: 0.6, ease: [0.65, 0.05, 0, 1], delay: Math.min(idx * 0.012, 0.18) + 0.1 }}
                                  />
                                </div>
                                <span className={`tabular-nums text-xs font-bold w-10 text-right ${m.winner === 'gils' ? '' : 'text-gray-400'}`}
                                  style={m.winner === 'gils' ? { color: GILS_COLOR } : undefined}>
                                  {gilsTotal}
                                </span>
                              </div>
                              {m.winner && (
                                <p className="text-[10px] text-gray-400 mt-0.5 pl-12">
                                  {m.winner === 'lads' ? 'Lads' : 'Gils'} won by {Math.abs(ladsTotal - gilsTotal)} pts
                                </p>
                              )}
                            </div>
                          )}
                        </Link>
                        {done && (
                          <div className="absolute bottom-3 right-3 z-10" style={{ pointerEvents: 'auto' }}>
                            <DiscountToggle matchId={f.match} discounted={isDiscounted} onToggle={toggleDiscount} />
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
