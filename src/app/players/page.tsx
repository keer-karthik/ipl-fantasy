'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSeasonState } from '@/lib/store';
import { computePlayerStats, computeSideTotal, computeSideStats } from '@/lib/stats';
import type { PlayerSeasonStat } from '@/lib/stats';
import { fixtures, parseMatchDate, isToday, hasMatchStarted } from '@/lib/data';
import { iplImageUrl } from '@/lib/playerImage';
import { applyMultiplier } from '@/lib/scoring';
import { createClient } from '@/lib/supabase/client';
import type { SeasonState } from '@/lib/types';

const LADS_COLOR = '#f59e0b';
const GILS_COLOR = '#7c3aed';
const SEASON_DAYS = 58; // Mar 28 → May 25
const MATCH_DUR_FRAC = 0.18; // ~4.3h of a day
const SEASON_START_MS = parseMatchDate('28-MAR-26').getTime();

// ─── Local types ────────────────────────────────────────────────────────────────
interface ChartPt { seq: number; lads: number; gils: number; events?: string[] }
interface SeasonPt { xRatio: number; lads: number; gils: number; matchId?: number; isLive?: boolean; events?: string[] }

function calcXRatio(matchDate: Date, seq: number): number {
  const dayOff = (matchDate.getTime() - SEASON_START_MS) / 86400000;
  return Math.max(0, (dayOff + Math.max(0, seq) / 39.6 * MATCH_DUR_FRAC) / SEASON_DAYS);
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
const AV_COLORS = ['#2563eb','#16a34a','#7c3aed','#d97706','#dc2626','#0891b2','#db2777','#65a30d'];

function PlayerAvatar({ name }: { name: string }) {
  const url = iplImageUrl(name);
  const [ok, setOk] = useState(!!url);
  const initials = name.trim().split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const bg = AV_COLORS[name.charCodeAt(0) % AV_COLORS.length];
  return (
    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-gray-100 bg-gray-50 shadow-sm">
      {url && ok
        ? <img src={url} alt={name} className="w-full h-full object-cover object-top" onError={() => setOk(false)} />
        : <div className="w-full h-full flex items-center justify-center text-white text-[11px] font-black" style={{ background: bg }}>{initials}</div>}
    </div>
  );
}

// ─── Rank badge ──────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="w-7 h-7 rounded-full bg-ipl-orange text-white text-xs font-black flex items-center justify-center shadow-sm">1</span>;
  if (rank === 2) return <span className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">2</span>;
  if (rank === 3) return <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">3</span>;
  return <span className="w-7 h-7 flex items-center justify-center text-gray-400 text-xs font-mono">{rank}</span>;
}

