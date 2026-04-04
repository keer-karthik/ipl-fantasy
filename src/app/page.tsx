'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { useSeasonState } from '@/lib/store';
import { computeSideStats } from '@/lib/stats';
import { fixtures, formatDate, isToday, isUpcoming, getMatchStartIST } from '@/lib/data';
import { TeamLogo } from '@/components/TeamBadge';
import type { TeamName } from '@/lib/types';

// ─── Brand colors — single source of truth ───────────────────────────────────
const LADS  = '#f59e0b';   // amber-400
const GILS  = '#7c3aed';   // violet-600
const NAVY  = '#003087';

// ─── GSAP count-up number ────────────────────────────────────────────────────
function CountUp({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const obj = { n: 0 };
    gsap.to(obj, {
      n: value, duration: 1, ease: 'power3.out',
      onUpdate() { if (ref.current) ref.current.textContent = Math.round(obj.n).toLocaleString(); },
    });
  }, [value]);
  return <span ref={ref} className={className} style={style}>0</span>;
}

// ─── Form pill ────────────────────────────────────────────────────────────────
function FormPill({ result }: { result: 'W' | 'L' }) {
  return (
    <span className={`w-6 h-6 rounded text-[10px] font-black flex items-center justify-center ${
      result === 'W'
        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-200'
        : 'bg-red-500/10 text-red-500 border border-red-200'
    }`}>{result}</span>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {live && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
      <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em]">{children}</h2>
    </div>
  );
}

