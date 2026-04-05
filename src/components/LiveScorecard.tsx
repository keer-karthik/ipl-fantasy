'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { calcLiveBatsmen, calcLiveBowlers, calcLiveFantasyTotal } from '@/lib/liveScoring';
import { decodeSeq, seqToOverPos } from '@/lib/espnSeq';
import type { PlayerPick, Multiplier } from '@/lib/types';
import type { LiveData } from '@/hooks/useLiveScore';
import { multiplierBadge } from '@/lib/scoring';
import { iplImageUrl } from '@/lib/playerImage';

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
// Per-player total (÷5 of team): 0–25 red | 25–65 yellow | 65–105 green | 105+ purple
export function tieredPtsColor(n: number): string {
  if (n < 25)  return 'text-red-500';
  if (n < 65)  return 'text-amber-400';
  if (n < 105) return 'text-green-500';
  return 'text-violet-600';
}
// Team total: 0–130 red | 130–330 yellow | 330–530 green | 530+ purple
export function tieredTotalColor(n: number): string {
  if (n < 0)   return 'text-red-500';
  if (n < 130) return 'text-red-500';
  if (n < 330) return 'text-amber-400';
  if (n < 530) return 'text-green-500';
  return 'text-violet-600';
}
function shortName(n: string) {
  const parts = n.trim().split(' ');
  return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts[0][0]}.` : n;
}

const INITIALS_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-violet-600',
  'bg-amber-500', 'bg-rose-600', 'bg-cyan-600',
];

export type BreakdownItem = {
  name: string; activeName: string; pts: number;
  batPts: number; bowlPts: number; fieldPts: number;
  multiplier: Multiplier | null; isSubstituted: boolean;
  batStats?: { runs: number; balls: number; fours: number; sixes: number; strikeRate: number; isOut: boolean };
  bowlStats?: { overs: number; maidens: number; runs: number; wickets: number; economy: number };
};

// ─── Point breakdown helpers ──────────────────────────────────────────────────
type BdLine = { label: string; pts: number };

function getBatBreakdown(s: NonNullable<BreakdownItem['batStats']>, battingPos = 1): BdLine[] {
  const out: BdLine[] = [];
  if (battingPos >= 7 && s.runs < 10) { out.push({ label: 'Lower-order, <10 runs', pts: 0 }); return out; }
  if (s.isOut && s.runs === 0) { out.push({ label: 'Duck', pts: -30 }); return out; }
  if (s.runs <= 10) { out.push({ label: `${s.runs} runs (≤10 penalty)`, pts: -20 }); return out; }
  out.push({ label: `${s.runs} runs`, pts: s.runs });
  if (s.runs >= 90) out.push({ label: '90+ milestone', pts: 35 });
  if (s.runs >= 70) out.push({ label: '70+ milestone', pts: 25 });
  if (s.runs >= 40) out.push({ label: '40+ milestone', pts: 15 });
  if (s.runs >= 25) out.push({ label: '25+ milestone', pts: 5 });
  if (s.balls > 0) {
    const sr = (s.runs / s.balls) * 100;
    if (sr >= 300 && s.balls >= 25)      out.push({ label: `SR ${sr.toFixed(0)} (≥300)`, pts: 50 });
    else if (sr >= 250 && s.balls >= 20) out.push({ label: `SR ${sr.toFixed(0)} (≥250)`, pts: 25 });
    else if (sr >= 200 && s.balls >= 10) out.push({ label: `SR ${sr.toFixed(0)} (≥200)`, pts: 10 });
    else if (sr <= 100 && s.balls >= 10) out.push({ label: `SR ${sr.toFixed(0)} (≤100)`, pts: -20 });
  }
  return out;
}

function getBowlBreakdown(s: NonNullable<BreakdownItem['bowlStats']>): BdLine[] {
  const out: BdLine[] = [];
  if (s.overs === 0) return out;
  if (s.wickets > 0) out.push({ label: `${s.wickets}W × 25`, pts: s.wickets * 25 });
  if (s.maidens > 0) out.push({ label: `${s.maidens} maiden${s.maidens > 1 ? 's' : ''} × 40`, pts: s.maidens * 40 });
  if (s.overs >= 3) {
    const eco = s.runs / s.overs;
    if      (eco <= 4)  out.push({ label: `ECO ${eco.toFixed(2)} (≤4.00)`, pts: 80 });
    else if (eco <= 6)  out.push({ label: `ECO ${eco.toFixed(2)} (≤6.00)`, pts: 60 });
    else if (eco <= 8)  out.push({ label: `ECO ${eco.toFixed(2)} (≤8.00)`, pts: 30 });
    else if (eco >= 14) out.push({ label: `ECO ${eco.toFixed(2)} (≥14)`, pts: -40 });
    else if (eco >= 12) out.push({ label: `ECO ${eco.toFixed(2)} (≥12)`, pts: -30 });
    else if (eco >= 10) out.push({ label: `ECO ${eco.toFixed(2)} (≥10)`, pts: -20 });
  }
  if (s.wickets === 0 && s.overs >= 2) out.push({ label: 'No wickets', pts: -20 });
  if (s.wickets >= 5)      out.push({ label: '5-wkt haul bonus', pts: 35 });
  else if (s.wickets >= 3) out.push({ label: '3-wkt bonus', pts: 20 });
  return out;
}

// ─── Tiered background for score strip ───────────────────────────────────────
function tieredBgClass(n: number): string {
  if (n < 25)  return 'bg-red-500';
  if (n < 65)  return 'bg-amber-400';
  if (n < 105) return 'bg-green-500';
  return 'bg-violet-600';
}

// ─── Player trading card: photo | breakdown ledger | vertical score strip ──────
function PlayerTradingCard({ b, isLads }: { b: BreakdownItem; isLads: boolean }) {
  const iplUrl = iplImageUrl(b.activeName);
  const [imgOk, setImgOk] = useState(!!iplUrl);

  const initials = b.activeName.trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const colorSeed = b.activeName.charCodeAt(0) % INITIALS_COLORS.length;

  const topBorder = isLads ? 'border-t-[3px] border-amber-400' : 'border-t-[3px] border-violet-500';
  const multBadgeBg: Record<string, string> = {
    yellow: 'bg-gray-200 text-gray-700',
    green:  'bg-green-600 text-white',
    purple: 'bg-violet-600 text-white',
    allin:  'bg-orange-500 text-white',
  };
  const badgeBg = b.multiplier ? (multBadgeBg[b.multiplier] ?? 'bg-gray-200 text-gray-700') : '';

  const FONT: React.CSSProperties = {
    fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
    fontWeight: 900,
  };

  const batLines  = b.batStats  ? getBatBreakdown(b.batStats)   : [];
  const bowlLines = b.bowlStats ? getBowlBreakdown(b.bowlStats) : [];
  const rawPts    = b.batPts + b.bowlPts + b.fieldPts;
  const gainFactor: Record<string, number> = { yellow: 1, green: 2, purple: 3, allin: 5 };
  const multX = b.multiplier ? (gainFactor[b.multiplier] ?? 1) : 1;
  const hasAnyActivity = b.batPts !== 0 || b.bowlPts !== 0 || b.fieldPts !== 0;

  // Line item renderer — label left, pts right
  const LedgerRow = ({ label, pts }: { label: string; pts: number }) => (
    <div className="flex justify-between items-baseline" style={{ ...FONT, fontSize: 12, fontWeight: 600 }}>
      <span className="text-gray-500 truncate pr-1">{label}</span>
      <span className={`shrink-0 font-black ${pts > 0 ? 'text-gray-800' : pts < 0 ? 'text-red-500' : 'text-gray-400'}`}>
        {pts > 0 ? `+${pts}` : pts === 0 ? '0' : pts}
      </span>
    </div>
  );

  return (
    <motion.div
      key={b.name}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-2xl overflow-hidden shadow-md bg-white ${topBorder} flex flex-row`}
      style={{ flex: '0 0 auto', minHeight: 110 }}
    >
      {/* ══ LEFT 38%: full-height photo ══ */}
      <div className="relative bg-gray-100 shrink-0 overflow-hidden" style={{ width: '38%' }}>
        {iplUrl && imgOk ? (
          <img
            src={iplUrl}
            alt={b.activeName}
            className="w-full h-full object-contain object-top"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${INITIALS_COLORS[colorSeed]}`}>
            <span className="text-3xl text-white/80" style={FONT}>{initials}</span>
          </div>
        )}
        {/* Multiplier badge */}
        {b.multiplier && (
          <span
            className={`absolute top-1.5 left-1.5 rounded-md shadow ${badgeBg}`}
            style={{ ...FONT, fontSize: 15, padding: '3px 8px', lineHeight: 1.3, letterSpacing: '0.06em' }}
          >
            {multiplierBadge(b.multiplier)}
          </span>
        )}
        {/* Name strip — semi-transparent overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)' }}>
          <div className="text-white leading-tight truncate uppercase"
            style={{ ...FONT, fontSize: b.activeName.length > 13 ? 10 : 12, letterSpacing: '0.05em' }}>
            {b.activeName}
          </div>
          {b.isSubstituted && (
            <div className="text-white/60 leading-none" style={{ fontSize: 8, fontWeight: 600 }}>
              sub for {b.name}
            </div>
          )}
        </div>
      </div>

      {/* ══ MIDDLE flex-1: breakdown ledger ══ */}
      <div className="flex-1 flex flex-col min-w-0 px-2.5 py-2 overflow-hidden">
        {!hasAnyActivity && (
          <div className="flex-1 flex items-center justify-center text-gray-200" style={{ ...FONT, fontSize: 13 }}>
            —
          </div>
        )}

        {/* BATTING */}
        {(b.batPts !== 0 || batLines.length > 0) && (
          <div className="mb-1.5">
            <div className="flex items-baseline gap-1.5 mb-0.5">
              <span className="text-black font-black uppercase tracking-widest" style={{ ...FONT, fontSize: 11 }}>BATTING</span>
              {b.batStats && (
                <span className="text-gray-400 font-semibold" style={{ fontSize: 11 }}>
                  {b.batStats.runs}({b.batStats.balls})
                  {' '}SR {b.batStats.strikeRate.toFixed(0)}
                  {b.batStats.fours > 0 ? ` · ${b.batStats.fours}×4` : ''}
                  {b.batStats.sixes > 0 ? ` · ${b.batStats.sixes}×6` : ''}
                </span>
              )}
            </div>
            {batLines.length > 0
              ? batLines.map((ln, i) => <LedgerRow key={i} label={ln.label} pts={ln.pts} />)
              : <LedgerRow label="batting" pts={b.batPts} />
            }
          </div>
        )}

        {/* BOWLING */}
        {(b.bowlPts !== 0 || bowlLines.length > 0) && (
          <div className={`mb-1.5 ${b.batPts !== 0 ? 'pt-1.5 border-t border-gray-100' : ''}`}>
            <div className="flex items-baseline gap-1.5 mb-0.5">
              <span className="text-black font-black uppercase tracking-widest" style={{ ...FONT, fontSize: 11 }}>BOWLING</span>
              {b.bowlStats && (
                <span className="text-gray-400 font-semibold" style={{ fontSize: 11 }}>
                  {b.bowlStats.overs}-{b.bowlStats.maidens}-{b.bowlStats.runs}-{b.bowlStats.wickets}
                  {' '}ECO {b.bowlStats.economy.toFixed(2)}
                </span>
              )}
            </div>
            {bowlLines.length > 0
              ? bowlLines.map((ln, i) => <LedgerRow key={i} label={ln.label} pts={ln.pts} />)
              : <LedgerRow label="bowling" pts={b.bowlPts} />
            }
          </div>
        )}

        {/* FIELDING */}
        {b.fieldPts !== 0 && (
          <div className={`mb-1.5 ${(b.batPts !== 0 || b.bowlPts !== 0) ? 'pt-1.5 border-t border-gray-100' : ''}`}>
            <div className="flex items-baseline gap-1.5 mb-0.5">
              <span className="text-black font-black uppercase tracking-widest" style={{ ...FONT, fontSize: 11 }}>FIELDING</span>
            </div>
            <LedgerRow label={`${b.fieldPts / 10} dismissal${b.fieldPts / 10 !== 1 ? 's' : ''} × 10`} pts={b.fieldPts} />
          </div>
        )}

        {/* RAW + multiplier footer */}
        {hasAnyActivity && (
          <div className="mt-auto pt-1 border-t border-gray-200">
            <div className="flex justify-between items-baseline" style={{ ...FONT, fontSize: 11 }}>
              <span className="text-gray-400 tracking-widest uppercase">Raw</span>
              <span className="text-gray-600 font-black">{rawPts > 0 ? `+${rawPts}` : rawPts}</span>
            </div>
            {multX > 1 && (
              <div className="flex justify-between items-baseline" style={{ ...FONT, fontSize: 11 }}>
                <span className="text-gray-400">
                  {rawPts >= 0
                    ? `× ${multX} (${b.multiplier})`
                    : `× ${b.multiplier === 'purple' ? 1.5 : b.multiplier === 'allin' ? 2.5 : 1} (${b.multiplier})`}
                </span>
                <span className="text-gray-800 font-black">{b.pts > 0 ? `+${b.pts}` : b.pts}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ RIGHT ~16%: colored vertical score strip ══ */}
      <motion.div
        key={b.pts}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        className={`shrink-0 flex items-center justify-center overflow-hidden ${tieredBgClass(b.pts)}`}
        style={{ width: '16%' }}
      >
        <span
          className="text-white font-black leading-none whitespace-nowrap"
          style={{
            ...FONT,
            fontSize: 28,
            transform: 'rotate(-90deg)',
            display: 'block',
            letterSpacing: '0.02em',
          }}
        >
          {b.pts > 0 ? `+${b.pts}` : String(b.pts)}
        </span>
      </motion.div>
    </motion.div>
  );
}

// ─── Side panel ───────────────────────────────────────────────────────────────
export function SidePanel({
  label, total, breakdown, textColor, borderColor, bgColor,
}: {
  label: string; total: number;
  breakdown: BreakdownItem[];
  textColor: string; borderColor: string; bgColor: string;
}) {
  const isLads = label === 'LADS';
  const accentText   = isLads ? 'text-amber-600'  : 'text-violet-600';
  const dividerColor = isLads ? 'border-amber-100' : 'border-violet-100';

  const HEADER_FONT: React.CSSProperties = {
    fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
    fontWeight: 900,
    letterSpacing: '0.12em',
  };

  return (
    <div className={`flex-1 rounded-2xl border-2 ${borderColor} ${bgColor} flex flex-col overflow-hidden`}>

      {/* ── Header: label + total ── */}
      <div className="px-5 pt-5 pb-4">
        <div className={`uppercase ${accentText}`}
          style={{ ...HEADER_FONT, fontSize: '22px', letterSpacing: '0.22em', marginBottom: '2px' }}>
          {label}
        </div>
        <motion.div
          key={total}
          initial={{ scale: 1.06, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`font-black leading-none ${textColor}`}
          style={{ fontSize: 'clamp(3.5rem, 5vw, 6rem)' }}
        >
          {total > 0 ? `+${total}` : total}
        </motion.div>
        <div className="text-[13px] text-gray-400 mt-1 font-semibold tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif' }}>
          pts this game
        </div>
      </div>

      {/* ── Player cards — flex column so all 5 share available height equally ── */}
      <div className={`flex-1 overflow-y-auto border-t ${dividerColor} px-3 py-3 flex flex-col gap-2`}>
        {breakdown.map(b => (
          <PlayerTradingCard key={b.name} b={b} isLads={isLads} />
        ))}
      </div>
    </div>
  );
}

// ─── Live progression chart ───────────────────────────────────────────────────
// seq stored in HistoryPoint is a 0–39.6 over-position (seqToOverPos result).
// innings 1 occupies 0–19.6, innings 2 occupies 20–39.6.
interface HistoryPoint { seq: number; lads: number; gils: number; events?: string[] }

function ProgressChart({ history, onRegenerate, canonicalLads, canonicalGils }: {
  history: HistoryPoint[];
  onRegenerate: () => void;
  // When the match is complete, pass the authoritative totals from autoResultFromLive so the
  // chart header shows the same number as the Results tab and Dashboard.
  canonicalLads?: number;
  canonicalGils?: number;
}) {
  if (history.length < 1) return null;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const W = 640, H = 230, PAD = { l: 50, r: 22, t: 26, b: 40 };
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };

  // Define last first so SEQ_END can reference it
  const last = history[history.length - 1];

  const allVals = history.flatMap(p => [p.lads, p.gils]);
  const rawMin = Math.min(...allVals, 0);
  const rawMax = Math.max(...allVals, 0);
  const vPad = Math.max((rawMax - rawMin) * 0.14, 15);
  const minV = rawMin - vPad, maxV = rawMax + vPad;
  const range = maxV - minV || 1;

  // Dynamic X range: fills chart space during live matches; expands to full once Inn 2 starts
  const SEQ_START = 0;
  const SEQ_END = last.seq < 19 ? Math.max(last.seq + 2, 5) : 39.6;

  const toX = (seq: number) => PAD.l + ((seq - SEQ_START) / (SEQ_END - SEQ_START)) * inner.w;
  const toY = (v: number) => PAD.t + (1 - (v - minV) / range) * inner.h;
  const zeroY = toY(0);

  // Catmull-Rom → cubic bezier: smooth worm-style curves
  function smoothLinePath(pts: HistoryPoint[], key: 'lads' | 'gils') {
    if (pts.length < 2) return `M${toX(pts[0].seq).toFixed(1)},${toY(pts[0][key]).toFixed(1)}`;
    const c = pts.map(p => [toX(p.seq), toY(p[key])]);
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

  function smoothAreaPath(pts: HistoryPoint[], key: 'lads' | 'gils') {
    const line = smoothLinePath(pts, key);
    return `${line} L${toX(last.seq).toFixed(1)},${zeroY.toFixed(1)} L${toX(pts[0].seq).toFixed(1)},${zeroY.toFixed(1)} Z`;
  }

  // Y-axis ticks
  const ySpan = rawMax - rawMin;
  const step = ySpan > 400 ? 100 : ySpan > 200 ? 50 : ySpan > 100 ? 25 : 20;
  const yTicks: number[] = [0];
  for (let t = step; t <= rawMax + step; t += step) if (t <= rawMax + 5) yTicks.push(t);
  for (let t = -step; t >= rawMin - step; t -= step) if (t >= rawMin - 5) yTicks.push(t);

  const xLabels = [
    { seq: 0, label: '1' }, { seq: 4, label: '5' }, { seq: 9, label: '10' },
    { seq: 14, label: '15' }, { seq: 19, label: '20' }, { seq: 24, label: '25' },
    { seq: 29, label: '30' }, { seq: 34, label: '35' }, { seq: 39, label: '40' },
  ].filter(({ seq }) => seq <= SEQ_END + 1);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !containerRef.current) return;
    // getScreenCTM gives exact SVG-space coords, eliminating cursor offset from scaling/letterboxing
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());
    const containerRect = containerRef.current.getBoundingClientRect();
    setMouseX(e.clientX - containerRect.left);
    let best = 0, bestDist = Infinity;
    history.forEach((p, i) => {
      const d = Math.abs(toX(p.seq) - svgPt.x);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setHoverIdx(bestDist < inner.w / history.length * 2 ? best : null);
  };

  const hp = hoverIdx !== null ? history[hoverIdx] : null;
  const prevHp = hoverIdx !== null && hoverIdx > 0 ? history[hoverIdx - 1] : null;
  const hpOver = hp
    ? { inn: hp.seq >= 20 ? 2 : 1, ov: Math.floor(hp.seq >= 20 ? hp.seq - 20 : hp.seq) + 1 }
    : null;

  const containerWidth = containerRef.current?.clientWidth ?? 400;
  const tipLeft = mouseX < containerWidth * 0.55;
  const fmtPts = (n: number) => `${n > 0 ? '+' : ''}${n}`;
  const eventPts = history.filter(p => p.events && p.events.length > 0);

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>
      {/* Header */}
      <div style={{ background: 'var(--ipl-navy)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 900, fontSize: 14, color: 'white', letterSpacing: 0.5 }}>
          Points Race
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button onClick={onRegenerate}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'rgba(255,255,255,0.2)'; el.style.color = 'white'; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'rgba(255,255,255,0.1)'; el.style.color = 'rgba(255,255,255,0.65)'; }}>
            ↻ Regenerate
          </button>
          <div style={{ display: 'flex', gap: 18 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', flexShrink: 0 }} />
              Lads {fmtPts(canonicalLads ?? Math.round(last.lads))}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7c3aed', display: 'inline-block', flexShrink: 0 }} />
              Gils {fmtPts(canonicalGils ?? Math.round(last.gils))}
            </span>
          </div>
        </div>
      </div>

      {/* Chart — white background, SVG has no fixed height so it sizes by viewBox aspect ratio
          This eliminates letterboxing entirely and makes getScreenCTM accurate. */}
      <div ref={containerRef} style={{ position: 'relative', background: 'white' }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>

          <defs>
            <linearGradient id="ladsAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="gilsAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines only — clean like the reference worm */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} y1={toY(v)} x2={W - PAD.r} y2={toY(v)}
                stroke={v === 0 ? '#94a3b8' : '#f1f5f9'}
                strokeWidth={v === 0 ? 1 : 0.8} />
              <text x={PAD.l - 8} y={toY(v) + 4} textAnchor="end"
                style={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          ))}

          {/* Innings divider — only shown once Inn 2 data present */}
          {last.seq >= 19.5 && (
            <>
              <line x1={toX(20)} y1={PAD.t - 10} x2={toX(20)} y2={H - PAD.b}
                stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4,3" />
              <text x={toX(20)} y={PAD.t - 12} textAnchor="middle"
                style={{ fontSize: 8, fontWeight: 800, fill: '#94a3b8', letterSpacing: 1.5 }}>INN 2</text>
            </>
          )}

          {/* Gradient area fills */}
          <path d={smoothAreaPath(history, 'lads')} fill="url(#ladsAreaGrad)" />
          <path d={smoothAreaPath(history, 'gils')} fill="url(#gilsAreaGrad)" />

          {/* Smooth worm lines */}
          <path d={smoothLinePath(history, 'lads')} fill="none"
            stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={smoothLinePath(history, 'gils')} fill="none"
            stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Hollow event dots at overs where notable events occurred */}
          {eventPts.map((p, i) => (
            <g key={i}>
              <circle cx={toX(p.seq)} cy={toY(p.lads)} r="4" fill="white" stroke="#f59e0b" strokeWidth="2" />
              <circle cx={toX(p.seq)} cy={toY(p.gils)} r="4" fill="white" stroke="#7c3aed" strokeWidth="2" />
            </g>
          ))}

          {/* Terminal dots */}
          <circle cx={toX(last.seq)} cy={toY(last.lads)} r="5" fill="#f59e0b" stroke="white" strokeWidth="2.5" />
          <circle cx={toX(last.seq)} cy={toY(last.gils)} r="5" fill="#7c3aed" stroke="white" strokeWidth="2.5" />

          {/* X-axis baseline */}
          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#e2e8f0" strokeWidth="1" />

          {/* X-axis labels */}
          {xLabels.map(({ seq, label }) => (
            <text key={seq} x={toX(seq)} y={H - PAD.b + 14} textAnchor="middle"
              style={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
              {label}
            </text>
          ))}
          <text x={W - PAD.r} y={H - 6} textAnchor="end"
            style={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8', letterSpacing: 0.5 }}>Overs</text>

          {/* Hover crosshair */}
          {hp && (
            <>
              <line x1={toX(hp.seq)} y1={PAD.t} x2={toX(hp.seq)} y2={H - PAD.b}
                stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" />
              <circle cx={toX(hp.seq)} cy={toY(hp.lads)} r="5.5" fill="white" stroke="#f59e0b" strokeWidth="2.5" />
              <circle cx={toX(hp.seq)} cy={toY(hp.gils)} r="5.5" fill="white" stroke="#7c3aed" strokeWidth="2.5" />
            </>
          )}

          {/* Full inner overlay — ensures mouse events fire over empty areas */}
          <rect x={PAD.l} y={PAD.t} width={inner.w} height={inner.h} fill="transparent" />
        </svg>

        {/* Hover tooltip */}
        {hp && hpOver && (
          <div style={{
            position: 'absolute', top: 8, zIndex: 20, pointerEvents: 'none',
            [tipLeft ? 'left' : 'right']: `${tipLeft ? mouseX + 14 : containerWidth - mouseX + 14}px`,
            background: 'white',
            borderRadius: 12, padding: '12px 16px', minWidth: 190,
            boxShadow: '0 4px 24px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#94a3b8', marginBottom: 10, fontFamily: 'ui-monospace, monospace' }}>
              Inn {hpOver.inn} · Over {hpOver.ov}
            </div>
            <div style={{ display: 'flex', gap: 20, marginBottom: hp.events?.length ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 900, color: hp.lads >= 0 ? '#d97706' : '#ef4444', lineHeight: 1, fontFamily: 'ui-monospace, monospace' }}>
                  {fmtPts(hp.lads)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 5 }}>
                  Lads{prevHp && <span style={{ fontWeight: 400, color: '#94a3b8' }}> ({fmtPts(hp.lads - prevHp.lads)} ov)</span>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 900, color: hp.gils >= 0 ? '#7c3aed' : '#ef4444', lineHeight: 1, fontFamily: 'ui-monospace, monospace' }}>
                  {fmtPts(hp.gils)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 5 }}>
                  Gils{prevHp && <span style={{ fontWeight: 400, color: '#94a3b8' }}> ({fmtPts(hp.gils - prevHp.gils)} ov)</span>}
                </div>
              </div>
            </div>
            {hp.events && hp.events.length > 0 && (
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {hp.events.map((ev, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#cbd5e1', fontSize: 14 }}>·</span>{ev}
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
  savedLadsBreakdown, savedGilsBreakdown, storedLadsTotal, storedGilsTotal,
}: {
  matchId: number;
  ladsPicks: PlayerPick[];
  gilsPicks: PlayerPick[];
  liveData: LiveData | null;
  loading: boolean;
  lastUpdated: Date | null;
  savedLadsBreakdown?: Array<{ name: string; activeName: string; pts: number; batPts: number; bowlPts: number; fieldPts: number; multiplier: import('@/lib/types').Multiplier | null; isSubstituted: boolean }>;
  savedGilsBreakdown?: Array<{ name: string; activeName: string; pts: number; batPts: number; bowlPts: number; fieldPts: number; multiplier: import('@/lib/types').Multiplier | null; isSubstituted: boolean }>;
  storedLadsTotal?: number;
  storedGilsTotal?: number;
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

  const [regenerating, setRegenerating] = useState(false);
  const autoRegenTriggered = useRef(false);

  function applyRemote(remote: HistoryPoint[], replaceAll = false) {
    const valid = remote.filter(p => isValidSeq(p.seq));
    if (replaceAll) {
      // Full replace: trust the API completely (clears stale data even if result is empty)
      const sorted = [...valid].sort((a, b) => a.seq - b.seq);
      setHistory(sorted);
      try { localStorage.setItem(historyKey, JSON.stringify(sorted)); } catch { /* quota */ }
      return;
    }
    if (valid.length === 0) return;
    setHistory(prev => {
      const validPrev = prev.filter(p => isValidSeq(p.seq));
      // Reconstruction always wins — local cache only fills in events that remote lacks
      const seqMap = new Map(validPrev.map(p => [p.seq, p]));
      for (const p of valid) {
        const prev_ = seqMap.get(p.seq);
        seqMap.set(p.seq, { ...p, events: p.events ?? prev_?.events });
      }
      const merged = Array.from(seqMap.values()).sort((a, b) => a.seq - b.seq);
      try { localStorage.setItem(historyKey, JSON.stringify(merged)); } catch { /* quota */ }
      return merged;
    });
  }

  // On mount: trigger reconstruction from ESPN data (works for past AND live games).
  useEffect(() => {
    fetch(`/api/reconstruct/${matchId}`)
      .then(r => r.ok ? r.json() : null)
      .then((remote: HistoryPoint[] | null) => {
        applyRemote(Array.isArray(remote) ? remote : [], true);
      })
      .catch(() => { /* network error — use localStorage */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Auto-regenerate: if stored match totals diverge from chart's final point by
  // more than 5 pts, the chart is stale — trigger a silent regenerate once.
  useEffect(() => {
    if (autoRegenTriggered.current) return;
    if (history.length === 0) return;
    if (!storedLadsTotal && !storedGilsTotal) return;
    const last = history[history.length - 1];
    const ladsDiff = storedLadsTotal ? Math.abs(last.lads - storedLadsTotal) : 0;
    const gilsDiff = storedGilsTotal ? Math.abs(last.gils - storedGilsTotal) : 0;
    if (ladsDiff > 5 || gilsDiff > 5) {
      autoRegenTriggered.current = true;
      setRegenerating(true);
      fetch(`/api/reconstruct/${matchId}`)
        .then(r => r.ok ? r.json() : null)
        .then((remote: HistoryPoint[] | null) => {
          applyRemote(Array.isArray(remote) ? remote : [], true);
        })
        .catch(() => {})
        .finally(() => setRegenerating(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, storedLadsTotal, storedGilsTotal]);

  function handleRegenerate() {
    setRegenerating(true);
    fetch(`/api/reconstruct/${matchId}`)
      .then(r => r.ok ? r.json() : null)
      .then((remote: HistoryPoint[] | null) => {
        applyRemote(Array.isArray(remote) ? remote : [], true);
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

  // Fallback chain for side-panel headline totals:
  //   1. Live ESPN stats (most up-to-date during the match)
  //   2. Stored totals from autoResultFromLive (authoritative once match is complete)
  //   3. Last chart history point (last resort)
  const lastHistoryPt = history.length > 0 ? history[history.length - 1] : null;
  const ladsDisplayTotal = ladsAgg.rawTotal !== 0
    ? Math.round(ladsAgg.rawTotal)
    : (storedLadsTotal ?? lastHistoryPt?.lads ?? 0);
  const gilsDisplayTotal = gilsAgg.rawTotal !== 0
    ? Math.round(gilsAgg.rawTotal)
    : (storedGilsTotal ?? lastHistoryPt?.gils ?? 0);

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

      {/* Mini totals bar — shown below 2xl where fixed panels aren't visible */}
      {showSidePanels && (
        <div className="flex gap-3 2xl:hidden">
          <div className="flex-1 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-600">Lads</div>
            <motion.div key={ladsDisplayTotal} initial={{ scale: 1.1 }} animate={{ scale: 1 }}
              className={`text-3xl font-black ${tieredTotalColor(ladsDisplayTotal)}`}>
              {ladsDisplayTotal > 0 ? `+${ladsDisplayTotal}` : ladsDisplayTotal}
            </motion.div>
          </div>
          <div className="flex-1 rounded-xl border-2 border-violet-200 bg-violet-50 p-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-violet-600">Gils</div>
            <motion.div key={gilsDisplayTotal} initial={{ scale: 1.1 }} animate={{ scale: 1 }}
              className={`text-3xl font-black ${tieredTotalColor(gilsDisplayTotal)}`}>
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
              canonicalLads={storedLadsTotal}
              canonicalGils={storedGilsTotal}
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