// ─── Head-to-head card ────────────────────────────────────────────────────────
function HeadToHeadCard({ state }: { state: SeasonState }) {
  const lads = computeSideStats(state, 'lads');
  const gils = computeSideStats(state, 'gils');
  const totalGames = lads.wins + lads.losses;
  if (totalGames === 0) return null;

  const ladsPct = (lads.wins / totalGames) * 100;
  const last5L = lads.form.slice(-5);
  const last5G = gils.form.slice(-5);
  const streakLabel = (s: number) => s > 0 ? `${s}W streak` : `${Math.abs(s)}L streak`;
  const streakCls = (s: number) => s > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 bottom-0 w-1 rounded-l-2xl bg-gradient-to-b from-amber-400 to-violet-600" />
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4 pl-2">Head to Head · {totalGames} matches played</h3>

      <div className="flex items-start justify-between gap-4 pl-2">
        {/* Lads */}
        <div className="flex-1">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Lads</div>
          <div className="text-[28px] font-black leading-none text-stat" style={{ color: LADS_COLOR }}>
            {lads.wins}<span className="text-base text-gray-300 mx-1">W</span>{lads.losses}<span className="text-base text-gray-300 ml-1">L</span>
          </div>
          <div className="flex gap-1 mt-2.5">
            {last5L.map((r, i) => (
              <span key={i} className={`w-5 h-5 rounded-sm text-[9px] font-black flex items-center justify-center ${r === 'W' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-500'}`}>{r}</span>
            ))}
          </div>
          {lads.currentStreak !== 0 && (
            <span className={`mt-2 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${streakCls(lads.currentStreak)}`}>
              {streakLabel(lads.currentStreak)}
            </span>
          )}
        </div>

        <div className="text-gray-200 font-black text-2xl self-center">vs</div>

        {/* Gils */}
        <div className="flex-1 text-right">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Gils</div>
          <div className="text-[28px] font-black leading-none text-stat" style={{ color: GILS_COLOR }}>
            {gils.wins}<span className="text-base text-gray-300 mx-1">W</span>{gils.losses}<span className="text-base text-gray-300 ml-1">L</span>
          </div>
          <div className="flex gap-1 mt-2.5 justify-end">
            {last5G.map((r, i) => (
              <span key={i} className={`w-5 h-5 rounded-sm text-[9px] font-black flex items-center justify-center ${r === 'W' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-500'}`}>{r}</span>
            ))}
          </div>
          {gils.currentStreak !== 0 && (
            <span className={`mt-2 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${streakCls(gils.currentStreak)}`}>
              {streakLabel(gils.currentStreak)}
            </span>
          )}
        </div>
      </div>

      {/* Win % bar */}
      <div className="mt-4 pl-2">
        <div className="relative h-2 rounded-full overflow-hidden bg-gray-100">
          <motion.div className="absolute left-0 top-0 h-full rounded-l-full"
            style={{ background: LADS_COLOR }}
            initial={{ width: '50%' }}
            animate={{ width: `${ladsPct}%` }}
            transition={{ duration: 0.9, ease: [0.65, 0.05, 0, 1] }}
          />
          <motion.div className="absolute right-0 top-0 h-full rounded-r-full"
            style={{ background: GILS_COLOR }}
            initial={{ width: '50%' }}
            animate={{ width: `${100 - ladsPct}%` }}
            transition={{ duration: 0.9, ease: [0.65, 0.05, 0, 1] }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] font-bold" style={{ color: LADS_COLOR }}>{ladsPct.toFixed(0)}%</span>
          <span className="text-[10px] font-bold" style={{ color: GILS_COLOR }}>{(100 - ladsPct).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Season Race Chart ────────────────────────────────────────────────────────
function SeasonRaceChart({ state, reload }: { state: SeasonState; reload: () => Promise<void> }) {
  const W = 720, H = 210;
  const PAD = { l: 46, r: 20, t: 24, b: 36 };
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Supabase Realtime: reload when season_state changes in another session
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('season-race-watch')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'season_state' }, () => {
        reload();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [reload]);

  // Detect today's live match (started, not yet complete)
  const liveFixture = useMemo(
    () => fixtures.find(f => isToday(f.date) && hasMatchStarted(f) && !(state.matches[f.match]?.isComplete)),
    [state.matches]
  );

  // Build season points from chartHistory + completed matches
  const points = useMemo<SeasonPt[]>(() => {
    const chartHistory = ((state as unknown) as Record<string, unknown>).chartHistory as Record<string, ChartPt[]> | undefined ?? {};
    const completed = Object.values(state.matches)
      .filter(m => m.isComplete)
      .sort((a, b) => a.matchId - b.matchId);

    const pts: SeasonPt[] = [{ xRatio: 0, lads: 0, gils: 0 }];
    let runLads = 0, runGils = 0;

    for (const match of completed) {
      const fx = fixtures.find(f => f.match === match.matchId);
      if (!fx) continue;
      const md = parseMatchDate(fx.date);
      const history = chartHistory[String(match.matchId)];
      const startRatio = calcXRatio(md, 0);

      // Flat-segment anchor before this match starts
      if (pts[pts.length - 1].xRatio < startRatio - 0.001) {
        pts.push({ xRatio: startRatio, lads: runLads, gils: runGils });
      }

      if (history && history.length > 0) {
        for (const p of history) {
          pts.push({ xRatio: calcXRatio(md, p.seq), lads: runLads + p.lads, gils: runGils + p.gils, matchId: match.matchId, events: p.events });
        }
        runLads += history[history.length - 1].lads;
        runGils += history[history.length - 1].gils;
      } else {
        runLads += computeSideTotal(match, 'lads');
        runGils += computeSideTotal(match, 'gils');
        pts.push({ xRatio: calcXRatio(md, 39.6), lads: runLads, gils: runGils, matchId: match.matchId });
      }
    }

    // Live trailing point from chartHistory if available
    if (liveFixture) {
      const liveHistory = chartHistory[String(liveFixture.match)];
      if (liveHistory && liveHistory.length > 0) {
        const md = parseMatchDate(liveFixture.date);
        const startRatio = calcXRatio(md, 0);
        if (pts[pts.length - 1].xRatio < startRatio - 0.001) {
          pts.push({ xRatio: startRatio, lads: runLads, gils: runGils });
        }
        const last = liveHistory[liveHistory.length - 1];
        pts.push({ xRatio: calcXRatio(md, last.seq), lads: runLads + last.lads, gils: runGils + last.gils, matchId: liveFixture.match, isLive: true });
      }
    }

    return pts;
  }, [state, liveFixture]);

  const toX = (xRatio: number) => PAD.l + xRatio * inner.w;
  const allVals = points.flatMap(p => [p.lads, p.gils]);
  const rawMax = Math.max(...allVals, 50);
  const rawMin = Math.min(...allVals, 0);
  const vPad = Math.max((rawMax - rawMin) * 0.14, 30);
  const minV = rawMin - vPad, maxV = rawMax + vPad;
  const range = maxV - minV || 1;
  const toY = (v: number) => PAD.t + (1 - (v - minV) / range) * inner.h;
  const zeroY = toY(0);

  const ySpan = rawMax - rawMin;
  const step = ySpan > 800 ? 200 : ySpan > 400 ? 100 : ySpan > 200 ? 50 : 25;
  const yTicks: number[] = [0];
  for (let t = step; t <= rawMax + step; t += step) if (t <= rawMax + 5) yTicks.push(t);
  for (let t = -step; t >= rawMin - step; t -= step) if (t >= rawMin - 5) yTicks.push(t);

  const monthLabels = [
    { label: 'APR', xRatio: 4 / SEASON_DAYS },
    { label: 'MAY', xRatio: 34 / SEASON_DAYS },
  ];

  function smoothPath(key: 'lads' | 'gils'): string {
    const c = points.map(p => [toX(p.xRatio), toY(p[key])]);
    if (c.length < 2) return `M${(c[0]?.[0] ?? 0).toFixed(1)},${(c[0]?.[1] ?? 0).toFixed(1)}`;
    let d = `M${c[0][0].toFixed(1)},${c[0][1].toFixed(1)}`;
    for (let i = 0; i < c.length - 1; i++) {
      const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
      const t = 0.35;
      const cp1x = p1[0] + (p2[0] - p0[0]) * t / 2, cp1y = p1[1] + (p2[1] - p0[1]) * t / 2;
      const cp2x = p2[0] - (p3[0] - p1[0]) * t / 2, cp2y = p2[1] - (p3[1] - p1[1]) * t / 2;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function areaPath(key: 'lads' | 'gils'): string {
    const last = points[points.length - 1];
    return `${smoothPath(key)} L${toX(last.xRatio).toFixed(1)},${zeroY.toFixed(1)} L${toX(points[0].xRatio).toFixed(1)},${zeroY.toFixed(1)} Z`;
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !containerRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());
    setMouseX(e.clientX - containerRef.current.getBoundingClientRect().left);
    let best = 0, bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(toX(p.xRatio) - svgPt.x);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setHoverIdx(bestDist < 20 ? best : null);
  };

  if (points.length < 2) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
        <p className="text-gray-400 text-sm">Season race chart will appear once matches are complete.</p>
      </div>
    );
  }

  const hp = hoverIdx !== null ? points[hoverIdx] : null;
  const last = points[points.length - 1];
  const livePt = last.isLive ? last : null;
  const hpFx = hp?.matchId ? fixtures.find(f => f.match === hp.matchId) : null;
  const evtPts = points.filter(p => p.events && p.events.length > 0);
  const containerWidth = containerRef.current?.clientWidth ?? 600;
  const tipLeft = mouseX < containerWidth * 0.58;

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="bg-navy px-5 py-3 flex items-center justify-between">
        <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 900, fontSize: 14, color: 'white' }}>
          Season Race
        </span>
        <div className="flex items-center gap-5">
          {liveFixture && livePt && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 live-dot inline-block" /> Live
            </span>
          )}
          <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: '#fbbf24' }}>
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: LADS_COLOR }} />
            Lads {last.lads > 0 ? `+${last.lads}` : last.lads}
          </span>
          <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: '#a78bfa' }}>
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: GILS_COLOR }} />
            Gils {last.gils > 0 ? `+${last.gils}` : last.gils}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="bg-white relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="srLadsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LADS_COLOR} stopOpacity="0.14" />
              <stop offset="100%" stopColor={LADS_COLOR} stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="srGilsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GILS_COLOR} stopOpacity="0.10" />
              <stop offset="100%" stopColor={GILS_COLOR} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Y gridlines */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} y1={toY(v)} x2={W - PAD.r} y2={toY(v)}
                stroke={v === 0 ? '#94a3b8' : '#f1f5f9'}
                strokeWidth={v === 0 ? 1 : 0.8} />
              <text x={PAD.l - 8} y={toY(v) + 4} textAnchor="end"
                style={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8', fontFamily: 'ui-monospace,monospace' }}>
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          ))}

          {/* X baseline */}
          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#e2e8f0" strokeWidth="1" />

          {/* Month dividers + labels */}
          {monthLabels.map(m => (
            <g key={m.label}>
              <line x1={toX(m.xRatio)} y1={PAD.t} x2={toX(m.xRatio)} y2={H - PAD.b}
                stroke="#e2e8f0" strokeWidth="0.8" strokeDasharray="3,3" />
              <text x={toX(m.xRatio)} y={H - PAD.b + 14} textAnchor="middle"
                style={{ fontSize: 9, fontWeight: 800, fill: '#cbd5e1', letterSpacing: 1.5, fontFamily: 'ui-monospace,monospace' }}>
                {m.label}
              </text>
            </g>
          ))}

          {/* MAR label at chart start */}
          <text x={PAD.l + 2} y={H - PAD.b + 14} textAnchor="start"
            style={{ fontSize: 9, fontWeight: 800, fill: '#cbd5e1', letterSpacing: 1.5, fontFamily: 'ui-monospace,monospace' }}>
            MAR
          </text>

          {/* Area fills */}
          <path d={areaPath('lads')} fill="url(#srLadsGrad)" />
          <path d={areaPath('gils')} fill="url(#srGilsGrad)" />

          {/* Animated lines */}
          <motion.path
            d={smoothPath('lads')} fill="none" stroke={LADS_COLOR}
            strokeWidth="2.5" strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.8, ease: [0.65, 0.05, 0, 1] }}
          />
          <motion.path
            d={smoothPath('gils')} fill="none" stroke={GILS_COLOR}
            strokeWidth="2.5" strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.8, ease: [0.65, 0.05, 0, 1], delay: 0.1 }}
          />

          {/* Event dots */}
          {evtPts.map((p, i) => (
            <g key={i}>
              <circle cx={toX(p.xRatio)} cy={toY(p.lads)} r="3.5" fill="white" stroke={LADS_COLOR} strokeWidth="1.8" />
              <circle cx={toX(p.xRatio)} cy={toY(p.gils)} r="3.5" fill="white" stroke={GILS_COLOR} strokeWidth="1.8" />
            </g>
          ))}

          {/* Terminal dots (when not live) */}
          {!livePt && (
            <>
              <circle cx={toX(last.xRatio)} cy={toY(last.lads)} r="5" fill={LADS_COLOR} stroke="white" strokeWidth="2.5" />
              <circle cx={toX(last.xRatio)} cy={toY(last.gils)} r="5" fill={GILS_COLOR} stroke="white" strokeWidth="2.5" />
            </>
          )}

          {/* Pulsing live dot */}
          {livePt && (
            <g>
              <circle cx={toX(livePt.xRatio)} cy={toY(livePt.lads)} r="9" fill={LADS_COLOR} opacity="0.12" className="live-dot" />
              <circle cx={toX(livePt.xRatio)} cy={toY(livePt.lads)} r="5" fill={LADS_COLOR} stroke="white" strokeWidth="2" />
              <circle cx={toX(livePt.xRatio)} cy={toY(livePt.gils)} r="9" fill={GILS_COLOR} opacity="0.12" className="live-dot" />
              <circle cx={toX(livePt.xRatio)} cy={toY(livePt.gils)} r="5" fill={GILS_COLOR} stroke="white" strokeWidth="2" />
            </g>
          )}

          {/* Hover crosshair */}
          {hp && hoverIdx !== null && (
            <>
              <line x1={toX(hp.xRatio)} y1={PAD.t} x2={toX(hp.xRatio)} y2={H - PAD.b}
                stroke="#cbd5e1" strokeWidth="1.2" strokeDasharray="3,2" />
              <circle cx={toX(hp.xRatio)} cy={toY(hp.lads)} r="4.5" fill={LADS_COLOR} stroke="white" strokeWidth="2" />
              <circle cx={toX(hp.xRatio)} cy={toY(hp.gils)} r="4.5" fill={GILS_COLOR} stroke="white" strokeWidth="2" />
            </>
          )}
        </svg>

        {/* Hover tooltip */}
        {hp && hoverIdx !== null && (
          <div
            className="absolute top-2 z-20 pointer-events-none"
            style={tipLeft
              ? { left: mouseX + 12 }
              : { right: containerWidth - mouseX + 12 }}
          >
            <div className="bg-gray-900 text-white rounded-xl px-3 py-2.5 shadow-xl text-[11px]" style={{ minWidth: 140 }}>
              {hpFx
                ? <div className="font-bold text-[12px] mb-1.5 text-gray-200">M{hp.matchId} · {hpFx.date.split('-').slice(0, 2).join(' ')}</div>
                : <div className="font-bold text-[12px] mb-1.5 text-gray-200">Season start</div>}
              {hp.isLive && <div className="text-red-400 text-[10px] font-bold mb-1 uppercase tracking-wide">● Live</div>}
              <div className="flex items-center justify-between gap-4">
                <span style={{ color: '#fbbf24' }} className="font-semibold">Lads</span>
                <span className="font-bold tabular-nums">{hp.lads > 0 ? `+${hp.lads}` : hp.lads}</span>
              </div>
              <div className="flex items-center justify-between gap-4 mt-0.5">
                <span style={{ color: '#a78bfa' }} className="font-semibold">Gils</span>
                <span className="font-bold tabular-nums">{hp.gils > 0 ? `+${hp.gils}` : hp.gils}</span>
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-gray-700 flex items-center justify-between gap-4">
                <span className="text-gray-400">Lead</span>
                <span className={`font-bold tabular-nums ${hp.lads >= hp.gils ? 'text-amber-400' : 'text-purple-400'}`}>
                  {hp.lads >= hp.gils ? 'Lads' : 'Gils'} +{Math.abs(hp.lads - hp.gils)}
                </span>
              </div>
            </div>
            <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 mx-auto -mt-1.5 rounded-sm" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Per-match bar chart ──────────────────────────────────────────────────────
function PerMatchBarChart({ state }: { state: SeasonState }) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const matchData = useMemo(() =>
    Object.values(state.matches)
      .filter(m => m.isComplete)
      .sort((a, b) => a.matchId - b.matchId)
      .map(m => ({ matchId: m.matchId, lads: computeSideTotal(m, 'lads'), gils: computeSideTotal(m, 'gils') })),
    [state.matches]
  );

  if (matchData.length === 0) return null;

  const maxPts = Math.max(...matchData.flatMap(m => [m.lads, m.gils]), 1);
  const BAR_H = 130;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 overflow-x-auto">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Match by Match</h3>
      <div className="flex items-end gap-1.5" style={{ minWidth: matchData.length * 48 }}>
        {matchData.map((m, idx) => {
          const isH = hoveredId === m.matchId;
          const winner = m.lads > m.gils ? 'lads' : m.gils > m.lads ? 'gils' : null;
          const delay = Math.min(idx * 0.02, 0.4);
          return (
            <div key={m.matchId} className="flex flex-col items-center gap-1 flex-1 relative"
              onMouseEnter={() => setHoveredId(m.matchId)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {isH && (
                <div className="absolute bottom-full mb-2 left-1/2 z-20 pointer-events-none" style={{ transform: 'translateX(-50%)', minWidth: 108 }}>
                  <div className="bg-gray-900 text-white rounded-xl px-3 py-2 text-[11px] shadow-xl">
                    <div className="font-bold mb-1 text-gray-200">M{m.matchId}</div>
                    <div className="flex justify-between gap-3"><span style={{ color: '#fbbf24' }}>Lads</span><span className="font-bold tabular-nums">{m.lads}</span></div>
                    <div className="flex justify-between gap-3 mt-0.5"><span style={{ color: '#a78bfa' }}>Gils</span><span className="font-bold tabular-nums">{m.gils}</span></div>
                    <div className="mt-1 pt-1 border-t border-gray-700 text-[10px] text-gray-400">
                      {winner === 'lads' ? 'Lads won' : winner === 'gils' ? 'Gils won' : 'Draw'}
                    </div>
                  </div>
                  <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 mx-auto -mt-1.5 rounded-sm" />
                </div>
              )}
              <div className="flex items-end gap-0.5" style={{ height: BAR_H }}>
                <motion.div className="w-4 rounded-t-sm flex-shrink-0"
                  style={{ background: LADS_COLOR, opacity: isH ? 1 : 0.72 }}
                  initial={{ height: 0 }}
                  animate={{ height: (m.lads / maxPts) * BAR_H }}
                  transition={{ duration: 0.5, ease: [0.65, 0.05, 0, 1], delay }}
                />
                <motion.div className="w-4 rounded-t-sm flex-shrink-0"
                  style={{ background: GILS_COLOR, opacity: isH ? 1 : 0.72 }}
                  initial={{ height: 0 }}
                  animate={{ height: (m.gils / maxPts) * BAR_H }}
                  transition={{ duration: 0.5, ease: [0.65, 0.05, 0, 1], delay: delay + 0.04 }}
                />
              </div>
              <div className={`text-[9px] font-medium tabular-nums ${isH ? 'text-gray-600' : 'text-gray-400'}`}>
                {m.matchId}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 text-[10px] font-semibold text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: LADS_COLOR }} /> Lads</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: GILS_COLOR }} /> Gils</span>
      </div>
    </div>
  );
}

// ─── Venue chart ──────────────────────────────────────────────────────────────
function VenueChart({ venueData }: { venueData: { venue: string; lads: number; gils: number }[] }) {
  const [hoveredVenue, setHoveredVenue] = useState<string | null>(null);
  if (venueData.length === 0) return null;
  const max = Math.max(...venueData.flatMap(v => [v.lads, v.gils]), 1);
  const BAR_H = 160;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 overflow-x-auto">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Points by Venue</h3>
      <div className="flex items-end gap-4" style={{ minWidth: venueData.length * 72 }}>
        {venueData.map(v => {
          const isHovered = hoveredVenue === v.venue;
          return (
            <div key={v.venue} className="flex flex-col items-center gap-1 flex-1 relative"
              onMouseEnter={() => setHoveredVenue(v.venue)}
              onMouseLeave={() => setHoveredVenue(null)}
            >
              {isHovered && (
                <div className="absolute bottom-full mb-2 left-1/2 z-20 pointer-events-none shadow-xl" style={{ transform: 'translateX(-50%)', minWidth: 120 }}>
                  <div className="bg-gray-900 text-white rounded-xl px-3 py-2.5 text-[11px]">
                    <div className="font-bold text-[12px] mb-1.5 truncate max-w-[140px]">{v.venue}</div>
                    <div className="flex items-center justify-between gap-3"><span style={{ color: '#fbbf24' }} className="font-semibold">Lads</span><span className="font-bold tabular-nums">{v.lads}</span></div>
                    <div className="flex items-center justify-between gap-3 mt-0.5"><span style={{ color: '#a78bfa' }} className="font-semibold">Gils</span><span className="font-bold tabular-nums">{v.gils}</span></div>
                    <div className="mt-1.5 pt-1.5 border-t border-gray-700 flex items-center justify-between gap-3"><span className="text-gray-400">Total</span><span className="font-bold tabular-nums">{v.lads + v.gils}</span></div>
                  </div>
                  <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 mx-auto -mt-1.5 rounded-sm" />
                </div>
              )}
              <div className="flex items-end gap-1 w-full justify-center" style={{ height: BAR_H }}>
                <div className="flex flex-col justify-end" style={{ height: BAR_H, flex: 1 }}>
                  <div className="rounded-t-md w-full transition-all duration-150" style={{ height: `${(v.lads / max) * BAR_H}px`, background: LADS_COLOR, opacity: isHovered ? 1 : 0.75, transform: isHovered ? 'scaleY(1.02)' : 'scaleY(1)', transformOrigin: 'bottom' }} />
                </div>
                <div className="flex flex-col justify-end" style={{ height: BAR_H, flex: 1 }}>
                  <div className="rounded-t-md w-full transition-all duration-150" style={{ height: `${(v.gils / max) * BAR_H}px`, background: GILS_COLOR, opacity: isHovered ? 1 : 0.75, transform: isHovered ? 'scaleY(1.02)' : 'scaleY(1)', transformOrigin: 'bottom' }} />
                </div>
              </div>
              <div className="text-[9px] font-bold tabular-nums" style={{ color: LADS_COLOR, opacity: isHovered ? 1 : 0.7 }}>{v.lads}</div>
              <div className="text-[9px] font-bold tabular-nums" style={{ color: GILS_COLOR, opacity: isHovered ? 1 : 0.7 }}>{v.gils}</div>
              <div className={`text-[9px] font-medium text-center leading-tight max-w-[60px] ${isHovered ? 'text-gray-700' : 'text-gray-400'}`} style={{ wordBreak: 'break-word' }}>{v.venue}</div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-4 text-[10px] font-semibold text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: LADS_COLOR }} /> Lads</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: GILS_COLOR }} /> Gils</span>
      </div>
    </div>
  );
}

