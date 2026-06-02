---
phase: 11-plan-the-rotation-ahead-of-the-break
plan: 01
subsystem: game-plan / live-game
tags: [plan-ahead, rotation, game-plan-projector, plannedRotation, honour, pin, partialize, pure-function, red-first-tdd]
provides:
  - projectUpcomingRotation(input) pure adapter — seeds projectGamePlan from live state, current period mirrors reality
  - resolveHonouredSwaps(input) pure honour/stale-guard decision
  - diffPlanToSwaps(input) pure edited-period → off/on/zone derivation
  - PlannedRotation type + plannedRotation live-store slice (partialize, gameId-keyed)
  - GamePlanModal extended (initialPlan / onPin / pinLabel / initialPeriodIndex) — ONE shared surface, no fork
  - AFL imminent-sub override-then-honour (advisory; coach still confirms)
affects: [11-02, phase-12, live-game-swapcard, game-plan-modal]
tech-stack:
  added: []
  patterns: [pure-adapter-over-projector, store-slice-in-partialize, red-first-tdd, reuse-before-fork, advisory-honour-not-auto-apply]
key-files:
  created:
    - src/lib/game-plan/live.ts
    - src/lib/game-plan/__tests__/projectUpcomingRotation.test.ts
    - src/lib/game-plan/__tests__/diffPlanToSwaps.test.ts
    - src/lib/__tests__/plannedRotationHonour.test.ts
    - e2e/tests/plan-ahead-rotation.spec.ts
  modified:
    - src/lib/game-plan/index.ts
    - src/lib/stores/liveGameStore.ts
    - src/components/game-plan/GamePlanModal.tsx
    - src/components/live/LiveGame.tsx
    - src/components/live/SwapCard.tsx
key-decisions:
  - "D-01: ONE surface = extend GamePlanModal (initialPlan/onPin), never fork — pre-game caller passes neither, unchanged"
  - "D-02: projectUpcomingRotation is PURE, calls projectGamePlan + computeTotals, overwrites the current period to mirror live reality"
  - "D-04: plannedRotation lives in the live store partialize, keyed by gameId — NO migration, NO new GameEventType"
  - "D-08: honour = validated pins REPLACE the computed suggestions for the current period; coach still taps Do all (advisory)"
  - "D-09: stale-guard — any invalid pinned pair discards the whole pin, falls back to the live suggester"
  - "D-10: pin cleared on apply (clearPlannedRotation after Do all) or when the period advances past pinnedForPeriod"
  - "DEV: diffPlanToSwaps extracted as its own pure+tested helper (the plan flagged it 'if non-trivial') — per-zone bench↔field diff"
  - "DEV: Reshuffle suppressed (→ Cancel) when onPin is set, so plan-ahead edits start from live reality, not a fresh projection"
duration: ~3.5h (across compaction)
completed: 2026-06-02
---

# Phase 11 / Plan 01: Plan-ahead foundation + AFL override-then-honour (ROTPLAN-01 / F1)

**The coach can now get AHEAD of the rotation: review the upcoming AFL
sub before it falls due, override WHO comes on via the shared Game Plan
surface, pin it, and the live game honours that pinned pair when the sub
comes due — instead of the engine's own pick. The pin is advisory (the
coach still taps "Do all"), keyed by gameId, survives reload, and a
stale pin is silently discarded back to the live suggester.**

This plan deliberately lands the THREE reusable pieces that Plan 11-02
(F2) consumes unchanged, plus the AFL F1 consumption.

## Performance
- **Duration:** ~3.5h (spanned a context compaction)
- **Tasks:** 4/4 completed
- **Files:** 5 created, 5 modified (+1,155 / −16 lines)

## Accomplishments
- **`projectUpcomingRotation` (pure adapter, `src/lib/game-plan/live.ts`)** —
  calls the existing sport-agnostic `projectGamePlan(...)` for the full
  game, then OVERWRITES the current period so its groups/bench equal the
  seeded live `currentGroups`/`currentBench`, recomputes totals via
  `computeTotals`. Deterministic; no Supabase, no React. Reuses the
  projector rather than re-implementing per-sport projection.
