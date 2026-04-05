'use client';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};

function SectionCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      variants={item}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <div className={`border-l-4 ${accent} px-6 py-4`}>
        <h2 className="font-bold text-gray-900 tracking-tight">{title}</h2>
      </div>
      <div className="px-6 pb-5 pt-3">{children}</div>
    </motion.section>
  );
}

function RuleRow({ metric, pts }: { metric: string; pts: string }) {
  const isNeg = pts.startsWith('−') || pts.startsWith('-');
  return (
    <div className="flex justify-between items-center py-2.5 text-sm border-b border-gray-50 last:border-0">
      <span className="text-gray-600">{metric}</span>
      <span className={`font-semibold tabular-nums shrink-0 ml-4 ${isNeg ? 'text-red-500' : 'text-emerald-600'}`}>
        {pts}
      </span>
    </div>
  );
}

const multipliers = [
  { name: 'Yellow', badge: '1×', gain: '1×', loss: '1×',    bg: 'bg-yellow-400',  text: 'text-yellow-900' },
  { name: 'Green',  badge: '2×', gain: '2×', loss: '1×',    bg: 'bg-emerald-500', text: 'text-white' },
  { name: 'Purple', badge: '3×', gain: '3×', loss: '1.5×',  bg: 'bg-purple-600',  text: 'text-white' },
  { name: 'All-in', badge: '5×', gain: '5×', loss: '2.5×',  bg: 'bg-red-500',     text: 'text-white', note: 'max 4 per season' },
];

const prizes = [
  { dot: 'bg-amber-400',  label: 'Most Wins',                               pts: 700 },
  { dot: 'bg-orange-400', label: 'Orange Cap — most fantasy runs scored',    pts: 350 },
  { dot: 'bg-purple-600', label: 'Purple Cap — most fantasy wickets taken',  pts: 350 },
  { dot: 'bg-blue-500',   label: 'Longest Winning Streak',                   pts: 350 },
  { dot: 'bg-violet-500', label: 'Most Purple Hits',                         pts: 350 },
];

