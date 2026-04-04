'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { calcLiveBatsmen, calcLiveBowlers, calcLiveFantasyTotal } from '@/lib/liveScoring';
import { decodeSeq, seqToOverPos } from '@/lib/espnSeq';
import type { PlayerPick, Multiplier } from '@/lib/types';
import type { LiveData } from '@/hooks/useLiveScore';
import { multiplierBadge } from '@/lib/scoring';

// ─── Dismissal formatting ─────────────────────────────────────────────────────
// ESPN can return short codes ("c", "b", "lbw") or richer text like "c Axar Patel b Kuldeep Yadav".
// We expand the leading verb so it reads naturally.
function formatDismissal(raw: string): string {
  if (!raw || raw === 'not out') return 'not out';
  const r = raw.trim();

  // Expand "c X b Y" → "c [X] b [Y]" (already legible — just ensure leading char is expanded)
  // Expand standalone single-char codes
  const lower = r.toLowerCase();
  if (lower === 'c' || lower === 'caught') return 'caught';
  if (lower === 'b' || lower === 'bowled') return 'bowled';
  if (lower === 'lbw') return 'lbw';
  if (lower === 'st' || lower === 'stumped') return 'stumped';
  if (lower === 'ro' || lower === 'run out') return 'run out';
  if (lower === 'c&b') return 'c&b';
  if (lower === 'ret' || lower === 'retired') return 'retired hurt';

  // For richer text like "c Axar Patel b Kuldeep", expand the leading code word
  const expanded = r
    .replace(/^c\s+/i, 'c ')      // "c Axar…" stays as-is (fielder name follows)
    .replace(/\sb\s/g, ' b ')     // spacing around bowler marker is fine
    .replace(/^b\s+/i, 'b ');    // "b Kuldeep" stays as-is

  return expanded;
}

// ─── Name matching — exact full name only ─────────────────────────────────────
function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
function matchName(a: string, b: string) { return norm(a) === norm(b); }

// Match against pick name OR substitute name (so sub player shows correct dots)
function isLadsPick(name: string, lads: PlayerPick[]) {
  return lads.some(p => matchName(name, p.playerName) || (p.substituteName && matchName(name, p.substituteName)));
}
function isGilsPick(name: string, gils: PlayerPick[]) {
  return gils.some(p => matchName(name, p.playerName) || (p.substituteName && matchName(name, p.substituteName)));
}
function getLadsMultiplier(name: string, lads: PlayerPick[]): Multiplier | null {
  return (lads.find(p => matchName(name, p.playerName) || (p.substituteName && matchName(name, p.substituteName))))?.multiplier ?? null;
}
function getGilsMultiplier(name: string, gils: PlayerPick[]): Multiplier | null {
  return (gils.find(p => matchName(name, p.playerName) || (p.substituteName && matchName(name, p.substituteName))))?.multiplier ?? null;
}

// ─── Commentary helpers ───────────────────────────────────────────────────────
function parseBallOutcome(text: string): { runs: number | 'W' | '·' | '4' | '6'; label: string } {
  const t = text.toUpperCase();
  if (t.includes(' W ') || t.includes('WICKET') || t.includes(' OUT') || t.includes('LBW') ||
      t.includes('CAUGHT') || t.includes('BOWLED') || t.includes('STUMPED') || t.includes('RUN OUT')) {
    return { runs: 'W', label: 'W' };
  }
  if (t.includes(' SIX') || t.includes(', 6')) return { runs: '6', label: '6' };
  if (t.includes(' FOUR') || t.includes(', 4')) return { runs: '4', label: '4' };
  if (t.includes('NO BALL')) return { runs: '·', label: 'nb' };
  if (t.includes('WIDE')) return { runs: '·', label: 'wd' };
  if (t.includes('NO RUN') || t.includes(', 0') || t.endsWith('DOT')) return { runs: '·', label: '·' };
  const m = text.match(/[,\s](\d+)\s*run/i);
  if (m) {
    const r = parseInt(m[1]);
    return { runs: r as number, label: String(r) };
  }
  return { runs: '·', label: '·' };
}

