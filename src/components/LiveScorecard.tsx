'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { calcLiveBatsmen, calcLiveBowlers, calcLiveFantasyTotal } from '@/lib/liveScoring';
import type { PlayerPick } from '@/lib/types';
import type { LiveData } from '@/hooks/useLiveScore';
import { multiplierBadge, multiplierColor } from '@/lib/scoring';

function MultiBadge({ m }: { m: string }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${multiplierColor(m as 'yellow' | 'green' | 'purple' | 'allin')}`}>
      {multiplierBadge(m as 'yellow' | 'green' | 'purple' | 'allin')}
    </span>
  );
}

function PtsChip({ pts, highlight }: { pts: number; highlight?: boolean }) {
  return (
    <motion.span
      key={pts}
      initial={{ scale: 1.3, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        highlight
          ? pts >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      {pts > 0 ? `+${pts}` : pts}
    </motion.span>
  );
}

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
      <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center">
        <div className="text-gray-400 text-sm">{loading ? 'Loading live data…' : 'No live data yet'}</div>
      </div>
    );
  }

  const { status, innings, commentaries } = liveData;
  const allPicks = [...ladsPicks, ...gilsPicks];

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status.isLive && (
            <span className="flex items-center gap-1.5 text-sm font-bold text-red-600">
              <span className="live-dot w-2 h-2 rounded-full bg-red-500 inline-block" />
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

      {/* Innings scorecards */}
      {Object.entries(innings).map(([teamName, inning]) => {
        const batsmen = calcLiveBatsmen(inning.batting, allPicks);
        const bowlers = calcLiveBowlers(inning.bowling, allPicks);
        const ladsLive = calcLiveFantasyTotal(batsmen, bowlers, ladsPicks);
        const gilsLive = calcLiveFantasyTotal(batsmen, bowlers, gilsPicks);

        return (
          <div key={teamName} className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
            {/* Innings header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100"
              style={{ background: 'var(--ipl-navy)' }}>
              <div>
                <span className="text-white font-bold text-sm">{teamName}</span>
                {inning.total && <span className="text-blue-200 text-xs ml-3">{inning.total}</span>}
              </div>
              <div className="flex gap-3 text-xs">
                {ladsLive.picksFound > 0 && (
                  <span className="bg-blue-500/30 text-blue-100 px-2 py-1 rounded-lg font-semibold">
                    Lads {ladsLive.rawTotal > 0 ? '+' : ''}{Math.round(ladsLive.rawTotal)} pts
                  </span>
                )}
                {gilsLive.picksFound > 0 && (
                  <span className="bg-pink-500/30 text-pink-100 px-2 py-1 rounded-lg font-semibold">
                    Gils {gilsLive.rawTotal > 0 ? '+' : ''}{Math.round(gilsLive.rawTotal)} pts
                  </span>
                )}
              </div>
            </div>

            {/* Batting */}
            {batsmen.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2 font-medium">Batter</th>
                      <th className="text-right px-2 py-2">R</th>
                      <th className="text-right px-2 py-2">B</th>
                      <th className="text-right px-2 py-2">4s</th>
                      <th className="text-right px-2 py-2">6s</th>
                      <th className="text-right px-2 py-2">SR</th>
                      <th className="text-right px-4 py-2">Fantasy</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {batsmen.map(b => (
                        <motion.tr key={b.playerName}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`border-b border-gray-50 transition-colors ${b.isFantasyPick ? 'bg-orange-50/60' : ''}`}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-medium text-gray-800">{b.playerName}</div>
                                <div className="text-xs text-gray-400">{b.isOut ? b.dismissal : <span className="text-green-600 font-medium">batting*</span>}</div>
                              </div>
                              {b.multiplier && <MultiBadge m={b.multiplier} />}
                            </div>
                          </td>
                          <td className="text-right px-2 py-2 font-bold text-gray-900">{b.runs}</td>
                          <td className="text-right px-2 py-2 text-gray-600">{b.balls}</td>
                          <td className="text-right px-2 py-2 text-gray-600">{b.fours}</td>
                          <td className="text-right px-2 py-2 text-gray-600">{b.sixes}</td>
                          <td className="text-right px-2 py-2 text-gray-500">{b.strikeRate}</td>
                          <td className="text-right px-4 py-2">
                            {b.isFantasyPick
                              ? <PtsChip pts={b.finalPoints} highlight />
                              : <PtsChip pts={b.fantasyPoints} />}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}

            {/* Bowling */}
            {bowlers.length > 0 && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium">Bowler</th>
                      <th className="text-right px-2 py-2">O</th>
                      <th className="text-right px-2 py-2">M</th>
                      <th className="text-right px-2 py-2">R</th>
                      <th className="text-right px-2 py-2">W</th>
                      <th className="text-right px-2 py-2">Eco</th>
                      <th className="text-right px-4 py-2">Fantasy</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {bowlers.map(b => (
                        <motion.tr key={b.playerName}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`border-b border-gray-50 transition-colors ${b.isFantasyPick ? 'bg-orange-50/60' : ''}`}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{b.playerName}</span>
                              {b.multiplier && <MultiBadge m={b.multiplier} />}
                            </div>
                          </td>
                          <td className="text-right px-2 py-2 text-gray-600">{b.overs}</td>
                          <td className="text-right px-2 py-2 text-gray-600">{b.maidens}</td>
                          <td className="text-right px-2 py-2 text-gray-600">{b.runs}</td>
                          <td className="text-right px-2 py-2 font-bold text-gray-900">{b.wickets}</td>
                          <td className="text-right px-2 py-2 text-gray-500">{b.economy}</td>
                          <td className="text-right px-4 py-2">
                            {b.isFantasyPick
                              ? <PtsChip pts={b.finalPoints} highlight />
                              : <PtsChip pts={b.fantasyPoints} />}
                          </td>
                        </motion.tr>
                      ))}
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
          <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wide">Commentary</h3>
          <div className="space-y-2">
            {commentaries.map((c, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-orange-500 font-mono font-bold shrink-0 w-10">{c.over || '—'}</span>
                <span className="text-gray-600">{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
