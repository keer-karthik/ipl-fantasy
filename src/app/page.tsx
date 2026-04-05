'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { useSeasonState } from '@/lib/store';
import { computeSideStats, computeSideTotal } from '@/lib/stats';
import { fixtures, formatDate, isToday, isUpcoming, getMatchStartIST } from '@/lib/data';
import { TeamLogo } from '@/components/TeamBadge';
import type { TeamName } from '@/lib/types';

// ─── Brand colors ─────────────────────────────────────────────────────────────
const LADS = '#f59e0b';
const GILS = '#7c3aed';
const NAVY = '#003087';

// ─── GSAP count-up ────────────────────────────────────────────────────────────
function CountUp({ value, style }: { value: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const obj = { n: 0 };
    gsap.to(obj, {
      n: value, duration: 1, ease: 'power3.out',
      onUpdate() { if (ref.current) ref.current.textContent = Math.round(obj.n).toLocaleString(); },
    });
  }, [value]);
  return <span ref={ref} style={style}>0</span>;
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

// ─── Prize tile ───────────────────────────────────────────────────────────────
function PrizeTile({
  abbrev, label, pts, color,
  ladsVal, gilsVal, ladsScore, gilsScore,
  ladsDetail, gilsDetail,
}: {
  abbrev: string; label: string; pts: number; color: string;
  ladsVal: string; gilsVal: string; ladsScore: number; gilsScore: number;
  ladsDetail?: string; gilsDetail?: string;
}) {
  const leader = ladsScore > gilsScore ? 'lads' : gilsScore > ladsScore ? 'gils' : 'tied';
  const total = ladsScore + gilsScore;
  const ladsPct = total > 0 ? (ladsScore / total) * 100 : 50;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${color}22`, boxShadow: `0 2px 16px ${color}10` }}>
      {/* Accent bar */}
      <div style={{ height: 3, background: color }} />
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div style={{
              fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
              fontSize: 20, fontWeight: 900, color, letterSpacing: '0.1em', lineHeight: 1,
            }}>{abbrev}</div>
            <div className="text-[11px] font-semibold text-gray-500 mt-0.5">{label}</div>
          </div>
          {leader === 'tied'
            ? <span className="text-[9px] font-semibold text-gray-300 border border-gray-100 px-1.5 py-0.5 rounded-full mt-0.5">Tied</span>
            : <span className="text-[9px] font-bold text-white px-2 py-0.5 rounded-full mt-0.5"
                style={{ background: leader === 'lads' ? LADS : GILS }}>
                {leader === 'lads' ? 'Lads' : 'Gils'}
              </span>
          }
        </div>

        {/* Lads */}
        <div className="mb-3">
          <div className="text-[9px] font-black uppercase tracking-[0.15em] mb-0.5" style={{ color: `${LADS}99` }}>Lads</div>
          <div style={{
            fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
            fontSize: 32, fontWeight: 900, lineHeight: 1,
            color: leader === 'lads' ? LADS : '#e5e7eb',
            transition: 'color 0.3s',
          }}>{ladsVal}</div>
          {ladsDetail && <div className="text-[9px] text-gray-400 mt-0.5 truncate">{ladsDetail}</div>}
        </div>

        {/* Gils */}
        <div className="mb-4">
          <div className="text-[9px] font-black uppercase tracking-[0.15em] mb-0.5" style={{ color: `${GILS}99` }}>Gils</div>
          <div style={{
            fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
            fontSize: 32, fontWeight: 900, lineHeight: 1,
            color: leader === 'gils' ? GILS : '#e5e7eb',
            transition: 'color 0.3s',
          }}>{gilsVal}</div>
          {gilsDetail && <div className="text-[9px] text-gray-400 mt-0.5 truncate">{gilsDetail}</div>}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full overflow-hidden flex">
          <div style={{ width: `${ladsPct}%`, background: LADS, transition: 'width 0.8s ease' }} />
          <div style={{ flex: 1, background: `${GILS}60` }} />
        </div>

        {/* Prize value */}
        <div className="mt-2 text-right">
          <span className="text-[9px] font-bold" style={{ color: 'var(--ipl-orange)' }}>+{pts} pts</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Next match countdown ─────────────────────────────────────────────────────
function NextMatchCountdown() {
  const [, setTick] = useState(0);
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
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex flex-col items-center gap-1">
            <TeamLogo team={next.home as TeamName} size={40} />
            <span className="text-[11px] font-bold text-gray-500">{(next.home as string).split(' ').pop()}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-black text-gray-300 border border-gray-200 rounded-full w-6 h-6 flex items-center justify-center">vs</span>
            <span className="text-[10px] text-gray-400 font-semibold">M{next.match}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <TeamLogo team={next.away as TeamName} size={40} />
            <span className="text-[11px] font-bold text-gray-500">{(next.away as string).split(' ').pop()}</span>
          </div>
          <div className="hidden sm:block ml-2">
            <div className="text-xs font-semibold text-gray-600">{formatDate(next.date)} · {next.time} IST</div>
            <div className="text-[11px] text-gray-400">{next.venue}</div>
          </div>
        </div>
        <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Starts in</div>
            <div className="font-mono font-black tabular-nums" style={{
              fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: NAVY, letterSpacing: '0.04em',
            }}>{timeStr}</div>
          </div>
          <Link href={`/match/${next.match}`}
            className="text-[12px] font-bold px-4 py-2 rounded-xl text-white transition-opacity hover:opacity-85"
            style={{ background: 'var(--ipl-orange)' }}>
            Select Picks
          </Link>
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
          background: isComplete && winner === 'lads' ? `${LADS}0d`
            : isComplete && winner === 'gils' ? `${GILS}0d`
            : today ? `${NAVY}08` : 'white',
          borderColor: isComplete && winner === 'lads' ? `${LADS}30`
            : isComplete && winner === 'gils' ? `${GILS}30`
            : today ? `${NAVY}20` : '#f3f4f6',
        }}>
        <div className="shrink-0" style={{ minWidth: 40 }}>
          <span className="text-[11px] font-bold border border-orange-300 text-orange-600 px-1.5 py-0.5 rounded">
            M{fixture.match}
          </span>
        </div>
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
        <div className="text-right shrink-0 hidden md:block">
          <div className="text-xs font-semibold text-gray-600">{formatDate(fixture.date)}</div>
          <div className="text-[11px] text-gray-400">{fixture.time} · {fixture.venue}</div>
        </div>
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
  const todayMatches    = fixtures.filter(f => isToday(f.date));
  const upcomingMatches = fixtures.filter(f => isUpcoming(f.date) && !isToday(f.date)).slice(0, 6);
  const played = Object.values(state.matches).filter(m => m.isComplete).length;

  if (!loaded) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-t-transparent"
        style={{ borderColor: `${LADS} ${LADS} ${LADS} transparent` }} />
    </div>
  );

  const totalPts = lads.totalPoints + gils.totalPoints;
  const ladsPct  = totalPts > 0 ? (lads.totalPoints / totalPts) * 100 : 50;
  const ptsDiff  = lads.totalPoints - gils.totalPoints;

  // Prize tile data
  const ocTile = {
    abbrev: 'OC', label: 'Orange Cap', pts: 350, color: '#ea580c',
    ladsVal: `${lads.totalSeasonRuns}r`, gilsVal: `${gils.totalSeasonRuns}r`,
    ladsScore: lads.totalSeasonRuns, gilsScore: gils.totalSeasonRuns,
    ladsDetail: lads.orangeCapRuns ? `Top: ${lads.orangeCapRuns.player} ${lads.orangeCapRuns.runs}r` : undefined,
    gilsDetail: gils.orangeCapRuns ? `Top: ${gils.orangeCapRuns.player} ${gils.orangeCapRuns.runs}r` : undefined,
  };
  const pcTile = {
    abbrev: 'PC', label: 'Purple Cap', pts: 350, color: '#7c3aed',
    ladsVal: `${lads.totalSeasonWickets}w`, gilsVal: `${gils.totalSeasonWickets}w`,
    ladsScore: lads.totalSeasonWickets, gilsScore: gils.totalSeasonWickets,
    ladsDetail: lads.purpleCapWickets ? `Top: ${lads.purpleCapWickets.player} ${lads.purpleCapWickets.wickets}w` : undefined,
    gilsDetail: gils.purpleCapWickets ? `Top: ${gils.purpleCapWickets.player} ${gils.purpleCapWickets.wickets}w` : undefined,
  };
  const stkTile = {
    abbrev: 'STK', label: 'Longest Streak', pts: 350, color: NAVY,
    ladsVal: `${lads.longestStreak}W`, gilsVal: `${gils.longestStreak}W`,
    ladsScore: lads.longestStreak, gilsScore: gils.longestStreak,
    ladsDetail: `Current: ${lads.currentStreak > 0 ? `${lads.currentStreak}W` : lads.currentStreak < 0 ? `${Math.abs(lads.currentStreak)}L` : '—'}`,
    gilsDetail: `Current: ${gils.currentStreak > 0 ? `${gils.currentStreak}W` : gils.currentStreak < 0 ? `${Math.abs(gils.currentStreak)}L` : '—'}`,
  };
  const phTile = {
    abbrev: 'PH', label: 'Purple Hits', pts: 350, color: '#6d28d9',
    ladsVal: String(lads.purpleHits), gilsVal: String(gils.purpleHits),
    ladsScore: lads.purpleHits, gilsScore: gils.purpleHits,
    ladsDetail: '3× pick scored highest',
    gilsDetail: '3× pick scored highest',
  };

  // Center feed content
  const centerFeed = (
    <div className="space-y-8">
      <NextMatchCountdown />

      {todayMatches.length > 0 && (
        <section>
          <SectionHeader live>Today — Select Your Picks</SectionHeader>
          <div className="space-y-2">
            {todayMatches.map(f => {
              const m = state.matches[f.match];
              return <MatchRow key={f.match} fixture={f}
                hasEntry={m?.lads.picks.length > 0}
                isComplete={m?.isComplete ?? false}
                ladsTotal={m ? computeSideTotal(m, 'lads') : undefined}
                gilsTotal={m ? computeSideTotal(m, 'gils') : undefined}
                winner={m?.winner} isToday />;
            })}
          </div>
        </section>
      )}

      {(() => {
        const recent = fixtures
          .filter(f => state.matches[f.match]?.isComplete)
          .slice(-5).reverse();
        if (recent.length === 0) return null;
        return (
          <section>
            <SectionHeader>Recent Matches</SectionHeader>
            <div className="space-y-2">
              {recent.map((f, i) => {
                const m = state.matches[f.match];
                return (
                  <motion.div key={f.match}
                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}>
                    <MatchRow fixture={f}
                      hasEntry={m?.lads.picks.length > 0}
                      isComplete={true}
                      ladsTotal={m ? computeSideTotal(m, 'lads') : undefined}
                      gilsTotal={m ? computeSideTotal(m, 'gils') : undefined}
                      winner={m?.winner} />
                  </motion.div>
                );
              })}
            </div>
          </section>
        );
      })()}

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

  return (
    <div className="pb-12 space-y-6">

      {/* ══ Hero — full width ══ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="rounded-2xl overflow-hidden relative"
        style={{
          background: 'linear-gradient(160deg, #001857 0%, #003087 55%, #0044b0 100%)',
          boxShadow: '0 4px 32px rgba(0,48,135,0.25)',
        }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 20% 50%, rgba(245,158,11,0.07) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(124,58,237,0.07) 0%, transparent 60%)',
        }} />
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{
          background: `linear-gradient(to right, transparent 0%, ${LADS}60 30%, transparent 50%, ${GILS}60 70%, transparent 100%)`,
        }} />
        <div className="relative z-10 px-6 py-8 text-center">
          <div className="inline-block text-white/50 text-[9px] font-bold uppercase tracking-[0.3em] border border-white/15 px-3 py-1 rounded mb-4">
            TATA IPL 2026
          </div>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
            fontSize: 'clamp(2rem, 5vw, 3.4rem)',
            fontWeight: 900, letterSpacing: '0.04em',
            color: 'white', lineHeight: 1, marginBottom: 6,
          }}>
            Lads <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 300 }}>vs</span> Gils
          </h1>
          <p className="text-sm font-medium mb-8" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
            {played} / 70 matches played
          </p>
          <div className="flex items-center justify-center gap-8 md:gap-16">
            <div className="text-center">
              <CountUp value={lads.wins} style={{
                fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
                fontSize: 'clamp(3rem, 8vw, 5rem)', fontWeight: 900,
                color: LADS, lineHeight: 1, display: 'block',
              }} />
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: LADS }}>
                Lads · {lads.totalPoints.toLocaleString()}pts
                {ptsDiff < 0 && <span style={{ color: '#ef4444' }}> ({ptsDiff})</span>}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>vs</div>
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.12)' }} />
            </div>
            <div className="text-center">
              <CountUp value={gils.wins} style={{
                fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
                fontSize: 'clamp(3rem, 8vw, 5rem)', fontWeight: 900,
                color: GILS, lineHeight: 1, display: 'block',
              }} />
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: GILS }}>
                Gils · {gils.totalPoints.toLocaleString()}pts
                {ptsDiff > 0 && <span style={{ color: '#ef4444' }}> (-{ptsDiff})</span>}
              </div>
            </div>
          </div>
          {totalPts > 0 && (
            <div className="mt-6 max-w-xs mx-auto">
              <div className="rounded-full overflow-hidden flex" style={{ height: 3, background: 'rgba(255,255,255,0.08)' }}>
                <motion.div className="h-full"
                  initial={{ width: '50%' }} animate={{ width: `${ladsPct}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
                  style={{ background: LADS, borderRadius: '9999px 0 0 9999px' }} />
                <motion.div className="h-full"
                  initial={{ width: '50%' }} animate={{ width: `${100 - ladsPct}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
                  style={{ background: GILS, borderRadius: '0 9999px 9999px 0' }} />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ══ Three-column layout ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_200px] xl:grid-cols-[220px_1fr_220px] gap-5 items-start">

        {/* Left sidebar: OC + Streak (desktop only) */}
        <div className="hidden lg:flex flex-col gap-4 sticky top-4">
          <PrizeTile {...ocTile} />
          <PrizeTile {...stkTile} />
        </div>

        {/* Center feed */}
        <div className="min-w-0">
          {centerFeed}
        </div>

        {/* Right sidebar: PC + PH (desktop only) */}
        <div className="hidden lg:flex flex-col gap-4 sticky top-4">
          <PrizeTile {...pcTile} />
          <PrizeTile {...phTile} />
        </div>
      </div>

      {/* Mobile: 2×2 prize grid (hidden on desktop) */}
      <div className="grid grid-cols-2 gap-3 lg:hidden">
        <PrizeTile {...ocTile} />
        <PrizeTile {...pcTile} />
        <PrizeTile {...stkTile} />
        <PrizeTile {...phTile} />
      </div>

    </div>
  );
}
