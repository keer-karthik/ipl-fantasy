'use client';
import { use, useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSeasonState, emptyMatch } from '@/lib/store';
import { getFixture, teams, formatDate, getMatchStartIST } from '@/lib/data';
import { multiplierColor, multiplierBadge, applyMultiplier } from '@/lib/scoring';
import { TeamLogo } from '@/components/TeamBadge';
import LiveScorecard, { SidePanel, tieredTotalColor } from '@/components/LiveScorecard';
import { useLiveScore, type LiveData } from '@/hooks/useLiveScore';
import { autoResultFromLive, calcLiveBatsmen, calcLiveBowlers, calcLiveFantasyTotal } from '@/lib/liveScoring';
import type { Multiplier, PlayerPick, PlayerStats, PlayerResult, SideEntry, MatchEntry, TeamName } from '@/lib/types';

const MULTIPLIERS: Multiplier[] = ['yellow', 'green', 'purple', 'allin'];

const MULT_CFG: Record<Multiplier, { short: string; label: string; active: string; idle: string; activeText: string; idleText: string }> = {
  yellow: { short: '1×', label: 'Yellow 1×', active: '#f59e0b', idle: '#fef3c7', activeText: '#fff', idleText: '#92400e' },
  green:  { short: '2×', label: 'Green 2×',  active: '#16a34a', idle: '#dcfce7', activeText: '#fff', idleText: '#166534' },
  purple: { short: '3×', label: 'Purple 3×', active: '#7c3aed', idle: '#ede9fe', activeText: '#fff', idleText: '#5b21b6' },
  allin:  { short: '5×', label: 'All-in 5×', active: '#be185d', idle: '#fdf2f8', activeText: '#fff', idleText: '#9d174d' },
};

function MultiplierPicker({ value, onChange, canUse }: {
  value: Multiplier;
  onChange: (m: Multiplier) => void;
  canUse: (m: Multiplier) => boolean;
}) {
  return (
    <div className="flex gap-1">
      {MULTIPLIERS.map(m => {
        const cfg = MULT_CFG[m];
        const active = value === m;
        const available = canUse(m);
        return (
          <button
            key={m}
            type="button"
            title={cfg.label}
            disabled={!available && !active}
            onClick={() => available && onChange(m)}
            style={{
              background: active ? cfg.active : cfg.idle,
              color: active ? cfg.activeText : cfg.idleText,
              border: `1.5px solid ${active ? cfg.active : 'transparent'}`,
              fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: '0.04em',
              padding: '4px 9px',
              borderRadius: 8,
              opacity: !available && !active ? 0.35 : 1,
              cursor: !available && !active ? 'not-allowed' : 'pointer',
              lineHeight: 1,
              transition: 'all 0.12s',
              whiteSpace: 'nowrap',
            }}
          >
            {cfg.short}
          </button>
        );
      })}
    </div>
  );
}

