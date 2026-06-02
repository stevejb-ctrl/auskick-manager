---
phase: 12-long-press-player-insight
plan: 01
subsystem: live-game / player-insight (shared core + AFL reference)
tags: [player-insight, long-press, buildPlayerInsight, playedZoneMsByPeriod, season-percentages, insight-slot, reuse-before-fork, red-first-tdd, cross-sport-core]
provides:
  - buildPlayerInsight(input) — pure, sport-agnostic view-model builder (in-game per-zone, per-period rows, msSinceLastSub, season per-zone PERCENTAGES only)
  - PlayerInsightSummary — shared presentational block (testids player-insight-ingame / -periods / -season), consumed verbatim by all 3 sports
  - AFL replay GameState.playedZoneMsByPeriod — the missing per-period x per-zone ms datum, accumulated additively at the existing addPlayed credit site
  - optional insight?: ReactNode slot on LockModal (AFL + rugby-league host)
  - AFL long-press wiring — LiveGame builds the VM (config zones, in-game zoneMs, per-period replay + live overlay, season -> %, lastSubbedOnMs) and passes PlayerInsightSummary into the existing LockModal slot
affects: [phase-12-02, live-game, lock-modal]
tech-stack:
  added: []
  patterns: [pure-vm-builder, shared-presentational-component, additive-replay-accessor-at-existing-credit-site, season-percentages-only, insight-slot-over-new-modal, config-zones-never-hardcoded, red-first-tdd, reuse-before-fork]
key-files:
  created:
    - src/lib/player-insight.ts
    - src/lib/__tests__/playerInsight.test.ts
    - src/lib/__tests__/playedZoneMsByPeriod.test.ts
    - src/components/live/PlayerInsightSummary.tsx
    - e2e/tests/player-insight.spec.ts
  modified:
    - src/lib/fairness.ts
    - src/components/live/LockModal.tsx
    - src/components/live/LiveGame.tsx
key-decisions:
  - "D-01: reuse the existing long-press host — add an optional insight?: ReactNode slot to LockModal (AFL + RL) rather than build a new modal"
  - "D-02: one shared pure buildPlayerInsight (no Supabase/React) + one shared PlayerInsightSummary; AFL is the reference, netball + league mirror in 12-02"
  - "D-03: zones from getSportConfig(sport).zones filtered to ageGroup.zones (config order), never a hardcoded ALL_ZONES"
  - "D-04: season is PERCENTAGES ONLY — the builder takes season per-zone in any consistent unit and emits seasonZonePct (pct field only); no raw season ms ever surfaces"
  - "D-05: per-period x per-zone ms is the one MISSING datum (replays only stored the ending zone) — derived additively as playedZoneMsByPeriod at the existing addPlayed credit site; the current open period is overlaid live in the component"
  - "D-06: time-since-last-sub reuses the Phase-10 lastSubbedOnMs (msSinceLastSub = max(0, nowAbsMs - lastSubbedOnMs), null when never subbed)"
  - "DEV (AFL nowAbsMs frame): nowAbsMs = completedQuarterMs + displayNowMs*clockMultiplier so the in-game elapsed and last-sub clock share one frame"
duration: ~2h
completed: 2026-06-02
---

# Phase 12 / Plan 01: Long-press player insight — shared core + AFL reference (PLAYERVIEW-01/02 / F3)

**Long-pressing a player in AFL now opens the existing `LockModal` with a
new shared summary block: this game's per-zone time + time-since-last-sub,
a per-period minutes-per-zone breakdown derived from the event replay, and
the player's season per-zone split as PERCENTAGES only. The summary is a
pure `buildPlayerInsight` view-model + a presentational `PlayerInsightSummary`
component — both sport-agnostic so netball and rugby league reuse them
verbatim in 12-02.**

This plan adds the shared core and wires only AFL. No new modal (the summary
rides into the existing `LockModal` via an additive `insight?` slot), no
migration, no new store slice, no new GameEventType, no new server action —
read-only derivation over already-loaded replay state + the already-fetched
team-scoped `season` prop.

## Performance
- **Duration:** ~2h
- **Tasks:** 3/3 completed
- **Files:** 5 created, 3 modified (+773 lines across src + e2e)

## Accomplishments
- **`buildPlayerInsight` (pure VM, `src/lib/player-insight.ts`)** — input
  `{ zones: ZoneDef[], inGameZoneMs, perPeriod[], seasonZoneMs, lastSubbedOnMs,
  nowAbsMs }` → output `{ inGameZones[], inGameTotalMs, perPeriod[],
  msSinceLastSub, seasonZonePct[] }`. Season is unit-agnostic (feed counts or
  ms — only `pct` surfaces, D-04). `msSinceLastSub` clamps to ≥0 and is `null`
  when the player was never subbed on (D-06). No Supabase, no React → fully
  unit-testable.