// ─── MVP top-3 cards ──────────────────────────────────────────────────────────
const MVP_RANK_COLORS = ['#e84611', '#6b7280', '#d97706'];
const MVP_RANK_LABELS = ['MVP', '#2', '#3'];

function MVPCards({ players, tab }: { players: PlayerSeasonStat[]; tab: 'lads' | 'gils' }) {
  const top3 = players.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
        <div className="grid grid-cols-3 gap-3">
          {top3.map((p, i) => (
            <motion.div key={p.name}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.06, duration: 0.22, ease: [0.65, 0.05, 0, 1] }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              style={{ borderLeftWidth: 4, borderLeftColor: MVP_RANK_COLORS[i] }}
            >
              <div className="p-4">
                <div className="text-[9px] font-black uppercase tracking-[0.22em] mb-2.5" style={{ color: MVP_RANK_COLORS[i] }}>
                  {MVP_RANK_LABELS[i]}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <PlayerAvatar name={p.name} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-900 truncate leading-tight">{p.name.split(' ').pop()}</div>
                    <div className="text-[10px] text-gray-400 truncate">{p.name}</div>
                  </div>
                </div>
                <div className="text-stat text-2xl leading-none" style={{ color: i === 0 ? '#e84611' : '#374151' }}>
                  {p.totalPoints > 0 ? '+' : ''}{p.totalPoints}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">avg {p.avgPoints} · {p.matches}M</div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Form squares ─────────────────────────────────────────────────────────────
function FormSquares({ scores, avg }: { scores: number[]; avg: number }) {
  const last5 = scores.slice(-5);
  if (last5.length === 0) return <span className="text-gray-200">—</span>;
  return (
    <div className="flex gap-0.5 justify-end">
      {last5.map((s, i) => {
        const bg = s < 0 ? '#fecaca' : s === 0 ? '#e5e7eb' : s > avg ? '#bbf7d0' : '#fde68a';
        const fg = s < 0 ? '#ef4444' : s === 0 ? '#9ca3af' : s > avg ? '#15803d' : '#b45309';
        return (
          <span key={i} title={`${s >= 0 ? '+' : ''}${s}`}
            className="w-3.5 h-3.5 rounded-sm inline-block border"
            style={{ background: bg, borderColor: fg, opacity: 0.9 }}
          />
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StatsPage() {
  const { state, loaded, reload } = useSeasonState();
  const [tab, setTab] = useState<'lads' | 'gils'>('lads');
  const players = computePlayerStats(state, tab);

  const anyComplete = Object.values(state.matches).some(m => m.isComplete);

  // Points by venue
  const venueData = useMemo(() => {
    const map: Record<string, { lads: number; gils: number }> = {};
    for (const match of Object.values(state.matches)) {
      if (!match.isComplete) continue;
      const fx = fixtures.find(f => f.match === match.matchId);
      if (!fx) continue;
      if (!map[fx.venue]) map[fx.venue] = { lads: 0, gils: 0 };
      map[fx.venue].lads += computeSideTotal(match, 'lads');
      map[fx.venue].gils += computeSideTotal(match, 'gils');
    }
    return Object.entries(map).map(([venue, pts]) => ({ venue, ...pts })).sort((a, b) => (b.lads + b.gils) - (a.lads + a.gils));
  }, [state.matches]);

  // Per-player match scores (for form + best match columns)
  const playerMatchScores = useMemo(() => {
    const map = new Map<string, number[]>();
    Object.values(state.matches)
      .filter(m => m.isComplete)
      .sort((a, b) => a.matchId - b.matchId)
      .forEach(m => {
        m[tab].results.forEach(r => {
          const pts = Math.round(applyMultiplier(r.battingPoints + r.bowlingPoints + r.fieldingPoints, r.multiplier));
          const arr = map.get(r.playerName) ?? [];
          arr.push(pts);
          map.set(r.playerName, arr);
        });
      });
    return map;
  }, [state.matches, tab]);

  const ladsStats = computeSideStats(state, 'lads');
  const gilsStats = computeSideStats(state, 'gils');

  const prizes = [
    {
      abbrev: 'OC', label: 'Orange Cap', pts: 350, dotClass: 'bg-orange-400',
      ladsTitle: `${ladsStats.totalSeasonRuns} runs`, gilsTitle: `${gilsStats.totalSeasonRuns} runs`,
      ladsDetail: ladsStats.orangeCapRuns ? `Top: ${ladsStats.orangeCapRuns.player} ${ladsStats.orangeCapRuns.runs}r` : 'No data',
      gilsDetail: gilsStats.orangeCapRuns ? `Top: ${gilsStats.orangeCapRuns.player} ${gilsStats.orangeCapRuns.runs}r` : 'No data',
      ladsScore: ladsStats.totalSeasonRuns, gilsScore: gilsStats.totalSeasonRuns,
    },
    {
      abbrev: 'PC', label: 'Purple Cap', pts: 350, dotClass: 'bg-purple-600',
      ladsTitle: `${ladsStats.totalSeasonWickets} wickets`, gilsTitle: `${gilsStats.totalSeasonWickets} wickets`,
      ladsDetail: ladsStats.purpleCapWickets ? `Top: ${ladsStats.purpleCapWickets.player} ${ladsStats.purpleCapWickets.wickets}w` : 'No data',
      gilsDetail: gilsStats.purpleCapWickets ? `Top: ${gilsStats.purpleCapWickets.player} ${gilsStats.purpleCapWickets.wickets}w` : 'No data',
      ladsScore: ladsStats.totalSeasonWickets, gilsScore: gilsStats.totalSeasonWickets,
    },
    {
      abbrev: 'STK', label: 'Longest Streak', pts: 350, dotClass: 'bg-blue-500',
      ladsTitle: `${ladsStats.longestStreak}W streak`, gilsTitle: `${gilsStats.longestStreak}W streak`,
      ladsDetail: `Current: ${ladsStats.currentStreak > 0 ? `${ladsStats.currentStreak}W` : ladsStats.currentStreak < 0 ? `${Math.abs(ladsStats.currentStreak)}L` : '—'}`,
      gilsDetail: `Current: ${gilsStats.currentStreak > 0 ? `${gilsStats.currentStreak}W` : gilsStats.currentStreak < 0 ? `${Math.abs(gilsStats.currentStreak)}L` : '—'}`,
      ladsScore: ladsStats.longestStreak, gilsScore: gilsStats.longestStreak,
    },
    {
      abbrev: 'PH', label: 'Purple Hits', pts: 350, dotClass: 'bg-violet-500',
      ladsTitle: `${ladsStats.purpleHits} hit${ladsStats.purpleHits !== 1 ? 's' : ''}`,
      gilsTitle: `${gilsStats.purpleHits} hit${gilsStats.purpleHits !== 1 ? 's' : ''}`,
      ladsDetail: '3× pick scored highest', gilsDetail: '3× pick scored highest',
      ladsScore: ladsStats.purpleHits, gilsScore: gilsStats.purpleHits,
    },
  ];

  if (!loaded) return <div className="text-gray-400 text-center py-20">Loading...</div>;

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-navy px-6 py-5 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 bottom-0 w-1.5 bg-ipl-orange" />
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Stats</h1>
        <p className="text-blue-300 text-sm mt-1">Season analytics & player stats</p>
      </motion.div>

      {/* Head-to-head */}
      <HeadToHeadCard state={state} />

      {/* Charts */}
      {anyComplete ? (
        <>
          <SeasonRaceChart state={state} reload={reload} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <PerMatchBarChart state={state} />
            <VenueChart venueData={venueData} />
          </div>
        </>
      ) : (
        <div className="text-center py-10 bg-white rounded-2xl border border-gray-100 text-gray-400 text-sm">
          No completed matches yet — charts will appear here.
        </div>
      )}

      {/* Prize Race */}
      <div>
        <h2 className="text-[13px] font-black text-gray-500 uppercase tracking-[0.15em] mb-3">End of Season Prize Race</h2>
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
                  {leader === 'tied'
                    ? <span className="text-[10px] font-semibold text-orange-400 border border-orange-200 bg-orange-50/50 px-2 py-0.5 rounded-full">Tied</span>
                    : <span className={`text-[10px] font-bold text-white px-2.5 py-0.5 rounded-full ${leader === 'lads' ? 'bg-amber-400' : 'bg-violet-600'}`}>
                        {leader === 'lads' ? 'Lads' : 'Gils'} leading
                      </span>
                  }
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
                  <div className="h-1.5 flex">
                    <div className="bg-amber-400" style={{ width: `${ladsPct}%` }} />
                    <div className="bg-violet-600" style={{ width: `${100 - ladsPct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Player Stats */}
      <div>
        <h2 className="text-[13px] font-black text-gray-500 uppercase tracking-[0.15em] mb-3">Player Stats</h2>

        {/* Tab switcher */}
        <div className="flex bg-white rounded-xl p-1 border border-gray-200 shadow-sm w-fit mb-4">
          {(['lads', 'gils'] as const).map(s => (
            <button key={s} onClick={() => setTab(s)} className="relative px-8 py-2 rounded-lg text-sm font-bold">
              {tab === s && (
                <motion.div layoutId="stats-tab-indicator"
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

        {/* MVP top-3 cards */}
        {players.length >= 3 && <div className="mb-4"><MVPCards players={players} tab={tab} /></div>}

        {players.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <p className="font-semibold text-gray-500">No match data yet</p>
            <p className="text-sm text-gray-400 mt-1">Complete some matches to see player stats.</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-4 py-3 font-medium">#</th>
                      <th className="text-left px-2 py-3 font-medium">Player</th>
                      <th className="text-right px-3 py-3 font-medium">M</th>
                      <th className="text-right px-3 py-3 font-medium">Total</th>
                      <th className="text-right px-3 py-3 font-medium">Avg</th>
                      <th className="text-right px-3 py-3 font-medium">Best</th>
                      <th className="text-right px-3 py-3 font-medium">Form</th>
                      <th className="text-right px-3 py-3 font-medium">Runs</th>
                      <th className="text-right px-3 py-3 font-medium">Wkts</th>
                      <th className="text-right px-3 py-3 font-medium">MOM</th>
                      <th className="text-right px-3 py-3 font-medium">3×</th>
                      <th className="text-right px-4 py-3 font-medium">2×</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {players.map((p, i) => {
                      const scores = playerMatchScores.get(p.name) ?? [];
                      const bestMatch = scores.length > 0 ? Math.max(...scores) : null;
                      const isHighBest = bestMatch !== null && p.avgPoints > 0 && bestMatch > p.avgPoints * 2;
                      return (
                        <tr key={p.name} className="hover:bg-gray-50/60 hover:-translate-y-px transition-all duration-150 ease-sharp">
                          <td className="px-4 py-2.5"><RankBadge rank={i + 1} /></td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-3">
                              <PlayerAvatar name={p.name} />
                              <span className="font-semibold text-gray-900">{p.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">{p.matches}</td>
                          <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${p.totalPoints >= 0 ? 'text-ipl-orange' : 'text-red-500'}`}>
                            {p.totalPoints > 0 ? '+' : ''}{p.totalPoints}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{p.avgPoints}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {bestMatch !== null
                              ? <span className={`font-bold ${isHighBest ? 'text-amber-500' : 'text-gray-500'}`}>{bestMatch > 0 ? `+${bestMatch}` : bestMatch}</span>
                              : <span className="text-gray-200">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <FormSquares scores={scores} avg={p.avgPoints} />
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{p.totalRuns}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{p.totalWickets}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {p.momCount > 0 ? <span className="font-bold text-amber-500">{p.momCount}</span> : <span className="text-gray-200">—</span>}
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
                      );
                    })}
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
