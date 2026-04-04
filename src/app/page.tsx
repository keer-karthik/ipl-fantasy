'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSeasonState } from '@/lib/store';
import { computeSideStats } from '@/lib/stats';
import { fixtures, formatDate, isToday, isUpcoming, getTeamColor } from '@/lib/data';
import { TeamLogo } from '@/components/TeamBadge';
import type { TeamName } from '@/lib/types';

function FormPill({ result }: { result: 'W' | 'L' }) {
  return (
    <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shadow-sm ${
      result === 'W' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`}>{result}</span>
  );
}

function SideCard({ side, label, color }: { side: ReturnType<typeof computeSideStats>; label: string; color: string }) {
  const streak = side.currentStreak;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex-1 overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: color }} />
      <h2 className="text-lg font-extrabold mb-4" style={{ color }}>{label}</h2>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {[
          { val: side.wins, label: 'Wins', color: '#22c55e' },
          { val: side.losses, label: 'Losses', color: '#ef4444' },
          { val: side.totalPoints, label: 'Points', color: '#f7a500' },
        ].map(s => (
          <div key={s.label} className="text-center rounded-xl py-3" style={{ background: `${s.color}12` }}>
            <div className="text-2xl font-black" style={{ color: s.color }}>{s.val.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {side.form.map((r, i) => <FormPill key={i} result={r} />)}
        {side.form.length === 0 && <span className="text-xs text-gray-400">No matches played yet</span>}
      </div>
      <div className="space-y-2 text-sm border-t border-gray-100 pt-3">
        <div className="flex justify-between text-gray-500">
          <span>Current Streak</span>
          <span className={`font-bold ${streak > 0 ? 'text-green-600' : streak < 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {streak > 0 ? `${streak}W` : streak < 0 ? `${Math.abs(streak)}L` : '—'}
          </span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>💜 Purple Hits</span><span className="font-bold text-purple-600">{side.purpleHits}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>🔴 All-in Used</span><span className="font-bold text-red-500">{side.allInUsed}/4</span>
        </div>
        {side.orangeCapRuns && (
          <div className="flex justify-between text-gray-500 text-xs">
            <span>🟠 Orange Cap</span>
            <span className="font-semibold text-orange-600 truncate ml-2">{side.orangeCapRuns.player} — {side.orangeCapRuns.runs} runs</span>
          </div>
        )}
        {side.purpleCapWickets && (
          <div className="flex justify-between text-gray-500 text-xs">
            <span>🟣 Purple Cap</span>
            <span className="font-semibold text-purple-600 truncate ml-2">{side.purpleCapWickets.player} — {side.purpleCapWickets.wickets}w</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MatchRow({ fixture, hasEntry, isComplete, ladsTotal, gilsTotal, winner }: {
  fixture: typeof fixtures[0]; hasEntry: boolean; isComplete: boolean;
  ladsTotal?: number; gilsTotal?: number; winner?: 'lads' | 'gils' | null;
}) {
  return (
    <Link href={`/match/${fixture.match}`}>
      <motion.div whileHover={{ y: -1, boxShadow: '0 4px 20px rgba(0,48,135,0.08)' }}
        className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-4 transition-all cursor-pointer">
        {/* Match number */}
        <div className="shrink-0 text-center" style={{ minWidth: 52 }}>
          <div className="text-xs font-bold text-orange-600 border border-orange-300 rounded px-1.5 py-0.5 inline-block">
            MATCH {fixture.match}
          </div>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <TeamLogo team={fixture.home as TeamName} size={32} />
            <span className="font-bold text-sm text-gray-800 hidden sm:block">{fixture.home}</span>
          </div>
          <div className="flex flex-col items-center shrink-0">
            <span className="text-xs font-bold text-gray-400">vs</span>
            {isComplete && ladsTotal !== undefined && gilsTotal !== undefined && (
              <span className="text-xs text-gray-500">{ladsTotal}–{gilsTotal}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <TeamLogo team={fixture.away as TeamName} size={32} />
            <span className="font-bold text-sm text-gray-800 hidden sm:block">{fixture.away}</span>
          </div>
        </div>

        {/* Date + venue */}
        <div className="text-right shrink-0 hidden md:block">
          <div className="text-xs font-semibold text-gray-600">{formatDate(fixture.date)}</div>
          <div className="text-xs text-gray-400">{fixture.time} · {fixture.venue}</div>
        </div>

        {/* Status */}
        <div className="shrink-0">
          {isComplete ? (
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${winner === 'lads' ? 'bg-blue-100 text-blue-700' : winner === 'gils' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}`}>
              {winner ? `${winner === 'lads' ? 'Lads' : 'Gils'} win` : 'Tie'}
            </span>
          ) : hasEntry ? (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--ipl-navy)' }}>
              Enter Stats
            </span>
          ) : (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--ipl-orange)' }}>
              Match Centre
            </span>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

export default function Dashboard() {
  const { state, loaded } = useSeasonState();
  const lads = computeSideStats(state, 'lads');
  const gils = computeSideStats(state, 'gils');
  const todayMatches = fixtures.filter(f => isToday(f.date));
  const upcomingMatches = fixtures.filter(f => isUpcoming(f.date) && !isToday(f.date)).slice(0, 6);
  const played = Object.values(state.matches).filter(m => m.isComplete).length;

  if (!loaded) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-orange-500 border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Hero banner */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="rounded-2xl overflow-hidden shadow-md relative"
        style={{ background: 'linear-gradient(135deg, var(--ipl-navy) 0%, #0a4fa8 100%)' }}>
        <div className="px-8 py-8 relative z-10">
          <div className="text-xs text-blue-300 font-semibold uppercase tracking-widest mb-1">TATA IPL 2026</div>
          <h1 className="text-3xl font-black text-white mb-1">Lads <span className="text-orange-400">vs</span> Gils</h1>
          <p className="text-blue-200 text-sm">{played} of 70 matches played</p>
          <div className="mt-4 flex gap-6">
            <div className="text-center">
              <div className="text-2xl font-black text-white">{lads.wins}</div>
              <div className="text-xs text-blue-300">Lads Wins</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-white">{gils.wins}</div>
              <div className="text-xs text-blue-300">Gils Wins</div>
            </div>
          </div>
        </div>
        {/* Decorative circles */}
        <div className="absolute right-0 top-0 w-48 h-48 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #f7a500, transparent)', transform: 'translate(20%, -30%)' }} />
        <div className="absolute right-16 bottom-0 w-32 h-32 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #e84611, transparent)', transform: 'translateY(40%)' }} />
      </motion.div>

      {/* Today's matches */}
      {todayMatches.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="live-dot w-2 h-2 rounded-full bg-red-500 inline-block" />
            Today
          </h2>
          <div className="space-y-2">
            {todayMatches.map(f => {
              const m = state.matches[f.match];
              return <MatchRow key={f.match} fixture={f}
                hasEntry={m?.lads.picks.length > 0}
                isComplete={m?.isComplete ?? false}
                ladsTotal={m?.lads.total} gilsTotal={m?.gils.total}
                winner={m?.winner} />;
            })}
          </div>
        </div>
      )}

      {/* Standings */}
      <div>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Season Standings</h2>
        <div className="flex gap-4 flex-col sm:flex-row">
          <SideCard side={lads} label="Lads" color="#3b82f6" />
          <SideCard side={gils} label="Gils" color="#ec4899" />
        </div>
      </div>

      {/* Season prizes */}
      <div>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">End of Season Prizes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { icon: '🏆', label: 'Most Wins', pts: 700 },
            { icon: '🟠', label: 'Orange Cap', pts: 350 },
            { icon: '🟣', label: 'Purple Cap', pts: 350 },
            { icon: '🔥', label: 'Longest Streak', pts: 350 },
            { icon: '💜', label: 'Purple Hits', pts: 350 },
          ].map((p, i) => (
            <motion.div key={p.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
              <div className="text-2xl mb-1">{p.icon}</div>
              <div className="text-xs text-gray-500 leading-tight">{p.label}</div>
              <div className="text-sm font-black mt-1" style={{ color: 'var(--ipl-orange)' }}>+{p.pts}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      {upcomingMatches.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Upcoming Fixtures</h2>
          <div className="space-y-2">
            {upcomingMatches.map(f => (
              <MatchRow key={f.match} fixture={f}
                hasEntry={false} isComplete={false} />
            ))}
          </div>
          <Link href="/fixtures" className="block text-center mt-4 text-sm font-semibold"
            style={{ color: 'var(--ipl-orange)' }}>
            View all 70 fixtures →
          </Link>
        </div>
      )}
    </div>
  );
}
