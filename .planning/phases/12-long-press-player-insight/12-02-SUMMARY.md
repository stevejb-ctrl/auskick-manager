---
phase: 12-long-press-player-insight
plan: 02
subsystem: live-game / player-insight (netball + rugby-league mirror)
tags: [player-insight, long-press, playedZoneMsByPeriod, netball, rugby-league, insight-slot, reuse-before-fork, red-first-tdd, cross-sport]
provides:
  - netball playedZoneMsByPeriod(events, periodSeconds, thirdLookup, inProgress?) — per-period x per-third ms, exported standalone (keyed by the 3 third zone ids)
  - rugby-league playedZoneMsByPeriod(events) — per-period field ms (closed stints, single "field" zone)
  - optional insight?: ReactNode slot on NetballPlayerActions (mirror of the LockModal slot)
  - netball long-press wiring — NetballLiveGame builds the VM (config thirds, playerThirdMs in-game, per-period replay, season position-counts->thirds %, lastSubbedOnMs) and passes PlayerInsightSummary into NetballPlayerActions
  - rugby-league long-press wiring — LeagueLiveGame builds the VM (single "field" config zone, playerMsOnField in-game + live overlay, per-period field ms, lastSubbedOnMs) and passes PlayerInsightSummary into the existing LockModal slot
  - e2e: netball + rugby-league long-press insight cases alongside the AFL case
affects: [live-game, netball-live-game, league-live-game, netball-player-actions]
tech-stack:
  added: []
  patterns: [standalone-per-sport-replay-accessor, shared-vm-builder-reuse, insight-slot-over-new-modal, config-zones-never-hardcoded, season-percentages-only, red-first-tdd, reuse-before-fork]
key-files:
  created:
    - src/lib/__tests__/playedZoneMsByPeriod.netball.test.ts
    - src/lib/__tests__/playedZoneMsByPeriod.league.test.ts
  modified:
    - src/lib/sports/netball/fairness.ts
    - src/lib/sports/rugby_league/fairness.ts
    - src/components/netball/NetballPlayerActions.tsx
    - src/components/netball/NetballLiveGame.tsx
    - src/components/league/LeagueLiveGame.tsx
    - e2e/tests/player-insight.spec.ts
key-decisions:
  - "D-01: netball reuses its forked NetballPlayerActions host (add the same insight? slot LockModal has); rugby league reuses the already-shared LockModal slot — NO new modal"
  - "D-02: both sports reuse the 12-01 buildPlayerInsight + PlayerInsightSummary VERBATIM — no per-sport fork of the summary"
  - "D-03: zones from each sport config — netball netballSport.zones intersected with ageGroup.zones AND the credited-third set (so the 2 circle zones that never accrue time are excluded); rugby league rugbyLeagueSport.zones intersected with ageGroup.zones (the single 'field')"
  - "D-04: season percentages only — netball feeds season QUARTERS-per-third counts (unit-agnostic %); league feeds season field ms; no raw season minutes surface"
  - "D-05: per-period derived from each engine's replay — netball per-third, league per-field — both via a standalone exported playedZoneMsByPeriod cross-checked to sum to the existing per-zone output"
  - "D-06: time-since-last-sub reuses each replay's existing lastSubbedOnMs (netball replayNetballGame; league LeagueGameState)"
  - "DEV (lower-risk per-period option): added playedZoneMsByPeriod as a STANDALONE exported function per sport (sharing the existing splitQuarterSegments / stint logic) rather than bolting a new field onto replay state — the plan's explicitly-offered lower-risk option; existing replay outputs untouched"
  - "DEV (netball credited-zone set): netball config has 5 zones but only 3 thirds ever accrue time (circles never get court time), so insightZones is derived by running primaryThirdFor over ageGroup.positions — config-driven, no hardcoded third list, and circles (which would always read 0%) are excluded"
  - "DEV (league single-zone honesty): RL config zones = single 'field', so the per-zone view is total field time + a 100%-field season split; the MEANINGFUL RL signals are time-since-last-sub + per-period field minutes (forwards/backs are vests, re-modelling out of scope per the plan)"
  - "DEV (netball credit point): netball credits a CLOSED quarter into playedZoneMsByPeriod at period_break_swap / game_finalised (subs happen at the break), NOT at quarter_end — so the netball e2e seeds a period_break_swap between Q1 and Q2"
duration: ~2h (across compaction)
completed: 2026-06-02
---

