---
phase: 08-sport-agnostic-period-foundation
plan: 02
status: complete
wave: 1
requirements: [CONFIG-02]
commits:
  - 67ee9e5 test(08-...): require subIntervalFloorSeconds (RED)
  - 58118e8 feat(08-...): set subIntervalFloorSeconds 240 (GREEN)
---

# 08-02 Summary — subIntervalFloorSeconds: 240

## Objective achieved

Added a REQUIRED `subIntervalFloorSeconds: number` field to the sports-config
`AgeGroupConfig` type (D-05), set it to an explicit `240` (4 min) on EVERY
age-group entry across all three sports (D-06), and pinned it with a
sports.test.ts assertion (D-09). Phase 8 only DEFINES the knob; the F4
interval-derivation function that consumes it is Phase 10 (SUB-02).

## What was built

- `src/lib/sports/types.ts`: required `subIntervalFloorSeconds: number` (no `?`,
  no central default constant) placed in the required-field cluster beside
  `subIntervalSeconds`.
- Explicit `240` on every entry:
  - AFL: one line in the generated `aflAgeGroups()` map (covers all AFL ages).
  - Netball: all 6 entries (set, go, 11u, 12u, 13u, open).
  - Rugby league: all 7 entries (U6, U7, U8, U9 quarters; U10, U11, U12 halves).
- `src/lib/__tests__/sports.test.ts`: asserts `subIntervalFloorSeconds === 240`
  for every age group across aflSport / netballSport / rugbyLeagueSport.

## Key files

- modified: `src/lib/sports/types.ts`, `src/lib/sports/afl/index.ts`,
  `src/lib/sports/netball/index.ts`, `src/lib/sports/rugby_league/index.ts`,
  `src/lib/__tests__/sports.test.ts`
- untouched (deliberately, D-06a): `src/lib/ageGroups.ts`

## Decisions honored

- D-05: required field, no central default — the compiler enforces "240 everywhere".
- D-06: explicit 240 on all 1 + 6 + 7 entries.
- D-06a: legacy `ageGroups.ts` interface NOT modified.
- D-09: sports.test.ts asserts 240 across all three sports.
- D-11: tsc + vitest + lint green.

## TDD gates

- RED: `67ee9e5` — required field + assertion committed; tsc failed on all 14
  config literals missing the field.
- GREEN: `58118e8` — all entries filled; tsc clean, assertion passes.

## Verification

- counts: afl 1 / netball 6 / rugby_league 7 (exact), type required field 1,
  legacy `ageGroups.ts` 0.
- `npx tsc --noEmit` → exits 0.
- `npx vitest run src/lib/__tests__/sports.test.ts` → 60 passed.
- `npm test` (full suite) → 43 files / 781 tests passed.
- `npm run lint` → no errors (pre-existing warnings only).

## Self-Check: PASSED
