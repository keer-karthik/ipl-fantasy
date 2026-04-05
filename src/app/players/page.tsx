'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSeasonState } from '@/lib/store';
import { computePlayerStats, computeSideTotal } from '@/lib/stats';
import { fixtures } from '@/lib/data';
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
  if (venueData.length === 0) return null;
  const max = Math.max(...venueData.flatMap(v => [v.lads, v.gils]), 1);
  const BAR_H = 160;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Points by Venue</h3>
      <div className="flex items-end gap-4" style={{ minWidth: venueData.length * 72 }}>
        {venueData.map(v => (
          <div key={v.venue} className="flex flex-col items-center gap-1 flex-1">
            <div className="flex items-end gap-1 w-full justify-center" style={{ height: BAR_H }}>
              {/* Lads bar */}
              <div className="flex flex-col justify-end" style={{ height: BAR_H, flex: 1 }}>
                <div
                  className="rounded-t-md w-full"
                  style={{ height: `${(v.lads / max) * BAR_H}px`, background: LADS, opacity: 0.85 }}
                />
              </div>
              {/* Gils bar */}
              <div className="flex flex-col justify-end" style={{ height: BAR_H, flex: 1 }}>
                <div
                  className="rounded-t-md w-full"
                  style={{ height: `${(v.gils / max) * BAR_H}px`, background: GILS, opacity: 0.85 }}
                />
              </div>
            </div>
            {/* Value labels */}
            <div className="text-[9px] font-bold tabular-nums" style={{ color: LADS }}>{v.lads}</div>
            <div className="text-[9px] font-bold tabular-nums" style={{ color: GILS }}>{v.gils}</div>
            {/* Venue label */}
            <div className="text-[9px] text-gray-400 font-medium text-center leading-tight max-w-[60px]"
              style={{ wordBreak: 'break-word' }}>{v.venue}</div>
          </div>
        ))}
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

// ─── Points per match line chart ──────────────────────────────────────────────
function PerMatchChart({ matchData }: {
  matchData: { matchId: number; lads: number; gils: number }[];
}) {
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

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">Points Per Match</h3>
      <div style={{ minWidth: 400 }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
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
          <path d={`${path('lads')} L${toX(matchData.length - 1)},${zeroY} L${toX(0)},${zeroY} Z`}
            fill={LADS} opacity="0.08" />
          <path d={`${path('gils')} L${toX(matchData.length - 1)},${zeroY} L${toX(0)},${zeroY} Z`}
            fill={GILS} opacity="0.08" />

          {/* Lines */}
          <path d={path('lads')} fill="none" stroke={LADS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={path('gils')} fill="none" stroke={GILS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Match labels on x-axis */}
          {matchData.map((m, i) => (
            (i === 0 || i === matchData.length - 1 || i % Math.ceil(matchData.length / 8) === 0) && (
              <text key={m.matchId} x={toX(i)} y={H - 6} textAnchor="middle"
                style={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}>
                M{m.matchId}
              </text>
            )
          ))}
        </svg>
      </div>
      {/* Legend */}
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

  // Build per-match data
  const matchData = Object.values(state.matches)
    .filter(m => m.isComplete)
    .sort((a, b) => a.matchId - b.matchId)
    .map(m => ({ matchId: m.matchId, lads: computeSideTotal(m, 'lads'), gils: computeSideTotal(m, 'gils') }));

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
