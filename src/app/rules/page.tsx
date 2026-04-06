'use client';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { calcBattingPoints, calcBowlingPoints, calcFieldingPoints } from '@/lib/scoring';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: [0.65, 0.05, 0, 1] } },
};

// ─── Section card ────────────────────────────────────────────────────────────
function SectionCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <motion.section variants={item} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`border-l-4 ${accent} bg-gray-50/60 px-5 py-3.5`}>
        <h2 className="font-black text-gray-900 uppercase tracking-wide text-[11px]">{title}</h2>
      </div>
      <div className="px-5 pb-4 pt-2.5">{children}</div>
    </motion.section>
  );
}

function RuleRow({ metric, pts }: { metric: string; pts: string }) {
  const isNeg = pts.startsWith('−') || pts.startsWith('-');
  return (
    <div className="flex justify-between items-center py-2 text-sm border-b border-gray-50 last:border-0">
      <span className="text-gray-600">{metric}</span>
      <span className={`font-semibold tabular-nums shrink-0 ml-3 ${isNeg ? 'text-red-500' : 'text-emerald-600'}`}>{pts}</span>
    </div>
  );
}

function GroupLabel({ label }: { label: string }) {
  return <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] pt-3 pb-0.5">{label}</p>;
}

// ─── Points calculator ────────────────────────────────────────────────────────
function PointsCalculator() {
  const [runs, setRuns] = useState(45);
  const [balls, setBalls] = useState(32);
  const [dismissed, setDismissed] = useState(true);
  const [batPos, setBatPos] = useState(3);
  const [wickets, setWickets] = useState(2);
  const [overs, setOvers] = useState(4);
  const [economy, setEconomy] = useState(7.5);
  const [maidens, setMaidens] = useState(0);
  const [catches, setCatches] = useState(1);

  const runsConceded = Math.round(overs * economy);

  const batPts = useMemo(() => calcBattingPoints(runs, balls, dismissed, batPos), [runs, balls, dismissed, batPos]);
  const bowlPts = useMemo(() => calcBowlingPoints(wickets, overs, runsConceded, maidens), [wickets, overs, runsConceded, maidens]);
  const fldPts = useMemo(() => calcFieldingPoints(catches, 0, 0), [catches]);
  const total = batPts + bowlPts + fldPts;

  function Slider({ value, min, max, step = 1, onChange, label, fmt }: {
    value: number; min: number; max: number; step?: number;
    onChange: (v: number) => void; label: string; fmt?: (v: number) => string;
  }) {
    return (
      <div className="space-y-1">
        <div className="flex justify-between items-baseline">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
          <span className="text-sm font-black text-gray-800 tabular-nums">{fmt ? fmt(value) : value}</span>
        </div>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200"
          style={{ accentColor: 'var(--ipl-orange)' }}
        />
      </div>
    );
  }

  const ptColor = (p: number) => p > 0 ? 'text-emerald-600' : p < 0 ? 'text-red-500' : 'text-gray-400';
  const ptSign = (p: number) => p > 0 ? `+${p}` : `${p}`;

  return (
    <motion.section variants={item} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="border-l-4 border-ipl-orange bg-gray-50/60 px-5 py-3.5">
        <h2 className="font-black text-gray-900 uppercase tracking-wide text-[11px]">Points Calculator</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">Adjust the sliders to see how points are calculated</p>
      </div>
      <div className="p-5 space-y-5">
        {/* Input grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Batting */}
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">Batting</p>
            <Slider label="Runs" value={runs} min={0} max={150} onChange={setRuns} />
            <Slider label="Balls faced" value={balls} min={1} max={150} onChange={setBalls} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Dismissed</span>
              <button
                onClick={() => setDismissed(d => !d)}
                className={`w-9 h-5 rounded-full transition-colors duration-200 relative ${dismissed ? 'bg-ipl-orange' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${dismissed ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Bat position</span>
              <select
                value={batPos}
                onChange={e => setBatPos(Number(e.target.value))}
                className="text-sm font-semibold text-gray-800 border border-gray-200 rounded-lg px-2 py-1 bg-white"
              >
                {Array.from({ length: 11 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>#{n}{n >= 7 ? ' (lower)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bowling */}
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Bowling</p>
            <Slider label="Wickets" value={wickets} min={0} max={10} onChange={setWickets} />
            <Slider label="Overs" value={overs} min={0} max={20} step={0.1} onChange={setOvers} fmt={v => v.toFixed(1)} />
            <Slider label="Economy" value={economy} min={0} max={20} step={0.5} onChange={setEconomy} fmt={v => v.toFixed(1)} />
            <Slider label="Maidens" value={maidens} min={0} max={10} onChange={setMaidens} />
            <p className="text-[10px] text-gray-400">
              {overs >= 0.1 ? `${runsConceded} runs conceded in ${overs.toFixed(1)} overs` : 'Set overs to activate bowling'}
            </p>
          </div>

          {/* Fielding */}
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Fielding</p>
            <Slider label="Catches / Stumpings" value={catches} min={0} max={5} onChange={setCatches} />
          </div>
        </div>

        {/* Result breakdown */}
        <div className="border-t border-gray-100 pt-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Batting', pts: batPts, color: 'border-amber-300 bg-amber-50/60' },
              { label: 'Bowling', pts: bowlPts, color: 'border-blue-300 bg-blue-50/60' },
              { label: 'Fielding', pts: fldPts, color: 'border-emerald-300 bg-emerald-50/60' },
            ].map(({ label, pts, color }) => (
              <div key={label} className={`rounded-xl border ${color} p-3 text-center`}>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">{label}</div>
                <div className={`text-stat text-xl ${ptColor(pts)}`}>{ptSign(pts)}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-3">
            <span className="text-sm font-black text-gray-600 uppercase tracking-wide">Total</span>
            <span key={total} className={`text-stat text-3xl count-animate ${ptColor(total)}`}>{ptSign(total)} pts</span>
          </div>
          {batPos >= 7 && (
            <p className="text-[11px] text-amber-600 mt-2 font-medium">Lower-order batter (pos {batPos}): no SR penalties applied</p>
          )}
        </div>
      </div>
    </motion.section>
  );
}

// ─── Batting milestone track ──────────────────────────────────────────────────
function MilestoneTrack() {
  const milestones = [
    { runs: 25, bonus: '+5', pct: 22 },
    { runs: 40, bonus: '+15', pct: 36 },
    { runs: 70, bonus: '+25', pct: 64 },
    { runs: 90, bonus: '+35', pct: 82 },
  ];
  return (
    <div className="pt-3 pb-1">
      <div className="relative h-2 bg-gray-100 rounded-full mx-2">
        <motion.div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-amber-200 to-amber-400"
          initial={{ width: 0 }}
          whileInView={{ width: '100%' }}
          viewport={{ once: true }}
          transition={{ duration: 1.0, ease: [0.65, 0.05, 0, 1] }}
        />
        {milestones.map(m => (
          <motion.div
            key={m.runs}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${m.pct}%` }}
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: m.pct / 200, duration: 0.25, ease: [0.65, 0.05, 0, 1] }}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white shadow-md" />
          </motion.div>
        ))}
      </div>
      <div className="relative h-10 mx-2 mt-1">
        {milestones.map(m => (
          <div
            key={m.runs}
            className="absolute -translate-x-1/2 text-center"
            style={{ left: `${m.pct}%` }}
          >
            <div className="text-[9px] font-black text-amber-600">{m.bonus}</div>
            <div className="text-[9px] text-gray-400">{m.runs}r</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Zone bar ─────────────────────────────────────────────────────────────────
function ZoneBar({ zones }: {
  zones: { label: string; pts: string; color: string; weight: number }[];
}) {
  const total = zones.reduce((s, z) => s + z.weight, 0);
  return (
    <div className="pt-2 pb-1">
      <div className="flex h-6 rounded-lg overflow-hidden gap-px">
        {zones.map(z => (
          <div
            key={z.label}
            className={`${z.color} flex items-center justify-center`}
            style={{ flex: z.weight / total }}
          />
        ))}
      </div>
      <div className="flex mt-1 gap-px">
        {zones.map(z => (
          <div key={z.label} className="text-center" style={{ flex: z.weight / total, minWidth: 0 }}>
            <div className={`text-[8px] font-black truncate ${z.pts.startsWith('+') ? 'text-emerald-600' : z.pts === '0' ? 'text-gray-400' : 'text-red-500'}`}>
              {z.pts}
            </div>
            <div className="text-[7px] text-gray-400 truncate">{z.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const srZones = [
  { label: '<75',     pts: '−30', color: 'bg-red-500',     weight: 75 },
  { label: '<100',    pts: '−20', color: 'bg-orange-400',   weight: 25 },
  { label: '<125',    pts: '−10', color: 'bg-yellow-300',   weight: 25 },
  { label: '125–175', pts: '0',   color: 'bg-gray-200',     weight: 50 },
  { label: '≥175',   pts: '+5',  color: 'bg-lime-200',     weight: 25 },
  { label: '≥200',   pts: '+20', color: 'bg-emerald-300',  weight: 50 },
  { label: '≥250',   pts: '+35', color: 'bg-emerald-400',  weight: 50 },
  { label: '≥300',   pts: '+50', color: 'bg-emerald-600',  weight: 50 },
];

const econZones = [
  { label: '≤4',    pts: '+80', color: 'bg-emerald-600',  weight: 4 },
  { label: '4–6',   pts: '+60', color: 'bg-emerald-400',  weight: 2 },
  { label: '6–8',   pts: '+40', color: 'bg-lime-300',     weight: 2 },
  { label: '8–9',   pts: '+20', color: 'bg-lime-200',     weight: 1 },
  { label: '9–10',  pts: '0',   color: 'bg-gray-200',     weight: 1 },
  { label: '10–12', pts: '−20', color: 'bg-orange-300',   weight: 2 },
  { label: '12–14', pts: '−40', color: 'bg-red-400',      weight: 2 },
  { label: '>14',   pts: '−60', color: 'bg-red-600',      weight: 2 },
];

// ─── Multiplier cards ─────────────────────────────────────────────────────────
const multiplierCards = [
  {
    name: 'Yellow', badge: '1×', bg: 'bg-yellow-400', text: 'text-yellow-900',
    border: 'border-yellow-300', gain: '1× gains', loss: '1× losses', tip: 'Safe default pick',
  },
  {
    name: 'Green', badge: '2×', bg: 'bg-emerald-500', text: 'text-white',
    border: 'border-emerald-400', gain: '2× gains', loss: '1× losses', tip: 'Great risk/reward ratio',
  },
  {
    name: 'Purple', badge: '3×', bg: 'bg-purple-600', text: 'text-white',
    border: 'border-purple-400', gain: '3× gains', loss: '1.5× losses', tip: 'High upside, some downside',
  },
  {
    name: 'All-in', badge: '5×', bg: 'bg-red-500', text: 'text-white',
    border: 'border-red-400', gain: '5× gains', loss: '2.5× losses', tip: 'Max 4 uses per season',
  },
];

const prizes = [
  { dot: 'bg-amber-400',  label: 'Most Wins',      sub: 'season match wins',       pts: 700 },
  { dot: 'bg-orange-400', label: 'Orange Cap',     sub: 'most fantasy runs',        pts: 350 },
  { dot: 'bg-purple-600', label: 'Purple Cap',     sub: 'most fantasy wickets',     pts: 350 },
  { dot: 'bg-blue-500',   label: 'Longest Streak', sub: 'consecutive match wins',   pts: 350 },
  { dot: 'bg-violet-500', label: 'Purple Hits',    sub: '3× pick scored highest',   pts: 350 },
];

export default function RulesPage() {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 pb-12">
      {/* Header */}
      <motion.div variants={item} className="rounded-2xl bg-navy px-6 py-5 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 bottom-0 w-1.5 bg-ipl-orange" />
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Rules & Scoring</h1>
        <p className="text-blue-300 text-sm mt-1">How points are calculated each match</p>
      </motion.div>

      {/* Points Calculator */}
      <PointsCalculator />

      {/* Team Setup */}
      <SectionCard title="Team Setup" accent="border-ipl-orange">
        <ul className="space-y-2 text-sm text-gray-600">
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

      {/* Batting + Bowling */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
        <SectionCard title="Batting Points" accent="border-amber-400">
          <GroupLabel label="Run milestones" />
          <MilestoneTrack />
          <RuleRow metric="1 run" pts="+1 pt" />

          <GroupLabel label="Strike rate zones (min 10 balls)" />
          <ZoneBar zones={srZones} />
          <p className="text-[10px] text-gray-400 pt-1">SR ≥ 250 requires 20+ balls · SR ≥ 300 requires 25+ balls</p>

          <GroupLabel label="Other penalties" />
          <RuleRow metric="Duck (dismissed for 0)"   pts="−30" />
          <RuleRow metric="Score ≤ 10 runs"          pts="−20" />

          <p className="text-[11px] text-gray-400 pt-3 leading-snug">
            Batters at position 7+ earn run points and SR bonuses only — no deductions.
          </p>
        </SectionCard>

        <SectionCard title="Bowling Points" accent="border-blue-500">
          <GroupLabel label="Wickets & maidens" />
          <RuleRow metric="1 wicket"    pts="+25 pts" />
          <RuleRow metric="3+ wickets"  pts="+20 bonus" />
          <RuleRow metric="5+ wickets"  pts="+35 bonus" />
          <RuleRow metric="Maiden over" pts="+40 bonus" />

          <GroupLabel label="Economy zones (3+ overs)" />
          <ZoneBar zones={econZones} />

          <GroupLabel label="Wicketless extra penalty (2+ overs)" />
          <RuleRow metric="Wicketless + eco &gt; 10" pts="−10 extra" />
          <RuleRow metric="Wicketless + eco &gt; 12" pts="−20 extra" />
        </SectionCard>
      </div>

      {/* Fielding + Multipliers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
        <SectionCard title="Fielding & Bonuses" accent="border-emerald-500">
          <RuleRow metric="Catch / Stumping"          pts="+10 pts" />
          <RuleRow metric="Run-out"                   pts="+10 pts" />
          <RuleRow metric="Man of the Match"          pts="+10 pts" />
          <RuleRow metric="Correct winner prediction" pts="+50 pts" />
        </SectionCard>

        <SectionCard title="Multipliers" accent="border-purple-500">
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {multiplierCards.map(m => (
              <div key={m.name} className={`rounded-xl border ${m.border} bg-white p-3 flex flex-col gap-2`}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${m.bg} ${m.text}`}>
                    {m.badge}
                  </div>
                  <span className="font-black text-gray-900 text-sm">{m.name}</span>
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">Gains</span>
                    <span className="font-bold text-emerald-600">{m.gain}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">Losses</span>
                    <span className="font-bold text-red-500">{m.loss}</span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-1.5">{m.tip}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 pt-3 leading-snug">
            A Purple Hit counts when the Purple pick earns the highest raw points among all five picks in a match.
          </p>
        </SectionCard>
      </div>

      {/* End-of-Season Prizes */}
      <motion.section variants={item} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="border-l-4 border-ipl-orange bg-gray-50/60 px-5 py-3.5">
          <h2 className="font-black text-gray-900 uppercase tracking-wide text-[11px]">End-of-Season Prizes</h2>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {prizes.map(p => (
              <div key={p.label} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5 flex flex-col gap-1.5">
                <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                <div className="font-black text-gray-900 text-sm leading-tight">{p.label}</div>
                <div className="text-[9px] text-gray-400 uppercase tracking-[0.1em] leading-snug">{p.sub}</div>
                <div className="mt-auto pt-2 text-stat text-2xl text-amber-500 tabular-nums">+{p.pts}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}
