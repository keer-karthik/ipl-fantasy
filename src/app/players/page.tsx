'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSeasonState } from '@/lib/store';
import { computePlayerStats, computeSideTotal, computeSideStats } from '@/lib/stats';
import { fixtures, parseMatchDate } from '@/lib/data';
import { iplImageUrl } from '@/lib/playerImage';

const LADS = '#f59e0b';
const GILS = '#7c3aed';

// ─── Small circular avatar with initials fallback ────────────────────────────
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
        <div className="w-full h-full flex items-center justify-center text-white text-xs font-black"
          style={{ background: bg, fontSize: 11 }}>
          {initials}
        </div>
      )}
    </div>
  );
}

// ─── Points by Venue bar chart ────────────────────────────────────────────────
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
            <div key={v.venue} className="flex flex-col items-center gap-1 flex-1 relative"
              onMouseEnter={() => setHoveredVenue(v.venue)}
              onMouseLeave={() => setHoveredVenue(null)}>
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute bottom-full mb-2 left-1/2 z-20 pointer-events-none shadow-xl"
                  style={{ transform: 'translateX(-50%)', minWidth: 120 }}>
                  <div className="bg-gray-900 text-white rounded-xl px-3 py-2.5 text-[11px]">
                    <div className="font-bold text-[12px] mb-1.5 truncate max-w-[140px]">{v.venue}</div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold" style={{ color: LADS }}>Lads</span>
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
                  {/* Arrow */}
                  <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 mx-auto -mt-1.5 rounded-sm" />
                </div>
              )}
              <div className="flex items-end gap-1 w-full justify-center" style={{ height: BAR_H }}>
                {/* Lads bar */}
                <div className="flex flex-col justify-end" style={{ height: BAR_H, flex: 1 }}>
                  <div
                    className="rounded-t-md w-full transition-all duration-150"
                    style={{
                      height: `${(v.lads / max) * BAR_H}px`,
                      background: LADS,
                      opacity: isHovered ? 1 : 0.75,
                      transform: isHovered ? 'scaleY(1.02)' : 'scaleY(1)',
                      transformOrigin: 'bottom',
                    }}
                  />
                </div>
                {/* Gils bar */}
                <div className="flex flex-col justify-end" style={{ height: BAR_H, flex: 1 }}>
                  <div
                    className="rounded-t-md w-full transition-all duration-150"
                    style={{
                      height: `${(v.gils / max) * BAR_H}px`,
                      background: GILS,
                      opacity: isHovered ? 1 : 0.75,
                      transform: isHovered ? 'scaleY(1.02)' : 'scaleY(1)',
                      transformOrigin: 'bottom',
                    }}
                  />
                </div>
              </div>
              {/* Value labels */}
              <div className="text-[9px] font-bold tabular-nums transition-opacity" style={{ color: LADS, opacity: isHovered ? 1 : 0.7 }}>{v.lads}</div>
              <div className="text-[9px] font-bold tabular-nums transition-opacity" style={{ color: GILS, opacity: isHovered ? 1 : 0.7 }}>{v.gils}</div>
              {/* Venue label */}
              <div className={`text-[9px] font-medium text-center leading-tight max-w-[60px] transition-colors ${isHovered ? 'text-gray-700' : 'text-gray-400'}`}
                style={{ wordBreak: 'break-word' }}>{v.venue}</div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex gap-4 mt-4 text-[10px] font-semibold text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: LADS }} /> Lads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: GILS }} /> Gils
        </span>
      </div>
    </div>
  );
}

