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
- **TypeScript**, no backend — all state is client-side in `localStorage`

## Architecture

This is a two-player IPL fantasy cricket scoring app for "Lads" vs "Gils" across the 70-match IPL 2026 season. There is no server, database, or auth — everything lives in the browser.

### State management

`src/lib/store.ts` — `useSeasonState()` is the single hook that owns all app state. It reads/writes `localStorage` under the key `ipl-fantasy-2026`. The state shape is `SeasonState` (see `src/lib/types.ts`): a map of `matchId → MatchEntry`, plus season-level all-in usage counters. All pages that need state call this hook.

### Data flow for a match

The match page has three tabs: **Studio** (picks + winner prediction), **Live** (real-time scorecard), **Result** (final breakdown).

1. **Picks** (`PlayerPick[]`) — each side picks 5 players with a multiplier (yellow 1×, green 2×, purple 3×, allin 5×). Each multiplier (except yellow) can only be used once per match; allin is capped at 4 uses per season. Each pick can optionally name a substitute player (used if the primary didn't play).
2. **Auto-results** — when ESPN reports the match as complete, a `useEffect` in the match page automatically calls `autoResultFromLive()` for both sides, saves results to state, and switches to the Result tab. No manual stat entry is required. `SideEntry.stats` exists in the type but is always saved as `[]`.
3. **Results** (`PlayerResult[]`) — computed by `autoResultFromLive()` in `src/lib/liveScoring.ts` (which calls `calcPlayerResult()` from `scoring.ts`). Stored in `SideEntry.results`. The side with the higher total wins the match.

### Live scoring layer

`src/app/api/live/[matchId]/route.ts` is a Next.js Route Handler that proxies two ESPN API endpoints (`summary` and `scoreboard`) and reshapes their response into a clean `innings` map keyed by batting team name. It maps fixture `matchId` → ESPN event ID via `data/espn_ids.json`.

`src/hooks/useLiveScore.ts` — `useLiveScore(matchId)` polls `/api/live/[matchId]` every 15 seconds and returns `LiveData`.

`src/lib/liveScoring.ts` — takes `LiveData.innings` and a side's `picks`, fuzzy-matches player names (strips non-alpha, checks substring/suffix overlap), and produces `PlayerResult[]` via `autoResultFromLive()`. Fielding stats (catches, stumpings, run-outs) are not available from ESPN and always default to 0 in auto-results. MOM is also not auto-detected — must be set manually if needed.

The match page uses live data two ways: (1) `LiveScorecard` component shows the real-time scorecard during the match; (2) on match completion, "Auto-fill from Live" calls `autoResultFromLive()` to populate results without manual stat entry.

### Key files

| File | Purpose |
|---|---|
| `src/lib/types.ts` | All TypeScript interfaces (`PlayerPick`, `PlayerStats`, `PlayerResult`, `MatchEntry`, `SeasonState`, etc.) |
| `src/lib/scoring.ts` | Fantasy point calculations — batting, bowling, fielding, multipliers |
| `src/lib/stats.ts` | Season-level aggregates (wins, losses, streaks, orange/purple cap) used by the dashboard |
| `src/lib/data.ts` | Accessors for `data/fixtures.json` and `data/teams.json`; date parsing utilities |
| `src/lib/store.ts` | `useSeasonState()` hook — localStorage persistence |
| `src/lib/liveScoring.ts` | Live ESPN data → `PlayerResult[]`; fuzzy name matching; `autoResultFromLive()` |
| `src/hooks/useLiveScore.ts` | Polls `/api/live/[matchId]` every 15s; returns `LiveData` |
| `src/app/api/live/[matchId]/route.ts` | Route Handler: proxies ESPN APIs, maps via `data/espn_ids.json` |
| `src/app/match/[id]/page.tsx` | Match workflow: Picks → Live scorecard → Auto-fill results |
| `src/app/page.tsx` | Dashboard: season standings, today's matches, upcoming fixtures |
| `data/fixtures.json` | All 70 IPL 2026 fixtures (date format: `"DD-MMM-YY"`) |
| `data/teams.json` | 10 teams with shortName, color, and player rosters |
| `data/espn_ids.json` | Maps fixture `matchId` (number as string key) → ESPN event ID string |
| `data/scoring_rules.json` | Scoring rules reference (mirrors logic in `scoring.ts`) |

### Scoring rules summary (from `scoring.ts`)

- **Batting**: 1pt/run; milestone bonuses at 25/40/70/90 runs; SR bonuses/penalties; duck = −30; ≤10 runs = −20; batting pos 7+ gets no points unless 10+ runs
- **Bowling**: 25pt/wicket; 40pt/maiden; economy bonuses/penalties (only after 3+ overs); wicketless penalty after 2+ overs
- **Fielding**: 10pt per catch/stumping/run-out
- **MOM**: +10; **Correct winner prediction**: +50
- **Multiplier on gains**: yellow 1×, green 2×, purple 3×, allin 5×; **on losses**: yellow 1×, green 1×, purple 1.5×, allin 2.5×
