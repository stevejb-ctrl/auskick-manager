---
phase: 09-availability-that-holds-pre-game-and-at-breaks
plan: 01
subsystem: live-game
tags: [availability, lineup, kickoff, afl, netball, rugby_league, supabase, playwright]

# Dependency graph
requires:
  - phase: 08-sport-agnostic-period-foundation
    provides: sport-agnostic live-game foundation + three per-sport start actions
provides:
  - "Shared reconcileLineupToAvailability helper (server-side availableIds union + recursive lineup filter)"
  - "All three start actions (startGame/startNetballGame/startLeagueGame) reconcile the kickoff lineup against availability"
  - "Client picker-hydration filter so unavailable players visibly drop off the field at picker load (all 3 sports)"
  - "Red-first cross-sport regression spec: set unavailable -> start -> assert absent from lineup_set"
affects: [09-02-break-availability, phase-10-rotation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single shared union impl (reuse-before-fork) consumed by all 3 sport start actions — no per-sport drift"
    - "Recursive structural lineup filter handles flat zone arrays (AFL/league) AND nested positions map (netball) with one function"

key-files:
  created:
    - src/lib/live/reconcileLineupToAvailability.ts
    - e2e/tests/availability-honoured-at-kickoff.spec.ts
  modified:
    - src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts
    - src/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions.ts
    - src/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions.ts
    - src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx

key-decisions:
  - "D-04 honoured: silent auto-remove (no prompt) — vacated spots left empty for the normal rotation to fill"
  - "D-05 honoured: server-side reconciliation is authoritative; client picker filter is UX-only"
  - "Generic helper signature deviated from the plan's `<T extends Record<string, string[]>>` to a recursive structural filter, because netball's GenericLineup nests court positions under `.positions` (not a flat string[] map)"

patterns-established:
  - "reconcileLineupToAvailability(supabase, gameId, lineup): one union + filter for all sports"
  - "filterLineupToAvailable(lineup, availableIds) in page.tsx: synchronous client-side echo of the server filter"

requirements-completed: [AVAIL-01]

# Metrics
duration: ~50min
completed: 2026-06-01
---

# Phase 9 / Plan 01: Availability holds at kickoff Summary

**A player marked unavailable pre-game can no longer start the game — the kickoff lineup is reconciled against availability server-side across AFL, netball, and rugby league.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-06-01
- **Tasks:** 3 completed
- **Files modified:** 4 (+2 created)

## Accomplishments

- Closed B1 / AVAIL-01: the three per-sport start actions used to commit
  whatever lineup the client sent (a stale draft could seed an
  unavailable player onto the field, bypassing the correct availability
  write). They now strip any id not in the server-computed availableIds
  union before the `lineup_set` insert.
- Extracted ONE shared `reconcileLineupToAvailability` helper so the
  union semantics (game_availability 'available' rows + game_fill_ins +
  player_arrived events) cannot drift between sports (reuse-before-fork,
  CLAUDE.md).
- Added the client-side picker-hydration filter in all three
  `live/page.tsx` branches so the coach SEES the unavailable player drop
  off the field when the picker loads (UX; correctness is server-side).
- Red-first cross-sport regression spec proving the fix.

## Task Commits

1. **Task 1: RED regression spec (3 sports)** - `0404347` (test)
2. **Task 2: GREEN reconcile helper + wire 3 start actions** - `eb4289d` (feat)
3. **Task 3: client picker filter (UX) + SUMMARY** - `<TASK3_SHA>` (feat)

## Files Created/Modified

- `src/lib/live/reconcileLineupToAvailability.ts` (created) — `buildAvailableIds`
  (the union) + `reconcileLineupToAvailability` (recursive structural
  filter). Recurses so it covers AFL/league flat zone arrays AND
  netball's nested `positions` map with one impl.
- `live/actions.ts` (AFL `startGame`) — reconcile between `clampOnFieldSize`
  and the `lineup_set` insert; commits the filtered lineup.
- `live/netball-actions.ts` (`startNetballGame`) — same, filtered
  `GenericLineup` in `metadata.lineup`.
- `live/league-actions.ts` (`startLeagueGame`) — reconcile reassigns
  `lineup` BEFORE the vest pre-flight (`fieldSet` build) so the
  pre-flight validates the post-reconcile field set, not the stale one.
- `live/page.tsx` — `filterLineupToAvailable` helper + applied to the
  hydrated draft in all three sport branches (AFL `initialDraft`, league
  `initialDraft`, netball `netballDraft`). PLUS a netball-only
  `backfillNetballCourt` helper: after the filter vacates a NAMED court
  position, it refills the open targeted slot(s) from the available
  bench so the lineup stays startable (see Deviation #2).
- `e2e/tests/availability-honoured-at-kickoff.spec.ts` (created) — 3
  sport tests; seed a draft placing X on field, mark X unavailable,
  drive the picker kickoff, assert X absent from the latest `lineup_set`
  metadata (and not rendered as an on-field tile for AFL).

## Decisions Made

- **D-01..D-06 honoured.** D-04 silent auto-remove (no prompt). For
  AFL/league the vacated zone-array spot is simply left empty (the
  array shortens; the picker is still startable). For NETBALL the
  vacated slot is a NAMED court position and an empty named position
  blocks `validateNetballLineup` at kickoff, so D-04's "the normal
  rotation fills the vacated spot" is realised concretely: the open
  court slot is silently backfilled from the available bench (still no
  prompt — see Deviation #2). D-05 server-authoritative + client UX
  echo. D-06:
  the `/run/[token]` path renders the SAME pickers (e.g.
  `LeagueLineupPicker` at `run/[token]/page.tsx:278`) which call the
  SAME `startGame`/`startNetballGame`/`startLeagueGame` actions — so the
  server-side reconciliation covers the token path for free. No
  token-specific code path was forked.

## Run-token coverage note (D-06)

The run-token mount (`src/app/run/[token]/page.tsx`) does NOT have its
own kickoff path: it renders the same pre-kickoff pickers as the
signed-in `/live` page, and those pickers call the same three start
actions. The token path uses the admin client (RLS bypassed) but reads
the same `game_availability` / `game_fill_ins` / `game_events` tables,
yielding the same availableIds union. The Task-2 server fix therefore
protects the token path with no fork (threat T-09-03 mitigated).

## Deviations from Plan

### 1. Helper generic signature — recursive filter instead of flat `Record<string, string[]>`

- **Found during:** Task 2 (wiring the helper).
- **Issue:** The plan's reference impl typed the helper as
  `<T extends Record<string, string[]>>` and iterated top-level keys as
  `string[]`. That is correct for AFL `Lineup` and league `LeagueLineup`,
  but netball's `GenericLineup` is `{ positions: Record<string,
  string[]>, bench: string[] }` — `positions` is a nested OBJECT, not a
  `string[]`. The flat impl would not have filtered the netball court
  positions (and would have mistyped).
- **Fix:** Implemented `reconcileLineupToAvailability<T>` with a
  recursive `filterValue` that filters `string[]` arrays in place and
  descends into object values. One impl, all three sports, no per-sport
  branching. Same recursion mirrored in the client `filterLineupToAvailable`.
- **Verification:** All three e2e sport tests go green, including
  netball (X seeded at `gs` is dropped from the committed lineup).
- **Committed in:** `eb4289d`.

### 2. Netball client filter must backfill the vacated court slot, not leave it empty

- **Found during:** Task 3 (full-suite e2e gate; reproduced in isolation).
- **Issue:** The plan's client filter just strips the unavailable id.
  For AFL/league a stripped id shortens a flat zone array and the
  picker is still startable. For NETBALL the stripped id leaves a NAMED
  court position empty, and `validateNetballLineup`
  (`src/lib/sports/netball/index.ts`) requires `filledCount >= target`
  — so `handleOpenStartModal` in `NetballLineupPicker` set an error
  ("Need 7 players on court — 1 position is empty") and never opened
  the Start-Q1 modal. The netball e2e test therefore TIMED OUT waiting
  for the "Start Q1" button (not flakiness — it reproduced 100% in
  isolation once Task 3's filter was in place).
- **Fix:** Added `backfillNetballCourt(lineup, courtPositions,
  availableIds)` in `page.tsx`. After the filter, it walks the targeted
  court positions in canonical order and fills each now-empty slot from
  the available bench (then any available id not yet on court),
  removing the placed players from the bench. This is D-04's "normal
  rotation fills the vacated spot" rule applied to netball's
  named-position model — still SILENT (no prompt), and the coach can
  rearrange before kickoff. AFL/league keep the leave-empty behaviour
  (their arrays don't have named slots to block on).
- **Verification:** `availability-honoured-at-kickoff.spec.ts` all 3
  sports green in isolation (netball: the bench player backfills GS,
  the lineup completes at 7-on-court, kickoff commits, X absent from
  `lineup_set`). tsc + lint + Vitest all green.
- **Committed in:** Task 3 commit (this commit).

**Total deviations:** 2 (both necessary for netball correctness; no
scope creep — AFL is the reference and stays unchanged in behaviour).

## Issues Encountered

- The RL picker CTA is "Ready for H1" (U10 plays halves), not "Ready for
  half 1" — the spec's button regex was corrected to
  `/^ready for (h1|half 1|q1)$/i` during the RED step. Resolved before
  committing the red spec.

## Gate Results

- `npx tsc --noEmit` — PASS (exit 0)
- `npm run lint` — PASS (exit 0; only pre-existing react-hooks warnings)
- `npm test` (Vitest) — PASS (781 tests, 43 files)
- `npm run e2e` (full suite) — PASS (116 passed, 3 skipped pre-existing
  fixmes; new `availability-honoured-at-kickoff.spec.ts` 3/3 green). Note:
  the 4-worker default tripped a Windows-only libuv/`UV_HANDLE_CLOSING`
  dev-server crash this session; re-running at `--workers=2` was stable
  and authoritative. The new spec also verified in isolation at
  `--workers=1` (4 passed).

## RED -> GREEN

- **RED (pre-fix):** all three sport tests failed at
  `expect(ids).not.toContain(X.id)` — X was present in the committed
  `lineup_set` (AFL `back[0]`, netball `gs`, RL `forwards[0]`).
- **GREEN (post-fix):** all three pass — X is stripped server-side.

## Next Phase Readiness

09-02 (break-time availability) builds on the same availableIds union
and break surfaces; this plan's shared helper + the confirmed
three-start-action seam are the foundation. No blockers.

---
*Phase: 09-availability-that-holds-pre-game-and-at-breaks*
*Completed: 2026-06-01*