// ─── Season Race — cumulative points over calendar time ───────────────────────
function SeasonRaceChart({ raceData }: {
  raceData: { date: Date; lads: number; gils: number; matchId: number }[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (raceData.length === 0) return null;

  const W = 560, H = 180, PAD = { l: 44, r: 16, t: 16, b: 28 };
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };

  const today = new Date();
  // Pad the left edge one day before the first match so the first dot isn't flush against the axis
  const startDate = new Date(raceData[0].date.getTime() - 86_400_000);
  const totalMs = today.getTime() - startDate.getTime() || 1;

  const toX = (d: Date) => PAD.l + ((d.getTime() - startDate.getTime()) / totalMs) * inner.w;
  const toY = (v: number) => PAD.t + (1 - (v - minV) / range) * inner.h;

  const allVals = raceData.flatMap(m => [m.lads, m.gils]);
  const rawMin = Math.min(...allVals, 0);
  const rawMax = Math.max(...allVals, 1);
  const vPad = Math.max((rawMax - rawMin) * 0.15, 30);
  const minV = rawMin - vPad, maxV = rawMax + vPad;
  const range = maxV - minV || 1;
  const zeroY = toY(0);

  const ySpan = rawMax - rawMin;
  const yStep = ySpan > 400 ? 100 : ySpan > 200 ? 50 : 25;
  const yTicks: number[] = [0];
  for (let t = yStep; t <= rawMax + yStep; t += yStep) if (t <= rawMax + 5) yTicks.push(t);
  for (let t = -yStep; t >= rawMin - yStep; t -= yStep) if (t >= rawMin - 5) yTicks.push(t);

  // Step-function path: flat between matches, jumps at each match date
  function buildStepPath(key: 'lads' | 'gils') {
    const rightX = toX(today).toFixed(1);
    let d = `M${PAD.l},${zeroY.toFixed(1)}`;
    for (const pt of raceData) {
      d += ` H${toX(pt.date).toFixed(1)} V${toY(pt[key]).toFixed(1)}`;
    }
    d += ` H${rightX}`;
    return d;
  }

  // 5 evenly-spaced date labels across the x-axis
  const xLabels = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
    x: PAD.l + pct * inner.w,
    label: new Date(startDate.getTime() + totalMs * pct)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  }));

  const hovered = hoveredIdx !== null ? raceData[hoveredIdx] : null;
  const tooltipXPct = hoveredIdx !== null
    ? Math.min(Math.max(toX(raceData[hoveredIdx].date) / W * 100, 12), 80)
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Season Race</h3>
      <div style={{ minWidth: 400, position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}
          onMouseLeave={() => setHoveredIdx(null)}>
          {/* Y gridlines */}
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

          {/* Area fills */}
          <path d={`${buildStepPath('lads')} V${zeroY.toFixed(1)} H${PAD.l} Z`}
            fill={LADS} opacity="0.08" />
          <path d={`${buildStepPath('gils')} V${zeroY.toFixed(1)} H${PAD.l} Z`}
            fill={GILS} opacity="0.08" />

          {/* Step lines */}
          <path d={buildStepPath('lads')} fill="none" stroke={LADS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={buildStepPath('gils')} fill="none" stroke={GILS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Hover line */}
          {hoveredIdx !== null && (
            <line x1={toX(raceData[hoveredIdx].date)} y1={PAD.t}
              x2={toX(raceData[hoveredIdx].date)} y2={H - PAD.b}
              stroke="#cbd5e1" strokeWidth={1.2} strokeDasharray="3,2" />
          )}

          {/* Data dots */}
          {raceData.map((m, i) => (
            <g key={m.matchId}>
              <circle cx={toX(m.date)} cy={toY(m.lads)} r={hoveredIdx === i ? 4.5 : 2.5}
                fill={LADS} opacity={hoveredIdx === i ? 1 : 0.35}
                style={{ transition: 'r 0.1s, opacity 0.1s' }} />
              <circle cx={toX(m.date)} cy={toY(m.gils)} r={hoveredIdx === i ? 4.5 : 2.5}
                fill={GILS} opacity={hoveredIdx === i ? 1 : 0.35}
                style={{ transition: 'r 0.1s, opacity 0.1s' }} />
            </g>
          ))}

          {/* Today marker */}
          <line x1={toX(today)} y1={PAD.t} x2={toX(today)} y2={H - PAD.b}
            stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,3" />

          {/* X-axis date labels */}
          {xLabels.map((lbl, i) => (
            <text key={i} x={lbl.x} y={H - 6} textAnchor="middle"
              style={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}>
              {lbl.label}
            </text>
          ))}

          {/* Invisible hit areas for hover — one segment per match */}
          {raceData.map((m, i) => {
            const x = toX(m.date);
            const prevX = i > 0 ? toX(raceData[i - 1].date) : PAD.l;
            const nextX = i < raceData.length - 1 ? toX(raceData[i + 1].date) : toX(today);
            return (
              <rect key={`hit-${m.matchId}`}
                x={(x + prevX) / 2} y={PAD.t}
                width={(x + nextX) / 2 - (x + prevX) / 2} height={inner.h}
                fill="transparent" style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setHoveredIdx(i)} />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered && hoveredIdx !== null && (
          <div className="absolute top-0 z-20 pointer-events-none"
            style={{ left: `${tooltipXPct}%`, transform: 'translateX(-50%)' }}>
            <div className="bg-gray-900 text-white rounded-xl px-3 py-2.5 shadow-xl text-[11px]" style={{ minWidth: 145 }}>
              <div className="font-bold text-[12px] mb-1.5 text-gray-200">
                M{hovered.matchId} · {hovered.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold" style={{ color: LADS }}>Lads</span>
                <span className="font-bold tabular-nums">{hovered.lads > 0 ? `+${hovered.lads}` : hovered.lads}</span>
              </div>
              <div className="flex items-center justify-between gap-4 mt-0.5">
                <span className="font-semibold" style={{ color: '#a78bfa' }}>Gils</span>
                <span className="font-bold tabular-nums">{hovered.gils > 0 ? `+${hovered.gils}` : hovered.gils}</span>
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
          <span className="w-4 h-0.5 inline-block rounded" style={{ background: LADS }} /> Lads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block rounded" style={{ background: GILS }} /> Gils
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StatsPage() {
  const { state, loaded } = useSeasonState();
  const [tab, setTab] = useState<'lads' | 'gils'>('lads');
  const players = computePlayerStats(state, tab);

  if (!loaded) return <div className="text-gray-400 text-center py-20">Loading...</div>;

  // Build per-venue data from completed matches
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

  // Build cumulative points over calendar time for Season Race chart
  const raceData = Object.values(state.matches)
    .filter(m => m.isComplete)
    .sort((a, b) => a.matchId - b.matchId)
    .reduce<{ matchId: number; date: Date; lads: number; gils: number }[]>((acc, m) => {
      const fixture = fixtures.find(f => f.match === m.matchId);
      if (!fixture) return acc;
      const prev = acc[acc.length - 1];
      return [...acc, {
        matchId: m.matchId,
        date: parseMatchDate(fixture.date),
        lads: (prev?.lads ?? 0) + computeSideTotal(m, 'lads'),
        gils: (prev?.gils ?? 0) + computeSideTotal(m, 'gils'),
      }];
    }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl px-6 py-5 shadow-md"
        style={{ background: 'linear-gradient(135deg, var(--ipl-navy) 0%, #0a4fa8 100%)' }}>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Stats</h1>
        <p className="text-blue-300 text-sm mt-1">Season analytics & player stats</p>
      </motion.div>

      {/* Charts */}
      {raceData.length > 0 ? (
        <>
          <SeasonRaceChart raceData={raceData} />
          <VenueChart venueData={venueData} />
        </>
      ) : (
        <div className="text-center py-10 bg-white rounded-2xl border border-gray-100 text-gray-400 text-sm">
          No completed matches yet — charts will appear here.
        </div>
      )}

      {/* Prize Race */}
      {(() => {
        const lads = computeSideStats(state, 'lads');
        const gils = computeSideStats(state, 'gils');

        const prizes = [
          {
            abbrev: 'OC', label: 'Orange Cap', pts: 350, color: '#ea580c',
            ladsTitle: `${lads.totalSeasonRuns} runs`,
            gilsTitle: `${gils.totalSeasonRuns} runs`,
            ladsDetail: lads.orangeCapRuns ? `Top: ${lads.orangeCapRuns.player} ${lads.orangeCapRuns.runs}r` : 'No data',
            gilsDetail: gils.orangeCapRuns ? `Top: ${gils.orangeCapRuns.player} ${gils.orangeCapRuns.runs}r` : 'No data',
            ladsScore: lads.totalSeasonRuns, gilsScore: gils.totalSeasonRuns,
          },
          {
            abbrev: 'PC', label: 'Purple Cap', pts: 350, color: '#7c3aed',
            ladsTitle: `${lads.totalSeasonWickets} wickets`,
            gilsTitle: `${gils.totalSeasonWickets} wickets`,
            ladsDetail: lads.purpleCapWickets ? `Top: ${lads.purpleCapWickets.player} ${lads.purpleCapWickets.wickets}w` : 'No data',
            gilsDetail: gils.purpleCapWickets ? `Top: ${gils.purpleCapWickets.player} ${gils.purpleCapWickets.wickets}w` : 'No data',
            ladsScore: lads.totalSeasonWickets, gilsScore: gils.totalSeasonWickets,
          },
          {
            abbrev: 'STK', label: 'Longest Streak', pts: 350, color: '#003087',
            ladsTitle: `${lads.longestStreak}W streak`,
            gilsTitle: `${gils.longestStreak}W streak`,
            ladsDetail: `Current: ${lads.currentStreak > 0 ? `${lads.currentStreak}W` : lads.currentStreak < 0 ? `${Math.abs(lads.currentStreak)}L` : '—'}`,
            gilsDetail: `Current: ${gils.currentStreak > 0 ? `${gils.currentStreak}W` : gils.currentStreak < 0 ? `${Math.abs(gils.currentStreak)}L` : '—'}`,
            ladsScore: lads.longestStreak, gilsScore: gils.longestStreak,
          },
          {
            abbrev: 'PH', label: 'Purple Hits', pts: 350, color: '#6d28d9',
            ladsTitle: `${lads.purpleHits} hit${lads.purpleHits !== 1 ? 's' : ''}`,
            gilsTitle: `${gils.purpleHits} hit${gils.purpleHits !== 1 ? 's' : ''}`,
            ladsDetail: '3× pick scored highest',
            gilsDetail: '3× pick scored highest',
            ladsScore: lads.purpleHits, gilsScore: gils.purpleHits,
          },
        ];

        return (
          <div>
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">End of Season Prize Race</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {prizes.map(p => {
                const leader = p.ladsScore > p.gilsScore ? 'lads' : p.gilsScore > p.ladsScore ? 'gils' : 'tied';
                const total = p.ladsScore + p.gilsScore || 1;
                const ladsPct = (p.ladsScore / total) * 100;
                return (
                  <div key={p.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-gray-50">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-black text-[15px]" style={{ color: p.color,
                            fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
                            letterSpacing: '0.08em' }}>{p.abbrev}</span>
                          <span className="text-[11px] font-semibold text-gray-500">{p.label}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">+{p.pts} pts end-of-season</div>
                      </div>
                      <div>
                        {leader === 'tied'
                          ? <span className="text-[10px] font-semibold text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">Tied</span>
                          : <span className="text-[10px] font-bold text-white px-2.5 py-0.5 rounded-full"
                              style={{ background: leader === 'lads' ? LADS : GILS }}>
                              {leader === 'lads' ? 'Lads' : 'Gils'} leading
                            </span>
                        }
                      </div>
                    </div>
                    {/* Lads vs Gils */}
                    <div className="grid grid-cols-2 divide-x divide-gray-50">
                      <div className={`px-4 py-3 ${leader === 'lads' ? 'bg-amber-50/40' : ''}`}>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Lads</div>
                        <div className="text-[13px] font-bold truncate" style={{ color: leader === 'lads' ? LADS : '#6b7280' }}>{p.ladsTitle}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 truncate">{p.ladsDetail}</div>
                      </div>
                      <div className={`px-4 py-3 ${leader === 'gils' ? 'bg-violet-50/40' : ''}`}>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Gils</div>
                        <div className="text-[13px] font-bold truncate" style={{ color: leader === 'gils' ? GILS : '#6b7280' }}>{p.gilsTitle}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 truncate">{p.gilsDetail}</div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    {(p.ladsScore > 0 || p.gilsScore > 0) && (
                      <div className="h-1 flex">
                        <div style={{ width: `${ladsPct}%`, background: LADS }} />
                        <div style={{ width: `${100 - ladsPct}%`, background: GILS }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Player stats section */}
      <div>
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Player Stats</h2>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-4">
          {(['lads', 'gils'] as const).map(s => (
            <button key={s} onClick={() => setTab(s)}
              className={`px-6 py-2 rounded-xl font-bold text-sm transition-all shadow-sm ${
                tab === s ? 'text-white' : 'bg-white border border-gray-200 text-gray-500 hover:text-gray-800'
              }`}
              style={tab === s ? { background: s === 'lads' ? LADS : GILS } : {}}>
              {s === 'lads' ? 'Lads' : 'Gils'}
            </button>
          ))}
        </div>

        {players.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 shadow-sm">
            <p className="font-semibold text-gray-600">No match data yet.</p>
            <p className="text-sm text-gray-400 mt-1">Complete some matches to see player stats.</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-2 py-3 font-medium">Player</th>
                    <th className="text-right px-3 py-3 font-medium">M</th>
                    <th className="text-right px-3 py-3 font-medium">Total Pts</th>
                    <th className="text-right px-3 py-3 font-medium">Avg</th>
                    <th className="text-right px-3 py-3 font-medium">Runs</th>
                    <th className="text-right px-3 py-3 font-medium">Wkts</th>
                    <th className="text-right px-3 py-3 font-medium">MOM</th>
                    <th className="text-right px-3 py-3 font-medium">3× Used</th>
                    <th className="text-right px-4 py-3 font-medium">2× Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {players.map((p, i) => (
                    <tr key={p.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-3">
                          <PlayerAvatar name={p.name} />
                          <span className="font-semibold text-gray-800">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-500">{p.matches}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${p.totalPoints >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {p.totalPoints > 0 ? '+' : ''}{p.totalPoints}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium ${p.avgPoints >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
                        {p.avgPoints}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-500">{p.totalRuns}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500">{p.totalWickets}</td>
                      <td className="px-3 py-2.5 text-right">
                        {p.momCount > 0
                          ? <span className="text-amber-500 font-bold">🏅 {p.momCount}</span>
                          : <span className="text-gray-200">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {p.timesAs3x > 0
                          ? <span className="text-purple-600 font-semibold">{p.timesAs3x}× <span className="text-purple-400 font-normal">({p.total3xPoints})</span></span>
                          : <span className="text-gray-200">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {p.timesAs2x > 0
                          ? <span className="text-green-600 font-semibold">{p.timesAs2x}× <span className="text-green-400 font-normal">({p.total2xPoints})</span></span>
                          : <span className="text-gray-200">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
