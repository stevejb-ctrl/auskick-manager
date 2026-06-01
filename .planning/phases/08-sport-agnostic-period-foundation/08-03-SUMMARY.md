---
phase: 08-sport-agnostic-period-foundation
plan: 03
status: complete
wave: 2
requirements: [CONFIG-01]
commits:
  - 1d6acd2 feat(08-...): derive period count from ageGroup across AFL/netball live surfaces (CONFIG-01)
---

# 08-03 Summary — period-count literals → ageGroup.periodCount (AFL/netball live)

## Objective achieved

Removed every hardcoded period-count `4` from the shared AFL/netball live
surfaces and the two shared sticky bars, deriving period structure from
`ageGroup.periodCount` via the `periodPhase()` helper (plan 08-01). AFL
`LiveGame.tsx` now takes the full `ageGroup: AgeGroupConfig` object (D-01),
matching netball/league which already did. `LeagueLiveGame.tsx` stays the
reference implementation; AFL/netball now mirror it. Behaviour is
byte-for-byte identical at `periodCount=4` — proven by the periodPhase
`periodCount=4` unit test (08-01) and the existing AFL/netball period-boundary
e2e specs, which stay green.

## What was built

- `src/components/live/LiveGame.tsx`: added `ageGroup: AgeGroupConfig` prop +
  `periodPhase` import; replaced the `isAtFullTime`/`isBetweenQuarters`
  booleans with a single `periodPhase(currentQuarter, ageGroup.periodCount,
  quarterEnded, finalised)` call (D-07). Scalar props (`quarterMs`,
  `subIntervalSeconds`, `positionModel`, `defaultOnFieldSize`) retained —
  collapsing deferred (D-01b). Threaded `periodCount={ageGroup.periodCount}`
  into the `<QuarterEndModal>` mount and the `<GameHeader>` mount.
- `src/components/netball/NetballLiveGame.tsx`: Option B minimal inline swap —
  all 3 render gates (`>= 4` ×2, `< 4` ×1) now read `ageGroup.periodCount`
  (already a prop). Semantics byte-identical for a 4-quarter config.
- `src/components/live/QuarterEndModal.tsx`: new `periodCount: number` prop;
  `isLastQuarter = quarter >= periodCount`. AFL "Q"/"Quarter" LABEL wording
  ("Quarter {quarter} complete", "Ready for Q{n+1}?", "Select team for Q{n+1}")
  preserved verbatim — conscious exclusion.
- `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx`: `<LiveGame>`
  mount now passes `ageGroup={ageCfgSport}`; netball sticky bar reads
  `ageCfgN.periodCount`, AFL sticky bar reads `ageCfgSport.periodCount`.
- `src/app/run/[token]/page.tsx` (DEVIATION — see below): AFL share-token
  `<LiveGame>` mount now passes `ageGroup={ageCfgSport}`.
- `src/components/live/GameHeader.tsx` (DEVIATION — see below): new
  `periodCount: number` prop; `quarter > 4` "FT" label guard → `quarter >
  periodCount`.

## Key files

- modified (in plan): `src/components/live/LiveGame.tsx`,
  `src/components/live/QuarterEndModal.tsx`,
  `src/components/netball/NetballLiveGame.tsx`,
  `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx`
- modified (deviation): `src/app/run/[token]/page.tsx`,
  `src/components/live/GameHeader.tsx`

## Deviations from plan (files_modified not enumerated)

1. **`src/app/run/[token]/page.tsx`** — The recon enumerated only the
   team-coach `live/page.tsx` `<LiveGame>` mount. The share-token *runner*
   page has a THIRD `<LiveGame>` mount (the AFL parent-runner path, ~:548).
   Once LiveGame's `ageGroup` prop became required (Task 1), `tsc` flagged
   this mount (`TS2741: Property 'ageGroup' is missing`). Fix: pass
   `ageGroup={ageCfgSport}` (already resolved at :503). The netball/league
   runner mounts already passed `ageGroup`. Mandatory to keep tsc green.

2. **`src/components/live/GameHeader.tsx`** — A residual `quarter > 4` guard
   drives the "FT" clock label (`isFinished || quarter > 4`). The plan's
   Task 5 gate pattern `(currentQuarter|quarter) (>=|<) 4` does not match the
   `>` operator, so it slipped the literal-survival gate — but it is a
   period-COUNT literal in a SHARED live surface, and it is NOT one of the
   plan's enumerated conscious exclusions (only QuarterEndModal labels and
   `liveGameStore.ts QUARTER_MS` are). Leaving it would be a true gap against
   the CONFIG-01 phase goal ("no live surface hardcodes the number 4"). Fix:
   added a `periodCount: number` prop (mirroring the existing `quarterMs`
   scalar-prop pattern), threaded `ageGroup.periodCount` from the LiveGame
   mount, and changed the guard to `quarter > periodCount`. Defensive-guard
   semantics preserved byte-for-byte at periodCount=4. This mirrors how the
   plan itself folded in QuarterEndModal as a "missed-recon residual" (Task 4).

## Decisions honored

- D-01: LiveGame takes the full `ageGroup: AgeGroupConfig` object.
- D-01a: live/page.tsx threads `ageCfgSport` into the `<LiveGame>` mount.
- D-01b: LiveGame scalar props kept (no collapsing).
- D-07: isAtFullTime/isBetweenQuarters derive from `periodPhase()`.
- CONFIG-01: no period-count `4` literal survives in the shared AFL/netball
  live surfaces (incl. QuarterEndModal `>= 4` and GameHeader `> 4`).
- Conscious exclusions preserved: QuarterEndModal AFL "Q"/"Quarter" labels;
  `liveGameStore.ts QUARTER_MS` (period-LENGTH constant, not a COUNT).

## TDD note

Tasks 1–4 are behaviour-preserving refactors (byte-identical at
periodCount=4), so coverage is the EXISTING tests, not a new red-first test:
the periodPhase `periodCount=4` unit test (08-01) pins the boolean logic, and
the AFL/netball period-boundary e2e specs pin the end-to-end behaviour. No new
unit test was warranted; no behaviour bug surfaced.

## Verification

- `npx tsc --noEmit` → exits 0.
- `npm run lint` → exits 0 (pre-existing warnings only).
- `npm test` (Vitest) → 43 files / 781 tests passed.
- `npm run e2e` (period-boundary specs):
  - `live-full-time.spec.ts`, `live-quarters.spec.ts`,
    `netball-quarter-break.spec.ts` → all PASS (the 3 plan-mandated specs).
  - `quarter-break-rotation.spec.ts` → flaked once under parallel load
    (4 workers, tight 3s modal-hide timeout after a server-action round-trip;
    the config notes Supabase-startup flakiness and retries twice in CI).
    Verified NOT a regression via stash comparison: passes in isolation on
    BOTH HEAD (12.5s) and the 08-03 code (11.9s). Refactor is byte-identical
    at periodCount=4, so it cannot have changed this behaviour.
- Literal-survival gate (plan Task 5 pattern, expecting 0):
  `grep -rnE "(currentQuarter|quarter) (>=|<) 4" src/components/live/ src/components/netball/`
  → 0. Broadened sweep (also catches `>`/`<=`) across both component dirs → 0.

## Self-Check: PASSED