// ─── Stat row ─────────────────────────────────────────────────────────────────
function StatRow({ label, value, color, dot, small }: {
  label: string; value: string; color: string; dot?: string; small?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-[13px] text-gray-500 flex items-center gap-2">
        {dot && <span style={{ width: 6, height: 6, background: dot, borderRadius: 2, flexShrink: 0, display: 'inline-block' }} />}
        {label}
      </span>
      <span className={`font-bold ml-2 truncate ${small ? 'text-[12px]' : 'text-[13px]'}`} style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Side card ────────────────────────────────────────────────────────────────
function SideCard({ side, label, isLads }: { side: ReturnType<typeof computeSideStats>; label: string; isLads: boolean }) {
  const color = isLads ? LADS : GILS;
  const streak = side.currentStreak;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex-1 bg-white rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${color}28`, boxShadow: `0 1px 8px ${color}10` }}>

      {/* 3px accent bar */}
      <div style={{ height: 3, background: color }} />

      {/* Label + form */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <h2 style={{
          fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
          fontSize: 20, fontWeight: 900, letterSpacing: '0.1em',
          color, textTransform: 'uppercase', lineHeight: 1,
        }}>{label}</h2>
        <div className="flex gap-1">
          {side.form.map((r, i) => <FormPill key={i} result={r} />)}
          {side.form.length === 0 && <span className="text-xs text-gray-300 italic">No matches yet</span>}
        </div>
      </div>

      {/* W / L / PTS stat grid */}
      <div className="grid grid-cols-3 border-t border-b border-gray-100">
        {[
          { val: side.wins,        label: 'Wins',   textColor: '#059669' },
          { val: side.losses,      label: 'Losses', textColor: '#dc2626' },
          { val: side.totalPoints, label: 'Points', textColor: color },
        ].map((s, i) => (
          <div key={s.label} className={`py-4 text-center ${i < 2 ? 'border-r border-gray-100' : ''}`}>
            <div style={{
              fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
              fontSize: 30, fontWeight: 900, color: s.textColor, lineHeight: 1,
            }}>
              {s.val.toLocaleString()}
            </div>
            <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Detail stats */}
      <div className="px-5 py-2">
        <StatRow
          label="Current Streak"
          value={streak > 0 ? `${streak}W` : streak < 0 ? `${Math.abs(streak)}L` : '—'}
          color={streak > 0 ? '#059669' : streak < 0 ? '#dc2626' : '#9ca3af'}
        />
        <StatRow label="Purple Hits" value={String(side.purpleHits)} color="#7c3aed" dot="#7c3aed" />
        <StatRow label="All-in Used" value={`${side.allInUsed}/4`} color="#ef4444" dot="#ef4444" />
        {side.orangeCapRuns && (
          <StatRow label="Orange Cap"
            value={`${side.orangeCapRuns.player} — ${side.orangeCapRuns.runs} runs`}
            color="#ea580c" dot="#ea580c" small />
        )}
        {side.purpleCapWickets && (
          <StatRow label="Purple Cap"
            value={`${side.purpleCapWickets.player} — ${side.purpleCapWickets.wickets}w`}
            color="#7c3aed" dot="#7c3aed" small />
        )}
      </div>
    </motion.div>
  );
}

// ─── Next match countdown ─────────────────────────────────────────────────────
function NextMatchCountdown() {
  const [, setTick] = useState(0);

  // Re-render every second
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const now = new Date();
  const next = fixtures.find(f => getMatchStartIST(f) > now);
  if (!next) return null;

  const msLeft = getMatchStartIST(next).getTime() - now.getTime();
  const totalSecs = Math.max(0, Math.floor(msLeft / 1000));
  const days  = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = days > 0
    ? `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`
    : `${pad(hours)}:${pad(mins)}:${pad(secs)}`;

  return (
    <section>
      <SectionHeader>Next Match</SectionHeader>
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex flex-col sm:flex-row items-center gap-4"
        style={{ boxShadow: '0 1px 8px rgba(0,48,135,0.06)' }}>

        {/* Teams */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex flex-col items-center gap-1">
            <TeamLogo team={next.home as TeamName} size={40} />
            <span className="text-[11px] font-bold text-gray-500 hidden sm:block">{(next.home as string).split(' ').pop()}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-black text-gray-300 border border-gray-200 rounded-full w-6 h-6 flex items-center justify-center">vs</span>
            <span className="text-[10px] text-gray-400 font-semibold">M{next.match}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <TeamLogo team={next.away as TeamName} size={40} />
            <span className="text-[11px] font-bold text-gray-500 hidden sm:block">{(next.away as string).split(' ').pop()}</span>
          </div>
          <div className="hidden sm:block ml-2">
            <div className="text-xs font-semibold text-gray-600">{formatDate(next.date)} · {next.time} IST</div>
            <div className="text-[11px] text-gray-400">{next.venue}</div>
          </div>
        </div>

        {/* Countdown */}
        <div className="text-center shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Starts in</div>
          <div className="font-mono font-black tabular-nums" style={{
            fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
            color: NAVY,
            letterSpacing: '0.04em',
          }}>
            {timeStr}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ─── Match row ────────────────────────────────────────────────────────────────
function MatchRow({ fixture, hasEntry, isComplete, ladsTotal, gilsTotal, winner, isToday: today }: {
  fixture: typeof fixtures[0]; hasEntry: boolean; isComplete: boolean;
  ladsTotal?: number; gilsTotal?: number; winner?: 'lads' | 'gils' | null;
  isToday?: boolean;
}) {
  return (
    <Link href={`/match/${fixture.match}`}>
      <motion.div
        whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(0,48,135,0.07)' }}
        transition={{ duration: 0.15 }}
        className="rounded-xl border px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors"
        style={{
          background: today ? `${NAVY}08` : 'white',
          borderColor: today ? `${NAVY}20` : '#f3f4f6',
        }}>

        {/* Match ID */}
        <div className="shrink-0" style={{ minWidth: 40 }}>
          <span className="text-[11px] font-bold border border-orange-300 text-orange-600 px-1.5 py-0.5 rounded">
            M{fixture.match}
          </span>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo team={fixture.home as TeamName} size={30} />
            <span className="font-semibold text-sm text-gray-700 hidden sm:block truncate">{fixture.home}</span>
          </div>
          <div className="flex flex-col items-center shrink-0">
            <span className="text-[9px] font-black text-gray-300 border border-gray-200 rounded-full w-6 h-6 flex items-center justify-center">vs</span>
            {isComplete && ladsTotal !== undefined && gilsTotal !== undefined && (
              <span className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{ladsTotal}–{gilsTotal}</span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo team={fixture.away as TeamName} size={30} />
            <span className="font-semibold text-sm text-gray-700 hidden sm:block truncate">{fixture.away}</span>
          </div>
        </div>

        {/* Date */}
        <div className="text-right shrink-0 hidden md:block">
          <div className="text-xs font-semibold text-gray-600">{formatDate(fixture.date)}</div>
          <div className="text-[11px] text-gray-400">{fixture.time} · {fixture.venue}</div>
        </div>

        {/* CTA / result */}
        <div className="shrink-0">
          {isComplete ? (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg border" style={
              winner === 'lads'
                ? { background: `${LADS}12`, color: '#b45309', borderColor: `${LADS}40` }
                : winner === 'gils'
                  ? { background: `${GILS}12`, color: '#5b21b6', borderColor: `${GILS}40` }
                  : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }
            }>
              {winner ? `${winner === 'lads' ? 'Lads' : 'Gils'} win` : 'Tie'}
            </span>
          ) : hasEntry ? (
            <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: NAVY }}>
              Enter Stats
            </span>
          ) : (
            <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--ipl-orange)' }}>
              Select Picks
            </span>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { state, loaded } = useSeasonState();
  const lads = computeSideStats(state, 'lads');
  const gils = computeSideStats(state, 'gils');
  const todayMatches  = fixtures.filter(f => isToday(f.date));
  const upcomingMatches = fixtures.filter(f => isUpcoming(f.date) && !isToday(f.date)).slice(0, 6);
  const played = Object.values(state.matches).filter(m => m.isComplete).length;

  if (!loaded) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-t-transparent"
        style={{ borderColor: `${LADS} ${LADS} ${LADS} transparent` }} />
    </div>
  );

  const totalPts    = lads.totalPoints + gils.totalPoints;
  const ladsPct     = totalPts > 0 ? (lads.totalPoints / totalPts) * 100 : 50;

  return (
    <div className="space-y-8 pb-12">

      {/* ══ Hero ══ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="rounded-2xl overflow-hidden relative"
        style={{
          background: 'linear-gradient(160deg, #001857 0%, #003087 55%, #0044b0 100%)',
          boxShadow: '0 4px 32px rgba(0,48,135,0.25)',
        }}>

        {/* Subtle gradient texture */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 20% 50%, rgba(245,158,11,0.07) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(124,58,237,0.07) 0%, transparent 60%)',
        }} />
        {/* Bottom accent rule */}
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{
          background: `linear-gradient(to right, transparent 0%, ${LADS}60 30%, transparent 50%, ${GILS}60 70%, transparent 100%)`,
        }} />

        <div className="relative z-10 px-6 py-10 text-center">
          {/* Badge */}
          <div className="inline-block text-white/50 text-[9px] font-bold uppercase tracking-[0.3em] border border-white/15 px-3 py-1 rounded mb-5">
            TATA IPL 2026
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
            fontSize: 'clamp(2.2rem, 5vw, 3.8rem)',
            fontWeight: 900, letterSpacing: '0.04em',
            color: 'white', lineHeight: 1, marginBottom: 8,
          }}>
            Lads{' '}
            <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 300 }}>vs</span>
            {' '}Gils
          </h1>
          <p className="text-sm font-medium mb-10" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
            {played} / 70 matches played
          </p>

          {/* Score row */}
          <div className="flex items-center justify-center gap-8 md:gap-16">

            <div className="text-center">
              <CountUp value={lads.wins} style={{
                fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
                fontSize: 'clamp(3.5rem, 9vw, 6rem)', fontWeight: 900,
                color: LADS, lineHeight: 1, letterSpacing: '-0.02em', display: 'block',
              }} />
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
                color: `${LADS}80`, textTransform: 'uppercase', marginTop: 4,
              }}>Lads Wins</div>
            </div>

            <div className="flex flex-col items-center" style={{ gap: 4 }}>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
                Season
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)' }} />
            </div>

            <div className="text-center">
              <CountUp value={gils.wins} style={{
                fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
                fontSize: 'clamp(3.5rem, 9vw, 6rem)', fontWeight: 900,
                color: GILS, lineHeight: 1, letterSpacing: '-0.02em', display: 'block',
              }} />
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
                color: `${GILS}80`, textTransform: 'uppercase', marginTop: 4,
              }}>Gils Wins</div>
            </div>
          </div>

          {/* Points bar */}
          {totalPts > 0 && (
            <div className="mt-8 max-w-sm mx-auto">
              <div className="flex justify-between mb-2">
                <span style={{ fontSize: 12, fontWeight: 700, color: `${LADS}cc` }}>
                  {lads.totalPoints.toLocaleString()} pts
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: `${GILS}cc` }}>
                  {gils.totalPoints.toLocaleString()} pts
                </span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: '50%' }} animate={{ width: `${ladsPct}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
                  style={{ background: `linear-gradient(to right, ${LADS}ee, ${LADS}88)` }}
                />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ══ Today ══ */}
      {todayMatches.length > 0 && (
        <section>
          <SectionHeader live>Today — Select Your Picks</SectionHeader>
          <div className="space-y-2">
            {todayMatches.map(f => {
              const m = state.matches[f.match];
              return <MatchRow key={f.match} fixture={f}
                hasEntry={m?.lads.picks.length > 0}
                isComplete={m?.isComplete ?? false}
                ladsTotal={m?.lads.total} gilsTotal={m?.gils.total}
                winner={m?.winner} isToday />;
            })}
          </div>
        </section>
      )}

      {/* ══ Season standings ══ */}
      <section>
        <SectionHeader>Season Standings</SectionHeader>
        <div className="flex gap-4 flex-col sm:flex-row">
          <SideCard side={lads} label="Lads" isLads={true} />
          <SideCard side={gils} label="Gils" isLads={false} />
        </div>
      </section>

      {/* ══ End of season prizes ══ */}
      <section>
        <SectionHeader>End of Season Prizes</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { abbrev: 'WINS', label: 'Most Wins',      pts: 700, color: '#d97706' },
            { abbrev: 'OC',   label: 'Orange Cap',     pts: 350, color: '#ea580c' },
            { abbrev: 'PC',   label: 'Purple Cap',     pts: 350, color: '#7c3aed' },
            { abbrev: 'STK',  label: 'Longest Streak', pts: 350, color: NAVY     },
            { abbrev: 'PH',   label: 'Purple Hits',    pts: 350, color: '#6d28d9' },
          ].map((p, i) => (
            <motion.div key={p.label}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
              className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-sm transition-shadow cursor-default">
              <div style={{
                fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
                fontSize: 20, fontWeight: 900, letterSpacing: '0.1em',
                color: p.color, lineHeight: 1, marginBottom: 5,
              }}>{p.abbrev}</div>
              <div className="text-[11px] text-gray-400 leading-tight">{p.label}</div>
              <div className="text-sm font-black mt-2 tabular-nums" style={{ color: 'var(--ipl-orange)' }}>+{p.pts}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══ Next match countdown ══ */}
      <NextMatchCountdown />

      {/* ══ Upcoming fixtures ══ */}
      {upcomingMatches.length > 0 && (
        <section>
          <SectionHeader>Upcoming Fixtures</SectionHeader>
          <div className="space-y-2">
            {upcomingMatches.map((f, i) => (
              <motion.div key={f.match}
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}>
                <MatchRow fixture={f} hasEntry={false} isComplete={false} />
              </motion.div>
            ))}
          </div>
          <Link href="/fixtures"
            className="block text-center mt-4 text-sm font-semibold hover:opacity-75 transition-opacity"
            style={{ color: 'var(--ipl-orange)' }}>
            View all 70 fixtures →
          </Link>
        </section>
      )}
    </div>
  );
}
