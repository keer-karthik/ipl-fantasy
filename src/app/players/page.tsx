'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSeasonState } from '@/lib/store';
import { computePlayerStats } from '@/lib/stats';

export default function PlayersPage() {
  const { state, loaded } = useSeasonState();
  const [tab, setTab] = useState<'lads' | 'gils'>('lads');

  const players = computePlayerStats(state, tab);

  if (!loaded) return <div className="text-gray-400 text-center py-20">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl px-6 py-5 shadow-md"
        style={{ background: 'linear-gradient(135deg, var(--ipl-navy) 0%, #0a4fa8 100%)' }}>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Player Stats</h1>
        <p className="text-blue-300 text-sm mt-1">Season totals & averages</p>
      </motion.div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {(['lads', 'gils'] as const).map(s => (
          <button key={s} onClick={() => setTab(s)}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all shadow-sm ${
              tab === s
                ? s === 'lads'
                  ? 'text-white'
                  : 'text-white'
                : 'bg-white border border-gray-200 text-gray-500 hover:text-gray-800'
            }`}
            style={tab === s ? { background: s === 'lads' ? '#2563eb' : '#db2777' } : {}}>
            {s === 'lads' ? 'Lads' : 'Gils'}
          </button>
        ))}
      </div>

      {players.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="text-5xl mb-4">📊</div>
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
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
                    <td className="px-2 py-3">
                      <span className="font-semibold text-gray-800">{p.name}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-500">{p.matches}</td>
                    <td className={`px-3 py-3 text-right font-bold ${p.totalPoints >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {p.totalPoints > 0 ? '+' : ''}{p.totalPoints}
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${p.avgPoints >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
                      {p.avgPoints}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-500">{p.totalRuns}</td>
                    <td className="px-3 py-3 text-right text-gray-500">{p.totalWickets}</td>
                    <td className="px-3 py-3 text-right">
                      {p.timesAs3x > 0 ? (
                        <span className="text-purple-600 font-semibold">{p.timesAs3x}× <span className="text-purple-400 font-normal">({p.total3xPoints})</span></span>
                      ) : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.timesAs2x > 0 ? (
                        <span className="text-green-600 font-semibold">{p.timesAs2x}× <span className="text-green-400 font-normal">({p.total2xPoints})</span></span>
                      ) : <span className="text-gray-200">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
