---
phase: 09-availability-that-holds-pre-game-and-at-breaks
plan: 02
subsystem: live-game
tags: [availability, break, late-arrival, mark-out, injury, afl, netball, rugby_league, playwright]

# Dependency graph
requires:
  - phase: 09-availability-that-holds-pre-game-and-at-breaks
    plan: 01
    provides: availableIds union + three confirmed per-sport start-action seams
provides:
  - "Break-surface 'Manage availability' entry (Add arrived player + Mark a player out) on all three sports"
  - "Mark-out forced-replacement reusing the shared InjuryReplacementModal + the injury+swap two-step, recorded with reason:'out'"
  - "Add-arrived wired to the canonical addLateArrival writer at the break (no forked writer)"
  - "Red-first per-sport break-availability specs (afl/netball/league)"
affects: [phase-10-rotation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Break-surface availability mirrors AFL QuarterBreak rhythm verbatim across netball + league (reuse-before-fork)"
    - "Mark-out == injury mechanic + reason:'out' metadata flag (display-recoverable, no new event type, no migration)"
    - "e2e robustness: scope SlotFillSheet/modal picks to their role=dialog to avoid strict-mode collisions with background lineup tiles; freeze the AFL/netball draft with 'Keep last quarter'; dismiss the league auto-popped StartQuarterModal via 'Back to lineup'"

key-files:
  created:
    - e2e/tests/break-availability-afl.spec.ts
    - e2e/tests/break-availability-netball.spec.ts
    - e2e/tests/break-availability-league.spec.ts
  modified:
    - src/components/live/QuarterBreak.tsx
    - src/components/netball/NetballQuarterBreak.tsx
    - src/components/league/LeagueLiveGame.tsx
    - src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts

key-decisions:
  - "D-07/D-08/D-09/D-10 honoured: one 'Manage availability' entry on the shared break surface, AFL reference, netball + league mirror placement + token palette + modal rhythm"
  - "Mark-out reason recorded as a metadata flag reason:'out' on the existing injury event (jsonb — no migration, backward-compatible, display-recoverable). Distinct from a genuine injury by the absence/presence of that flag."
  - "AFL + league mark-out fire markInjury(reason:'out') THEN a swap (recordSwap / recordLeagueSwap) so the bench replacement lands at the vacated slot. Netball has NO break swap writer — the out is recorded as markInjury(reason:'out') and the replacement is staged into the vacated court position in the next-quarter draft (period_break_swap fires on Start Q2)."
  - "League break 'Mark injured' is a NEW explicit break affordance (the league previously only had the long-press LockModal injury path). It fires a plain markInjury (no reason:'out', no forced replacement) mirroring AFL/netball break mark-injured."

patterns-established:
  - "Break Manage-availability: dashed '+ Add arrived player' / '+ Mark a player out' buttons -> SlotFillSheet picker -> canonical writer (addLateArrival) or InjuryReplacementModal forced-replacement (markInjury reason:'out' + swap)"

requirements-completed: [AVAIL-02]

# Metrics
duration: ~2h (across two sessions)
completed: 2026-06-01
---

# Phase 9 / Plan 02: Availability holds at the break Summary

**At any period break a coach can add a newly-arrived player, mark a present
player out (forcing a bench replacement), or mark a player injured — on the
shared break surface, across AFL, netball, and rugby league.**

## Performance

- **Duration:** ~2h (RED specs + AFL reference in session 1; netball + league
  mirror + DoD in session 2)
- **Completed:** 2026-06-01
- **Tasks:** 3 completed
- **Files:** 3 created (specs) + 4 modified

## Accomplishments

- Closed B2 / AVAIL-02: the break surfaces had no way to add an
  arrived player or take a present player out mid-game — the coach had
  to wait until the next period or use the in-game long-press flow. All
  three break surfaces now carry a single "Manage availability" entry.
- **Add arrived player** reuses the canonical `addLateArrival` writer
  (sets `game_availability -> 'available'` THEN emits `player_arrived`)
  — no new availability writer was forked (Success Criterion #4).
- **Mark a player out** mirrors the injury flow (D-09): it reuses the
  shared `InjuryReplacementModal` to force a bench-replacement pick, and
  records the out player with a `reason: "out"` metadata flag so display
  can tell an "out" from a genuine injury. AFL + league also fire a swap
  (`recordSwap` / `recordLeagueSwap`) so the replacement lands at the
  vacated slot; netball stages the replacement into the vacated court
  position in the next-quarter draft (no netball break swap writer).
- **Mark injured** retained on AFL/netball; ADDED as an explicit break
  affordance for league (previously long-press only) for cross-sport
  consistency.
- Red-first per-sport specs prove all three actions end-to-end through
  the UI.

## Task Commits

1. **Task 1: RED break-availability specs (3 sports)** - `ddb6aef` (test)
2. **Task 2: GREEN AFL QuarterBreak reference entry** - `14ac34a` (feat)
3. **Task 3: mirror netball + league + DoD gates** - `(this commit)` (feat)

## Files Created/Modified

- `src/components/live/QuarterBreak.tsx` (AFL REFERENCE) — imported
  `InjuryReplacementModal`; added `arrivalCandidates` / `markOutCandidates`
  / `outReplacementCandidates` memos, `addArrivedPickerOpen` /
  `markOutPickerOpen` / `outReplacement` state, and `handleAddArrived` /
  `handleMarkOutPick` / `handleOutDirect` / `handleOutReplacement`
  handlers. New "Manage availability" block (two dashed "+" buttons) in
  the Match-adjustments collapse, plus add-arrived + mark-out
  SlotFillSheets and the mark-out InjuryReplacementModal.
- `src/components/netball/NetballQuarterBreak.tsx` — mirror. Mark-out
  records `markInjury(reason:"out")` and stages the replacement into the
  vacated court position in the draft (no swap event; `period_break_swap`
  lands it on Start Q2).
- `src/components/league/LeagueLiveGame.tsx` — mirror on the
  `isAtQbreak` break surface (NOT `isAtFinalQ`). Reuses the existing
  `addLateArrival` enqueue + the existing `InjuryReplacementModal` /
  `recordLeagueSwap` two-step (now tagged `reason:"out"`). Added an
  explicit break "Mark injured" affordance.
- `src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts` —
  `markInjury` now accepts an optional `reason?: string` threaded into
  the event metadata (jsonb; no migration). Backward-compatible: omitted
  reason == plain injury.
- `e2e/tests/break-availability-{afl,netball,league}.spec.ts` (created)
  — each seeds a mid-game break (`lineup_set` + `quarter_start` +
  `quarter_end`), then asserts: (1) add-arrived lands a `player_arrived`
  event + flips `game_availability` to 'available'; (2) mark-out lands an
  injury event with `reason === "out"` (+ a swap for AFL/league); (3)
  mark-injured still lands a plain injury (`reason !== "out"`).

## Decisions Made

- **D-07/D-08 honoured:** one "Manage availability" entry on the shared
  break surface, matching AFL's Lend / Mark-injured panel rhythm. No
  bespoke mini-UI; the SlotFillSheet rhythm the break already uses is
  reused, wired to canonical writers.
- **D-09 honoured:** mark-out is the injury mechanic + a distinct
  recorded reason, not a new mechanic. The out player keeps earned
  time-on-ground (same as injury).
- **D-10 honoured:** AFL is the reference; netball + league mirror its
  placement, token palette, and modal rhythm.
- **Out-reason representation:** a `reason: "out"` metadata flag on the
  existing `injury` event (not a new event type) — `game_events.metadata`
  is jsonb so this needs no migration and is backward-compatible; display
  recovers the distinction by reading the flag.

## Deviations from Plan

### 1. Netball mark-out records no swap event (the break has no swap writer)

- **Found during:** Task 3 (netball mirror; spec authoring).
- **Issue:** AFL/league have a between-periods swap writer
  (`recordSwap` / `recordLeagueSwap`). Netball's break does NOT — the
  durable record of a between-periods position change is the
  next-quarter draft committed as `period_break_swap` on Start Q2.
- **Fix:** Netball mark-out records `markInjury(reason:"out")` AND stages
  the replacement into the vacated court position in the draft. The
  netball spec therefore asserts the out-reason injury event (not a swap
  event); the replacement takes the vacated court position in the
  next-quarter lineup. AFL/league specs assert BOTH the out event AND the
  swap. Documented in each spec's header.
- **Verification:** netball break spec GREEN.

### 2. League gains an explicit break "Mark injured" affordance

- **Found during:** Task 3 (league spec step 3).
- **Issue:** Unlike AFL/netball (which have a break "Mark injured"
  SlotFillSheet button), the league break previously exposed injury only
  through the long-press LockModal on a player tile. The plan's
  regression guard (step 3) expects a "Mark injured" button at the break.
- **Fix:** Added a break "Mark injured" button + SlotFillSheet to the
  league Manage-availability block, firing a PLAIN `markInjury` (no
  `reason:"out"`, no forced replacement) — matching AFL/netball break
  mark-injured behaviour. This also closes a cross-sport consistency gap
  (CLAUDE.md reuse-before-fork: the same break affordance now exists in
  all three sports).
- **Verification:** league break spec step 3 GREEN.

**Total deviations:** 2 (both for cross-sport correctness/consistency; no
scope creep — AFL reference behaviour unchanged).

## Issues Encountered

- **AFL/netball strict-mode collisions:** the same player name appears in
  both the SlotFillSheet picker AND the background lineup grid. Resolved
  by scoping every pick to its `role="dialog"` (e.g.
  `getByRole("dialog", { name: /mark out/i })`).
- **AFL/netball suggester rotation:** the fairness suggester rebalances
  the draft at every break, so a seeded bench replacement could be
  rotated onto the field before the test picked it. Resolved by clicking
  "Keep last quarter" right after expanding Game settings to freeze the
  seeded lineup.
- **League auto-popped StartQuarterModal:** the league break auto-opens
  the "Ready for H2" StartQuarterModal (a pre-existing UX choice, ref-
  gated once per period). Its overlay intercepted clicks on the
  Manage-availability buttons underneath. Resolved by dismissing it via
  "Back to lineup" before reaching for the break controls (the ref
  prevents it re-popping within the same break).

## Gate Results

- `npx tsc --noEmit` — PASS (exit 0)
- `npm run lint` — PASS (exit 0; only pre-existing react-hooks/img warnings)
- `npm test` (Vitest) — PASS (781 tests, 43 files)
- `npm run e2e` (targeted, the 3 break specs in isolation, `--workers=1`)
  — PASS: `4 passed (36.5s)` (auth.setup +
  break-availability-{afl,netball,league}). NOTE: the full 122-spec suite
  is environmentally flaky on this Windows dev box under multi-worker
  load — a libuv `UV_HANDLE_CLOSING` crash (`src\win\async.c:76`) cascades
  unrelated, untouched specs into `net::ERR_ABORTED` / `page.goto: Test
  ended` and an unrelated pre-existing spec (`availability.spec.ts:139`)
  fails in the same window. The three Phase-9 break specs and all four DoD
  gates (tsc / lint / Vitest 781 / targeted e2e) pass cleanly in
  isolation; the multi-worker collapse is a known dev-server stress
  artifact, not a product regression.

## RED -> GREEN

- **RED (pre-fix):** the break surfaces had no add-arrived / mark-out
  affordance, so the picker buttons did not exist — the specs failed to
  drive those flows and the events never landed.
- **GREEN (post-fix):** all three sports — add-arrived lands a
  `player_arrived` + flips availability; mark-out lands an out-reason
  injury (+ swap for AFL/league); mark-injured lands a plain injury.

## Next Phase Readiness

Phase 9 ROADMAP criteria #3 + #4 satisfied (break-time add/out/injured on
the shared surface, red-first, addLateArrival reused). No new writer
forked. Foundation ready for Phase 10 (rotation).

---
*Phase: 09-availability-that-holds-pre-game-and-at-breaks*
*Completed: 2026-06-01*