- **`resolveHonouredSwaps` (pure honour/stale-guard)** — given the pin +
  current period + lineup + injured/loaned + a fallback swap list, returns
  the PINNED swaps only when every pair is valid AND `pinnedForPeriod`
  matches the current period; otherwise the fallback (live suggester).
  This is the D-08/D-09 decision as a unit-testable pure function.
- **`diffPlanToSwaps` (pure derivation)** — translates the edited current
  period back into AFL rolling-sub pairs: per-zone, an incoming bench
  player paired with an outgoing player who left that zone to the bench →
  one `{off, on, zone}` per genuine bench↔field move; field↔field
  reshuffles and bench reorders emit nothing.
- **`plannedRotation` live-store slice** — `setPlannedRotation` /
  `clearPlannedRotation`, added to the `partialize` allowlist so it
  survives `router.refresh()` + reload; ignored on read when
  `gameId !== activeGameId` (cross-game guard); cleared when the period
  advances past `pinnedForPeriod`. No migration, no new event (D-04/D-05).
- **`GamePlanModal` extended (ONE surface, Success Criterion #3)** — added
  optional `initialPlan` / `onPin` / `pinLabel` / `initialPeriodIndex`.
  When `initialPlan` is set the modal seeds from it (not a fresh project);
  when `onPin` is set it renders a primary "Use this plan" pin action.
  Pre-game caller passes none → byte-for-byte unchanged.
- **AFL F1 in `LiveGame`** — a "Plan ahead" entry on the sub-due surface
  opens the shared modal seeded via `projectUpcomingRotation`; on pin it
  writes `plannedRotation` via `diffPlanToSwaps`. At the suggestions site,
  a valid pin is honoured (via `resolveHonouredSwaps`) as the SwapCard
  suggestions; a "Planned sub ready" badge surfaces (D-15); the pin is
  cleared after a successful apply.

## Task Commits
1. **Task 1: RED specs** — `ba5bcf1` — `test(11-01): add failing plan-ahead projector + honour specs`
2. **Task 2: GREEN adapter + store slice + honour helper** — `0b8d9a1` — `feat(11-01): projectUpcomingRotation adapter + plannedRotation store slice + honour helper`
3. **Task 3: GREEN modal + AFL entry + honour** — `050aeea` — `feat(11-01): AFL plan-ahead entry + pinned-sub honour via shared GamePlanModal`
4. **Task 4: e2e + DoD gates** — `22eb1d9` — `test(11-01): e2e override-then-honour + DoD gates`

## Files Created/Modified
**Created**
- `src/lib/game-plan/live.ts` — `projectUpcomingRotation`, `resolveHonouredSwaps`, `diffPlanToSwaps`, `PlannedRotation` (+ input types).
- `src/lib/game-plan/__tests__/projectUpcomingRotation.test.ts` — current period mirrors the seed exactly; later periods projected; determinism.
- `src/lib/game-plan/__tests__/diffPlanToSwaps.test.ts` — one swap per real bench↔field move, per-zone; reshuffles/reorders emit nothing; purity.
- `src/lib/__tests__/plannedRotationHonour.test.ts` — valid pin → pinned; stale pin (injured/loaned/off-bench) → fallback; wrong-period → fallback.
- `e2e/tests/plan-ahead-rotation.spec.ts` — full override-then-honour through the real AFL live UI (Alicia OFF → Octavia ON, Octavia the LAST bench player so the pin demonstrably beats the engine default).
**Modified**
- `src/lib/game-plan/index.ts` — barrel re-exports the new pure helpers + types.
- `src/lib/stores/liveGameStore.ts` — `plannedRotation` slice + actions + partialize entry + gameId guard + period-advance clear.
- `src/components/game-plan/GamePlanModal.tsx` — `initialPlan`/`onPin`/`pinLabel`/`initialPeriodIndex`; Reshuffle→Cancel in plan-ahead mode; `game-plan-pin` action.
- `src/components/live/LiveGame.tsx` — `plan-ahead-entry`, GamePlanModal render seeded from `projectUpcomingRotation`, `diffPlanToSwaps`→`setPlannedRotation`, honour via `resolveHonouredSwaps`, `planned-sub-badge`/`plan-ahead-clear`, `clearPlannedRotation` after apply.
- `src/components/live/SwapCard.tsx` — added `data-testid="swapcard-toggle"` + `data-testid="swapcard-apply-all"` (additive, cross-sport safe).

## Decisions & Deviations
- **Followed the plan** for D-01/D-02/D-04/D-08/D-09/D-10 as specified;
  no new modal component (reuse-before-fork honoured — the only modal
  touched is `GamePlanModal`).
- **DEV — `diffPlanToSwaps` extracted as its own pure, tested helper.**
  The plan flagged this ("Add/extend a focused unit test if the diff/pin
  derivation is non-trivial"); it was non-trivial (per-zone matching), so
  it lives in `live.ts` with `diffPlanToSwaps.test.ts`. New
  `src/lib/game-plan/__tests__/` subdir holds it + the projector spec.
- **DEV — Reshuffle suppressed (→ Cancel) in plan-ahead mode.** When
  `onPin` is set, the modal must start from live reality (the seeded
  `initialPlan`); allowing Reshuffle would re-project from scratch and
  defeat "override the upcoming sub". The pre-game (copy) caller keeps
  Reshuffle.
- **DEV — SwapCard testids.** Added `swapcard-toggle` / `swapcard-apply-all`
  so the e2e can reach the apply step without brittle name-regex matching.
  Purely additive; safe for the netball/league consumers of SwapCard.
- **e2e race-free ordering (self-caught).** The honour path only engages
  once a sub is genuinely due AND the live suggester would also fire — so
  the spec drives the real clock to sub-due rather than faking it. The
  SubDueModal is dismissed FIRST (its backdrop would block the planner +
  SwapCard); because `subState` stays `"due"` while no sub is made, the
  modal does not re-open, leaving a clean modal-free editing window. Then
  pin → expand SwapCard → "Do all" → assert the `swap` event carries
  `off=Alicia, on=Octavia`. Verified stable under `--repeat-each=3`.
- **e2e (Phase-9 environmental protocol).** Full `npm run e2e` showed
  114 passed / 6 failed; the 6 failures (account-deletion,
  afl-hooter-freezes-player-time, demo-picker netball, feedback-fab ×2,
  rugby-league-full-game-playthrough) are pre-existing Windows
  multi-worker contention — re-running all 6 in isolation
  (`--workers=1`) passed 16/16. The new spec's changes are additive
  testids + new files and cannot regress those specs.

## DoD Gates
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0; only pre-existing exhaustive-deps + `<img>` warnings) |
| `npm test` (Vitest) | PASS (840 tests, 49 files) |
| `npm run e2e` | PASS — new `plan-ahead-rotation.spec.ts` green; full run 114 pass / 6 pre-existing multi-worker flakes, all 6 confirmed green serially (`--workers=1`, Phase-9 protocol) |
| Schema drift | NONE — no migration, no new GameEventType (D-04/D-05); all persistence via the existing client store + existing `persistSwap` action |

## Next Phase Readiness
- **11-02 (ROTPLAN-02/F2)** can proceed: it reuses pieces 1–3 unchanged —
  `projectUpcomingRotation` + the extended `GamePlanModal` (`initialPlan`/
  `onPin`/`initialPeriodIndex`) + the `plannedRotation` store slice. F2
  adds the final-minutes "plan next period" entry and pre-seeds each
  sport's break from `plannedRotation.nextPeriod*` (AFL `QuarterBreak`,
  netball `NetballQuarterBreak`, league `LeagueLiveGame`).
- **Shared seam note for 11-02:** both 11-01 and 11-02 modify
  `LiveGame.tsx`, so 11-02 runs serially after this (Wave 2). The
  `PlannedRotation` type already carries the `nextPeriod*` fields (D-06)
  F2 needs — no shape change required, only new producers/consumers.
- Success Criteria #1, #3, #4 (F1 slice) satisfied; #2 (build the next
  period's lineup across all sports) is delivered by 11-02.
