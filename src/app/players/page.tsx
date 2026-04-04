'use client';
import { useState } from 'react';
import { useSeasonState } from '@/lib/store';
import { computePlayerStats } from '@/lib/stats';

export default function PlayersPage() {
  const { state, loaded } = useSeasonState();
  const [tab, setTab] = useState<'lads' | 'gils'>('lads');

  const players = computePlayerStats(state, tab);

  if (!loaded) return <div className="text-gray-500 text-center py-20">Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-yellow-400">Player Stats</h1>

      <div className="flex gap-2">
        {(['lads', 'gils'] as const).map(s => (
          <button key={s} onClick={() => setTab(s)}
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors capitalize ${
              tab === s
                ? s === 'lads' ? 'bg-blue-500 text-white' : 'bg-pink-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {s === 'lads' ? 'Lads' : 'Gils'}
          </button>
        ))}
      </div>

      {players.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <div className="text-4xl mb-3">📊</div>
          <p>No match data yet.</p>
          <p className="text-sm mt-1">Complete some matches to see player stats.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                <th className="text-left pb-3 pr-4">Player</th>
                <th className="text-right pb-3 px-3">M</th>
                <th className="text-right pb-3 px-3">Total Pts</th>
                <th className="text-right pb-3 px-3">Avg Pts</th>
                <th className="text-right pb-3 px-3">Runs</th>
                <th className="text-right pb-3 px-3">Wkts</th>
                <th className="text-right pb-3 px-3">3× Used</th>
                <th className="text-right pb-3 pl-3">2× Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {players.map((p, i) => (
                <tr key={p.name} className="hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 text-xs w-5">{i + 1}</span>
                      <div>
                        <div className="font-medium text-gray-200">{p.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right text-gray-400">{p.matches}</td>
                  <td className={`py-3 px-3 text-right font-bold ${p.totalPoints >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {p.totalPoints}
                  </td>
                  <td className={`py-3 px-3 text-right ${p.avgPoints >= 0 ? 'text-gray-300' : 'text-red-400'}`}>
                    {p.avgPoints}
                  </td>
                  <td className="py-3 px-3 text-right text-gray-400">{p.totalRuns}</td>
                  <td className="py-3 px-3 text-right text-gray-400">{p.totalWickets}</td>
                  <td className="py-3 px-3 text-right">
                    {p.timesAs3x > 0 ? (
                      <span className="text-purple-400">{p.timesAs3x}× ({p.total3xPoints} pts)</span>
                    ) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    {p.timesAs2x > 0 ? (
                      <span className="text-green-400">{p.timesAs2x}× ({p.total2xPoints} pts)</span>
                    ) : <span className="text-gray-700">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
