export default function RulesPage() {
  const tableRow = (label: string, value: string) => {
    const isNeg = value.startsWith('−') || value.startsWith('-');
    return (
      <tr key={label} className="border-b border-gray-100 last:border-0">
        <td className="py-2 pr-4 text-gray-600 text-sm">{label}</td>
        <td className={`py-2 text-right text-sm font-bold ${isNeg ? 'text-red-500' : 'text-emerald-600'}`}>{value}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="rounded-2xl px-6 py-5 shadow-md"
        style={{ background: 'linear-gradient(135deg, var(--ipl-navy) 0%, #0a4fa8 100%)' }}>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Rules & Scoring</h1>
        <p className="text-blue-300 text-sm mt-1">How points are calculated each match</p>
      </div>

      {/* Team Setup — full width */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-800 mb-3">Team Setup <span className="text-gray-400 font-normal text-sm">(per match)</span></h2>
        <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
          <li>Pick <span className="font-semibold text-gray-800">5 players</span> from the two playing IPL teams</li>
          <li>Designate <span className="text-purple-600 font-semibold">Purple (3×)</span> and <span className="text-emerald-600 font-semibold">Green (2×)</span> players — the other 3 are Yellow (1×)</li>
          <li><span className="text-red-500 font-semibold">All-in (5×)</span> can replace any multiplier — max <span className="font-semibold text-gray-800">4 uses per season</span></li>
          <li>Assign a substitute to each player (used if primary didn't play)</li>
          <li>Picks are locked at match start</li>
          <li>Predict the winning team for <span className="font-semibold text-amber-600">+50 bonus pts</span></li>
        </ul>
      </section>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* Batting */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-3">Batting</h2>
          <table className="w-full">
            <tbody>
              {[
                ['1 Run', '+1 pt'],
                ['25 runs', '+5 bonus'],
                ['40 runs', '+15 bonus'],
                ['70 runs', '+25 bonus'],
                ['90 runs', '+35 bonus'],
                ['SR ≥ 200 (min 10 balls)', '+10'],
                ['SR ≥ 250 (min 20 balls)', '+25'],
                ['SR ≥ 300 (min 25 balls)', '+50'],
                ['SR ≤ 100 (min 10 balls)', '−20'],
                ['Duck (dismissed for 0)', '−30'],
                ['Score ≤ 10 runs', '−20'],
              ].map(([m, p]) => tableRow(m, p))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">Batters at position 7+ get no points unless they score 10+ runs.</p>
        </section>

        {/* Bowling */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-3">Bowling</h2>
          <table className="w-full">
            <tbody>
              {[
                ['1 Wicket', '+25 pts'],
                ['Maiden over', '+40 bonus'],
                ['3+ wickets', '+20 bonus'],
                ['5+ wickets', '+35 bonus'],
                ['Economy ≤ 4.0 (3+ overs)', '+80'],
                ['Economy ≤ 6.0 (3+ overs)', '+60'],
                ['Economy ≤ 8.0 (3+ overs)', '+30'],
                ['Economy ≥ 10.0 (3+ overs)', '−20'],
                ['Economy ≥ 12.0 (3+ overs)', '−30'],
                ['Economy ≥ 14.0 (3+ overs)', '−40'],
                ['Wicketless after 2+ overs', '−20'],
              ].map(([m, p]) => tableRow(m, p))}
            </tbody>
          </table>
        </section>

        {/* Fielding & Bonuses */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-3">Fielding & Bonuses</h2>
          <table className="w-full">
            <tbody>
              {[
                ['Catch / Stumping', '+10 pts'],
                ['Run-out', '+10 pts'],
                ['Man of the Match', '+10 pts'],
                ['Correct winner prediction', '+50 pts'],
              ].map(([m, p]) => tableRow(m, p))}
            </tbody>
          </table>
        </section>

        {/* Multipliers */}
        <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-3">Multipliers</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
                <th className="text-right pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Gain</th>
                <th className="text-right pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Loss</th>
              </tr>
            </thead>
            <tbody>
              {[
                { type: 'Yellow', gain: '1×', loss: '1×', c: 'text-yellow-500' },
                { type: 'Green', gain: '2×', loss: '1×', c: 'text-emerald-600' },
                { type: 'Purple', gain: '3×', loss: '1.5×', c: 'text-purple-600' },
                { type: 'All-in (max 4/season)', gain: '5×', loss: '2.5×', c: 'text-red-500' },
              ].map(r => (
                <tr key={r.type} className="border-b border-gray-100 last:border-0">
                  <td className={`py-2 text-sm font-bold ${r.c}`}>{r.type}</td>
                  <td className="py-2 text-right text-sm font-bold text-emerald-600">{r.gain}</td>
                  <td className="py-2 text-right text-sm font-bold text-red-500">{r.loss}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">Multipliers apply to gains and losses separately.</p>
        </section>

      </div>

      {/* End-of-Season Prizes — full width */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-800 mb-3">End-of-Season Prizes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { icon: '🏆', label: 'Most Wins', pts: 700 },
            { icon: '🟠', label: 'Orange Cap', sub: 'most fantasy runs', pts: 350 },
            { icon: '🟣', label: 'Purple Cap', sub: 'most fantasy wickets', pts: 350 },
            { icon: '🔥', label: 'Longest Win Streak', pts: 350 },
            { icon: '💜', label: 'Most Purple Hits', pts: 350 },
          ].map(p => (
            <div key={p.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="text-xl mb-1">{p.icon}</div>
              <div className="text-sm font-semibold text-gray-700">{p.label}</div>
              {p.sub && <div className="text-xs text-gray-400">{p.sub}</div>}
              <div className="text-base font-black text-amber-500 mt-1">+{p.pts} pts</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