function BallCircle({ text }: { text: string }) {
  const { runs, label } = parseBallOutcome(text);
  let bg = 'bg-gray-100 text-gray-500';
  if (runs === 'W') bg = 'bg-red-600 text-white';
  else if (runs === '6') bg = 'bg-green-600 text-white';
  else if (runs === '4') bg = 'bg-amber-500 text-white';
  else if (runs === '·') bg = 'bg-gray-200 text-gray-500';
  else if (typeof runs === 'number' && runs > 0) bg = 'bg-blue-100 text-blue-700';
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black shrink-0 ${bg}`}>
      {label}
    </span>
  );
}

function formatOver(sequence?: number): string {
  if (!sequence) return '';
  const d = decodeSeq(sequence);
  if (!d) return '';
  return `${d.over}.${d.ball}`;
}

// ─── Pick ownership dots ──────────────────────────────────────────────────────
function OwnerDots({ lads, gils }: { lads: boolean; gils: boolean }) {
  if (!lads && !gils) return null;
  return (
    <span className="flex gap-0.5 items-center">
      {lads && <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" title="Lads pick" />}
      {gils && <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" title="Gils pick" />}
    </span>
  );
}

// ─── Multiplier badge coloured by owner ──────────────────────────────────────
function MultiBadge({ m, owner }: { m: Multiplier; owner: 'lads' | 'gils' }) {
  const label = multiplierBadge(m);
  const base = 'text-xs px-1.5 py-0.5 rounded font-black border';
  if (owner === 'lads') return <span className={`${base} bg-amber-100 text-amber-700 border-amber-300`}>{label}</span>;
  return <span className={`${base} bg-violet-100 text-violet-700 border-violet-300`}>{label}</span>;
}

// ─── Points chip ─────────────────────────────────────────────────────────────
function PtsChip({ pts }: { pts: number }) {
  return (
    <motion.span key={pts} initial={{ scale: 1.25, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        pts > 0 ? 'bg-green-100 text-green-700' : pts < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'
      }`}>
      {pts > 0 ? `+${pts}` : pts}
    </motion.span>
  );
}

