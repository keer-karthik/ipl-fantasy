export default function RulesPage() {
  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-yellow-400">Rules & Scoring</h1>

      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
        <h2 className="text-lg font-semibold text-white">Team Setup (per match)</h2>
        <ul className="text-sm text-gray-400 space-y-1.5 list-disc list-inside">
          <li>Pick 5 players from the two playing IPL teams</li>
          <li>Designate <span className="text-purple-400 font-semibold">Purple (3×)</span> and <span className="text-green-400 font-semibold">Green (2×)</span> players — the other 3 are Yellow (1×)</li>
          <li><span className="text-red-400 font-semibold">All-in (5×)</span> can replace any multiplier — max 4 uses per season</li>
          <li>Assign a substitute to each player (for injury / not in XI)</li>
          <li>Picks are locked at coin toss</li>
          <li>Predict the winning IPL team for +50 bonus pts</li>
        </ul>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Batting Points</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-800">
            {[
              ['1 Run', '1 pt'],
              ['25 runs', '+5 bonus'],
              ['40 runs', '+15 bonus'],
              ['70 runs', '+25 bonus'],
              ['90 runs', '+35 bonus'],
              ['SR ≥ 200 (min 10 balls)', '+10 bonus'],
              ['SR ≥ 250 (min 20 balls)', '+25 bonus'],
              ['SR ≥ 300 (min 25 balls)', '+50 bonus'],
              ['SR ≤ 100 (min 10 balls)', '−20'],
              ['Duck (dismissed for 0)', '−30'],
              ['Score ≤ 10 runs', '−20'],
            ].map(([m, p]) => (
              <tr key={m} className="text-gray-400">
                <td className="py-1.5 pr-4">{m}</td>
                <td className={`py-1.5 font-semibold text-right ${p.startsWith('−') ? 'text-red-400' : 'text-green-400'}`}>{p}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-600">Players batting at position 7+ get no batting rules unless they score 10+ runs.</p>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Bowling Points</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-800">
            {[
              ['1 Wicket', '25 pts'],
              ['Maiden over', '+40 bonus'],
              ['Economy ≤ 4.0 (after 3 overs)', '+80'],
              ['Economy ≤ 6.0 (after 3 overs)', '+60'],
              ['Economy ≤ 8.0 (after 3 overs)', '+30'],
              ['Economy ≥ 10.0 (after 3 overs)', '−20'],
              ['Economy ≥ 12.0 (after 3 overs)', '−30'],
              ['Economy ≥ 14.0 (after 3 overs)', '−40'],
              ['Wicketless after 2+ overs', '−20'],
              ['3+ wickets', '+20 bonus'],
              ['5+ wickets', '+35 bonus'],
            ].map(([m, p]) => (
              <tr key={m} className="text-gray-400">
                <td className="py-1.5 pr-4">{m}</td>
                <td className={`py-1.5 font-semibold text-right ${p.startsWith('−') ? 'text-red-400' : 'text-green-400'}`}>{p}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Fielding & Bonuses</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-800">
            {[
              ['Catch / Stumping', '+10 pts'],
              ['Run-out', '+10 pts'],
              ['Man of the Match', '+10 pts'],
              ["Winner's Choice (correct IPL winner prediction)", '+50 pts'],
            ].map(([m, p]) => (
              <tr key={m} className="text-gray-400">
                <td className="py-1.5 pr-4">{m}</td>
                <td className="py-1.5 font-semibold text-right text-green-400">{p}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Multipliers</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase">
              <th className="text-left pb-2">Type</th>
              <th className="text-right pb-2">Gain ×</th>
              <th className="text-right pb-2">Loss ×</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {[
              { type: 'Yellow', gain: '1×', loss: '1×', c: 'text-yellow-400' },
              { type: 'Green', gain: '2×', loss: '1×', c: 'text-green-400' },
              { type: 'Purple', gain: '3×', loss: '1.5×', c: 'text-purple-400' },
              { type: 'All-in (max 4/season)', gain: '5×', loss: '2.5×', c: 'text-red-400' },
            ].map(r => (
              <tr key={r.type} className="text-gray-400">
                <td className={`py-1.5 font-semibold ${r.c}`}>{r.type}</td>
                <td className="py-1.5 text-right text-green-400">{r.gain}</td>
                <td className="py-1.5 text-right text-red-400">{r.loss}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-600">A Purple Hit counts only when the Purple (3×) player earns positive points (&gt; 0).</p>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
        <h2 className="text-lg font-semibold text-white">End-of-Season Prizes</h2>
        <div className="space-y-2">
          {[
            { icon: '🏆', label: 'Most Wins', pts: 700 },
            { icon: '🟠', label: 'Orange Cap (most fantasy runs)', pts: 350 },
            { icon: '🟣', label: 'Purple Cap (most fantasy wickets)', pts: 350 },
            { icon: '🔥', label: 'Longest Winning Streak', pts: 350 },
            { icon: '💜', label: 'Most Purple Hits', pts: 350 },
          ].map(p => (
            <div key={p.label} className="flex justify-between items-center text-sm">
              <span className="text-gray-400">{p.icon} {p.label}</span>
              <span className="font-bold text-yellow-400">+{p.pts} pts</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
