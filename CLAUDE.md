# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

No test suite is configured.

## Stack

- **Next.js 16.2.2** with App Router — read `node_modules/next/dist/docs/` before writing Next.js code (see AGENTS.md)
- **React 19.2.4**
- **Tailwind CSS v4** — no `tailwind.config.js`; configured via CSS in `src/app/globals.css`. v4 has breaking changes from v3.
- **Supabase** — auth (JWT) + state persistence (`season_state` table). `createClient()` for auth, `createServiceClient()` for bypassing RLS.
- **TypeScript**

## Architecture

This is a two-player IPL fantasy cricket scoring app for "Lads" vs "Gils" across the 70-match IPL 2026 season.

### State management

`src/lib/store.ts` — `useSeasonState()` is the single hook for all app state. On mount it calls `GET /api/state` to load from Supabase. Updates call `PATCH /api/state` in the background after optimistic local update. The state shape is `SeasonState` (see `src/lib/types.ts`): a map of `matchId → MatchEntry`, plus season-level all-in counters.

State is stored as a **single JSON blob** in the Supabase `season_state` table (id=1), shared between both users. The server enforces pick-locking: once a match has started, picks cannot be changed (returns 403). Bypass matches can be configured in the route handler.

**Never trust the stored `total` field** — always recompute via `computeSideTotal()` in `src/lib/stats.ts` or `applyMultiplier(r.rawTotal, r.multiplier)` per-player, as stored values can be stale from historical bugs.

### Data flow for a match

The match page (`src/app/match/[id]/page.tsx`) has three tabs: **Studio** (picks + winner prediction), **Live** (real-time scorecard), **Result** (final breakdown).

1. **Picks** (`PlayerPick[]`) — each side picks up to 5 players with a multiplier (yellow 1×, green 2×, purple 3×, allin 5×). Each non-yellow multiplier can only be used once per match; allin is capped at 4 uses per season. Each pick can optionally name a substitute (activated only if main player is absent from ESPN's playing eleven).
2. **Auto-results** — when ESPN reports completion, a `useEffect` calls `autoResultFromLive()` for both sides, saves results, and switches to the Result tab. `SideEntry.stats` is always `[]`; results go into `SideEntry.results`.
3. **Results** (`PlayerResult[]`) — computed by `autoResultFromLive()` in `src/lib/liveScoring.ts`. The Result tab recomputes display totals at render time from `rawTotal + multiplier` to avoid stale stored values.

### Live scoring layer

`src/app/api/live/[matchId]/route.ts` — Route Handler that fetches from two sources:
- **ESPN** (`summary` + `scoreboard` endpoints) for batting/bowling stats, dismissals, team scores, playing eleven
- **IPLT20 CDN** (S3 JSON feeds, ID = `2416 + matchId`) for Man of the Match and ball-by-ball data

Maps fixture `matchId` → ESPN event ID via `data/espn_ids.json`. Returns a `LiveData` shape with `innings`, `playingEleven`, `commentaries`, `actualWinner`, `manOfTheMatch`, `playerImageMap`.

`src/hooks/useLiveScore.ts` — polls `/api/live/[matchId]` every 15s. Returns `{ data, loading, error, lastUpdated, refresh }`.

`src/lib/liveScoring.ts` — transforms `LiveData` into fantasy points:
- `calcLiveBatsmen` / `calcLiveBowlers` — per-pick batting/bowling points, live-specific: batting penalty (≤10 runs = −20) is held until dismissal, not applied while still at crease
- `calcLiveFantasyTotal` — combines bat+bowl+fielding, applies substitute logic, returns `BreakdownEntry[]`
- `autoResultFromLive` — final results after match: full penalties applied, fielding credits parsed from dismissal text, MOM from IPLT20 CDN (falls back to manually-set `isMOM` flag)
- **Name matching**: `normalizeName()` (lowercase, alpha-only) + `NAME_ALIASES` table for nicknames. Fielding uses substring matching of surnames against dismissal text.
- **Substitute logic**: main player activated if in ESPN's `playingEleven` OR list is empty; sub activated only if main NOT in XI AND sub IS in XI.
- **Fielding**: ESPN doesn't expose fielding stats. Credits parsed from `dismissalFielder` field (primary) or dismissal text regex fallback. Joint run-outs ("A/B") credit both fielders.

### Scoring rules (from `src/lib/scoring.ts`)

- **Batting**: 1pt/run; milestone bonuses at 25/40/70/90 runs (+5/15/25/35); SR bonuses (+50/25/10 for ≥300/250/200% with min balls); SR penalty (−20 for ≤100%, 10+ balls); duck = −30; ≤10 runs = −20; **batting pos 7+ gets 0 unless 10+ runs** (no penalties)
- **Bowling**: 25pt/wicket; 40pt/maiden; economy bonuses/penalties after 3+ overs (≤4/≤6/≤8 = +80/60/30; ≥10/≥12/≥14 = −20/−30/−40); wicket milestones (3+ = +20, 5+ = +35); wicketless penalty −20 after 2+ overs
- **Fielding**: 10pt per catch/stumping/run-out (ESPN-provided or parsed from dismissal text)
- **MOM**: +10 (separate bonus, never in `rawTotal`); **Correct winner prediction**: +50
- **Multiplier on gains**: yellow 1×, green 2×, purple 3×, allin 5×; **on losses**: yellow 1×, green 1×, purple 1.5×, allin 2.5×

### Season stats (`src/lib/stats.ts`)

`computeSideTotal(match, side)` — recomputes total from `PlayerResult[]` including MOM bonus and prediction bonus. Use this as source of truth, not `match[side].total`.

`computeSideStats(state, side)` → `SideStats` — wins/losses, form, streaks, purple hits (3× player scored >0), orange/purple cap leaders by team total runs/wickets.

`computePlayerStats(state, side)` → per-player season aggregates sorted by total points.

### Key files

| File | Purpose |
|---|---|
| `src/lib/types.ts` | All TypeScript interfaces |
| `src/lib/scoring.ts` | Fantasy point calculations |
| `src/lib/stats.ts` | Season aggregates; `computeSideTotal()` is source of truth for match totals |
| `src/lib/data.ts` | Fixture/team data accessors; IST-aware date helpers |
| `src/lib/store.ts` | `useSeasonState()` — Supabase-backed state hook |
| `src/lib/liveScoring.ts` | ESPN data → `PlayerResult[]`; name matching; substitute logic |
| `src/hooks/useLiveScore.ts` | Polls `/api/live/[matchId]` every 15s |
| `src/app/api/live/[matchId]/route.ts` | ESPN + IPLT20 CDN proxy |
| `src/app/api/state/route.ts` | State persistence with pick-lock enforcement |
| `src/app/match/[id]/page.tsx` | Match workflow: Picks → Live → Result |
| `src/app/page.tsx` | Dashboard: standings, prize race, today's matches |
| `src/components/LiveScorecard.tsx` | Live scorecard + side panels with per-player breakdowns |
| `data/fixtures.json` | 70 IPL 2026 fixtures (date format: `"DD-MMM-YY"`) |
| `data/teams.json` | 10 teams with shortName, color, player rosters |
| `data/espn_ids.json` | `matchId` (string key) → ESPN event ID |
| `data/scoring_rules.json` | Scoring rules reference (mirrors `scoring.ts`) |
