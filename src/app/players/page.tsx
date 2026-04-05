'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSeasonState } from '@/lib/store';
import { computePlayerStats, computeSideTotal, computeSideStats } from '@/lib/stats';
import { fixtures } from '@/lib/data';
import { iplImageUrl } from '@/lib/playerImage';

// Chart colour tokens — used only in SVG/canvas contexts where Tailwind can't reach
const LADS_COLOR = '#f59e0b';
const GILS_COLOR = '#7c3aed';

// ─── Player avatar ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#2563eb','#16a34a','#7c3aed','#d97706','#dc2626','#0891b2','#db2777','#65a30d',
];

function PlayerAvatar({ name }: { name: string }) {
  const url = iplImageUrl(name);
  const [ok, setOk] = useState(!!url);

  const initials = name.trim().split(' ')
    .filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const bg = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

  return (
    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-gray-100 bg-gray-50 shadow-sm">
      {url && ok ? (
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover object-top"
          onError={() => setOk(false)}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-white text-[11px] font-black"
          style={{ background: bg }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

// ─── Rank badge ─────────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="w-7 h-7 rounded-full bg-amber-400 text-amber-900 text-xs font-black flex items-center justify-center shadow-sm">
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">
        3
      </span>
    );
  return (
    <span className="w-7 h-7 flex items-center justify-center text-gray-400 text-xs font-mono">
      {rank}
    </span>
  );
}

// ─── Points by Venue bar chart ─────────────────────────────────────────────────
function VenueChart({ venueData }: {
  venueData: { venue: string; lads: number; gils: number }[];
}) {
  const [hoveredVenue, setHoveredVenue] = useState<string | null>(null);
  if (venueData.length === 0) return null;
  const max = Math.max(...venueData.flatMap(v => [v.lads, v.gils]), 1);
  const BAR_H = 160;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Points by Venue</h3>
      <div className="flex items-end gap-4" style={{ minWidth: venueData.length * 72 }}>
        {venueData.map(v => {
          const isHovered = hoveredVenue === v.venue;
          return (
            <div
              key={v.venue}
              className="flex flex-col items-center gap-1 flex-1 relative"
              onMouseEnter={() => setHoveredVenue(v.venue)}
              onMouseLeave={() => setHoveredVenue(null)}
            >
              {isHovered && (
                <div
                  className="absolute bottom-full mb-2 left-1/2 z-20 pointer-events-none shadow-xl"
                  style={{ transform: 'translateX(-50%)', minWidth: 120 }}
                >
                  <div className="bg-gray-900 text-white rounded-xl px-3 py-2.5 text-[11px]">
                    <div className="font-bold text-[12px] mb-1.5 truncate max-w-[140px]">{v.venue}</div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold" style={{ color: LADS_COLOR }}>Lads</span>
                      <span className="font-bold tabular-nums">{v.lads}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-0.5">
                      <span className="font-semibold" style={{ color: '#a78bfa' }}>Gils</span>
                      <span className="font-bold tabular-nums">{v.gils}</span>
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-gray-700 flex items-center justify-between gap-3">
                      <span className="text-gray-400">Total</span>
                      <span className="font-bold tabular-nums text-white">{v.lads + v.gils}</span>
                    </div>
                  </div>
                  <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 mx-auto -mt-1.5 rounded-sm" />
                </div>
              )}
              <div className="flex items-end gap-1 w-full justify-center" style={{ height: BAR_H }}>
                <div className="flex flex-col justify-end" style={{ height: BAR_H, flex: 1 }}>
                  <div
                    className="rounded-t-md w-full transition-all duration-150"
                    style={{
                      height: `${(v.lads / max) * BAR_H}px`,
                      background: LADS_COLOR,
                      opacity: isHovered ? 1 : 0.75,
                      transform: isHovered ? 'scaleY(1.02)' : 'scaleY(1)',
                      transformOrigin: 'bottom',
                    }}
                  />
                </div>
                <div className="flex flex-col justify-end" style={{ height: BAR_H, flex: 1 }}>
                  <div
                    className="rounded-t-md w-full transition-all duration-150"
                    style={{
                      height: `${(v.gils / max) * BAR_H}px`,
                      background: GILS_COLOR,
                      opacity: isHovered ? 1 : 0.75,
                      transform: isHovered ? 'scaleY(1.02)' : 'scaleY(1)',
                      transformOrigin: 'bottom',
                    }}
                  />
                </div>
              </div>
              <div className="text-[9px] font-bold tabular-nums" style={{ color: LADS_COLOR, opacity: isHovered ? 1 : 0.7 }}>{v.lads}</div>
              <div className="text-[9px] font-bold tabular-nums" style={{ color: GILS_COLOR, opacity: isHovered ? 1 : 0.7 }}>{v.gils}</div>
              <div className={`text-[9px] font-medium text-center leading-tight max-w-[60px] ${isHovered ? 'text-gray-700' : 'text-gray-400'}`}
                style={{ wordBreak: 'break-word' }}>{v.venue}</div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-4 text-[10px] font-semibold text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: LADS_COLOR }} /> Lads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: GILS_COLOR }} /> Gils
        </span>
      </div>
    </div>
  );
}

// ─── Cumulative points line chart ──────────────────────────────────────────────
function PerMatchChart({ matchData }: {
  matchData: { matchId: number; lads: number; gils: number }[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (matchData.length < 2) return null;

  const W = 560, H = 180, PAD = { l: 44, r: 16, t: 16, b: 28 };
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };

  const allVals = matchData.flatMap(m => [m.lads, m.gils]);
  const rawMin = Math.min(...allVals, 0);
  const rawMax = Math.max(...allVals, 0);
  const vPad = Math.max((rawMax - rawMin) * 0.15, 30);
  const minV = rawMin - vPad, maxV = rawMax + vPad;
  const range = maxV - minV || 1;

  const toX = (i: number) => PAD.l + (i / (matchData.length - 1)) * inner.w;
  const toY = (v: number) => PAD.t + (1 - (v - minV) / range) * inner.h;
  const zeroY = toY(0);

  function path(key: 'lads' | 'gils') {
    return matchData.map((m, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(m[key]).toFixed(1)}`).join(' ');
  }

  const ySpan = rawMax - rawMin;
  const step = ySpan > 400 ? 100 : ySpan > 200 ? 50 : 25;
  const yTicks: number[] = [0];
  for (let t = step; t <= rawMax + step; t += step) if (t <= rawMax + 5) yTicks.push(t);
  for (let t = -step; t >= rawMin - step; t -= step) if (t >= rawMin - 5) yTicks.push(t);

  const hovered = hoveredIdx !== null ? matchData[hoveredIdx] : null;
  const tooltipXPct = hoveredIdx !== null
    ? Math.min(Math.max(toX(hoveredIdx) / W * 100, 12), 80)
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Cumulative Points</h3>
      <div style={{ minWidth: 400, position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}
          onMouseLeave={() => setHoveredIdx(null)}>
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} y1={toY(v)} x2={W - PAD.r} y2={toY(v)}
                stroke={v === 0 ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={v === 0 ? 1.2 : 0.7}
                strokeDasharray={v === 0 ? '5,4' : undefined} />
              <text x={PAD.l - 6} y={toY(v) + 4} textAnchor="end"
                style={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}>
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          ))}
          <path d={`${path('lads')} L${toX(matchData.length - 1)},${zeroY} L${toX(0)},${zeroY} Z`}
            fill={LADS_COLOR} opacity="0.08" />
          <path d={`${path('gils')} L${toX(matchData.length - 1)},${zeroY} L${toX(0)},${zeroY} Z`}
            fill={GILS_COLOR} opacity="0.08" />
          <path d={path('lads')} fill="none" stroke={LADS_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={path('gils')} fill="none" stroke={GILS_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {hoveredIdx !== null && (
            <line x1={toX(hoveredIdx)} y1={PAD.t} x2={toX(hoveredIdx)} y2={H - PAD.b}
              stroke="#cbd5e1" strokeWidth={1.2} strokeDasharray="3,2" />
          )}
          {matchData.map((m, i) => (
            <g key={m.matchId}>
              <circle cx={toX(i)} cy={toY(m.lads)} r={hoveredIdx === i ? 4.5 : 2.5}
                fill={LADS_COLOR} opacity={hoveredIdx === i ? 1 : 0.35}
                style={{ transition: 'r 0.1s, opacity 0.1s' }} />
              <circle cx={toX(i)} cy={toY(m.gils)} r={hoveredIdx === i ? 4.5 : 2.5}
                fill={GILS_COLOR} opacity={hoveredIdx === i ? 1 : 0.35}
                style={{ transition: 'r 0.1s, opacity 0.1s' }} />
            </g>
          ))}
          {matchData.map((m, i) => (
            (i === 0 || i === matchData.length - 1 || i % Math.ceil(matchData.length / 8) === 0) && (
              <text key={m.matchId} x={toX(i)} y={H - 6} textAnchor="middle"
                style={{ fontSize: 9, fill: hoveredIdx === i ? '#475569' : '#94a3b8', fontWeight: 600 }}>
                M{m.matchId}
              </text>
            )
          ))}
          {matchData.map((m, i) => {
            const x = toX(i);
            const prevX = i > 0 ? toX(i - 1) : x;
            const nextX = i < matchData.length - 1 ? toX(i + 1) : x;
            const left = i === 0 ? PAD.l : (x + prevX) / 2;
            const right = i === matchData.length - 1 ? W - PAD.r : (x + nextX) / 2;
            return (
              <rect key={`hit-${m.matchId}`}
                x={left} y={PAD.t} width={right - left} height={inner.h}
                fill="transparent" style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setHoveredIdx(i)} />
            );
          })}
        </svg>
        {hovered && hoveredIdx !== null && (
          <div className="absolute top-0 z-20 pointer-events-none"
            style={{ left: `${tooltipXPct}%`, transform: 'translateX(-50%)' }}>
            <div className="bg-gray-900 text-white rounded-xl px-3 py-2.5 shadow-xl text-[11px]" style={{ minWidth: 130 }}>
              <div className="font-bold text-[12px] mb-1.5 text-gray-200">Match {hovered.matchId}</div>
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold" style={{ color: LADS_COLOR }}>Lads</span>
                <span className="font-bold tabular-nums">{hovered.lads}</span>
              </div>
              <div className="flex items-center justify-between gap-4 mt-0.5">
                <span className="font-semibold" style={{ color: '#a78bfa' }}>Gils</span>
                <span className="font-bold tabular-nums">{hovered.gils}</span>
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-gray-700 flex items-center justify-between gap-4">
                <span className="text-gray-400">Lead</span>
                <span className={`font-bold tabular-nums ${hovered.lads >= hovered.gils ? 'text-amber-400' : 'text-purple-400'}`}>
                  {hovered.lads >= hovered.gils ? 'Lads' : 'Gils'} +{Math.abs(hovered.lads - hovered.gils)}
                </span>
              </div>
            </div>
            <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 mx-auto -mt-1.5 rounded-sm" />
          </div>
        )}
      </div>
      <div className="flex gap-4 mt-1 text-[10px] font-semibold text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block rounded" style={{ background: LADS_COLOR }} /> Lads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block rounded" style={{ background: GILS_COLOR }} /> Gils
        </span>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function StatsPage() {
  const { state, loaded } = useSeasonState();
  const [tab, setTab] = useState<'lads' | 'gils'>('lads');
  const players = computePlayerStats(state, tab);

  if (!loaded) return <div className="text-gray-400 text-center py-20">Loading...</div>;

  // Points by venue
  const venueMap: Record<string, { lads: number; gils: number }> = {};
  for (const match of Object.values(state.matches)) {
    if (!match.isComplete) continue;
    const fixture = fixtures.find(f => f.match === match.matchId);
    if (!fixture) continue;
    const venue = fixture.venue;
    if (!venueMap[venue]) venueMap[venue] = { lads: 0, gils: 0 };
    venueMap[venue].lads += computeSideTotal(match, 'lads');
    venueMap[venue].gils += computeSideTotal(match, 'gils');
  }
  const venueData = Object.entries(venueMap)
    .map(([venue, pts]) => ({ venue, ...pts }))
    .sort((a, b) => (b.lads + b.gils) - (a.lads + a.gils));

  // Cumulative points per match
  const matchData = Object.values(state.matches)
    .filter(m => m.isComplete)
    .sort((a, b) => a.matchId - b.matchId)
    .reduce<{ matchId: number; lads: number; gils: number }[]>((acc, m) => {
      const prev = acc[acc.length - 1];
      return [...acc, {
        matchId: m.matchId,
        lads: (prev?.lads ?? 0) + computeSideTotal(m, 'lads'),
        gils: (prev?.gils ?? 0) + computeSideTotal(m, 'gils'),
      }];
    }, []);

  const ladsStats = computeSideStats(state, 'lads');
  const gilsStats = computeSideStats(state, 'gils');

  const prizes = [
    {
      abbrev: 'OC', label: 'Orange Cap', pts: 350, dotClass: 'bg-orange-400',
      ladsTitle: `${ladsStats.totalSeasonRuns} runs`,
      gilsTitle: `${gilsStats.totalSeasonRuns} runs`,
      ladsDetail: ladsStats.orangeCapRuns ? `Top: ${ladsStats.orangeCapRuns.player} ${ladsStats.orangeCapRuns.runs}r` : 'No data',
      gilsDetail: gilsStats.orangeCapRuns ? `Top: ${gilsStats.orangeCapRuns.player} ${gilsStats.orangeCapRuns.runs}r` : 'No data',
      ladsScore: ladsStats.totalSeasonRuns, gilsScore: gilsStats.totalSeasonRuns,
    },
    {
      abbrev: 'PC', label: 'Purple Cap', pts: 350, dotClass: 'bg-purple-600',
      ladsTitle: `${ladsStats.totalSeasonWickets} wickets`,
      gilsTitle: `${gilsStats.totalSeasonWickets} wickets`,
      ladsDetail: ladsStats.purpleCapWickets ? `Top: ${ladsStats.purpleCapWickets.player} ${ladsStats.purpleCapWickets.wickets}w` : 'No data',
      gilsDetail: gilsStats.purpleCapWickets ? `Top: ${gilsStats.purpleCapWickets.player} ${gilsStats.purpleCapWickets.wickets}w` : 'No data',
      ladsScore: ladsStats.totalSeasonWickets, gilsScore: gilsStats.totalSeasonWickets,
    },
    {
      abbrev: 'STK', label: 'Longest Streak', pts: 350, dotClass: 'bg-blue-500',
      ladsTitle: `${ladsStats.longestStreak}W streak`,
      gilsTitle: `${gilsStats.longestStreak}W streak`,
      ladsDetail: `Current: ${ladsStats.currentStreak > 0 ? `${ladsStats.currentStreak}W` : ladsStats.currentStreak < 0 ? `${Math.abs(ladsStats.currentStreak)}L` : '—'}`,
      gilsDetail: `Current: ${gilsStats.currentStreak > 0 ? `${gilsStats.currentStreak}W` : gilsStats.currentStreak < 0 ? `${Math.abs(gilsStats.currentStreak)}L` : '—'}`,
      ladsScore: ladsStats.longestStreak, gilsScore: gilsStats.longestStreak,
    },
    {
      abbrev: 'PH', label: 'Purple Hits', pts: 350, dotClass: 'bg-violet-500',
      ladsTitle: `${ladsStats.purpleHits} hit${ladsStats.purpleHits !== 1 ? 's' : ''}`,
      gilsTitle: `${gilsStats.purpleHits} hit${gilsStats.purpleHits !== 1 ? 's' : ''}`,
      ladsDetail: '3× pick scored highest',
      gilsDetail: '3× pick scored highest',
      ladsScore: ladsStats.purpleHits, gilsScore: gilsStats.purpleHits,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-navy px-6 py-5 shadow-md"
      >
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Stats</h1>
        <p className="text-blue-300 text-sm mt-1">Season analytics & player stats</p>
      </motion.div>

      {/* Charts */}
      {matchData.length > 0 ? (
        <>
          <PerMatchChart matchData={matchData} />
          <VenueChart venueData={venueData} />
        </>
      ) : (
        <div className="text-center py-10 bg-white rounded-2xl border border-gray-100 text-gray-400 text-sm">
          No completed matches yet — charts will appear here.
        </div>
      )}

      {/* Prize Race */}
      <div>
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">End of Season Prize Race</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {prizes.map(p => {
            const leader = p.ladsScore > p.gilsScore ? 'lads' : p.gilsScore > p.ladsScore ? 'gils' : 'tied';
            const total = p.ladsScore + p.gilsScore || 1;
            const ladsPct = (p.ladsScore / total) * 100;
            return (
              <div key={p.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-gray-50">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className={`w-2 h-2 rounded-full inline-block ${p.dotClass}`} />
                      <span className="font-black text-[15px] text-gray-900 tracking-wide">{p.abbrev}</span>
                      <span className="text-[11px] font-semibold text-gray-500">{p.label}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">+{p.pts} pts end-of-season</div>
                  </div>
                  <div>
                    {leader === 'tied'
                      ? <span className="text-[10px] font-semibold text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">Tied</span>
                      : <span className={`text-[10px] font-bold text-white px-2.5 py-0.5 rounded-full ${leader === 'lads' ? 'bg-amber-400' : 'bg-violet-600'}`}>
                          {leader === 'lads' ? 'Lads' : 'Gils'} leading
                        </span>
                    }
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-gray-50">
                  <div className={`px-4 py-3 ${leader === 'lads' ? 'bg-amber-50/40' : ''}`}>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Lads</div>
                    <div className={`text-[13px] font-bold truncate ${leader === 'lads' ? 'text-amber-500' : 'text-gray-500'}`}>{p.ladsTitle}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">{p.ladsDetail}</div>
                  </div>
                  <div className={`px-4 py-3 ${leader === 'gils' ? 'bg-violet-50/40' : ''}`}>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Gils</div>
                    <div className={`text-[13px] font-bold truncate ${leader === 'gils' ? 'text-violet-600' : 'text-gray-500'}`}>{p.gilsTitle}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">{p.gilsDetail}</div>
                  </div>
                </div>
                {(p.ladsScore > 0 || p.gilsScore > 0) && (
                  <div className="h-1 flex">
                    <div className="bg-amber-400" style={{ width: `${ladsPct}%` }} />
                    <div className="bg-violet-600" style={{ width: `${100 - ladsPct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Player Stats table */}
      <div>
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Player Stats</h2>

        {/* Tab switcher with sliding indicator */}
        <div className="flex bg-white rounded-xl p-1 border border-gray-200 shadow-sm w-fit mb-4">
          {(['lads', 'gils'] as const).map(s => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className="relative px-8 py-2 rounded-lg text-sm font-bold"
            >
              {tab === s && (
                <motion.div
                  layoutId="stats-tab-indicator"
                  className={`absolute inset-0 rounded-lg ${s === 'lads' ? 'bg-amber-400' : 'bg-violet-600'}`}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <span className={`relative z-10 transition-colors duration-150 ${tab === s ? 'text-white' : 'text-gray-500'}`}>
                {s === 'lads' ? 'Lads' : 'Gils'}
              </span>
            </button>
          ))}
        </div>

        {players.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <p className="font-semibold text-gray-500">No match data yet</p>
            <p className="text-sm text-gray-400 mt-1">Complete some matches to see player stats.</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-4 py-3 font-medium">#</th>
                      <th className="text-left px-2 py-3 font-medium">Player</th>
                      <th className="text-right px-3 py-3 font-medium">M</th>
                      <th className="text-right px-3 py-3 font-medium">Total Pts</th>
                      <th className="text-right px-3 py-3 font-medium">Avg</th>
                      <th className="text-right px-3 py-3 font-medium">Runs</th>
                      <th className="text-right px-3 py-3 font-medium">Wkts</th>
                      <th className="text-right px-3 py-3 font-medium">MOM</th>
                      <th className="text-right px-3 py-3 font-medium">3×</th>
                      <th className="text-right px-4 py-3 font-medium">2×</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {players.map((p, i) => (
                      <tr key={p.name} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-2.5">
                          <RankBadge rank={i + 1} />
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-3">
                            <PlayerAvatar name={p.name} />
                            <span className="font-semibold text-gray-900">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">{p.matches}</td>
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${p.totalPoints >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {p.totalPoints > 0 ? '+' : ''}{p.totalPoints}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{p.avgPoints}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{p.totalRuns}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{p.totalWickets}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {p.momCount > 0
                            ? <span className="font-bold text-amber-500">{p.momCount}</span>
                            : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {p.timesAs3x > 0
                            ? <span className="text-purple-600 font-semibold">{p.timesAs3x}<span className="text-purple-300 font-normal text-xs ml-1">({p.total3xPoints})</span></span>
                            : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {p.timesAs2x > 0
                            ? <span className="text-emerald-600 font-semibold">{p.timesAs2x}<span className="text-emerald-300 font-normal text-xs ml-1">({p.total2xPoints})</span></span>
                            : <span className="text-gray-200">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
