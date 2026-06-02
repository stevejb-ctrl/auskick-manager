---
phase: 11-plan-the-rotation-ahead-of-the-break
plan: 02
subsystem: game-plan / live-game (cross-sport)
tags: [plan-ahead, next-period, build-next-period, plannedRotation, pre-seed, stale-reconcile, reuse-before-fork, red-first-tdd, cross-sport]
provides:
  - seedNextPeriodLineup(input) pure cross-sport seed/reconcile helper — pin → groupId->ids + bench, invalid players reconciled out, wrong-period → null
  - AFL final-minutes "plan next period" entry (LiveGame) → shared GamePlanModal on the NEXT period; QuarterBreak pre-seeds its draft from the pin (lastAppliedModeRef-safe)
  - netball final-minutes entry (NetballLiveGame) → NetballQuarterBreak initialDraft pre-seeded from the pin
  - rugby-league final-minutes entry (LeagueLiveGame) → between-periods forwards/backs pre-seeded from the pin via recordLeagueLineupSet on explicit Start
  - planned-seed-banner (D-15 visible indication) at each sport's break
affects: [phase-12, live-game, quarter-break, netball-quarter-break, league-live-game]
tech-stack:
  added: []
  patterns: [pure-seed-reconcile-over-pin, reuse-wave1-surface, seed-on-explicit-start-not-auto-commit, lastAppliedModeRef-seed-as-initial, red-first-tdd, reuse-before-fork]
key-files:
  created:
    - src/lib/__tests__/nextPeriodPlanSeed.test.ts
  modified:
    - src/lib/game-plan/live.ts
    - src/lib/game-plan/index.ts
    - src/components/live/LiveGame.tsx
    - src/components/live/QuarterBreak.tsx
    - src/components/netball/NetballLiveGame.tsx
    - src/components/netball/NetballQuarterBreak.tsx
    - src/components/league/LeagueLiveGame.tsx
    - e2e/tests/plan-ahead-rotation.spec.ts
key-decisions:
  - "D-11: reuse the Wave-1 GamePlanModal; the final-minutes entry opens it on the NEXT period (initialPeriodIndex), gated by a sport-agnostic final-window predicate + !isLastPeriod (never hardcode 'quarter')"
  - "D-12: each sport's break opens PRE-SEEDED from plannedRotation.nextPeriod* — AFL QuarterBreak draft (seed treated as the lastAppliedModeRef initial state so suggestedLineup can't stomp it), netball NetballQuarterBreak initialDraft, league between-periods forwards/backs"
  - "D-13: seedNextPeriodLineup reconciles the pin against current availability — players no longer available drop to bench and the suggester fills; never fielded"
  - "D-14: pin cleared once the next period starts (after each sport's start commit) so it can't leak into a later period"
  - "D-15: a visible 'planned' indication (planned-seed-banner / planned-next-period-badge) surfaces at the entry and the break"
  - "DEV (league): league has NO separate break component, so both F2 halves live in LeagueLiveGame — the live-surface entry pins, and handleStartNextPeriod seeds via recordLeagueLineupSet on the explicit Start tap (auth/RLS-guarded, never auto-commit, T-11-02-B), then clears the pin"
  - "DEV (e2e timing): the AFL F2 spec backdates quarter_start created_at by 12s (quarter_length 50s, sub_interval 45s) so the game loads inside the final window with ~38s of hooter margin; the hooter QuarterEndModal CTA 'Select team for Q2' transitions to the break where planned-seed-banner is asserted"
duration: ~2h (across compaction)
completed: 2026-06-02
---

# Phase 11 / Plan 02: Build the next period's lineup before the siren — cross-sport (ROTPLAN-02 / F2)

**During the dying minutes of a period the coach can now open the SAME
shared Game Plan surface from Wave 1 on the NEXT period, build/edit its
lineup, and pin it — and when the break arrives, each sport's break path
opens PRE-SEEDED with that plan instead of recomputing its own
suggestion. Works for AFL, netball, and rugby league. A stale pin (a
player marked out/injured/loaned after pinning) is reconciled — invalid
players drop to the bench and the suggester fills, never fielded — and
the pin is cleared once that period starts.**

