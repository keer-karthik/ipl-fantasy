'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { calcLiveBatsmen, calcLiveBowlers, calcLiveFantasyTotal } from '@/lib/liveScoring';
import type { PlayerPick, Multiplier } from '@/lib/types';
import type { LiveData } from '@/hooks/useLiveScore';
import { multiplierBadge } from '@/lib/scoring';

// ─── Name normalisation (mirrors liveScoring.ts) ──────────────────────────────
function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
function matchName(a: string, b: string) {
  const na = norm(a), nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na) ||
    (na.length > 4 && nb.slice(-na.length) === na) ||
    (nb.length > 4 && na.slice(-nb.length) === nb);
}
function isLadsPick(name: string, lads: PlayerPick[]) { return lads.some(p => matchName(name, p.playerName)); }
function isGilsPick(name: string, gils: PlayerPick[]) { return gils.some(p => matchName(name, p.playerName)); }
function getLadsMultiplier(name: string, lads: PlayerPick[]): Multiplier | null {
  return lads.find(p => matchName(name, p.playerName))?.multiplier ?? null;
}
function getGilsMultiplier(name: string, gils: PlayerPick[]): Multiplier | null {
  return gils.find(p => matchName(name, p.playerName))?.multiplier ?? null;
}

// ─── Pick ownership dots ──────────────────────────────────────────────────────
function OwnerDots({ lads, gils }: { lads: boolean; gils: boolean }) {
  if (!lads && !gils) return null;
  return (
    <span className="flex gap-0.5 items-center">
      {lads && <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" title="Lads pick" />}
      {gils && <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" title="Gils pick" />}
    </span>
  );
}

// ─── Multiplier badge coloured by owner ──────────────────────────────────────
function MultiBadge({ m, owner }: { m: Multiplier; owner: 'lads' | 'gils' | 'both' }) {
  const label = multiplierBadge(m);
  const base = 'text-xs px-1.5 py-0.5 rounded font-black border';
  if (owner === 'lads') return <span className={`${base} bg-amber-100 text-amber-700 border-amber-300`}>{label}</span>;
  if (owner === 'gils') return <span className={`${base} bg-violet-100 text-violet-700 border-violet-300`}>{label}</span>;
  return <span className={`${base} bg-gray-100 text-gray-600 border-gray-200`}>{label}</span>;
}

// ─── Points chip ─────────────────────────────────────────────────────────────
function PtsChip({ pts }: { pts: number }) {
  return (
    <motion.span key={pts} initial={{ scale: 1.25, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        pts > 0 ? 'bg-green-100 text-green-700' : pts < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'
      }`}>
      {pts > 0 ? `+${pts}` : pts}
    </motion.span>
  );
}

// ─── Side panel (Lads or Gils) ───────────────────────────────────────────────
function SidePanel({
  label, total, breakdown, color, textColor, borderColor, bgColor,
}: {
  label: string; total: number;
  breakdown: { name: string; pts: number; multiplier: Multiplier | null }[];
  color: string; textColor: string; borderColor: string; bgColor: string;
}) {
  return (
    <div className={`rounded-2xl border-2 ${borderColor} ${bgColor} p-4 flex flex-col gap-3`}>
      <div className="text-xs font-black uppercase tracking-widest" style={{ color }}>{label}</div>
      <motion.div key={total} initial={{ scale: 1.1 }} animate={{ scale: 1 }}
        className={`text-5xl font-black ${textColor} leading-none`}>
        {total > 0 ? `+${total}` : total}
      </motion.div>
      <div className="text-xs font-medium text-gray-400">pts this game</div>
      <div className="border-t border-gray-100 pt-2 space-y-1.5">
        {breakdown.map(b => (
          <div key={b.name} className="flex items-center justify-between gap-1">
            <div className="text-xs text-gray-600 truncate flex-1">{b.name.split(' ').pop()}</div>
            {b.multiplier && (
              <span className={`text-[10px] font-bold px-1 rounded ${
                label === 'LADS' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'
              }`}>
                {multiplierBadge(b.multiplier)}
              </span>
            )}
            <span className={`text-xs font-bold w-10 text-right ${
              b.pts > 0 ? 'text-green-600' : b.pts < 0 ? 'text-red-500' : 'text-gray-400'
            }`}>
              {b.pts > 0 ? `+${b.pts}` : b.pts}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LiveScorecard({
  ladsPicks, gilsPicks, liveData, loading, lastUpdated,
}: {
  ladsPicks: PlayerPick[];
  gilsPicks: PlayerPick[];
  liveData: LiveData | null;
  loading: boolean;
  lastUpdated: Date | null;
}) {
  if (!liveData) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
        <div className="text-gray-400 text-sm">{loading ? 'Loading live data…' : 'No live data yet'}</div>
      </div>
    );
  }

  const { status, innings, commentaries } = liveData;
  const allPicks = [...ladsPicks, ...gilsPicks];

  // Aggregate batsmen/bowlers across ALL innings for the side panels
  const aggBatsmen = Object.values(innings).flatMap(inn => calcLiveBatsmen(inn.batting, allPicks));
  const aggBowlers = Object.values(innings).flatMap(inn => calcLiveBowlers(inn.bowling, allPicks));
  const ladsAgg = calcLiveFantasyTotal(aggBatsmen, aggBowlers, ladsPicks);
  const gilsAgg = calcLiveFantasyTotal(aggBatsmen, aggBowlers, gilsPicks);

  const showSidePanels = ladsPicks.length > 0 || gilsPicks.length > 0;

  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status.isLive && (
            <span className="flex items-center gap-1.5 text-sm font-bold text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse" />
              LIVE
            </span>
          )}
          {status.isComplete && <span className="text-sm font-bold text-green-600">RESULT</span>}
          {!status.isLive && !status.isComplete && (
            <span className="text-sm text-gray-500">{status.description}</span>
          )}
        </div>
        {lastUpdated && (
          <span className="text-xs text-gray-400">
            Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {/* Mobile totals (visible < lg) */}
      {showSidePanels && (
        <div className="flex gap-3 lg:hidden">
          <div className="flex-1 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-600">Lads</div>
            <motion.div key={ladsAgg.rawTotal} initial={{ scale: 1.1 }} animate={{ scale: 1 }}
              className={`text-3xl font-black ${ladsAgg.rawTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {ladsAgg.rawTotal > 0 ? `+${Math.round(ladsAgg.rawTotal)}` : Math.round(ladsAgg.rawTotal)}
            </motion.div>
          </div>
          <div className="flex-1 rounded-xl border-2 border-violet-200 bg-violet-50 p-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-violet-600">Gils</div>
            <motion.div key={gilsAgg.rawTotal} initial={{ scale: 1.1 }} animate={{ scale: 1 }}
              className={`text-3xl font-black ${gilsAgg.rawTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {gilsAgg.rawTotal > 0 ? `+${Math.round(gilsAgg.rawTotal)}` : Math.round(gilsAgg.rawTotal)}
            </motion.div>
          </div>
        </div>
      )}

      {/* 3-column layout on desktop */}
      <div className="flex gap-4 items-start">

        {/* LEFT — Lads panel (desktop only) */}
        {showSidePanels && (
          <div className="hidden lg:block w-52 shrink-0 sticky top-20">
            <SidePanel
              label="Lads" total={Math.round(ladsAgg.rawTotal)}
              breakdown={ladsAgg.breakdown}
              color="#d97706" textColor={ladsAgg.rawTotal >= 0 ? 'text-green-600' : 'text-red-500'}
              borderColor="border-amber-200" bgColor="bg-amber-50"
            />
          </div>
        )}

        {/* MIDDLE — Innings scorecards + commentary */}
        <div className="flex-1 min-w-0 space-y-4">
          {Object.entries(innings).map(([teamName, inning]) => {
            const batsmen = calcLiveBatsmen(inning.batting, allPicks);
            const bowlers = calcLiveBowlers(inning.bowling, allPicks);

            return (
              <div key={teamName} className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
                {/* Innings header */}
                <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100"
                  style={{ background: 'var(--ipl-navy)' }}>
                  <div>
                    <span className="text-white font-bold text-sm">{teamName}</span>
                    {inning.total && <span className="text-blue-200 text-xs ml-3">{inning.total}</span>}
                  </div>
                  {/* Per-innings pts in header (mobile) */}
                  <div className="flex gap-2 text-xs lg:hidden">
                    {ladsPicks.length > 0 && (() => {
                      const l = calcLiveFantasyTotal(batsmen, bowlers, ladsPicks);
                      return l.picksFound > 0 ? (
                        <span className="bg-amber-400/30 text-amber-200 px-2 py-0.5 rounded font-bold">
                          L {l.rawTotal > 0 ? '+' : ''}{Math.round(l.rawTotal)}
                        </span>
                      ) : null;
                    })()}
                    {gilsPicks.length > 0 && (() => {
                      const g = calcLiveFantasyTotal(batsmen, bowlers, gilsPicks);
                      return g.picksFound > 0 ? (
                        <span className="bg-violet-400/30 text-violet-200 px-2 py-0.5 rounded font-bold">
                          G {g.rawTotal > 0 ? '+' : ''}{Math.round(g.rawTotal)}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* Batting table */}
                {batsmen.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-3 py-2 font-medium">Batter</th>
                          <th className="text-right px-2 py-2">R</th>
                          <th className="text-right px-2 py-2">B</th>
                          <th className="text-right px-2 py-2">4s</th>
                          <th className="text-right px-2 py-2">6s</th>
                          <th className="text-right px-2 py-2">SR</th>
                          <th className="text-right px-3 py-2">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {batsmen.map(b => {
                            const inLads = isLadsPick(b.playerName, ladsPicks);
                            const inGils = isGilsPick(b.playerName, gilsPicks);
                            const ladsM = getLadsMultiplier(b.playerName, ladsPicks);
                            const gilsM = getGilsMultiplier(b.playerName, gilsPicks);
                            const rowBg = inLads && inGils
                              ? 'bg-gradient-to-r from-amber-50/60 to-violet-50/60'
                              : inLads ? 'bg-amber-50/70' : inGils ? 'bg-violet-50/70' : '';

                            return (
                              <motion.tr key={b.playerName}
                                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                                className={`border-b border-gray-50 transition-colors ${rowBg}`}>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <OwnerDots lads={inLads} gils={inGils} />
                                    <div>
                                      <div className="font-semibold text-gray-800 text-sm">{b.playerName}</div>
                                      <div className="text-xs text-gray-400">
                                        {b.isOut ? b.dismissal : <span className="text-green-600 font-medium">batting*</span>}
                                      </div>
                                    </div>
                                    {inLads && ladsM && <MultiBadge m={ladsM} owner="lads" />}
                                    {inGils && gilsM && <MultiBadge m={gilsM} owner="gils" />}
                                  </div>
                                </td>
                                <td className="text-right px-2 py-2 font-bold text-gray-900">{b.runs}</td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.balls}</td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.fours}</td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.sixes}</td>
                                <td className="text-right px-2 py-2 text-gray-500">{b.strikeRate}</td>
                                <td className="text-right px-3 py-2">
                                  {(inLads || inGils) ? <PtsChip pts={b.finalPoints} /> : (
                                    <span className="text-xs text-gray-300">{b.fantasyPoints > 0 ? `+${b.fantasyPoints}` : b.fantasyPoints}</span>
                                  )}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bowling table */}
                {bowlers.length > 0 && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 font-medium">Bowler</th>
                          <th className="text-right px-2 py-2">O</th>
                          <th className="text-right px-2 py-2">M</th>
                          <th className="text-right px-2 py-2">R</th>
                          <th className="text-right px-2 py-2">W</th>
                          <th className="text-right px-2 py-2">Eco</th>
                          <th className="text-right px-3 py-2">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {bowlers.map(b => {
                            const inLads = isLadsPick(b.playerName, ladsPicks);
                            const inGils = isGilsPick(b.playerName, gilsPicks);
                            const ladsM = getLadsMultiplier(b.playerName, ladsPicks);
                            const gilsM = getGilsMultiplier(b.playerName, gilsPicks);
                            const rowBg = inLads && inGils
                              ? 'bg-gradient-to-r from-amber-50/60 to-violet-50/60'
                              : inLads ? 'bg-amber-50/70' : inGils ? 'bg-violet-50/70' : '';

                            return (
                              <motion.tr key={b.playerName}
                                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                                className={`border-b border-gray-50 transition-colors ${rowBg}`}>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <OwnerDots lads={inLads} gils={inGils} />
                                    <span className="font-semibold text-gray-800 text-sm">{b.playerName}</span>
                                    {inLads && ladsM && <MultiBadge m={ladsM} owner="lads" />}
                                    {inGils && gilsM && <MultiBadge m={gilsM} owner="gils" />}
                                  </div>
                                </td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.overs}</td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.maidens}</td>
                                <td className="text-right px-2 py-2 text-gray-600">{b.runs}</td>
                                <td className="text-right px-2 py-2 font-bold text-gray-900">{b.wickets}</td>
                                <td className="text-right px-2 py-2 text-gray-500">{b.economy}</td>
                                <td className="text-right px-3 py-2">
                                  {(inLads || inGils) ? <PtsChip pts={b.finalPoints} /> : (
                                    <span className="text-xs text-gray-300">{b.fantasyPoints > 0 ? `+${b.fantasyPoints}` : b.fantasyPoints}</span>
                                  )}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Commentary */}
          {commentaries.length > 0 && (
            <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
              <h3 className="font-bold text-gray-700 mb-3 text-xs uppercase tracking-widest">Commentary</h3>
              <div className="space-y-1.5">
                {commentaries.map((c, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="text-orange-400 font-mono font-bold shrink-0 w-6">—</span>
                    <span className="text-gray-600">{c.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Gils panel (desktop only) */}
        {showSidePanels && (
          <div className="hidden lg:block w-52 shrink-0 sticky top-20">
            <SidePanel
              label="Gils" total={Math.round(gilsAgg.rawTotal)}
              breakdown={gilsAgg.breakdown}
              color="#7c3aed" textColor={gilsAgg.rawTotal >= 0 ? 'text-green-600' : 'text-red-500'}
              borderColor="border-violet-200" bgColor="bg-violet-50"
            />
          </div>
        )}
      </div>

      {/* Legend */}
      {showSidePanels && (
        <div className="flex gap-4 text-xs text-gray-400 justify-center pt-1">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Lads pick</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> Gils pick</span>
        </div>
      )}
    </div>
  );
}