// ─── Side panel (full-height, number at top) ─────────────────────────────────
function ptsStr(n: number) { return n > 0 ? `+${n}` : n === 0 ? '—' : String(n); }
function ptsColor(n: number) { return n > 0 ? 'text-green-600' : n < 0 ? 'text-red-500' : 'text-gray-300'; }
function shortName(n: string) {
  const parts = n.trim().split(' ');
  return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts[0][0]}.` : n;
}

function SidePanel({
  label, total, breakdown, color, textColor, borderColor, bgColor,
}: {
  label: string; total: number;
  breakdown: { name: string; activeName: string; pts: number; batPts: number; bowlPts: number; fieldPts: number; multiplier: Multiplier | null; isSubstituted: boolean }[];
  color: string; textColor: string; borderColor: string; bgColor: string;
}) {
  const isLads = label === 'LADS';
  const accentBorder = isLads ? 'border-amber-200' : 'border-violet-200';
  const accentText   = isLads ? 'text-amber-600'  : 'text-violet-600';
  const accentBadge  = isLads
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-violet-100 text-violet-700 border-violet-200';

  return (
    <div className={`flex-1 rounded-2xl border-2 ${borderColor} ${bgColor} flex flex-col overflow-hidden`}>

      {/* ── TOP: label + big number ── */}
      <div className="px-5 pt-5 pb-4">
        <div className={`text-[10px] font-black uppercase tracking-[0.25em] mb-2 ${accentText}`}>{label}</div>
        <motion.div
          key={total}
          initial={{ scale: 1.06, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`font-black leading-none ${textColor}`}
          style={{ fontSize: 'clamp(3.5rem, 5vw, 6rem)' }}
        >
          {total > 0 ? `+${total}` : total}
        </motion.div>
        <div className="text-[10px] text-gray-400 mt-1 font-medium tracking-wide uppercase">pts this game</div>
      </div>

      {/* ── Picks: one card per player ── */}
      <div className={`flex-1 overflow-y-auto border-t ${accentBorder} px-3 py-2 space-y-2`}>
        {breakdown.map(b => {
          const hasStats = b.batPts !== 0 || b.bowlPts !== 0 || b.fieldPts !== 0;
          return (
            <div key={b.name}
              className="bg-white/60 rounded-xl px-3 py-2.5 border border-white shadow-sm">

              {/* Row 1: name + multiplier badge + total */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-extrabold text-gray-900 truncate leading-tight">
                    {shortName(b.activeName)}
                  </span>
                  {b.multiplier && (
                    <span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md border ${accentBadge}`}>
                      {multiplierBadge(b.multiplier)}
                    </span>
                  )}
                </div>
                <motion.span key={b.pts}
                  initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className={`text-[17px] font-black shrink-0 ${ptsColor(b.pts)}`}>
                  {ptsStr(b.pts)}
                </motion.span>
              </div>

              {/* Row 2: sub label + stat chips */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {b.isSubstituted && (
                  <span className="text-[9px] text-gray-400 font-semibold">↑ sub {shortName(b.name)}</span>
                )}
                {hasStats ? (
                  <>
                    {b.batPts !== 0 && (
                      <span className="text-[10px] font-bold text-blue-500">
                        Bat <span className={ptsColor(b.batPts)}>{ptsStr(b.batPts)}</span>
                      </span>
                    )}
                    {b.bowlPts !== 0 && (
                      <span className="text-[10px] font-bold text-orange-500">
                        Bowl <span className={ptsColor(b.bowlPts)}>{ptsStr(b.bowlPts)}</span>
                      </span>
                    )}
                    {b.fieldPts !== 0 && (
                      <span className="text-[10px] font-bold text-green-600">
                        Field <span className={ptsColor(b.fieldPts)}>{ptsStr(b.fieldPts)}</span>
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-gray-300 font-medium">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Live progression chart ───────────────────────────────────────────────────
// seq stored in HistoryPoint is a 0–39.6 over-position (seqToOverPos result).
// innings 1 occupies 0–19.6, innings 2 occupies 20–39.6.
interface HistoryPoint { seq: number; lads: number; gils: number; events?: string[] }

function ProgressChart({ history, onRegenerate }: { history: HistoryPoint[]; onRegenerate: () => void }) {
  if (history.length < 1) return null;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const W = 560, H = 180, PAD = { l: 46, r: 14, t: 20, b: 30 };
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };

  const allVals = history.flatMap(p => [p.lads, p.gils]);
  const rawMin = Math.min(...allVals, 0);
  const rawMax = Math.max(...allVals, 0);
  const vPad = Math.max((rawMax - rawMin) * 0.18, 20);
  const minV = rawMin - vPad, maxV = rawMax + vPad;
  const range = maxV - minV || 1;

  const SEQ_START = 0, SEQ_END = 39.6;
  const toX = (seq: number) => PAD.l + ((seq - SEQ_START) / (SEQ_END - SEQ_START)) * inner.w;
  const toY = (v: number) => PAD.t + (1 - (v - minV) / range) * inner.h;
  const zeroY = toY(0);

  function linePath(pts: HistoryPoint[], key: 'lads' | 'gils') {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.seq).toFixed(1)},${toY(p[key]).toFixed(1)}`).join(' ');
  }

  const last = history[history.length - 1];

  // Y-axis ticks: pick sensible interval
  const ySpan = rawMax - rawMin;
  const step = ySpan > 400 ? 100 : ySpan > 200 ? 50 : ySpan > 100 ? 25 : 20;
  const yTicks: number[] = [0];
  for (let t = step; t <= rawMax + step; t += step) if (t <= rawMax + 5) yTicks.push(t);
  for (let t = -step; t >= rawMin - step; t -= step) if (t >= rawMin - 5) yTicks.push(t);

  const xLabels = [
    { seq: 0, label: '1' }, { seq: 4, label: '5' }, { seq: 9, label: '10' },
    { seq: 14, label: '15' }, { seq: 19, label: '20' }, { seq: 24, label: '25' },
    { seq: 29, label: '30' }, { seq: 34, label: '35' }, { seq: 39, label: '40' },
  ];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !containerRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    setMouseX(relX);
    const svgX = (relX / rect.width) * W;
    let best = 0, bestDist = Infinity;
    history.forEach((p, i) => {
      const d = Math.abs(toX(p.seq) - svgX);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    // Only show tooltip if mouse is reasonably close to a data point
    setHoverIdx(bestDist < inner.w / history.length * 2 ? best : null);
  };

  const hp = hoverIdx !== null ? history[hoverIdx] : null;
  const prevHp = hoverIdx !== null && hoverIdx > 0 ? history[hoverIdx - 1] : null;

  // Over label for tooltip: seq 0–19.x = Inn 1 overs 1–20, seq 20–39.x = Inn 2 overs 1–20
  const hpOver = hp
    ? { inn: hp.seq >= 20 ? 2 : 1, ov: Math.floor(hp.seq >= 20 ? hp.seq - 20 : hp.seq) + 1 }
    : null;

  // Tooltip x position: flip to left side when mouse is past midpoint
  const containerWidth = containerRef.current?.clientWidth ?? 400;
  const tipLeft = mouseX < containerWidth * 0.55;

  const fmtPts = (n: number) => `${n > 0 ? '+' : ''}${n}`;

  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between"
        style={{ background: 'var(--ipl-navy)' }}>
        <span className="text-white font-bold text-sm uppercase tracking-widest">Points Race</span>
        <div className="flex items-center gap-4">
          <button onClick={onRegenerate}
            className="text-[10px] font-bold px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors uppercase tracking-wide">
            ↻ Regenerate
          </button>
          <div className="flex gap-4 text-sm font-bold">
            <span className="flex items-center gap-1.5 text-amber-300">
              <span className="w-4 h-0.5 bg-amber-400 inline-block rounded" />
              Lads {fmtPts(Math.round(last.lads))}
            </span>
            <span className="flex items-center gap-1.5 text-violet-300">
              <span className="w-4 h-0.5 bg-violet-400 inline-block rounded" />
              Gils {fmtPts(Math.round(last.gils))}
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative px-3 py-4">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full"
          style={{ height: '200px', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>

          {/* Y-axis gridlines + labels */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} y1={toY(v)} x2={W - PAD.r} y2={toY(v)}
                stroke={v === 0 ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={v === 0 ? 1.2 : 0.7}
                strokeDasharray={v === 0 ? '5,4' : undefined} />
              <text x={PAD.l - 7} y={toY(v) + 4.5} textAnchor="end"
                style={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }}>
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          ))}

          {/* Area fills */}
          <path
            d={`${linePath(history, 'lads')} L${toX(last.seq).toFixed(1)},${zeroY.toFixed(1)} L${toX(SEQ_START).toFixed(1)},${zeroY.toFixed(1)} Z`}
            fill="#f59e0b" opacity="0.10" />
          <path
            d={`${linePath(history, 'gils')} L${toX(last.seq).toFixed(1)},${zeroY.toFixed(1)} L${toX(SEQ_START).toFixed(1)},${zeroY.toFixed(1)} Z`}
            fill="#7c3aed" opacity="0.10" />

          {/* Lines */}
          <path d={linePath(history, 'lads')} fill="none"
            stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d={linePath(history, 'gils')} fill="none"
            stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* End dots */}
          <circle cx={toX(last.seq)} cy={toY(last.lads)} r="5" fill="#f59e0b" stroke="white" strokeWidth="2" />
          <circle cx={toX(last.seq)} cy={toY(last.gils)} r="5" fill="#7c3aed" stroke="white" strokeWidth="2" />

          {/* Innings divider */}
          <line x1={toX(20)} y1={PAD.t - 6} x2={toX(20)} y2={H - PAD.b}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,3" />
          <text x={toX(20)} y={PAD.t - 8} textAnchor="middle"
            style={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}>INN 2</text>

          {/* X-axis over labels */}
          {xLabels.map(({ seq, label }) => (
            <text key={seq} x={toX(seq)} y={H - 8} textAnchor="middle"
              style={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}>
              {label}
            </text>
          ))}
          <text x={W / 2} y={H - 1} textAnchor="middle"
            style={{ fontSize: 9, fontWeight: 600, fill: '#cbd5e1' }}>Overs</text>

          {/* Hover crosshair */}
          {hp && (
            <>
              <line x1={toX(hp.seq)} y1={PAD.t - 4} x2={toX(hp.seq)} y2={H - PAD.b}
                stroke="#64748b" strokeWidth="1" strokeDasharray="3,3" />
              <circle cx={toX(hp.seq)} cy={toY(hp.lads)} r="5.5" fill="#f59e0b" stroke="white" strokeWidth="2" />
              <circle cx={toX(hp.seq)} cy={toY(hp.gils)} r="5.5" fill="#7c3aed" stroke="white" strokeWidth="2" />
            </>
          )}

          {/* Invisible overlay for mouse events (ensures full area is responsive) */}
          <rect x={PAD.l} y={PAD.t} width={inner.w} height={inner.h} fill="transparent" />
        </svg>

        {/* Hover tooltip */}
        {hp && hpOver && (
          <div
            className="absolute top-4 z-20 pointer-events-none
              bg-gray-900 text-white rounded-xl shadow-2xl px-4 py-3 min-w-[200px] max-w-[260px]"
            style={{ [tipLeft ? 'left' : 'right']: `${tipLeft ? mouseX + 12 : containerWidth - mouseX + 12}px` }}>
            {/* Over header */}
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Inn {hpOver.inn} · Over {hpOver.ov}
            </div>
            {/* Totals + delta */}
            <div className="flex gap-4 mb-2">
              <div className="flex flex-col">
                <span className={`text-lg font-black leading-none ${hp.lads >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                  {fmtPts(hp.lads)}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  Lads
                  {prevHp && (
                    <span className="ml-1 text-slate-500">
                      ({fmtPts(hp.lads - prevHp.lads)} ov)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-col">
                <span className={`text-lg font-black leading-none ${hp.gils >= 0 ? 'text-violet-400' : 'text-red-400'}`}>
                  {fmtPts(hp.gils)}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  Gils
                  {prevHp && (
                    <span className="ml-1 text-slate-500">
                      ({fmtPts(hp.gils - prevHp.gils)} ov)
                    </span>
                  )}
                </span>
              </div>
            </div>
            {/* Events */}
            {hp.events && hp.events.length > 0 && (
              <div className="border-t border-white/10 pt-2 space-y-1">
                {hp.events.map((ev, i) => (
                  <div key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                    <span className="text-slate-500">·</span>{ev}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LiveScorecard({
  matchId, ladsPicks, gilsPicks, liveData, loading, lastUpdated,
  savedLadsBreakdown, savedGilsBreakdown,
}: {
  matchId: number;
  ladsPicks: PlayerPick[];
  gilsPicks: PlayerPick[];
  liveData: LiveData | null;
  loading: boolean;
  lastUpdated: Date | null;
  savedLadsBreakdown?: Array<{ name: string; activeName: string; pts: number; batPts: number; bowlPts: number; fieldPts: number; multiplier: import('@/lib/types').Multiplier | null; isSubstituted: boolean }>;
  savedGilsBreakdown?: Array<{ name: string; activeName: string; pts: number; batPts: number; bowlPts: number; fieldPts: number; multiplier: import('@/lib/types').Multiplier | null; isSubstituted: boolean }>;
}) {
  const historyKey = `ipl-chart-${matchId}`;

  // Valid over-position range: 0–39.6 (both innings of a T20 match)
  const isValidSeq = (s: number) => s >= 0 && s <= 40;

  // Seed from localStorage first (instant, no flash), then merge Supabase history on mount.
  // Filter out old data that was stored in wrong formats (raw ESPN integers, adjusted offsets, etc.)
  const [history, setHistory] = useState<HistoryPoint[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(historyKey);
      const parsed = raw ? (JSON.parse(raw) as HistoryPoint[]) : [];
      return parsed.filter(p => isValidSeq(p.seq));
    } catch { return []; }
  });

  // On mount: trigger reconstruction from ESPN data (works for past AND live games).
  // The reconstruct endpoint fetches ESPN, rebuilds the full chart using commentary,
  // merges with any existing Supabase snapshots, saves, and returns the merged result.
  // This means opening ANY match page — even days later — auto-populates the chart.
  useEffect(() => {
    fetch(`/api/reconstruct/${matchId}`)
      .then(r => r.ok ? r.json() : null)
      .then((remote: HistoryPoint[] | null) => {
        if (!Array.isArray(remote) || remote.length === 0) return;
        setHistory(prev => {
          // Discard any old-format points before merging
          const validRemote = remote.filter(p => isValidSeq(p.seq));
          const validPrev   = prev.filter(p => isValidSeq(p.seq));
          if (validRemote.length === 0) return validPrev;
          // Merge: real-time snapshots win at their seq; reconstruction fills the gaps.
          // Always keep events from remote (old localStorage entries won't have them).
          const seqMap = new Map(validRemote.map(p => [p.seq, p]));
          for (const p of validPrev) {
            const rec = seqMap.get(p.seq);
            seqMap.set(p.seq, { ...p, events: p.events ?? rec?.events });
          }
          const merged = Array.from(seqMap.values()).sort((a, b) => a.seq - b.seq);
          try { localStorage.setItem(historyKey, JSON.stringify(merged)); } catch { /* quota */ }
          return merged;
        });
      })
      .catch(() => { /* network error — use localStorage */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const [regenerating, setRegenerating] = useState(false);

  function handleRegenerate() {
    setRegenerating(true);
    fetch(`/api/reconstruct/${matchId}`)
      .then(r => r.ok ? r.json() : null)
      .then((remote: HistoryPoint[] | null) => {
        if (!Array.isArray(remote) || remote.length === 0) return;
        const valid = remote.filter(p => isValidSeq(p.seq));
        if (valid.length === 0) return;
        const sorted = [...valid].sort((a, b) => a.seq - b.seq);
        setHistory(sorted);
        try { localStorage.setItem(historyKey, JSON.stringify(sorted)); } catch { /* quota */ }
      })
      .catch(() => {})
      .finally(() => setRegenerating(false));
  }

  // Compute totals unconditionally (hooks must all come before any return)
  const allPicks = [...ladsPicks, ...gilsPicks];
  const aggBatsmen = liveData
    ? Object.values(liveData.innings).flatMap(inn => calcLiveBatsmen(inn.batting, allPicks))
    : [];
  const aggBowlers = liveData
    ? Object.values(liveData.innings).flatMap(inn => calcLiveBowlers(inn.bowling, allPicks))
    : [];
  const playingEleven = liveData?.playingEleven ?? [];
  const ladsAgg = calcLiveFantasyTotal(aggBatsmen, aggBowlers, ladsPicks, playingEleven);
  const gilsAgg = calcLiveFantasyTotal(aggBatsmen, aggBowlers, gilsPicks, playingEleven);

  // Use saved breakdown as fallback when live breakdown is all-zero (e.g. completed matches)
  const ladsBreakdown = (ladsAgg.breakdown.some(b => b.pts !== 0) ? ladsAgg.breakdown : null) ?? savedLadsBreakdown ?? ladsAgg.breakdown;
  const gilsBreakdown = (gilsAgg.breakdown.some(b => b.pts !== 0) ? gilsAgg.breakdown : null) ?? savedGilsBreakdown ?? gilsAgg.breakdown;

  // When live innings data is absent (ESPN returns "Scheduled" for completed matches),
  // fall back to the final point in chart history for the headline totals.
  const lastHistoryPt = history.length > 0 ? history[history.length - 1] : null;
  const ladsDisplayTotal = ladsAgg.rawTotal !== 0 ? Math.round(ladsAgg.rawTotal) : (lastHistoryPt?.lads ?? 0);
  const gilsDisplayTotal = gilsAgg.rawTotal !== 0 ? Math.round(gilsAgg.rawTotal) : (lastHistoryPt?.gils ?? 0);

  // Append a history point whenever liveData updates, keyed by commentary sequence (ball number).
  // Saves to both localStorage (instant) and Supabase (durable, cross-session).
  useEffect(() => {
    if (!liveData?.status.isLive) return;
    const ladsT = Math.round(ladsAgg.rawTotal);
    const gilsT = Math.round(gilsAgg.rawTotal);
    // Derive current ball from the highest sequence number in commentaries
    const maxSeq = liveData.commentaries.reduce<number>((m, c) => {
      const s = c.sequence ?? 0;
      return s > m ? s : m;
    }, 0);
    if (maxSeq === 0) return; // no commentary yet, skip
    // Convert ESPN integer seq to 0–39.6 over-position
    const overPos = seqToOverPos(maxSeq);
    if (overPos === null) return; // unrecognised format

    setHistory(prev => {
      const last = prev[prev.length - 1];
      if (last && last.seq === overPos && last.lads === ladsT && last.gils === gilsT) return prev;
      const point = { seq: overPos, lads: ladsT, gils: gilsT };
      const next = [...prev.filter(p => p.seq !== overPos), point];
      next.sort((a, b) => a.seq - b.seq);
      // Save locally for instant restore
      try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* quota */ }
      // Save to Supabase for cross-session persistence (fire-and-forget)
      fetch(`/api/snapshots/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(point),
      }).catch(() => { /* non-critical */ });
      return next;
    });
  }, [liveData]);

  if (!liveData) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
        <div className="text-gray-400 text-sm">{loading ? 'Loading live data…' : 'No live data yet'}</div>
      </div>
    );
  }

  const { status, innings, commentaries } = liveData;
  const showSidePanels = ladsPicks.length > 0 || gilsPicks.length > 0;

  // Group commentaries by innings+over for display.
  // Key = innings * 1000 + over (e.g. innings 2, over 7 → 2007)
  type CommEntry = { text: string; over: string; sequence?: number };
  type OverGroup = { innings: number; over: number; balls: CommEntry[] };
  const overGroupMap: Map<number, OverGroup> = new Map();
  for (const c of commentaries) {
    const d = c.sequence != null ? decodeSeq(c.sequence) : null;
    const key = d ? d.innings * 1000 + d.over : -1;
    if (!overGroupMap.has(key)) {
      overGroupMap.set(key, { innings: d?.innings ?? 0, over: d?.over ?? 0, balls: [] });
    }
    overGroupMap.get(key)!.balls.push(c);
  }
  const sortedOvers = Array.from(overGroupMap.entries()).sort((a, b) => b[0] - a[0]);

  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status.isLive && (
            <span className="flex items-center gap-1.5 text-sm font-bold text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse" />
              LIVE
            </span>
          )}
          {status.isComplete && <span className="text-sm font-bold text-green-600">RESULT</span>}
          {!status.isLive && !status.isComplete && (
            <span className="text-sm text-gray-500">{status.description}</span>
          )}
        </div>
        {lastUpdated && (
          <span className="text-xs text-gray-400">
            Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {/* Fixed side panels — fill viewport margins at 2xl (1536px+).
          max-w-5xl = 64rem = 1024px, so each side has calc(50vw - 32rem) available. */}
      {showSidePanels && (
        <>
          <div className="fixed left-0 bottom-0 hidden 2xl:flex flex-col z-30 p-2"
            style={{ top: '56px', width: 'calc(50vw - 32rem)' }}>
            <SidePanel
              label="LADS" total={ladsDisplayTotal}
              breakdown={ladsBreakdown}
              color="#d97706" textColor={ladsDisplayTotal >= 0 ? 'text-green-600' : 'text-red-500'}
              borderColor="border-amber-200" bgColor="bg-amber-50"
            />
          </div>
          <div className="fixed right-0 bottom-0 hidden 2xl:flex flex-col z-30 p-2"
            style={{ top: '56px', width: 'calc(50vw - 32rem)' }}>
            <SidePanel
              label="GILS" total={gilsDisplayTotal}
              breakdown={gilsBreakdown}
              color="#7c3aed" textColor={gilsDisplayTotal >= 0 ? 'text-green-600' : 'text-red-500'}
              borderColor="border-violet-200" bgColor="bg-violet-50"
            />
          </div>
        </>
      )}

      {/* Mini totals bar — shown below 2xl where fixed panels aren't visible */}
      {showSidePanels && (
        <div className="flex gap-3 2xl:hidden">
          <div className="flex-1 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-600">Lads</div>
            <motion.div key={ladsDisplayTotal} initial={{ scale: 1.1 }} animate={{ scale: 1 }}
              className={`text-3xl font-black ${ladsDisplayTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {ladsDisplayTotal > 0 ? `+${ladsDisplayTotal}` : ladsDisplayTotal}
            </motion.div>
          </div>
          <div className="flex-1 rounded-xl border-2 border-violet-200 bg-violet-50 p-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-violet-600">Gils</div>
            <motion.div key={gilsDisplayTotal} initial={{ scale: 1.1 }} animate={{ scale: 1 }}
              className={`text-3xl font-black ${gilsDisplayTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {gilsDisplayTotal > 0 ? `+${gilsDisplayTotal}` : gilsDisplayTotal}
            </motion.div>
          </div>
        </div>
      )}

      {/* Full-width scorecard + commentary */}
      <div className="space-y-4">

          {/* Points Race chart — show once we have 2+ history points */}
          {showSidePanels && (
            <ProgressChart
              history={history}
              onRegenerate={handleRegenerate}
            />
          )}
          {regenerating && (
            <div className="text-center text-xs text-gray-400 animate-pulse py-1">Rebuilding chart from ESPN…</div>
          )}

          {Object.entries(innings).map(([teamName, inning]) => {
            const batsmen = calcLiveBatsmen(inning.batting, allPicks);
            const bowlers = calcLiveBowlers(inning.bowling, allPicks);

            return (
              <div key={teamName} className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
                {/* Innings header */}
                <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100"
                  style={{ background: 'var(--ipl-navy)' }}>
                  <div>
                    <span className="text-white font-bold text-sm">{teamName}</span>
                    {inning.total && <span className="text-blue-200 text-xs ml-3">{inning.total}</span>}
                  </div>
                </div>

                {/* Batting table */}
                {batsmen.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-3 py-2 font-medium">Batter</th>
                          <th className="text-right px-2 py-2">R</th>
                          <th className="text-right px-2 py-2">B</th>
                          <th className="text-right px-2 py-2">4s</th>
                          <th className="text-right px-2 py-2">6s</th>
                          <th className="text-right px-2 py-2">SR</th>
                          <th className="text-right px-3 py-2">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {batsmen.map(b => {
                            const inLads = isLadsPick(b.playerName, ladsPicks);
                            const inGils = isGilsPick(b.playerName, gilsPicks);
                            const ladsM = getLadsMultiplier(b.playerName, ladsPicks);
                            const gilsM = getGilsMultiplier(b.playerName, gilsPicks);
                            const rowBg = inLads && inGils
                              ? 'bg-gradient-to-r from-amber-50/60 to-violet-50/60'
                              : inLads ? 'bg-amber-50/70' : inGils ? 'bg-violet-50/70' : '';

                            // Per-row pts: use combined raw (batting-only here) with the pick's multiplier
                            // For display simplicity, show individual discipline pts
                            const ladsDisplayPts = inLads && ladsM ? Math.round(b.finalPoints) : null;
                            const gilsDisplayPts = inGils && gilsM ? Math.round(b.finalPoints) : null;

                            return (
                              <motion.tr key={b.playerName}
                                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                                className={`border-b border-gray-50 transition-colors ${rowBg}`}>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <OwnerDots lads={inLads} gils={inGils} />
                                    <div>
                                      <div className="font-semibold text-gray-800 text-sm">{b.playerName}</div>
                                      <div className="text-xs text-gray-400 max-w-[220px]" title={b.dismissal}
                                        style={{ overflowWrap: 'anywhere' }}>
                                        {b.isOut ? formatDismissal(b.dismissal) : <span className="text-green-600 font-medium">batting*</span>}
                                      </div>
                                    </div>
                                    {inLads && ladsM && <MultiBadge m={ladsM} owner="lads" />}
                                    {inGils && gilsM && <MultiBadge m={gilsM} owner="gils" />}
                                  </div>
                                </td>
                                <td className="text-right px-2 py-2 font-bold text-gray-900">{b.runs}</td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.balls}</td>
                                <td className="text-right px-2 py-2 text-orange-500 font-semibold">{b.fours || <span className="text-gray-400 font-normal">0</span>}</td>
                                <td className="text-right px-2 py-2 text-green-600 font-semibold">{b.sixes || <span className="text-gray-400 font-normal">0</span>}</td>
                                <td className="text-right px-2 py-2 text-gray-500">{b.strikeRate}</td>
                                <td className="text-right px-3 py-2">
                                  {inLads && ladsDisplayPts != null ? <PtsChip pts={ladsDisplayPts} /> :
                                   inGils && gilsDisplayPts != null ? <PtsChip pts={gilsDisplayPts} /> :
                                   <span className="text-xs text-gray-300">{b.fantasyPoints > 0 ? `+${b.fantasyPoints}` : b.fantasyPoints}</span>}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bowling table */}
                {bowlers.length > 0 && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 font-medium">Bowler</th>
                          <th className="text-right px-2 py-2">O</th>
                          <th className="text-right px-2 py-2">M</th>
                          <th className="text-right px-2 py-2">R</th>
                          <th className="text-right px-2 py-2 text-red-500">W</th>
                          <th className="text-right px-2 py-2">Eco</th>
                          <th className="text-right px-3 py-2">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {bowlers.map(b => {
                            const inLads = isLadsPick(b.playerName, ladsPicks);
                            const inGils = isGilsPick(b.playerName, gilsPicks);
                            const ladsM = getLadsMultiplier(b.playerName, ladsPicks);
                            const gilsM = getGilsMultiplier(b.playerName, gilsPicks);
                            const rowBg = inLads && inGils
                              ? 'bg-gradient-to-r from-amber-50/60 to-violet-50/60'
                              : inLads ? 'bg-amber-50/70' : inGils ? 'bg-violet-50/70' : '';

                            return (
                              <motion.tr key={b.playerName}
                                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                                className={`border-b border-gray-50 transition-colors ${rowBg}`}>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <OwnerDots lads={inLads} gils={inGils} />
                                    <span className="font-semibold text-gray-800 text-sm">{b.playerName}</span>
                                    {inLads && ladsM && <MultiBadge m={ladsM} owner="lads" />}
                                    {inGils && gilsM && <MultiBadge m={gilsM} owner="gils" />}
                                  </div>
                                </td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.overs}</td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.maidens}</td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.runs}</td>
                                <td className={`text-right px-2 py-2 font-bold ${b.wickets > 0 ? 'text-red-600' : 'text-gray-400'}`}>{b.wickets}</td>
                                <td className="text-right px-2 py-2 text-gray-500">{b.economy}</td>
                                <td className="text-right px-3 py-2">
                                  {(inLads || inGils) ? <PtsChip pts={Math.round(b.finalPoints)} /> : (
                                    <span className="text-xs text-gray-300">{b.fantasyPoints > 0 ? `+${b.fantasyPoints}` : b.fantasyPoints}</span>
                                  )}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Commentary — IPL style ball-by-ball */}
          {commentaries.length > 0 && (
            <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2"
                style={{ background: 'var(--ipl-navy)' }}>
                <span className="text-white font-bold text-xs uppercase tracking-widest">Ball-by-Ball</span>
              </div>
              <div className="divide-y divide-gray-50">
                {sortedOvers.map(([key, group]) => (
                  <div key={key}>
                    {/* Over header with ball summary */}
                    {key >= 0 && (
                      <div className="px-4 py-2 bg-gray-50 flex items-center gap-3">
                        <span className="text-xs font-black text-gray-500 uppercase tracking-wide w-16">
                          {group.innings === 2 ? 'Inn 2 · ' : ''}Ov {group.over}
                        </span>
                        <div className="flex gap-1">
                          {[...group.balls].reverse().map((c, i) => (
                            <BallCircle key={i} text={c.text} />
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Individual balls */}
                    <div className="divide-y divide-gray-50">
                      {group.balls.map((c, i) => {
                        const over = formatOver(c.sequence);
                        const t = c.text.toUpperCase();
                        const isSix = t.includes(' SIX') || t.includes(', 6');
                        const isFour = t.includes(' FOUR') || t.includes(', 4');
                        const isWicket = t.includes(' W ') || t.includes('WICKET') || t.includes('LBW') ||
                          t.includes('CAUGHT') || t.includes('BOWLED') || t.includes('STUMPED') || t.includes('RUN OUT');
                        return (
                          <div key={i} className={`flex items-start gap-3 px-4 py-2.5 ${
                            isWicket ? 'bg-red-50' : isSix ? 'bg-green-50' : isFour ? 'bg-amber-50' : ''
                          }`}>
                            {over && (
                              <span className="text-[11px] font-mono font-bold text-gray-400 w-8 shrink-0 pt-0.5">{over}</span>
                            )}
                            <BallCircle text={c.text} />
                            <span className={`text-sm leading-snug ${
                              isWicket ? 'text-red-700 font-semibold' :
                              isSix ? 'text-green-700 font-semibold' :
                              isFour ? 'text-amber-700 font-semibold' :
                              'text-gray-600'
                            }`}>{c.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      {/* Legend */}
      {showSidePanels && (
        <div className="flex gap-4 text-xs text-gray-400 justify-center pt-1">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Lads pick</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> Gils pick</span>
        </div>
      )}
    </div>
  );
}