This plan adds only producers + consumers around the Wave-1 foundation:
no new modal, no new store slice, no migration (Success Criterion #3 +
reuse-before-fork). AFL is the reference; netball and league mirror it.

## Performance
- **Duration:** ~2h (spanned a context compaction)
- **Tasks:** 3/3 completed
- **Files:** 1 created, 8 modified (+1,099 / −3 lines across src + e2e)

## Accomplishments
- **`seedNextPeriodLineup` (pure cross-sport helper, `src/lib/game-plan/live.ts`)** —
  given `{ pin, periodIndex (0-based), availableIds, groupIds }` returns a
  sport-neutral `{ groups: Record<groupId, ids[]>, bench }` or `null`.
  Returns null when there is no pin, when `pin.nextPeriodIndex !==
  periodIndex` (wrong-period → break falls back to its own suggestion),
  or when there are no `nextPeriodGroups`. When it seeds, it filters
  unavailable players out of BOTH groups and bench (D-13 reconcile) and
  always emits an entry for every requested groupId. No Supabase, no
  React — unit-testable.
- **AFL reference (`LiveGame` + `QuarterBreak`)** — a "Plan next {period}"
  entry on the live surface, visible only when the derived final-window
  predicate is true AND `!isLastPeriod` (periodPhase). It opens the shared
  `GamePlanModal` seeded via `projectUpcomingRotation(...)` with
  `initialPeriodIndex` = the next period; on pin it writes
  `plannedRotation.nextPeriod*`. `QuarterBreak` seeds its `draft` from
  `seedNextPeriodLineup(...)` when the pin targets this upcoming period and
  marks the seed as the `lastAppliedModeRef` initial applied state so the
  computed `suggestedLineup` does NOT stomp it on mount (D-12); a
  planned-seed banner surfaces (D-15); the pin is cleared after a
  successful start (D-14).
- **Netball mirror (`NetballLiveGame` + `NetballQuarterBreak`)** — the same
  final-window entry (positions are the groupIds) pins `nextPeriod*`;
  `NetballQuarterBreak` seeds its `initialDraft` from the reconciled pin and
  shows the planned-seed banner; the pin clears after the netball start
  commit.
- **Rugby-league mirror (`LeagueLiveGame`)** — league has NO separate break
  component, so both halves live in this file: the live-surface entry pins
  `forwards`/`backs`, and `handleStartNextPeriod` seeds the next-period
  lineup via `recordLeagueLineupSet` on the explicit Start tap
  (auth/RLS-guarded — never auto-commit, T-11-02-B), reconciling unavailable
  players to bench, then clears the pin. The inline between-periods section
  shows the planned-seed banner.

## Task Commits
1. **Task 1: RED cross-sport seed + reconcile spec** — `26f42c5` — `test(11-02): add failing cross-sport next-period seed + reconcile spec`
2. **Task 2: GREEN AFL entry + QuarterBreak pre-seed** — `f72973c` — `feat(11-02): AFL plan-next-period entry + QuarterBreak pre-seed from pinned plan`
3. **Task 3: GREEN netball + league mirror + DoD gates** — `a138270` — `feat(11-02): mirror plan-next-period pre-seed into netball + league`

## Files Created/Modified
**Created**
- `src/lib/__tests__/nextPeriodPlanSeed.test.ts` — 13 tests, `describe.each` over AFL / netball / league groupIds: seed-match (pin returned unchanged when all available), wrong-period (→ null), stale-reconcile (unavailable on-field player dropped, valid teammate stays), purity.

