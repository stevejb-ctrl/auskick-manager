---
phase: 08-sport-agnostic-period-foundation
plan: 01
status: complete
wave: 1
requirements: [CONFIG-01]
commits:
  - 6b0a02e test(08-...): add failing periodPhase() spec (RED)
  - d467e16 feat(08-...): add pure periodPhase() helper (GREEN)
---

# 08-01 Summary — periodPhase() helper

## Objective achieved

Extracted the last-period / between-periods / full-time boolean logic into ONE
pure, testable helper at `src/lib/live/periodPhase.ts` (D-07), proven
period-count-correct at periodCount=4 (AFL/netball) AND periodCount=2 (rugby
league halves) (D-08). This is the single source of truth that AFL `LiveGame`,
netball `NetballLiveGame`, and the `live/page.tsx` sticky bars will call in
plan 08-03 to replace their hardcoded `currentQuarter >= 4` / `< 4` literals.

## What was built

- `periodPhase(currentPeriod, periodCount, periodEnded, finalised)` →
  `{ isAtFullTime, isBetweenPeriods, isLastPeriod }`.
  - `isLastPeriod = currentPeriod >= periodCount`
  - `isAtFullTime = !finalised && periodEnded && isLastPeriod` (finalised owns
    full-time state — the finished branch handles it)
  - `isBetweenPeriods = periodEnded && currentPeriod >= 1 && currentPeriod < periodCount`
- Pure leaf module: NO store, component, or fairness imports.

## Key files

- created: `src/lib/live/periodPhase.ts` — the pure helper
- created: `src/lib/live/__tests__/periodPhase.test.ts` — 6 cases (periodCount 4
  AND 2, finalised → not-full-time, mid-period non-boundary)

## Decisions honored

- D-07: single pure helper, no store imports, no hardcoded 4.
- D-08: unit-tested at periodCount=4 and periodCount=2 + finalised case.
- D-11: tsc + vitest + lint green.

## TDD gates

- RED: `6b0a02e` — spec committed failing (`Cannot find package '@/lib/live/periodPhase'`).
- GREEN: `d467e16` — helper committed, 6/6 pass.

## Verification

- `npx vitest run src/lib/live/__tests__/periodPhase.test.ts` → 6 passed.
- `npx tsc --noEmit` → exits 0.
- `npm run lint` → no errors (pre-existing warnings only, none in new files).

## Self-Check: PASSED

## Notes for downstream (08-03)

The helper takes `periodCount` positionally; callers must pass
`ageGroup.periodCount`, never the literal 4. The periodCount=2 unit test is the
authoritative proof of the AFL/netball refactor — the rugby-league e2e in 08-04
exercises `LeagueLiveGame` (already periodCount-correct), not these components.
