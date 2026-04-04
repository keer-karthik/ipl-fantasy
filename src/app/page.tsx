'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSeasonState } from '@/lib/store';
import { computeSideStats } from '@/lib/stats';
import { fixtures, formatDate, isToday, isUpcoming } from '@/lib/data';
import { TeamLogo } from '@/components/TeamBadge';
import type { TeamName } from '@/lib/types';

// ─── IPL-style burst decoration (like the colorful firework patterns on iplt20.com) ───

function BurstDecoration({ flip = false }: { flip?: boolean }) {
  const rays = [
    { angle: 0,   color: '#FFD700', len: 70, dot: 6 },
    { angle: 22,  color: '#FF6B00', len: 55, dot: 4 },
    { angle: 45,  color: '#00C853', len: 65, dot: 5 },
    { angle: 67,  color: '#FF1493', len: 50, dot: 4 },
    { angle: 90,  color: '#00B4D8', len: 72, dot: 6 },
    { angle: 112, color: '#9C27B0', len: 55, dot: 4 },
    { angle: 135, color: '#FFD700', len: 68, dot: 5 },
    { angle: 157, color: '#FF4444', len: 52, dot: 4 },
    { angle: 180, color: '#00C853', len: 75, dot: 6 },
    { angle: 202, color: '#FF6B00', len: 50, dot: 4 },
    { angle: 225, color: '#00B4D8', len: 65, dot: 5 },
    { angle: 247, color: '#FF1493', len: 53, dot: 4 },
    { angle: 270, color: '#FFD700', len: 70, dot: 6 },
    { angle: 292, color: '#9C27B0', len: 55, dot: 4 },
    { angle: 315, color: '#FF4444', len: 67, dot: 5 },
    { angle: 337, color: '#00C853', len: 52, dot: 4 },
  ];

  return (
    <svg viewBox="0 0 200 200" width="200" height="200" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      {rays.map((r, i) => {
        const rad = (r.angle * Math.PI) / 180;
        const startR = 28;
        const x1 = 100 + startR * Math.cos(rad);
        const y1 = 100 + startR * Math.sin(rad);
        const x2 = 100 + r.len * Math.cos(rad);
        const y2 = 100 + r.len * Math.sin(rad);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={r.color} strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
            <circle cx={x2} cy={y2} r={r.dot} fill={r.color} opacity="0.9" />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Form pill ───────────────────────────────────────────────────────────────

function FormPill({ result }: { result: 'W' | 'L' }) {
  return (
    <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shadow-sm ${
      result === 'W' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`}>{result}</span>
  );
}

// ─── Side card ───────────────────────────────────────────────────────────────

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
          <span>💜 Purple Hits</span>
          <span className="font-bold text-purple-600">{side.purpleHits}</span>
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

// ─── Match row ────────────────────────────────────────────────────────────────

function MatchRow({ fixture, hasEntry, isComplete, ladsTotal, gilsTotal, winner, isToday: today }: {
  fixture: typeof fixtures[0]; hasEntry: boolean; isComplete: boolean;
  ladsTotal?: number; gilsTotal?: number; winner?: 'lads' | 'gils' | null;
  isToday?: boolean;
}) {
  return (
    <Link href={`/match/${fixture.match}`}>
      <motion.div whileHover={{ y: -1, boxShadow: '0 4px 20px rgba(0,48,135,0.08)' }}
        className={`rounded-xl border px-4 py-3 flex items-center gap-4 transition-all cursor-pointer ${
          today ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'
        }`}>
        {/* Match badge */}
        <div className="shrink-0 text-center" style={{ minWidth: 52 }}>
          <div className={`text-xs font-bold border rounded px-1.5 py-0.5 inline-block ${
            today ? 'border-orange-400 text-orange-600 bg-orange-100' : 'border-orange-300 text-orange-600'
          }`}>
            M{fixture.match}
          </div>
        </div>

        {/* Teams with logos */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo team={fixture.home as TeamName} size={34} />
            <span className="font-bold text-sm text-gray-800 hidden sm:block truncate">{fixture.home}</span>
          </div>
          <div className="flex flex-col items-center shrink-0 mx-1">
            <div className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center bg-white shadow-sm">
              <span className="text-xs font-black text-gray-400">vs</span>
            </div>
            {isComplete && ladsTotal !== undefined && gilsTotal !== undefined && (
              <span className="text-xs text-gray-400 mt-0.5">{ladsTotal}–{gilsTotal}</span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo team={fixture.away as TeamName} size={34} />
            <span className="font-bold text-sm text-gray-800 hidden sm:block truncate">{fixture.away}</span>
          </div>
        </div>

        {/* Date */}
        <div className="text-right shrink-0 hidden md:block">
          <div className="text-xs font-semibold text-gray-600">{formatDate(fixture.date)}</div>
          <div className="text-xs text-gray-400">{fixture.time} · {fixture.venue}</div>
        </div>

        {/* CTA */}
        <div className="shrink-0">
          {isComplete ? (
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
              winner === 'lads' ? 'bg-blue-100 text-blue-700' :
              winner === 'gils' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {winner ? `${winner === 'lads' ? 'Lads' : 'Gils'} win` : 'Tie'}
            </span>
          ) : hasEntry ? (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--ipl-navy)' }}>
              Enter Stats
            </span>
          ) : (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--ipl-orange)' }}>
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
      {/* Hero — IPL style with burst decorations */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="rounded-2xl overflow-hidden shadow-lg relative"
        style={{ background: 'linear-gradient(135deg, #001f6b 0%, var(--ipl-navy) 50%, #0a4fa8 100%)' }}>

        {/* Left burst */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/4 opacity-80 pointer-events-none select-none">
          <BurstDecoration />
        </div>
        {/* Right burst */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 opacity-80 pointer-events-none select-none">
          <BurstDecoration flip />
        </div>

        <div className="relative z-10 px-8 py-10 text-center">
          <div className="inline-block bg-white/10 border border-white/20 text-white text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
            TATA IPL 2026
          </div>

          <h1 className="text-4xl font-black text-white mb-1 tracking-tight">
            Lads <span style={{ color: '#f7a500' }}>vs</span> Gils
          </h1>
          <p className="text-blue-300 text-sm mb-6">{played} of 70 matches played</p>

          <div className="flex items-center justify-center gap-12">
            <div className="text-center">
              <div className="text-5xl font-black text-white">{lads.wins}</div>
              <div className="text-xs text-blue-300 font-semibold mt-1 uppercase tracking-wide">Lads Wins</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-2xl font-black text-orange-400">—</div>
              <div className="text-xs text-blue-300">Season</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-black text-white">{gils.wins}</div>
              <div className="text-xs text-blue-300 font-semibold mt-1 uppercase tracking-wide">Gils Wins</div>
            </div>
          </div>

          {/* Total points bar */}
          {(lads.totalPoints > 0 || gils.totalPoints > 0) && (
            <div className="mt-6 max-w-xs mx-auto">
              <div className="flex justify-between text-xs text-blue-300 mb-1.5">
                <span className="font-semibold text-blue-200">{lads.totalPoints} pts</span>
                <span className="font-semibold text-blue-200">{gils.totalPoints} pts</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                {(() => {
                  const total = lads.totalPoints + gils.totalPoints;
                  const pct = total > 0 ? (lads.totalPoints / total) * 100 : 50;
                  return (
                    <div className="h-full rounded-full" style={{
                      width: `${pct}%`,
                      background: 'linear-gradient(to right, #3b82f6, #60a5fa)'
                    }} />
                  );
                })()}
              </div>
              <div className="flex justify-between text-xs text-blue-400 mt-1">
                <span>Lads</span><span>Gils</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Today's matches */}
      {todayMatches.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
            Today — Select Your Picks
          </h2>
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

      {/* End of season prizes */}
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
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center hover:shadow-md transition-shadow">
              <div className="text-2xl mb-1">{p.icon}</div>
              <div className="text-xs text-gray-500 leading-tight">{p.label}</div>
              <div className="text-sm font-black mt-1" style={{ color: 'var(--ipl-orange)' }}>+{p.pts}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Upcoming fixtures */}
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