# Phase 12 / Plan 02: Long-press player insight — netball + rugby-league mirror (PLAYERVIEW-01/02 / F3)

**Long-pressing a player in NETBALL and RUGBY LEAGUE now opens the SAME
shared player-insight summary AFL got in 12-01 — this game's per-zone time +
time-since-last-sub, a per-period minutes-per-zone breakdown derived from each
sport's own event replay, and the season per-zone split as percentages only.
Netball renders it inside its forked `NetballPlayerActions` (via the same
`insight?` slot `LockModal` already had); rugby league renders it inside the
already-shared `LockModal`. Both reuse the 12-01 `buildPlayerInsight` builder
and `PlayerInsightSummary` component verbatim — no per-sport fork of the
summary.**

The only per-sport work is (a) deriving the per-period breakdown from each
engine's replay (netball per-third, league per-field) and (b) feeding the
shared builder sport-correct inputs. No new modal, no new summary component, no
migration, no new store slice, no new GameEventType, no new server action —
read-only.

## Performance
- **Duration:** ~2h (spanned a context compaction)
- **Tasks:** 3/3 completed
- **Files:** 2 created, 6 modified (+1,224 / −79 lines across src + e2e)

## Accomplishments
- **Netball per-period accessor (`src/lib/sports/netball/fairness.ts`)** —
  exported `playedZoneMsByPeriod(events, periodSeconds, thirdLookup,
  inProgress?)` → `Record<pid, Record<period, Record<thirdZoneId, ms>>>`,
  sharing the existing `splitQuarterSegments` so the per-period split sums
  exactly to the whole-game `playerThirdMs` output. Credits closed quarters at
  `period_break_swap` / `game_finalised`; the open quarter via the same
  `inProgressContribution` the live per-third stat uses.
- **Rugby-league per-period accessor (`src/lib/sports/rugby_league/fairness.ts`)** —
  exported `playedZoneMsByPeriod(events)` → per-period CLOSED field ms (single
  `"field"` zone), mirroring `playerMsOnField`'s stint logic; sums to the
  whole-game on-field ms.
- **`NetballPlayerActions` insight slot** — optional `insight?: ReactNode`
  rendered under the header in every sub-mode; existing callers unaffected
  (mirror of the LockModal slot).
- **Netball wiring (`NetballLiveGame.tsx`)** — `insightZones` derived by running
  `primaryThirdFor` over `ageGroup.positions` so only the 3 credited thirds show
  (config-driven, circles excluded); in-game from `playerThirdMs`; per-period
  from the netball `playedZoneMsByPeriod` (reusing one shared
  `inProgressContribution` so the split provably sums); season from
  `seasonPositionCounts` mapped to thirds (counts → %); `lastSubbedOnMs` from
  `replayNetballGame`. Passed into `NetballPlayerActions` via `insight=`.
- **Rugby-league wiring (`LeagueLiveGame.tsx`)** — `insightZones` =
  `rugbyLeagueSport.zones` filtered to `ageGroup.zones` (the single field);
  in-game from `playerMsOnField`; per-period from the league
  `playedZoneMsByPeriod` with the live open stint overlaid onto the current
  period; season field ms summed per game; `lastSubbedOnMs` from
  `LeagueGameState`. Passed into the existing `LockModal` via `insight=`.

## Task Commits
1. **Task 1: RED netball + league per-period specs** — `26618a6` — `test(12-02): add failing netball + rugby-league per-period zone-ms replay specs`
2. **Task 2: GREEN replays + wire both hosts** — `ee58f81` — `feat(12-02): netball + rugby-league per-period zone-ms + long-press insight summary`
3. **Task 3: GREEN netball + league e2e + DoD gates** — `77d9f88` — `feat(12-02): netball + rugby-league long-press insight e2e + DoD gates`

## Files Created/Modified
**Created**
- `src/lib/__tests__/playedZoneMsByPeriod.netball.test.ts` — per-period × per-third ms: right period+third credited, mid-quarter sub split, no phantom periods, and the locked invariant (per-period buckets sum to whole-game `playerThirdMs`).
- `src/lib/__tests__/playedZoneMsByPeriod.league.test.ts` — per-period field ms across the 2 halves (period count from `ageGroup.periodCount`), summing to `playerMsOnField`.