**Modified**
- `src/lib/game-plan/live.ts` — added the pure `seedNextPeriodLineup(...)` helper next to the Wave-1 adapters.
- `src/lib/game-plan/index.ts` — barrel re-export of `seedNextPeriodLineup`.
- `src/components/live/LiveGame.tsx` — final-window "plan next period" entry → shared modal on the next period; pin `nextPeriod*`; planned-next-period badge.
- `src/components/live/QuarterBreak.tsx` — seed `draft` from `seedNextPeriodLineup` when the pin targets this break; lastAppliedModeRef treats the seed as initial applied state; planned-seed banner; `clearPlannedRotation()` after a successful start.
- `src/components/netball/NetballLiveGame.tsx` — netball final-window entry + pin; mounts `NetballQuarterBreak` with the seeded `initialDraft`; clears pin after start.
- `src/components/netball/NetballQuarterBreak.tsx` — seed `initialDraft`/lineup from the reconciled pin; planned-seed banner.
- `src/components/league/LeagueLiveGame.tsx` — live-surface entry + pin (forwards/backs); `handleStartNextPeriod` seeds via `recordLeagueLineupSet` on explicit Start, reconciles to bench, clears pin; planned-seed banner in the inline q-break.
- `e2e/tests/plan-ahead-rotation.spec.ts` — appended the F2 build-next-period test (AFL): backdated clock loads the game in the final window → pin the next period via the shared modal → hooter `Select team for Q2` → assert `planned-seed-banner` at the break.

## Decisions & Deviations
- **Followed the plan** for D-11 → D-15 as specified. No new modal, no new
  store slice, no migration — the only modal touched is the Wave-1
  `GamePlanModal`; the pin lives in the Wave-1 `plannedRotation` slice
  (`nextPeriod*` fields, already in `partialize`). Reuse-before-fork
  honoured.
- **DEV — league two-in-one (no break component).** Unlike AFL/netball,
  league has no dedicated break component, so the consumer half lives in
  `LeagueLiveGame` itself. The seed is applied through the existing
  `recordLeagueLineupSet` action inside `handleStartNextPeriod` — i.e. only
  on the coach's explicit "Start period" tap, never auto-committed (satisfies
  threat T-11-02-B). After the seeded commit the pin is cleared (D-14).
- **DEV — e2e deterministic timing.** The F2 spec backdates the
  `quarter_start` event's `created_at` by 12s on an AFL U10 game configured
  `quarter_length_seconds: 50`, `sub_interval_seconds: 45`,
  `clock_multiplier: 1`. On load the game is already inside the final window
  (entry visible) with ~38s of margin before the hooter auto-fires; the sub
  falls due at ~57s (after the hooter) so the SubDueModal never blocks the
  pin/edit window. The hooter's `QuarterEndModal` CTA "Select team for Q2"
  transitions to the break, where `planned-seed-banner` is asserted.
- **DEV — pre-existing lint warnings (not introduced here).** `npm run lint`
  reports 2 `react-hooks/exhaustive-deps` warnings (NetballLiveGame,
  NetballQuarterBreak). Confirmed pre-existing via `git stash` — the same
  warnings appear on the clean tree, only shifted in line number by the lines
  this plan added. Zero new lint issues introduced.

## DoD Gates
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (0 errors; 2 pre-existing exhaustive-deps warnings, confirmed not introduced by this plan) |
| `npm test` (Vitest) | PASS — `nextPeriodPlanSeed.test.ts` 13/13 green (full suite unchanged otherwise) |
| `npm run e2e` | PASS — `plan-ahead-rotation.spec.ts` 3/3 (setup + F1 + F2) green, `--workers=1` per Phase-9 protocol |
| Schema drift | NONE — no migration, no new GameEventType, no new store slice; persistence via the existing client store + existing RLS-guarded start/lineup_set actions |

## Next Phase Readiness
- **F2 slice complete across all three sports.** Success Criteria #2, #3, #4
  (F2 slice) satisfied: build the next period's lineup during the final
  minutes (#2); via the ONE shared Wave-1 surface, no fork (#3); one-handed
  on the live surface with e2e build-next-period coverage (#4). Criterion #1
  (override the imminent sub) was delivered by plan 11-01.
- **Phase 11 is functionally complete** — both waves landed (11-01 F1,
  11-02 F2). Ready for Phase 11 verification + STATE/ROADMAP completion.
- **Shared seam clean for Phase 12.** Both plans modified `LiveGame.tsx`
  and ran serially (Wave 1 then Wave 2) as planned; no merge conflicts. The
  `plannedRotation` slice now has both producers (F1 `pinnedSwaps`, F2
  `nextPeriod*`) and consumers (AFL/netball/league live + break) wired —
  any future period-planning work extends rather than re-creates this seam.
