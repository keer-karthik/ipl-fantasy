'use client';
import { use, useState } from 'react';
import { motion } from 'framer-motion';
import { useSeasonState, emptyMatch } from '@/lib/store';
import { getFixture, teams, formatDate } from '@/lib/data';
import { calcPlayerResult, multiplierColor, multiplierBadge } from '@/lib/scoring';
import { TeamLogo } from '@/components/TeamBadge';
import LiveScorecard from '@/components/LiveScorecard';
import type { Multiplier, PlayerPick, PlayerStats, TeamName } from '@/lib/types';

const MULTIPLIERS: Multiplier[] = ['yellow', 'green', 'purple', 'allin'];

function emptyStats(name: string): PlayerStats {
  return {
    playerName: name, didBat: false, runs: 0, balls: 0, dismissed: false, battingPosition: 1,
    didBowl: false, overs: 0, runsConceded: 0, wickets: 0, maidens: 0,
    catches: 0, stumpings: 0, runOuts: 0, isMOM: false,
  };
}

// ─── Picks Section ────────────────────────────────────────────────────────────

function PicksEditor({
  picks, onChange, fixture, sideLabel, allInUsedSeason,
}: {
  picks: PlayerPick[];
  onChange: (picks: PlayerPick[]) => void;
  fixture: ReturnType<typeof getFixture>;
  sideLabel: string;
  allInUsedSeason: number;
}) {
  if (!fixture) return null;
  const allPlayers = [
    ...(teams[fixture.home]?.players ?? []).map(p => ({ ...p, team: fixture.home as TeamName })),
    ...(teams[fixture.away]?.players ?? []).map(p => ({ ...p, team: fixture.away as TeamName })),
  ];

  const used = picks.map(p => p.multiplier);
  const purpleUsed = used.includes('purple');
  const greenUsed = used.includes('green');
  const allinUsed = used.includes('allin');

  function addPick() {
    if (picks.length >= 5) return;
    const first = allPlayers.find(p => !picks.some(pk => pk.playerName === p.name));
    if (!first) return;
    onChange([...picks, { playerName: first.name, team: first.team, multiplier: 'yellow' }]);
  }

  function removePick(i: number) { onChange(picks.filter((_, idx) => idx !== i)); }

  function updatePick(i: number, field: keyof PlayerPick, value: string) {
    const next = picks.map((p, idx) => idx === i ? { ...p, [field]: value } : p);
    onChange(next);
  }

  function canUseMultiplier(m: Multiplier, currentIdx: number): boolean {
    const currentM = picks[currentIdx]?.multiplier;
    if (m === 'purple') return currentM === 'purple' || !purpleUsed;
    if (m === 'green')  return currentM === 'green'  || !greenUsed;
    if (m === 'allin')  return currentM === 'allin'  || (!allinUsed && allInUsedSeason < 4);
    return true;
  }

  const isLads = sideLabel === 'Lads';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className={`font-bold text-sm ${isLads ? 'text-blue-600' : 'text-pink-600'}`}>
          {sideLabel} — Picks ({picks.length}/5)
        </h3>
        {picks.length < 5 && (
          <button onClick={addPick}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-medium transition-colors shadow-sm">
            + Add Player
          </button>
        )}
      </div>
      {picks.map((pick, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 shadow-sm">
          <div className="flex gap-2 items-start">
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <select
                  value={pick.playerName}
                  onChange={e => {
                    const player = allPlayers.find(p => p.name === e.target.value);
                    updatePick(i, 'playerName', e.target.value);
                    if (player) updatePick(i, 'team', player.team);
                  }}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {allPlayers.map(p => (
                    <option key={p.name} value={p.name}
                      disabled={picks.some((pk, idx) => idx !== i && pk.playerName === p.name)}>
                      {p.name} ({p.role.charAt(0)}) — {teams[p.team]?.shortName}
                    </option>
                  ))}
                </select>
                <select
                  value={pick.multiplier}
                  onChange={e => updatePick(i, 'multiplier', e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {MULTIPLIERS.map(m => (
                    <option key={m} value={m} disabled={!canUseMultiplier(m, i)}>
                      {m === 'yellow' ? '🟡 Yellow 1×' : m === 'green' ? '🟢 Green 2×' : m === 'purple' ? '🟣 Purple 3×' : `🔴 All-in 5× (${allInUsedSeason}/4 used)`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 items-center text-xs text-gray-500">
                <span className="font-medium">Sub:</span>
                <select
                  value={pick.substituteName ?? ''}
                  onChange={e => {
                    const player = allPlayers.find(p => p.name === e.target.value);
                    updatePick(i, 'substituteName', e.target.value);
                    if (player) updatePick(i, 'substituteTeam', player.team);
                  }}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-gray-600"
                >
                  <option value="">— No substitute —</option>
                  {allPlayers.filter(p => p.name !== pick.playerName).map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.role.charAt(0)}) — {teams[p.team]?.shortName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button onClick={() => removePick(i)}
              className="text-gray-300 hover:text-red-400 text-xl leading-none pt-1 transition-colors">×</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Stats Entry ──────────────────────────────────────────────────────────────

function StatsRow({ stats, onChange }: { stats: PlayerStats; onChange: (s: PlayerStats) => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-800">{stats.playerName}</span>
        <label className="flex items-center gap-2 text-xs text-amber-600 font-semibold cursor-pointer">
          <input type="checkbox" checked={stats.isMOM} onChange={e => onChange({ ...stats, isMOM: e.target.checked })} className="rounded" />
          MOM (+10)
        </label>
      </div>

      {/* Batting */}
      <div>
        <label className="flex items-center gap-2 text-xs text-gray-500 mb-2 cursor-pointer">
          <input type="checkbox" checked={stats.didBat} onChange={e => onChange({ ...stats, didBat: e.target.checked })} />
          Batted
        </label>
        {stats.didBat && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Runs', field: 'runs' as const },
              { label: 'Balls', field: 'balls' as const },
              { label: 'Pos', field: 'battingPosition' as const },
            ].map(({ label, field }) => (
              <label key={field} className="text-center">
                <span className="text-xs text-gray-400 block mb-1">{label}</span>
                <input type="number" min={0} value={stats[field] as number}
                  onChange={e => onChange({ ...stats, [field]: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-sm text-center text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </label>
            ))}
            <label className="text-center">
              <span className="text-xs text-gray-400 block mb-1">Out</span>
              <div className="flex items-center justify-center h-9">
                <input type="checkbox" checked={stats.dismissed}
                  onChange={e => onChange({ ...stats, dismissed: e.target.checked })}
                  className="w-4 h-4" />
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Bowling */}
      <div>
        <label className="flex items-center gap-2 text-xs text-gray-500 mb-2 cursor-pointer">
          <input type="checkbox" checked={stats.didBowl} onChange={e => onChange({ ...stats, didBowl: e.target.checked })} />
          Bowled
        </label>
        {stats.didBowl && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Overs', field: 'overs' as const, isFloat: true },
              { label: 'Runs', field: 'runsConceded' as const },
              { label: 'Wkts', field: 'wickets' as const },
              { label: 'Maidens', field: 'maidens' as const },
            ].map(({ label, field, isFloat }) => (
              <label key={field} className="text-center">
                <span className="text-xs text-gray-400 block mb-1">{label}</span>
                <input type="number" min={0} step={isFloat ? 0.1 : 1} value={stats[field] as number}
                  onChange={e => onChange({ ...stats, [field]: isFloat ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-sm text-center text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Fielding */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Catches', field: 'catches' as const },
          { label: 'Stumpings', field: 'stumpings' as const },
          { label: 'Run-outs', field: 'runOuts' as const },
        ].map(({ label, field }) => (
          <label key={field} className="text-center">
            <span className="text-xs text-gray-400 block mb-1">{label}</span>
            <input type="number" min={0} value={stats[field]}
              onChange={e => onChange({ ...stats, [field]: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-sm text-center text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Result Display ───────────────────────────────────────────────────────────

function ResultsDisplay({ match }: { match: ReturnType<typeof emptyMatch> }) {
  const winner = match.winner;

  return (
    <div className="space-y-6">
      {/* Score Summary */}
      <div className="grid grid-cols-2 gap-4">
        {(['lads', 'gils'] as const).map(side => {
          const data = match[side];
          const isWinner = winner === side;
          return (
            <motion.div key={side} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className={`rounded-2xl p-5 border-2 shadow-sm text-center ${
                isWinner ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'
              }`}>
              <div className={`text-sm font-bold mb-1 ${side === 'lads' ? 'text-blue-600' : 'text-pink-600'}`}>
                {side === 'lads' ? 'Lads' : 'Gils'} {isWinner && '🏆'}
              </div>
              <div className="text-4xl font-black text-gray-900">{data.total}</div>
              <div className="text-xs text-gray-400 mt-1">points</div>
            </motion.div>
          );
        })}
      </div>

      {/* Player Breakdown */}
      {(['lads', 'gils'] as const).map(side => (
        <div key={side}>
          <h3 className={`font-bold mb-3 ${side === 'lads' ? 'text-blue-600' : 'text-pink-600'}`}>
            {side === 'lads' ? 'Lads' : 'Gils'} — Breakdown
          </h3>
          <div className="space-y-2">
            {match[side].results.map(r => (
              <div key={r.playerName} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-800">{r.playerName}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${multiplierColor(r.multiplier)}`}>
                      {multiplierBadge(r.multiplier)}
                    </span>
                  </div>
                  <span className={`font-bold text-sm ${r.finalTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {r.finalTotal > 0 ? '+' : ''}{r.finalTotal}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-400">
                  {r.didBat && <span>Bat: <span className="text-gray-600 font-medium">{r.battingPoints}</span> ({r.runs}r {r.balls}b)</span>}
                  {r.didBowl && <span>Bowl: <span className="text-gray-600 font-medium">{r.bowlingPoints}</span> ({r.wickets}w {r.overs}ov)</span>}
                  {r.fieldingPoints > 0 && <span>Field: <span className="text-gray-600 font-medium">+{r.fieldingPoints}</span></span>}
                  {r.isMOM && <span className="text-amber-500 font-semibold">MOM +10</span>}
                  {r.rawTotal !== r.finalTotal && <span className="text-gray-400">Raw: {r.rawTotal}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const matchId = parseInt(id);
  const fixture = getFixture(matchId);
  const { state, updateMatch, loaded } = useSeasonState();
  const [activeTab, setActiveTab] = useState<'picks' | 'live' | 'stats' | 'result'>('picks');

  if (!loaded) return <div className="text-gray-400 text-center py-20">Loading...</div>;
  if (!fixture) return <div className="text-red-500 text-center py-20">Match {matchId} not found.</div>;

  const match = state.matches[matchId] ?? emptyMatch(matchId);

  // Local stats state (before saving)
  const [ladsPicks, setLadsPicks] = useState<PlayerPick[]>(match.lads.picks);
  const [gilsPicks, setGilsPicks] = useState<PlayerPick[]>(match.gils.picks);

  const [ladsStats, setLadsStats] = useState<PlayerStats[]>(
    match.lads.picks.length > 0
      ? (match.lads.stats.length > 0 ? match.lads.stats : match.lads.picks.map(p => emptyStats(p.playerName)))
      : []
  );
  const [gilsStats, setGilsStats] = useState<PlayerStats[]>(
    match.gils.picks.length > 0
      ? (match.gils.stats.length > 0 ? match.gils.stats : match.gils.picks.map(p => emptyStats(p.playerName)))
      : []
  );

  const [ladsPrediction, setLadsPrediction] = useState<TeamName | ''>(match.lads.predictedWinner ?? '');
  const [gilsPrediction, setGilsPrediction] = useState<TeamName | ''>(match.gils.predictedWinner ?? '');
  const [actualWinner, setActualWinner] = useState<TeamName | ''>(match.actualWinner ?? '');

  function savePicks() {
    updateMatch(matchId, m => ({
      ...m,
      lads: { ...m.lads, picks: ladsPicks, predictedWinner: (ladsPrediction as TeamName) || null },
      gils: { ...m.gils, picks: gilsPicks, predictedWinner: (gilsPrediction as TeamName) || null },
    }));
    setLadsStats(ladsPicks.map(p => ladsStats.find(s => s.playerName === p.playerName) ?? emptyStats(p.playerName)));
    setGilsStats(gilsPicks.map(p => gilsStats.find(s => s.playerName === p.playerName) ?? emptyStats(p.playerName)));
    setActiveTab('stats');
  }

  function saveStats() {
    const aw = actualWinner as TeamName | '';
    const results = (picks: PlayerPick[], stats: PlayerStats[], prediction: TeamName | '') => {
      const correctPred = aw !== '' && prediction === aw;
      return picks.map((pick, i) => calcPlayerResult(stats[i] ?? emptyStats(pick.playerName), pick.multiplier, correctPred));
    };

    const ladsResults = results(ladsPicks, ladsStats, ladsPrediction);
    const gilsResults = results(gilsPicks, gilsStats, gilsPrediction);
    const ladsTotal = ladsResults.reduce((s, r) => s + r.finalTotal, 0);
    const gilsTotal = gilsResults.reduce((s, r) => s + r.finalTotal, 0);
    const winner = ladsTotal > gilsTotal ? 'lads' : gilsTotal > ladsTotal ? 'gils' : null;

    const ladsAllin = ladsPicks.some(p => p.multiplier === 'allin');
    const gilsAllin = gilsPicks.some(p => p.multiplier === 'allin');

    updateMatch(matchId, m => ({
      ...m,
      isComplete: true,
      actualWinner: aw || null,
      winner,
      lads: { ...m.lads, picks: ladsPicks, stats: ladsStats, results: ladsResults, total: ladsTotal, predictedWinner: (ladsPrediction as TeamName) || null, allInUsed: ladsAllin },
      gils: { ...m.gils, picks: gilsPicks, stats: gilsStats, results: gilsResults, total: gilsTotal, predictedWinner: (gilsPrediction as TeamName) || null, allInUsed: gilsAllin },
    }));
    setActiveTab('result');
  }

  const tabs: { key: 'picks' | 'live' | 'stats' | 'result'; label: string; disabled?: boolean }[] = [
    { key: 'picks', label: '📋 Picks' },
    { key: 'live', label: '🔴 Live' },
    { key: 'stats', label: '📝 Stats' },
    { key: 'result', label: '🏆 Result', disabled: !match.isComplete },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden shadow-md"
        style={{ background: 'linear-gradient(135deg, var(--ipl-navy) 0%, #0a4fa8 100%)' }}>
        <div className="px-6 py-6 flex flex-col items-center gap-4">
          <div className="text-xs text-blue-300 font-bold uppercase tracking-widest">
            Match {fixture.match} · {fixture.venue}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <TeamLogo team={fixture.home} size={56} />
              <span className="text-white font-bold text-sm">{fixture.home.split(' ').pop()}</span>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-white">VS</div>
              <div className="text-xs text-blue-300 mt-1">{formatDate(fixture.date)}</div>
              <div className="text-xs text-blue-300">{fixture.time} IST</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <TeamLogo team={fixture.away} size={56} />
              <span className="text-white font-bold text-sm">{fixture.away.split(' ').pop()}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
        {tabs.map(t => (
          <button key={t.key} onClick={() => !t.disabled && setActiveTab(t.key)}
            disabled={t.disabled}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.key
                ? 'text-white shadow-sm'
                : t.disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-800'
            }`}
            style={activeTab === t.key ? { background: 'var(--ipl-navy)' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Picks Tab */}
      {activeTab === 'picks' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-100">
              <PicksEditor picks={ladsPicks} onChange={setLadsPicks} fixture={fixture}
                sideLabel="Lads" allInUsedSeason={state.ladsAllInUsed} />
            </div>
            <div className="bg-pink-50/60 rounded-2xl p-4 border border-pink-100">
              <PicksEditor picks={gilsPicks} onChange={setGilsPicks} fixture={fixture}
                sideLabel="Gils" allInUsedSeason={state.gilsAllInUsed} />
            </div>
          </div>

          {/* Winner predictions */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <h3 className="font-bold text-gray-700 text-sm">Winner Prediction <span className="text-amber-500 font-semibold">(+50 pts if correct)</span></h3>
            <div className="grid grid-cols-2 gap-4">
              {(['Lads', 'Gils'] as const).map(side => {
                const pred = side === 'Lads' ? ladsPrediction : gilsPrediction;
                const setPred = side === 'Lads' ? setLadsPrediction : setGilsPrediction;
                return (
                  <label key={side}>
                    <span className={`block text-xs font-semibold mb-1.5 ${side === 'Lads' ? 'text-blue-600' : 'text-pink-600'}`}>{side}</span>
                    <select value={pred} onChange={e => setPred(e.target.value as TeamName | '')}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      <option value="">— No prediction —</option>
                      <option value={fixture.home}>{fixture.home}</option>
                      <option value={fixture.away}>{fixture.away}</option>
                    </select>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            onClick={savePicks}
            disabled={ladsPicks.length !== 5 || gilsPicks.length !== 5}
            className="w-full py-3 rounded-xl font-bold text-gray-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            style={{ background: ladsPicks.length === 5 && gilsPicks.length === 5 ? 'var(--ipl-orange)' : '#f0a060', color: 'white' }}
          >
            Lock Picks & Go to Stats →
          </button>
        </motion.div>
      )}

      {/* Live Tab */}
      {activeTab === 'live' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <LiveScorecard
            matchId={matchId}
            ladsPicks={ladsPicks}
            gilsPicks={gilsPicks}
          />
        </motion.div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Actual winner */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <label className="text-sm font-semibold text-gray-600 block mb-2">Actual IPL match winner</label>
            <select value={actualWinner} onChange={e => setActualWinner(e.target.value as TeamName | '')}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              <option value="">— Match not finished —</option>
              <option value={fixture.home}>{fixture.home}</option>
              <option value={fixture.away}>{fixture.away}</option>
            </select>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Lads stats */}
            <div className="space-y-3">
              <h3 className="font-bold text-blue-600">Lads — Player Stats</h3>
              {ladsStats.length === 0 ? (
                <p className="text-sm text-gray-400">Lock picks first.</p>
              ) : ladsStats.map((s, i) => (
                <StatsRow key={s.playerName} stats={s}
                  onChange={next => setLadsStats(ladsStats.map((x, idx) => idx === i ? next : x))} />
              ))}
            </div>

            {/* Gils stats */}
            <div className="space-y-3">
              <h3 className="font-bold text-pink-600">Gils — Player Stats</h3>
              {gilsStats.length === 0 ? (
                <p className="text-sm text-gray-400">Lock picks first.</p>
              ) : gilsStats.map((s, i) => (
                <StatsRow key={s.playerName} stats={s}
                  onChange={next => setGilsStats(gilsStats.map((x, idx) => idx === i ? next : x))} />
              ))}
            </div>
          </div>

          <button onClick={saveStats}
            className="w-full py-3 rounded-xl font-bold text-white transition-colors shadow-sm"
            style={{ background: 'var(--ipl-navy)' }}>
            Calculate & Save Results →
          </button>
        </motion.div>
      )}

      {/* Result Tab */}
      {activeTab === 'result' && match.isComplete && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <ResultsDisplay match={match} />
        </motion.div>
      )}
    </div>
  );
}