**Modified**
- `src/lib/sports/netball/fairness.ts` — exported `QuarterSub` + module-scope `splitQuarterSegments`; refactored `playerThirdMs` onto it; added `playedZoneMsByPeriod`.
- `src/lib/sports/rugby_league/fairness.ts` — added `playedZoneMsByPeriod` (closed stints, per half, single `"field"`).
- `src/components/netball/NetballPlayerActions.tsx` — optional `insight?` slot under the header.
- `src/components/netball/NetballLiveGame.tsx` — build the netball VM (shared `inProgressContribution`, config thirds, season counts→%) + pass `PlayerInsightSummary` into `NetballPlayerActions`.
- `src/components/league/LeagueLiveGame.tsx` — build the league VM (single field, live overlay onto current period, season field ms) + pass `PlayerInsightSummary` into the existing `LockModal`.
- `e2e/tests/player-insight.spec.ts` — added a netball case and a rugby-league case alongside AFL (each: completed period 1 + in-progress period 2 → long-press → in-game / periods / season sections + period row "Q1"/"H1" + the host's action set still rendering).

## Decisions & Deviations
- **Followed the plan** for D-01 → D-06 as specified. Both sports reuse the
  shared `buildPlayerInsight` + `PlayerInsightSummary` verbatim; zones come from
  config; season is percentages only; no new modal/migration/store-slice/event/
  server-action.
- **DEV — standalone per-sport accessor (the plan's lower-risk option).** Rather
  than bolt a new per-period field onto `replayNetballGame` / `replayLeagueGame`
  state, `playedZoneMsByPeriod` is a STANDALONE exported function per sport that
  reuses the existing segment/stint helpers. Plan Task 2 explicitly offered
  "extend the replay … OR add a per-period variant — choose the lower-risk
  option"; the standalone variant leaves the existing replay outputs completely
  untouched (existing fairness specs unchanged) and is independently
  unit-testable.
- **DEV — netball credited-zone set.** Netball config has 5 zones but only the 3
  thirds accrue court time (the 2 circles never do). `insightZones` is derived
  by running `primaryThirdFor` over `ageGroup.positions`, so the summary stays
  config-driven (no hardcoded third list) while excluding circles that would
  always read 0%.
- **DEV — rugby-league single-zone honesty.** RL config zones = a single
  `"field"`, so the per-zone view collapses to total field time and a
  100%-field season split. This is correct given the config (forwards/backs are
  vests/roles, not config zones; re-modelling them is out of scope). The
  meaningful RL signals — time-since-last-sub + per-period field minutes — are
  real.
- **DEV — netball credits at the break, not quarter_end.** Netball's
  `playedZoneMsByPeriod` credits a closed quarter at `period_break_swap` /
  `game_finalised` (subs happen at the break), unlike AFL which credits at
  `quarter_end`. The netball e2e therefore seeds a `period_break_swap` (same
  lineup, no swaps) between Q1 and Q2 so period-1 data exists for the "By
  period" section — caught when the first e2e run failed the "Q1" assertion and
  fixed by adding the break event.
- **DEV — TS2802 fixes (no `target` in tsconfig → ES3 iteration).** Replaced
  `for…of` Map iteration and `[...set]` spreads with `Array.from(...)` in the
  new netball test and `LeagueLiveGame` per-period overlay (these paths are
  typechecked under `tsc` even though Vitest/esbuild don't typecheck). Also
  annotated two previously-implicit-`any` locals in the RL fairness
  `league_position_change` branch (`string[]`).

## DoD Gates
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (0 errors; only pre-existing exhaustive-deps warnings in LiveGame / QuarterBreak / NetballQuarterBreak / FeatureSection — none in touched files) |
| `npm test` (Vitest) | PASS — 875/875 (54 files), incl. both new per-period specs |
| `npm run e2e` | PASS — `player-insight.spec.ts` 4/4 (setup + AFL + netball + rugby league), `--workers=1` per Phase-9 protocol |
| Schema drift | NONE — no migration, no new GameEventType, no new store slice, no new server action (read-only derivation + presentational reuse) |

## Next Phase Readiness
- **F3 complete across all three sports.** Long-press insight (in-game per-zone
  + last-sub + per-period, season % only) now works for AFL, netball, and rugby
  league through each sport's existing long-press host — no fork.
- **Phase 12 functionally complete** — both waves landed (12-01 shared core +
  AFL; 12-02 netball + league mirror). Ready for STATE/ROADMAP completion.
- **Phase 13 (AUDIO-01) is independent** and may run any time. v1.0 Phase 6 is
  still paused on user-provided prod credentials.