export default function RulesPage() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-5 max-w-2xl pb-12"
    >
      {/* Page header */}
      <motion.div variants={item} className="rounded-2xl bg-navy px-6 py-5 shadow-md">
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Rules & Scoring</h1>
        <p className="text-blue-300 text-sm mt-1">How points are calculated each match</p>
      </motion.div>

      {/* Team Setup */}
      <SectionCard title="Team Setup" accent="border-gray-300">
        <ul className="space-y-2.5 text-sm text-gray-600">
          {([
            <>Pick <span className="font-semibold text-gray-800">5 players</span> from the two playing IPL teams each match.</>,
            <>Designate a <span className="font-semibold text-purple-600">Purple (3×)</span> and a <span className="font-semibold text-emerald-600">Green (2×)</span> player — the remaining three are Yellow (1×).</>,
            <>Use <span className="font-semibold text-red-500">All-in (5×)</span> instead of any other multiplier — limited to 4 uses per season.</>,
            'Assign a substitute to each player in case they are injured or not in the starting XI.',
            'Picks are locked at match start.',
            <>Predict the winning team for <span className="font-semibold text-amber-600">+50 bonus pts</span>.</>,
          ] as React.ReactNode[]).map((text, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-[7px] shrink-0" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Batting */}
      <SectionCard title="Batting Points" accent="border-amber-400">
        <RuleRow metric="1 run"                             pts="+1 pt" />
        <RuleRow metric="25 runs"                           pts="+5 bonus" />
        <RuleRow metric="40 runs"                           pts="+15 bonus" />
        <RuleRow metric="70 runs"                           pts="+25 bonus" />
        <RuleRow metric="90 runs"                           pts="+35 bonus" />
        <RuleRow metric="SR ≥ 175 (min 10 balls)"           pts="+5" />
        <RuleRow metric="SR ≥ 200 (min 10 balls)"           pts="+20" />
        <RuleRow metric="SR ≥ 250 (min 20 balls)"           pts="+35" />
        <RuleRow metric="SR ≥ 300 (min 25 balls)"           pts="+50" />
        <RuleRow metric="SR ≤ 125 (min 10 balls)"           pts="−10" />
        <RuleRow metric="SR ≤ 100 (min 10 balls)"           pts="−20" />
        <RuleRow metric="SR ≤ 75 (min 10 balls)"            pts="−30" />
        <RuleRow metric="Duck (dismissed for 0)"            pts="−30" />
        <RuleRow metric="Score ≤ 10 runs"                   pts="−20" />
        <p className="text-xs text-gray-400 pt-3">
          Batters at position 7+ earn run points and SR bonuses only — no deductions.
        </p>
      </SectionCard>

      {/* Bowling */}
      <SectionCard title="Bowling Points" accent="border-blue-500">
        <RuleRow metric="1 wicket"                          pts="+25 pts" />
        <RuleRow metric="Maiden over"                       pts="+40 bonus" />
        <RuleRow metric="3+ wickets"                        pts="+20 bonus" />
        <RuleRow metric="5+ wickets"                        pts="+35 bonus" />
        <RuleRow metric="Economy ≤ 4.0 (3+ overs)"         pts="+80" />
        <RuleRow metric="Economy ≤ 6.0 (3+ overs)"         pts="+60" />
        <RuleRow metric="Economy ≤ 8.0 (3+ overs)"         pts="+40" />
        <RuleRow metric="Economy ≤ 9.0 (3+ overs)"         pts="+20" />
        <RuleRow metric="Economy ≥ 10.0 (3+ overs)"        pts="−20" />
        <RuleRow metric="Economy ≥ 12.0 (3+ overs)"        pts="−40" />
        <RuleRow metric="Economy ≥ 14.0 (3+ overs)"        pts="−60" />
        <RuleRow metric="Wicketless + economy &gt; 10"      pts="−10 extra" />
        <RuleRow metric="Wicketless + economy &gt; 12"      pts="−20 extra" />
      </SectionCard>

      {/* Fielding & Bonuses */}
      <SectionCard title="Fielding & Bonuses" accent="border-emerald-500">
        <RuleRow metric="Catch / Stumping"                              pts="+10 pts" />
        <RuleRow metric="Run-out"                                       pts="+10 pts" />
        <RuleRow metric="Man of the Match"                              pts="+10 pts" />
        <RuleRow metric="Correct winner prediction"                     pts="+50 pts" />
      </SectionCard>

      {/* Multipliers */}
      <SectionCard title="Multipliers" accent="border-purple-500">
        <div>
          {multipliers.map(m => (
            <div
              key={m.name}
              className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${m.bg} ${m.text}`}
              >
                {m.badge}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-gray-900 text-sm">{m.name}</span>
                {m.note && (
                  <span className="text-xs text-gray-400 ml-2">{m.note}</span>
                )}
              </div>
              <div className="flex gap-6 text-sm shrink-0">
                <div className="text-center w-10">
                  <div className="text-xs text-gray-400 mb-0.5">Gain</div>
                  <div className="font-bold text-emerald-600">{m.gain}</div>
                </div>
                <div className="text-center w-10">
                  <div className="text-xs text-gray-400 mb-0.5">Loss</div>
                  <div className="font-bold text-red-500">{m.loss}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 pt-3">
          Multipliers apply to gains and losses separately.
        </p>
      </SectionCard>

      {/* End-of-Season Prizes */}
      <SectionCard title="End-of-Season Prizes" accent="border-yellow-400">
        {prizes.map(p => (
          <div
            key={p.label}
            className="flex items-center gap-3 py-2.5 text-sm border-b border-gray-50 last:border-0"
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.dot}`} />
            <span className="flex-1 text-gray-600">{p.label}</span>
            <span className="font-bold text-amber-600 tabular-nums">+{p.pts} pts</span>
          </div>
        ))}
      </SectionCard>
    </motion.div>
  );
}
