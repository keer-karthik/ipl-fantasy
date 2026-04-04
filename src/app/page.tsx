'use client';
import Link from 'next/link';
import { useSeasonState } from '@/lib/store';
import { computeSideStats } from '@/lib/stats';
import { fixtures, formatDate, isToday, isUpcoming } from '@/lib/data';
import TeamBadge from '@/components/TeamBadge';
import type { TeamName } from '@/lib/types';

function FormPill({ result }: { result: 'W' | 'L' }) {
  return (
    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
      result === 'W' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    }`}>{result}</span>
  );
}

function SidePanel({ side, label, color }: { side: ReturnType<typeof computeSideStats>; label: string; color: string }) {
  const streak = side.currentStreak;
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 flex-1">
      <h2 className="text-xl font-bold mb-4" style={{ color }}>{label}</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-green-400">{side.wins}</div>
          <div className="text-xs text-gray-500">Wins</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-red-400">{side.losses}</div>
          <div className="text-xs text-gray-500">Losses</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-yellow-400">{side.totalPoints.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Pts</div>
        </div>
      </div>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {side.form.map((r, i) => <FormPill key={i} result={r} />)}
        {side.form.length === 0 && <span className="text-xs text-gray-600">No matches yet</span>}
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-gray-400">
          <span>Streak</span>
          <span className={streak > 0 ? 'text-green-400' : streak < 0 ? 'text-red-400' : 'text-gray-500'}>
            {streak > 0 ? `${streak}W` : streak < 0 ? `${Math.abs(streak)}L` : '—'}
          </span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Longest Streak</span><span className="text-green-400">{side.longestStreak}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Purple Hits</span><span className="text-purple-400">{side.purpleHits}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>All-in Used</span><span className="text-red-400">{side.allInUsed}/4</span>
        </div>
        {side.orangeCapRuns && (
          <div className="flex justify-between text-gray-400">
            <span>🟠 Orange Cap</span>
            <span className="text-orange-400 text-xs truncate ml-2">{side.orangeCapRuns.player} ({side.orangeCapRuns.runs} runs)</span>
          </div>
        )}
        {side.purpleCapWickets && (
          <div className="flex justify-between text-gray-400">
            <span>🟣 Purple Cap</span>
            <span className="text-purple-400 text-xs truncate ml-2">{side.purpleCapWickets.player} ({side.purpleCapWickets.wickets}w)</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { state, loaded } = useSeasonState();
  const lads = computeSideStats(state, 'lads');
  const gils = computeSideStats(state, 'gils');
  const todayMatches = fixtures.filter(f => isToday(f.date));
  const upcoming = fixtures.filter(f => isUpcoming(f.date) && !isToday(f.date)).slice(0, 5);
  const played = Object.values(state.matches).filter(m => m.isComplete).length;

  if (!loaded) return <div className="text-gray-500 text-center py-20">Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-yellow-400">IPL Fantasy 2026</h1>
        <p className="text-gray-500 mt-1">{played} of 70 matches played</p>
      </div>

      {todayMatches.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Today</h2>
          <div className="space-y-2">
            {todayMatches.map(f => {
              const m = state.matches[f.match];
              const hasPicks = m?.lads.picks.length > 0;
              return (
                <div key={f.match} className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-yellow-400 font-bold text-sm">M{f.match}</span>
                    <TeamBadge team={f.home as TeamName} size="md" />
                    <span className="text-gray-500 text-xs">vs</span>
                    <TeamBadge team={f.away as TeamName} size="md" />
                    <span className="text-gray-500 text-xs">{f.time} · {f.venue}</span>
                  </div>
                  <Link href={`/match/${f.match}`}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-colors">
                    {hasPicks ? (m?.isComplete ? 'View Result' : 'Enter Stats') : 'Set Picks'}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Season Standings</h2>
        <div className="flex gap-4 flex-col sm:flex-row">
          <SidePanel side={lads} label="Lads" color="#60a5fa" />
          <SidePanel side={gils} label="Gils" color="#f472b6" />
        </div>
        {(lads.wins > 0 || gils.wins > 0) && lads.wins !== gils.wins && (
          <p className="mt-3 text-center text-sm text-gray-500">
            {lads.wins > gils.wins
              ? <><span className="text-blue-400 font-semibold">Lads</span> lead by {lads.wins - gils.wins} win{lads.wins - gils.wins > 1 ? 's' : ''}</>
              : <><span className="text-pink-400 font-semibold">Gils</span> lead by {gils.wins - lads.wins} win{gils.wins - lads.wins > 1 ? 's' : ''}</>
            }
          </p>
        )}
      </div>

      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Season Prizes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Most Wins', pts: 700, icon: '🏆' },
            { label: 'Orange Cap', pts: 350, icon: '🟠' },
            { label: 'Purple Cap', pts: 350, icon: '🟣' },
            { label: 'Longest Streak', pts: 350, icon: '🔥' },
            { label: 'Purple Hits', pts: 350, icon: '💜' },
          ].map(p => (
            <div key={p.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
              <div className="text-xl mb-1">{p.icon}</div>
              <div className="text-xs text-gray-400">{p.label}</div>
              <div className="text-sm font-bold text-yellow-400 mt-1">+{p.pts} pts</div>
            </div>
          ))}
        </div>
      </div>

      {upcoming.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Upcoming</h2>
          <div className="space-y-2">
            {upcoming.map(f => (
              <Link key={f.match} href={`/match/${f.match}`}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-3 hover:border-gray-600 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-gray-600 text-sm w-8">M{f.match}</span>
                  <TeamBadge team={f.home as TeamName} />
                  <span className="text-gray-600 text-xs">vs</span>
                  <TeamBadge team={f.away as TeamName} />
                </div>
                <div className="text-xs text-gray-500">{formatDate(f.date)} · {f.time}</div>
              </Link>
            ))}
          </div>
          <Link href="/fixtures" className="block text-center text-sm text-yellow-400 hover:text-yellow-300 mt-3">
            View all 70 fixtures →
          </Link>
        </div>
      )}
    </div>
  );
}