// Searchable player combobox — text input filters the dropdown in real-time
function PlayerComboBox({
  value,
  options,
  onChange,
  placeholder,
  className,
  small,
}: {
  value: string;
  options: Array<{ name: string; label: string; disabled?: boolean }>;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
  small?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.name === value);
  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const inputCls = small
    ? 'w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 placeholder:text-gray-400'
    : 'w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 placeholder:text-gray-400';

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* When closed: show selected label; click anywhere opens it */}
      {!open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setQuery(''); }}
          className={inputCls + ' text-left truncate w-full'}
        >
          {selected ? selected.label : <span className="text-gray-400">{placeholder ?? 'Select player'}</span>}
        </button>
      ) : (
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={selected?.label ?? placeholder ?? 'Type to search…'}
          className={inputCls}
        />
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No players found</div>
          ) : (
            filtered.map(o => (
              <button
                key={o.name}
                type="button"
                disabled={o.disabled}
                onClick={() => {
                  onChange(o.name);
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full text-left px-3.5 transition-colors
                  ${o.name === value ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-50'}
                  ${o.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                  ${small ? 'text-xs py-1.5' : 'text-sm py-2'}`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// IPL burst decoration (miniature version for match header)
function BurstDecoration({ flip = false, size = 160 }: { flip?: boolean; size?: number }) {
  const rays = [
    { angle: 0,   color: '#FFD700', len: 60, dot: 5 },
    { angle: 30,  color: '#FF6B00', len: 45, dot: 3.5 },
    { angle: 60,  color: '#00C853', len: 55, dot: 4.5 },
    { angle: 90,  color: '#FF1493', len: 40, dot: 3.5 },
    { angle: 120, color: '#00B4D8', len: 58, dot: 5 },
    { angle: 150, color: '#9C27B0', len: 43, dot: 3.5 },
    { angle: 180, color: '#FFD700', len: 62, dot: 5 },
    { angle: 210, color: '#FF4444', len: 44, dot: 3.5 },
    { angle: 240, color: '#00C853', len: 56, dot: 4.5 },
    { angle: 270, color: '#FF6B00', len: 42, dot: 3.5 },
    { angle: 300, color: '#00B4D8', len: 60, dot: 5 },
    { angle: 330, color: '#FF1493', len: 44, dot: 3.5 },
  ];
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}
      style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      {rays.map((r, i) => {
        const rad = (r.angle * Math.PI) / 180;
        const x1 = 100 + 25 * Math.cos(rad);
        const y1 = 100 + 25 * Math.sin(rad);
        const x2 = 100 + r.len * Math.cos(rad);
        const y2 = 100 + r.len * Math.sin(rad);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={r.color} strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
            <circle cx={x2} cy={y2} r={r.dot} fill={r.color} opacity="0.9" />
          </g>
        );
      })}
    </svg>
  );
}

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
  const accent = isLads ? '#f59e0b' : '#7c3aed';
  const accentTextCls = isLads ? 'text-amber-500' : 'text-violet-600';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-sm" style={{
          fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif',
          fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent,
        }}>
          {sideLabel} — Picks ({picks.length}/5)
        </h3>
        {picks.length < 5 && (
          <button onClick={addPick}
            className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 font-semibold transition-colors shadow-sm">
            + Add
          </button>
        )}
      </div>
      {picks.map((pick, i) => {
        const cfg = MULT_CFG[pick.multiplier];
        return (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl shadow-sm overflow-hidden"
            style={{ background: cfg.idle, border: `2px solid ${cfg.active}` }}>
            {/* Top row: player + remove */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
              <PlayerComboBox
                value={pick.playerName}
                options={allPlayers.map(p => ({
                  name: p.name,
                  label: `${p.name} (${p.role.charAt(0)}) — ${teams[p.team]?.shortName}`,
                  disabled: picks.some((pk, idx) => idx !== i && pk.playerName === p.name),
                }))}
                onChange={name => {
                  const player = allPlayers.find(p => p.name === name);
                  const next = picks.map((p, idx) =>
                    idx === i ? { ...p, playerName: name, ...(player ? { team: player.team } : {}) } : p
                  );
                  onChange(next);
                }}
                className="flex-1"
              />
              <button onClick={() => removePick(i)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors text-lg leading-none flex-shrink-0">
                ×
              </button>
            </div>

            {/* Multiplier chips */}
            <div className="px-3 pb-2 flex items-center justify-between">
              <MultiplierPicker
                value={pick.multiplier}
                onChange={m => updatePick(i, 'multiplier', m)}
                canUse={m => canUseMultiplier(m, i)}
              />
              {pick.multiplier === 'allin' && (
                <span className="text-[10px] text-gray-400 font-semibold">{allInUsedSeason}/4 used</span>
              )}
            </div>

            {/* Sub row */}
            <div className="border-t border-black/5 px-3 py-1.5 flex gap-2 items-center bg-black/5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0">Sub</span>
              <PlayerComboBox
                small
                value={pick.substituteName ?? ''}
                options={[
                  { name: '', label: '— No substitute —' },
                  ...allPlayers.filter(p => p.name !== pick.playerName).map(p => ({
                    name: p.name,
                    label: `${p.name} (${p.role.charAt(0)}) — ${teams[p.team]?.shortName}`,
                  })),
                ]}
                onChange={name => {
                  const player = allPlayers.find(p => p.name === name);
                  const next = picks.map((p, idx) =>
                    idx === i ? { ...p, substituteName: name || undefined, ...(player ? { substituteTeam: player.team } : { substituteTeam: undefined }) } : p
                  );
                  onChange(next);
                }}
                className="flex-1"
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Result Display ───────────────────────────────────────────────────────────

function pts(n: number, fallback = '—') {
  if (n === 0) return fallback;
  return n > 0 ? `+${n}` : String(n);
}

function getBattingBreakdown(r: PlayerResult): Array<{ label: string; pts: number }> {
  if (!r.didBat) return [];
  if (r.battingPosition >= 7 && r.runs < 10) return [];
  if (r.dismissed && r.runs === 0 && r.battingPosition < 7)
    return [{ label: 'Duck (dismissed for 0)', pts: -30 }];
  if (r.runs <= 10 && r.battingPosition < 7)
    return [{ label: `${r.runs} run${r.runs !== 1 ? 's' : ''} (≤10 penalty)`, pts: -20 }];
  const items: Array<{ label: string; pts: number }> = [];
  items.push({ label: `${r.runs} runs`, pts: r.runs });
  if (r.runs >= 25) items.push({ label: '25+ milestone', pts: 5 });
  if (r.runs >= 40) items.push({ label: '40+ milestone', pts: 15 });
  if (r.runs >= 70) items.push({ label: '70+ milestone', pts: 25 });
  if (r.runs >= 90) items.push({ label: '90+ milestone', pts: 35 });
  if (r.balls > 0) {
    const sr = (r.runs / r.balls) * 100;
    if      (sr >= 300 && r.balls >= 25) items.push({ label: `SR ${sr.toFixed(0)}% (≥300, ${r.balls}b)`, pts: 50 });
    else if (sr >= 250 && r.balls >= 20) items.push({ label: `SR ${sr.toFixed(0)}% (≥250, ${r.balls}b)`, pts: 25 });
    else if (sr >= 200 && r.balls >= 10) items.push({ label: `SR ${sr.toFixed(0)}% (≥200, ${r.balls}b)`, pts: 10 });
    else if (sr <= 100 && r.balls >= 10) items.push({ label: `SR ${sr.toFixed(0)}% (≤100, ${r.balls}b)`, pts: -20 });
  }
  return items;
}

function getBowlingBreakdown(r: PlayerResult): Array<{ label: string; pts: number }> {
  if (!r.didBowl || r.overs === 0) return [];
  const items: Array<{ label: string; pts: number }> = [];
  if (r.wickets > 0) items.push({ label: `${r.wickets} wkt${r.wickets > 1 ? 's' : ''} × 25`, pts: r.wickets * 25 });
  if (r.maidens > 0) items.push({ label: `${r.maidens} maiden${r.maidens > 1 ? 's' : ''} × 40`, pts: r.maidens * 40 });
  if (r.overs >= 3) {
    const eco = r.runsConceded / r.overs;
    const ecoLabel = `ECO ${eco.toFixed(2)} (${r.runsConceded}r / ${r.overs}ov)`;
    if      (eco <= 4)  items.push({ label: `${ecoLabel} ≤4.0`, pts: 80 });
    else if (eco <= 6)  items.push({ label: `${ecoLabel} ≤6.0`, pts: 60 });
    else if (eco <= 8)  items.push({ label: `${ecoLabel} ≤8.0`, pts: 40 });
    else if (eco <= 9)  items.push({ label: `${ecoLabel} ≤9.0`, pts: 20 });
    else if (eco >= 14) items.push({ label: `${ecoLabel} ≥14.0`, pts: -60 });
    else if (eco >= 12) items.push({ label: `${ecoLabel} ≥12.0`, pts: -40 });
    else if (eco >= 10) items.push({ label: `${ecoLabel} ≥10.0`, pts: -20 });
    // Additional tiered wicketless penalty (only when economy is bad)
    if (r.wickets === 0) {
      if      (eco > 12) items.push({ label: 'No wickets (eco>12)', pts: -20 });
      else if (eco > 10) items.push({ label: 'No wickets (eco>10)', pts: -10 });
    }
  }
  if      (r.wickets >= 5) items.push({ label: '5+ wickets bonus', pts: 35 });
  else if (r.wickets >= 3) items.push({ label: '3+ wickets bonus', pts: 20 });
  return items;
}

function ResultsDisplay({ match, matchId, updateMatch }: {
  match: ReturnType<typeof emptyMatch>;
  matchId: number;
  updateMatch: (id: number, updater: (m: MatchEntry) => MatchEntry) => void;
}) {
  const winner = match.winner;
  const [refreshing, setRefreshing] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  // Always recompute from individual discipline points — stored rawTotal may be stale from old scoring runs
  function computedRaw(r: PlayerResult) {
    return r.battingPoints + r.bowlingPoints + r.fieldingPoints;
  }

  function sideDisplayTotal(side: 'lads' | 'gils') {
    const data = match[side];
    const hasBonus = data.predictedWinner !== null && match.actualWinner === data.predictedWinner;
    const momBonus = data.results.filter(r => r.isMOM).length * 10;
    return data.results.reduce((s, r) => s + Math.round(applyMultiplier(computedRaw(r), r.multiplier)), 0)
      + (hasBonus ? 50 : 0)
      + momBonus;
  }

  async function handleRefreshStats() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/live/${matchId}`);
      const liveData: LiveData = await res.json();
      updateMatch(matchId, m => {
        const actualWinner = liveData.actualWinner as TeamName | null;
        const refreshSide = (se: SideEntry): SideEntry => {
          const momSet = new Set(se.results.filter(r => r.isMOM).map(r => r.playerName));
          const newResults = autoResultFromLive(liveData.innings, se.picks, liveData.playingEleven ?? [], liveData.manOfTheMatch ?? null);
          const results = newResults.map(r => ({ ...r, isMOM: momSet.has(r.playerName) || r.isMOM }));
          const hasWinnerBonus = se.predictedWinner !== null && se.predictedWinner === actualWinner;
          const momBonus = results.filter(r => r.isMOM).length * 10;
          const total = results.reduce((s, r) => s + Math.round(applyMultiplier(r.battingPoints + r.bowlingPoints + r.fieldingPoints, r.multiplier)), 0) + (hasWinnerBonus ? 50 : 0) + momBonus;
          return { ...se, results, total };
        };
        return { ...m, lads: refreshSide(m.lads), gils: refreshSide(m.gils) };
      });
    } finally {
      setRefreshing(false);
    }
  }

  function handleSetMOM(clickedSide: 'lads' | 'gils', playerName: string) {
    updateMatch(matchId, m => {
      const isAlreadyMOM = m[clickedSide].results.some(r => r.playerName === playerName && r.isMOM);
      const clearAndSet = (results: PlayerResult[]) =>
        results.map(r => ({ ...r, isMOM: !isAlreadyMOM && r.playerName === playerName }));
      return {
        ...m,
        lads: { ...m.lads, results: clearAndSet(m.lads.results) },
        gils: { ...m.gils, results: clearAndSet(m.gils.results) },
      };
    });
  }

  // Auto-refresh once on mount if match is complete but fielding data is missing
  useEffect(() => {
    const allResults = [...match.lads.results, ...match.gils.results];
    if (match.isComplete && allResults.length > 0 && allResults.every(r => r.fieldingPoints === 0)) {
      handleRefreshStats();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {/* Score Summary */}
      <div className="grid grid-cols-2 gap-4">
        {(['lads', 'gils'] as const).map(side => {
          const displayTotal = sideDisplayTotal(side);
          const isWinner = winner === side;
          return (
            <motion.div key={side} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className={`rounded-2xl p-5 border-2 shadow-sm text-center ${
                isWinner ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'
              }`}>
              <div className={`text-sm font-bold mb-1 ${side === 'lads' ? 'text-blue-600' : 'text-pink-600'}`}>
                {side === 'lads' ? 'Lads' : 'Gils'} {isWinner && <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>WIN</span>}
              </div>
              <div className="text-4xl font-black text-gray-900">{displayTotal}</div>
              <div className="text-xs text-gray-400 mt-1">points</div>
            </motion.div>
          );
        })}
      </div>

      {/* Refresh button */}
      {match.isComplete && (
        <div className="flex justify-end -mt-2">
          <button onClick={handleRefreshStats} disabled={refreshing}
            className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-40 flex items-center gap-1 transition-colors">
            {refreshing ? 'Refreshing…' : '↻ Refresh stats from ESPN'}
          </button>
        </div>
      )}

      {/* Per-side breakdown tables */}
      {(['lads', 'gils'] as const).map(side => {
        const data = match[side];
        const hasWinnerBonus = data.predictedWinner !== null && match.actualWinner === data.predictedWinner;
        const displayTotal = sideDisplayTotal(side);

        return (
          <div key={side}>
            <h3 className={`font-bold mb-3 ${side === 'lads' ? 'text-blue-600' : 'text-pink-600'}`}>
              {side === 'lads' ? 'Lads' : 'Gils'} — Breakdown
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm bg-white">
              <table className="w-full text-sm" style={{ minWidth: 520 }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-3 py-2.5 font-semibold">Player</th>
                    <th className="text-right px-2 py-2.5 font-semibold">Bat</th>
                    <th className="text-right px-2 py-2.5 font-semibold">Bowl</th>
                    <th className="text-right px-2 py-2.5 font-semibold">Field</th>
                    <th className="text-center px-2 py-2.5 font-semibold">MOM</th>
                    <th className="text-right px-2 py-2.5 font-semibold">Raw</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.results.map(r => {
                    const raw = computedRaw(r);
                    const displayFinal = Math.round(applyMultiplier(raw, r.multiplier));
                    const expandKey = `${side}-${r.playerName}`;
                    const isExpanded = expandedPlayer === expandKey;
                    const batItems = getBattingBreakdown(r);
                    const bowlItems = getBowlingBreakdown(r);
                    const fieldDismissals = r.fieldingPoints > 0 ? r.fieldingPoints / 10 : 0;
                    return (
                      <>
                        <tr key={r.playerName}
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer select-none"
                          onClick={() => setExpandedPlayer(prev => prev === expandKey ? null : expandKey)}>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-400 text-xs">{isExpanded ? '▾' : '▸'}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${multiplierColor(r.multiplier)}`}>
                                {multiplierBadge(r.multiplier)}
                              </span>
                              <span className="font-semibold text-gray-800">{r.playerName}</span>
                            </div>
                            <div className="flex gap-2 text-xs text-gray-400 mt-0.5 ml-5">
                              {r.didBat && <span>{r.runs}r · {r.balls}b</span>}
                              {r.didBowl && <span>{r.wickets}w · {r.overs}ov</span>}
                              {!r.didBat && !r.didBowl && <span>DNP</span>}
                            </div>
                          </td>
                          <td className={`text-right px-2 py-3 font-medium tabular-nums ${
                            !r.didBat ? 'text-gray-300' :
                            r.battingPoints > 0 ? 'text-green-600' : r.battingPoints < 0 ? 'text-red-500' : 'text-gray-400'
                          }`}>
                            {r.didBat ? pts(r.battingPoints, '0') : '—'}
                          </td>
                          <td className={`text-right px-2 py-3 font-medium tabular-nums ${
                            !r.didBowl ? 'text-gray-300' :
                            r.bowlingPoints > 0 ? 'text-green-600' : r.bowlingPoints < 0 ? 'text-red-500' : 'text-gray-400'
                          }`}>
                            {r.didBowl ? pts(r.bowlingPoints, '0') : '—'}
                          </td>
                          <td className={`text-right px-2 py-3 font-medium tabular-nums ${
                            r.fieldingPoints > 0 ? 'text-green-600' : 'text-gray-300'
                          }`}>
                            {pts(r.fieldingPoints)}
                          </td>
                          <td className="text-center px-2 py-3">
                            {match.isComplete ? (
                              r.isMOM ? (
                                <button onClick={e => { e.stopPropagation(); handleSetMOM(side, r.playerName); }}
                                  className="text-xs px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-700 cursor-pointer">
                                  +10
                                </button>
                              ) : (
                                <button onClick={e => { e.stopPropagation(); handleSetMOM(side, r.playerName); }}
                                  title="Set as Man of the Match"
                                  className="text-gray-300 hover:text-amber-400 transition-colors text-base leading-none">
                                  ☆
                                </button>
                              )
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="text-right px-2 py-3 tabular-nums text-gray-500 font-medium">
                            {pts(raw, '0')}
                          </td>
                          <td className={`text-right px-3 py-3 font-bold tabular-nums text-base ${
                            displayFinal > 0 ? 'text-green-600' : displayFinal < 0 ? 'text-red-600' : 'text-gray-400'
                          }`}>
                            {pts(displayFinal, '0')}
                          </td>
                        </tr>
                        {isExpanded && (batItems.length > 0 || bowlItems.length > 0 || fieldDismissals > 0) && (
                          <tr key={`${r.playerName}-expand`} className="bg-slate-50 border-t border-slate-100">
                            <td colSpan={7} className="px-5 py-3">
                              <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
                                {batItems.length > 0 && (
                                  <div className="min-w-[160px]">
                                    <div className="text-gray-400 font-bold uppercase tracking-wider mb-1.5">Batting</div>
                                    {batItems.map((item, i) => (
                                      <div key={i} className="flex justify-between gap-4">
                                        <span className="text-gray-500">{item.label}</span>
                                        <span className={`font-semibold tabular-nums ${item.pts >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                          {item.pts > 0 ? `+${item.pts}` : item.pts}
                                        </span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between gap-4 border-t border-slate-200 mt-1 pt-1 font-bold">
                                      <span className="text-gray-600">Subtotal</span>
                                      <span className={r.battingPoints >= 0 ? 'text-green-700' : 'text-red-600'}>
                                        {pts(r.battingPoints, '0')}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                {bowlItems.length > 0 && (
                                  <div className="min-w-[200px]">
                                    <div className="text-gray-400 font-bold uppercase tracking-wider mb-1.5">Bowling</div>
                                    {bowlItems.map((item, i) => (
                                      <div key={i} className="flex justify-between gap-4">
                                        <span className="text-gray-500">{item.label}</span>
                                        <span className={`font-semibold tabular-nums ${item.pts >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                          {item.pts > 0 ? `+${item.pts}` : item.pts}
                                        </span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between gap-4 border-t border-slate-200 mt-1 pt-1 font-bold">
                                      <span className="text-gray-600">Subtotal</span>
                                      <span className={r.bowlingPoints >= 0 ? 'text-green-700' : 'text-red-600'}>
                                        {pts(r.bowlingPoints, '0')}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                {fieldDismissals > 0 && (
                                  <div className="min-w-[160px]">
                                    <div className="text-gray-400 font-bold uppercase tracking-wider mb-1.5">Fielding</div>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-gray-500">{fieldDismissals} dismissal{fieldDismissals !== 1 ? 's' : ''} × 10</span>
                                      <span className="font-semibold text-green-600 tabular-nums">+{r.fieldingPoints}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  {hasWinnerBonus && (
                    <tr className="bg-amber-50/70 border-t border-amber-100">
                      <td className="px-3 py-2.5 font-semibold text-amber-700 text-sm" colSpan={4}>
                        Correct prediction — {data.predictedWinner}
                      </td>
                      <td />
                      <td className="text-right px-2 py-2.5 font-medium text-gray-500 tabular-nums">+50</td>
                      <td className="text-right px-3 py-2.5 font-bold text-green-600 tabular-nums text-base">+50</td>
                    </tr>
                  )}
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="px-3 py-3 font-black text-gray-700 text-sm uppercase tracking-wide" colSpan={6}>
                      Total
                    </td>
                    <td className={`text-right px-3 py-3 font-black text-xl tabular-nums ${
                      displayTotal >= 0 ? 'text-gray-900' : 'text-red-600'
                    }`}>
                      {displayTotal}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const matchId = parseInt(id);
  const fixture = getFixture(matchId);
  const { state, updateMatch, loaded, side } = useSeasonState();

  // ALL hooks must be declared before any conditional return
  const [activeTab, setActiveTab] = useState<'studio' | 'live' | 'result'>('studio');

  // Read URL hash on mount and keep hash in sync when switching tabs
  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as 'studio' | 'live' | 'result';
    if (hash === 'studio' || hash === 'live' || hash === 'result') {
      setActiveTab(hash);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchTab(tab: 'studio' | 'live' | 'result') {
    setActiveTab(tab);
    if (typeof window !== 'undefined') window.location.hash = tab;
  }
  const [ladsPicks, setLadsPicks] = useState<PlayerPick[]>([]);
  const [gilsPicks, setGilsPicks] = useState<PlayerPick[]>([]);
  const [ladsPrediction, setLadsPrediction] = useState<TeamName | ''>('');
  const [gilsPrediction, setGilsPrediction] = useState<TeamName | ''>('');
  const [initialized, setInitialized] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const { data: liveData, loading: liveLoading, lastUpdated } = useLiveScore(matchId, true);

  // Initialise local state from persisted match data once loaded
  useEffect(() => {
    if (!loaded || initialized) return;
    const match = state.matches[matchId] ?? emptyMatch(matchId);
    setLadsPicks(match.lads.picks);
    setGilsPicks(match.gils.picks);
    setLadsPrediction(match.lads.predictedWinner ?? '');
    setGilsPrediction(match.gils.predictedWinner ?? '');
    setInitialized(true);
  }, [loaded, initialized, matchId, state.matches]);

  // Finalise / refresh results from live ESPN data.
  // Always re-runs when ESPN data arrives so stored totals stay in sync with any
  // scoring algorithm changes. Only switches to Result tab on first completion.
  const finaliseFromLive = useCallback(() => {
    if (!liveData?.status.isComplete) return;
    if (ladsPicks.length === 0 || gilsPicks.length === 0) return;

    const actualWinner = liveData.actualWinner as TeamName | null;
    const ladsCorrect = ladsPrediction !== '' && ladsPrediction === actualWinner;
    const gilsCorrect = gilsPrediction !== '' && gilsPrediction === actualWinner;

    const mom = liveData.manOfTheMatch ?? null;
    const ladsResults = autoResultFromLive(liveData.innings, ladsPicks, liveData.playingEleven ?? [], mom);
    const gilsResults = autoResultFromLive(liveData.innings, gilsPicks, liveData.playingEleven ?? [], mom);
    const ladsTotal = ladsResults.reduce((s, r) => s + r.finalTotal, 0) + (ladsCorrect ? 50 : 0);
    const gilsTotal = gilsResults.reduce((s, r) => s + r.finalTotal, 0) + (gilsCorrect ? 50 : 0);
    const winner = ladsTotal > gilsTotal ? 'lads' : gilsTotal > ladsTotal ? 'gils' : null;
    const ladsAllin = ladsPicks.some(p => p.multiplier === 'allin');
    const gilsAllin = gilsPicks.some(p => p.multiplier === 'allin');

    const wasAlreadyComplete = (state.matches[matchId] ?? emptyMatch(matchId)).isComplete;

    updateMatch(matchId, m => ({
      ...m,
      isComplete: true,
      actualWinner,
      winner,
      lads: { ...m.lads, picks: ladsPicks, stats: [], results: ladsResults, total: ladsTotal, predictedWinner: ladsPrediction as TeamName || null, allInUsed: ladsAllin },
      gils: { ...m.gils, picks: gilsPicks, stats: [], results: gilsResults, total: gilsTotal, predictedWinner: gilsPrediction as TeamName || null, allInUsed: gilsAllin },
    }));

    if (!wasAlreadyComplete) switchTab('result');
  }, [liveData, ladsPicks, gilsPicks, ladsPrediction, gilsPrediction, matchId, updateMatch, state.matches]);

  // Always refresh results when ESPN confirms completion — no isComplete guard so
  // stale localStorage totals are corrected whenever the match page is visited.
  useEffect(() => {
    finaliseFromLive();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData?.status.isComplete, liveData?.actualWinner, ladsPicks.length, gilsPicks.length]);

  // Clock for countdown — stops ticking once match has started
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNow(n);
      if (fixture && n >= getMatchStartIST(fixture)) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [fixture]);

  if (!loaded) return <div className="text-gray-400 text-center py-20">Loading...</div>;
  if (!fixture) return <div className="text-red-500 text-center py-20">Match {matchId} not found.</div>;

  const match = state.matches[matchId] ?? emptyMatch(matchId);

  const savedLadsBreakdown = match.lads.results.length > 0 ? match.lads.results.map(r => ({
    name: r.playerName,
    activeName: r.playerName,
    pts: r.finalTotal,
    batPts: r.battingPoints,
    bowlPts: r.bowlingPoints,
    fieldPts: r.fieldingPoints,
    momPts: r.momPoints,
    multiplier: r.multiplier,
    isSubstituted: false,
  })) : undefined;
  const savedGilsBreakdown = match.gils.results.length > 0 ? match.gils.results.map(r => ({
    name: r.playerName,
    activeName: r.playerName,
    pts: r.finalTotal,
    batPts: r.battingPoints,
    bowlPts: r.bowlingPoints,
    fieldPts: r.fieldingPoints,
    momPts: r.momPoints,
    multiplier: r.multiplier,
    isSubstituted: false,
  })) : undefined;

  // ─── Breakdown computation for persistent side panels ─────────────────────
  const allPicksForPanel = [...ladsPicks, ...gilsPicks];
  const panelBatsmen = liveData
    ? Object.values(liveData.innings).flatMap(inn => calcLiveBatsmen(inn.batting, allPicksForPanel))
    : [];
  const panelBowlers = liveData
    ? Object.values(liveData.innings).flatMap(inn => calcLiveBowlers(inn.bowling, allPicksForPanel))
    : [];
  const panelPlayingEleven = liveData?.playingEleven ?? [];
  const panelMOM = liveData?.manOfTheMatch ?? null;
  const ladsAgg = calcLiveFantasyTotal(panelBatsmen, panelBowlers, ladsPicks, panelPlayingEleven, panelMOM);
  const gilsAgg = calcLiveFantasyTotal(panelBatsmen, panelBowlers, gilsPicks, panelPlayingEleven, panelMOM);

  const ladsBreakdown = (ladsAgg.breakdown.some(b => b.pts !== 0) ? ladsAgg.breakdown : null) ?? savedLadsBreakdown ?? ladsAgg.breakdown;
  const gilsBreakdown = (gilsAgg.breakdown.some(b => b.pts !== 0) ? gilsAgg.breakdown : null) ?? savedGilsBreakdown ?? gilsAgg.breakdown;

  const ladsDisplayTotal = ladsAgg.rawTotal !== 0
    ? Math.round(ladsAgg.rawTotal)
    : (match.lads.total ?? 0);
  const gilsDisplayTotal = gilsAgg.rawTotal !== 0
    ? Math.round(gilsAgg.rawTotal)
    : (match.gils.total ?? 0);

  const panelActualWinner = liveData?.actualWinner ?? match.actualWinner ?? null;
  const ladsHasWinnerBonus = !!ladsPrediction && ladsPrediction === panelActualWinner;
  const gilsHasWinnerBonus = !!gilsPrediction && gilsPrediction === panelActualWinner;

  const showSidePanels = ladsPicks.length > 0 || gilsPicks.length > 0;

  function savePicks() {
    updateMatch(matchId, m => ({
      ...m,
      lads: side === 'lads'
        ? { ...m.lads, picks: ladsPicks, predictedWinner: (ladsPrediction as TeamName) || null }
        : m.lads,
      gils: side === 'gils'
        ? { ...m.gils, picks: gilsPicks, predictedWinner: (gilsPrediction as TeamName) || null }
        : m.gils,
    }));
    switchTab('live');
  }

  const tabs: { key: 'studio' | 'live' | 'result'; label: string; disabled?: boolean }[] = [
    { key: 'studio', label: 'Studio' },
    { key: 'live', label: 'Live' },
    { key: 'result', label: 'Result', disabled: !match.isComplete },
  ];

  return (
    <div className="max-w-[760px] mx-auto space-y-6 pb-12">
      {/* Header — IPL style */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden shadow-lg relative"
        style={{ background: 'linear-gradient(135deg, #001f6b 0%, var(--ipl-navy) 60%, #0a4fa8 100%)' }}>

        {/* Burst decorations */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/3 opacity-75 pointer-events-none select-none">
          <BurstDecoration size={160} />
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3 opacity-75 pointer-events-none select-none">
          <BurstDecoration size={160} flip />
        </div>

        <div className="relative z-10 px-6 py-6 flex flex-col items-center gap-3">
          {/* Match badge */}
          <div className="bg-white text-blue-900 text-xs font-black uppercase tracking-widest px-4 py-1 rounded-sm">
            MATCH {fixture.match}
          </div>

          {liveData && Object.keys(liveData.innings).length > 0 ? (() => {
            // Scorecard layout — shown once innings data is available
            const inningsKeys = Object.keys(liveData.innings);
            const [t1, t2] = inningsKeys;
            const bowlingTeam = [fixture.home, fixture.away].find(t => t !== t1) ?? fixture.away;

            function parseTotal(total: string) {
              const score = total.split(' (')[0].trim();
              const oversM = total.match(/\(([^)]+)\)/);
              return { score, overs: oversM?.[1] ?? '' };
            }

            const p1 = parseTotal(liveData.innings[t1].total);
            const p2 = t2 ? parseTotal(liveData.innings[t2].total) : null;

            return (
              <>
                <div className="flex items-center w-full gap-3 px-2">
                  {/* Batting-first team */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center p-1 shrink-0">
                      <TeamLogo team={t1 as import('@/lib/types').TeamName} size={48} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-white font-black text-3xl leading-none tracking-tight">{p1.score}</div>
                      <div className="text-blue-300 text-xs mt-0.5">{p1.overs}</div>
                    </div>
                  </div>

                  {/* vs circle */}
                  <div className="w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center shrink-0">
                    <span className="text-white font-black text-xs">v/s</span>
                  </div>

                  {/* Batting-second team (or just logo if 1st innings still live) */}
                  <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
                    {p2 ? (
                      <div className="min-w-0 text-right">
                        <div className="text-white font-black text-3xl leading-none tracking-tight">{p2.score}</div>
                        <div className="text-blue-300 text-xs mt-0.5">{p2.overs}</div>
                      </div>
                    ) : null}
                    <div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center p-1 shrink-0">
                      <TeamLogo team={(t2 ?? bowlingTeam) as import('@/lib/types').TeamName} size={48} />
                    </div>
                  </div>
                </div>

                {/* Result description */}
                {liveData.status.description && liveData.status.description !== 'Scheduled' && (
                  <div className="text-blue-200 text-xs text-center font-semibold">{liveData.status.description}</div>
                )}

                {/* Recent balls (live only) */}
                {liveData.status.isLive && liveData.commentaries.length > 0 && (
                  <div className="flex gap-1 justify-center flex-wrap">
                    {liveData.commentaries.slice(-6).map((c, i) => {
                      const txt = (c.text ?? '').toLowerCase();
                      const isWicket = txt.includes('out') || txt.includes('wicket');
                      const isFour = txt.includes('four');
                      const isSix = txt.includes('six');
                      const label = isSix ? '6' : isFour ? '4' : isWicket ? 'W' : c.text.replace(/[^0-9.W]/gi,'').trim() || '·';
                      return (
                        <span key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                          isWicket ? 'bg-red-500 text-white' : isSix ? 'bg-purple-500 text-white' : isFour ? 'bg-orange-400 text-white' : 'bg-white/20 text-white'
                        }`}>{label}</span>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })() : (
            // Pre-match layout
            <>
              <div className="flex items-center gap-8 w-full justify-center">
                <div className="flex flex-col items-center gap-2 flex-1 max-w-[140px]">
                  <div className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center p-1">
                    <TeamLogo team={fixture.home} size={56} />
                  </div>
                  <span className="text-white font-extrabold text-base tracking-wide">
                    {fixture.home.split(' ').map(w => w[0]).join('')}
                  </span>
                  <span className="text-blue-300 text-xs hidden sm:block text-center">{fixture.home}</span>
                </div>

                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div className="w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center">
                    <span className="text-white font-black text-sm">vs</span>
                  </div>
                  <div className="text-xs text-blue-300 mt-2 text-center">
                    <div className="font-semibold">{formatDate(fixture.date)}</div>
                    <div>{fixture.time} IST</div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2 flex-1 max-w-[140px]">
                  <div className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center p-1">
                    <TeamLogo team={fixture.away} size={56} />
                  </div>
                  <span className="text-white font-extrabold text-base tracking-wide">
                    {fixture.away.split(' ').map(w => w[0]).join('')}
                  </span>
                  <span className="text-blue-300 text-xs hidden sm:block text-center">{fixture.away}</span>
                </div>
              </div>

              <div className="text-xs text-blue-300 text-center">{fixture.venue}</div>
            </>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
        {tabs.map(t => (
          <button key={t.key} onClick={() => !t.disabled && switchTab(t.key)}
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

      {/* Studio Tab */}
      {activeTab === 'studio' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Show only the logged-in user's picks editor */}
          {side === 'lads' && (
            <div className="bg-amber-50/40 rounded-2xl p-4 border border-amber-100">
              <PicksEditor picks={ladsPicks} onChange={setLadsPicks} fixture={fixture}
                sideLabel="Lads" allInUsedSeason={state.ladsAllInUsed} />
            </div>
          )}
          {side === 'gils' && (
            <div className="bg-violet-50/40 rounded-2xl p-4 border border-violet-100">
              <PicksEditor picks={gilsPicks} onChange={setGilsPicks} fixture={fixture}
                sideLabel="Gils" allInUsedSeason={state.gilsAllInUsed} />
            </div>
          )}

          {/* Winner prediction — only for current side */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-700 text-sm">Winner Prediction</h3>
              <span className="text-xs font-semibold text-amber-500 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">+50 pts if correct</span>
            </div>
            {(side === 'lads' || side === 'gils') && (() => {
              const pred = side === 'lads' ? ladsPrediction : gilsPrediction;
              const setPred = side === 'lads' ? setLadsPrediction : setGilsPrediction;
              const accentColor = side === 'lads' ? '#f59e0b' : '#7c3aed';
              return (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: accentColor }}>
                    {side === 'lads' ? 'Lads' : 'Gils'} pick
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {/* No prediction */}
                    <button type="button" onClick={() => setPred('')}
                      className="py-2.5 rounded-xl border-2 text-xs font-bold transition-all"
                      style={{
                        borderColor: pred === '' ? accentColor : '#e5e7eb',
                        background: pred === '' ? accentColor : '#f9fafb',
                        color: pred === '' ? '#fff' : '#9ca3af',
                      }}>
                      —
                    </button>
                    {[fixture.home, fixture.away].map(team => {
                      const teamData = teams[team as TeamName];
                      const selected = pred === team;
                      return (
                        <button key={team} type="button" onClick={() => setPred(team as TeamName)}
                          className="py-2.5 px-1 rounded-xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-0.5"
                          style={{
                            borderColor: selected ? accentColor : '#e5e7eb',
                            background: selected ? accentColor : '#f9fafb',
                            color: selected ? '#fff' : '#374151',
                          }}>
                          <span className="text-sm font-black" style={{ fontFamily: 'var(--font-barlow-condensed), system-ui, sans-serif', letterSpacing: '0.05em' }}>
                            {teamData?.shortName ?? team}
                          </span>
                          <span className="truncate max-w-full opacity-80" style={{ fontSize: 9 }}>{team}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {(() => {
            const LOCK_BYPASS = new Set([8, 9]);
            const myPicks = side === 'lads' ? ladsPicks : gilsPicks;
            const ready = myPicks.length === 5;
            const matchStart = getMatchStartIST(fixture);
            const started = !LOCK_BYPASS.has(matchId) && now >= matchStart;
            const secsLeft = Math.max(0, Math.floor((matchStart.getTime() - now.getTime()) / 1000));
            const hh = String(Math.floor(secsLeft / 3600)).padStart(2, '0');
            const mm = String(Math.floor((secsLeft % 3600) / 60)).padStart(2, '0');
            const ss = String(secsLeft % 60).padStart(2, '0');
            return (
              <div className="space-y-3">
                {started ? (
                  <div className="text-center py-2 px-4 rounded-xl bg-red-50 border border-red-200 text-red-600 font-semibold text-sm">
                    Picks Locked
                  </div>
                ) : !LOCK_BYPASS.has(matchId) && (
                  <div className="text-center text-xs text-amber-600 font-mono font-semibold">
                    Picks lock in {hh}:{mm}:{ss}
                  </div>
                )}
                <button
                  onClick={savePicks}
                  disabled={!ready || started}
                  className="w-full py-3 rounded-xl font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  style={{ background: ready && !started ? 'var(--ipl-orange)' : '#f0a060' }}
                >
                  Lock Picks →
                </button>
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* Live Tab */}
      {activeTab === 'live' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {liveData?.status.isComplete && !match.isComplete && ladsPicks.length > 0 && gilsPicks.length > 0 && (
            <div style={{ textAlign: 'center', padding: '12px' }}>
              <button
                onClick={finaliseFromLive}
                style={{ background: 'var(--ipl-navy)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
              >
                Finalise Results
              </button>
            </div>
          )}
          <LiveScorecard
            matchId={matchId}
            ladsPicks={ladsPicks}
            gilsPicks={gilsPicks}
            liveData={liveData}
            loading={liveLoading}
            lastUpdated={lastUpdated}
            savedLadsBreakdown={savedLadsBreakdown}
            savedGilsBreakdown={savedGilsBreakdown}
            storedLadsTotal={match.lads.total}
            storedGilsTotal={match.gils.total}
          />
        </motion.div>
      )}

      {/* Result Tab */}
      {activeTab === 'result' && match.isComplete && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <ResultsDisplay match={match} matchId={matchId} updateMatch={updateMatch} />
        </motion.div>
      )}

      {/* Fixed side panels — persist across all tabs at 2xl (1536px+) */}
      {showSidePanels && (
        <>
          <div className="fixed left-0 bottom-0 hidden 2xl:flex flex-col z-30 p-2"
            style={{ top: '56px', width: 'calc(50vw - 24rem)' }}>
            <SidePanel
              label="LADS" total={ladsDisplayTotal}
              breakdown={ladsBreakdown}
              textColor={tieredTotalColor(ladsDisplayTotal + (ladsHasWinnerBonus ? 50 : 0))}
              borderColor="border-amber-200" bgColor="bg-amber-50"
              hasWinnerBonus={ladsHasWinnerBonus}
            />
          </div>
          <div className="fixed right-0 bottom-0 hidden 2xl:flex flex-col z-30 p-2"
            style={{ top: '56px', width: 'calc(50vw - 24rem)' }}>
            <SidePanel
              label="GILS" total={gilsDisplayTotal}
              breakdown={gilsBreakdown}
              textColor={tieredTotalColor(gilsDisplayTotal + (gilsHasWinnerBonus ? 50 : 0))}
              borderColor="border-violet-200" bgColor="bg-violet-50"
              hasWinnerBonus={gilsHasWinnerBonus}
            />
          </div>
        </>
      )}
    </div>
  );
}