- **`PlayerInsightSummary` (shared component, `src/components/live/`)** — three
  sections with stable testids (`player-insight-ingame` / `-periods` /
  `-season`); the per-period section only renders when there's per-period data.
  Owns presentation only; all numbers come from the VM so every sport renders
  identical chrome (reuse-before-fork).
- **AFL per-period datum (`src/lib/fairness.ts`)** — `GameState.playedZoneMsByPeriod`
  (`Record<pid, Record<period, Record<zoneId, ms>>>`) accumulated at the
  existing `addPlayed` credit site, so the per-period split is a finer-grained
  view of the SAME credited ms (existing outputs unchanged). Covered red-first,
  cross-checked to sum to `basePlayedZoneMs`.
- **`LockModal` insight slot** — optional `insight?: ReactNode` rendered under
  the player header; existing callers unaffected (D-01). Rugby league inherits
  the slot for free in 12-02.
- **AFL wiring (`LiveGame.tsx`)** — `insightZones` from
  `getSportConfig("afl").zones` filtered to `ageGroup.zones` (config-driven,
  D-03); in-game from `zoneMsByPlayer`; per-period from
  `playedZoneMsByPeriod[pid]` with the current open period overlaid live
  (`displayNowMs - stintStart`); season mapped to `%`; `nowAbsMs =
  completedQuarterMs + displayNowMs*clockMultiplier`. Passed into the existing
  `LockModal` via `insight={<PlayerInsightSummary .../>}`.

## Task Commits
1. **Task 1: RED VM + AFL per-period specs** — `704c2ef` — `test(12-01): add failing buildPlayerInsight VM spec + AFL per-period zone-ms replay spec`
2. **Task 2: GREEN core + AFL replay + slot** — `10bca9e` — `feat(12-01): buildPlayerInsight VM + shared PlayerInsightSummary + AFL per-period zone-ms`
3. **Task 3: GREEN AFL wiring + e2e** — `593d45d` — `feat(12-01): AFL long-press player-insight summary in LockModal + e2e`

## Files Created/Modified
**Created**
- `src/lib/player-insight.ts` — pure `buildPlayerInsight` + PlayerInsight types.
- `src/lib/__tests__/playerInsight.test.ts` — VM coverage: season %-only / no-ms, zones-from-config (3-zone + 5-zone shapes), `msSinceLastSub` incl. null + clamp, per-period rows, purity.
- `src/lib/__tests__/playedZoneMsByPeriod.test.ts` — AFL replay per-period × per-zone, cross-checked to sum to `basePlayedZoneMs`.
- `src/components/live/PlayerInsightSummary.tsx` — shared three-section summary block.
- `e2e/tests/player-insight.spec.ts` — AFL long-press case (completed Q1 + in-progress Q2 → in-game / periods / season sections + "Q1" period row + action set still rendering).

**Modified**
- `src/lib/fairness.ts` — `GameState.playedZoneMsByPeriod` accumulated in `addPlayed`; existing outputs unchanged.
- `src/components/live/LockModal.tsx` — optional `insight?: ReactNode` slot under the header.
- `src/components/live/LiveGame.tsx` — build the AFL VM + pass `PlayerInsightSummary` into the LockModal slot.

## Decisions & Deviations
- **Followed the plan** for D-01 → D-06 as specified. No new modal, no new
  store slice, no migration, no new GameEventType, no new server action — the
  only modal touched is the existing `LockModal`, and the per-period datum is
  additive at the existing credit site.
- **DEV — single shared frame for nowAbsMs.** AFL `nowAbsMs` is
  `completedQuarterMs + displayNowMs*clockMultiplier`, the same frame the
  Phase-10 recency guard uses, so the in-game elapsed and the last-sub clock
  agree.
- **DEV — current period overlaid live in the component.** `playedZoneMsByPeriod`
  stores CLOSED-period ms; the open period's running time is overlaid in
  `LiveGame` before building the VM, so the per-period rows stay live without
  the replay having to re-credit on every tick.

## DoD Gates
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (0 errors; only pre-existing exhaustive-deps warnings) |
| `npm test` (Vitest) | PASS — `playerInsight.test.ts` + `playedZoneMsByPeriod.test.ts` green |
| `npm run e2e` | PASS — `player-insight.spec.ts` AFL case green (`--workers=1` per Phase-9 protocol) |
| Schema drift | NONE — no migration, no new GameEventType, no new store slice, no new server action |

## Next Phase Readiness
- **Shared core ready for the mirror.** `buildPlayerInsight` +
  `PlayerInsightSummary` are sport-neutral and proven on AFL; 12-02 reuses them
  verbatim and only adds each engine's per-period accessor + sport-correct
  inputs.
- **Reuse boundary established.** The reuse seam is the summary CONTENT (builder
  + component) embedded via an `insight` slot — not the host. Rugby league gets
  the slot for free (shared `LockModal`); netball adds the same slot to its
  forked `NetballPlayerActions` in 12-02.
