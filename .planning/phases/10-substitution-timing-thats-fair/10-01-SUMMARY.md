---
phase: 10-substitution-timing-thats-fair
plan: 01
subsystem: sports-config / fairness
tags: [sub-interval, period-length, fairness, season-diversity, units, pure-function]
provides:
  - deriveSubIntervalSeconds(periodSeconds, floorSeconds) pure helper
  - sub interval derived from period length across all 3 sports
  - WR-01 fix — season-diversity threshold compares minutes-to-minutes
affects: [10-02, phase-11, phase-12, sub-due-timing, lineup-suggester]
tech-stack:
  added: []
  patterns: [pure-function-at-config, red-first-tdd, minutes-vs-ms-unit-discipline]
key-files:
  created:
    - src/lib/sports/subInterval.ts
    - src/lib/__tests__/subInterval.test.ts
    - src/lib/__tests__/seasonDiversityUnits.test.ts
  modified:
    - src/lib/sports/afl/index.ts
    - src/lib/sports/netball/index.ts
    - src/lib/sports/rugby_league/index.ts
    - src/lib/fairness.ts
key-decisions:
  - "D-01: 'even' = clean/evenly-dividing divisor; pick smallest >= floor"
  - "D-02: derive at the config (sport index.ts), not at each call site"
  - "D-03: cadence behaviour changes are intended (AFL 180->240/300, netball 600->300, RL half 600->240)"
  - "D-04: fold the WR-01 unit fix into this plan (Task 3)"
duration: ~40min
completed: 2026-06-02
---

# Phase 10 / Plan 01: Derive sub interval from period length + WR-01 fix

**The sub cadence now falls out of the period length (smallest clean
divisor >= the per-age-group floor) instead of a hand-set literal, and the
season-diversity nudge finally compares minutes to minutes.**

## Performance
- **Duration:** ~40 min
- **Tasks:** 3/3 completed
- **Files modified:** 4 (+3 created)

## Accomplishments
- Added `deriveSubIntervalSeconds(periodSeconds, floorSeconds)` — a pure,
  import-free helper: smallest CLEAN (evenly-dividing) divisor of the
  period that clears the floor; near-even fallback (`round(period/N)`,
  `N = floor(period/floor)`) for indivisible periods; whole-period stint
  when even a 2-way split can't clear the floor.
- Wired it into all three sport configs in place of hand-set literals:
  - AFL: 10/12/15-min groups rise from 180s to the 240–300s derived value
    (240 floor); 20-min groups unchanged at 240.
  - netball: 600 → 300 (240 ∤ 600; next clean divisor is 300).
  - rugby league: half 600 → 240 (1200/240 = 5); quarter unchanged at 240.
- Fixed WR-01: `owed()` compared `seasonMins` (MINUTES) against
  `fullPeriodMs` (MILLISECONDS, ~720000) so the season-diversity bonus
  fired unconditionally for every zone. Now compares against
  `fullPeriodMins = fullPeriodMs / 60000`.

## Task Commits
1. **Task 1: RED specs** - `95e88a8` — `test(10-01): add failing subInterval + season-diversity-units specs`
2. **Task 2: GREEN derive + wire** - `dc2e2b4` — `feat(10-01): derive sub interval from period length (all sports)`
3. **Task 3: GREEN WR-01 fix** - `76b2050` — `fix(10-01): correct season-diversity unit mismatch (WR-01)`

## Files Created/Modified
- `src/lib/sports/subInterval.ts` — pure `deriveSubIntervalSeconds` helper.
- `src/lib/sports/afl/index.ts` — derive cadence from `cfg.quarterSeconds`.
- `src/lib/sports/netball/index.ts` — derive cadence for all 6 age blocks.
- `src/lib/sports/rugby_league/index.ts` — derive QUARTER/HALF sub intervals.
- `src/lib/fairness.ts` — WR-01 minutes-to-minutes threshold.
- `src/lib/__tests__/subInterval.test.ts` — contract/floor/degenerate/
  near-even cases + per-age-group derived-value snapshot (35 cases).
- `src/lib/__tests__/seasonDiversityUnits.test.ts` — single-player
  two-zone WR-01 regression (asserts the under-played zone wins).

## Decisions & Deviations
- Followed the plan as specified (D-01..D-04 honoured).
- **No snapshot ripple:** the WR-01 fix only changes behaviour for season
  totals in [12, 720000) min — a range no existing fairness test uses — so
  the full Vitest suite stayed green (817) with zero snapshot updates. The
  Task 3 commit is the fairness.ts fix alone (no separate snapshot churn).
- **e2e (Phase-9 environmental protocol):** no new e2e spec required (F4 is
  a config/pure-function change) and a grep confirmed NO existing spec
  asserts the derived interval or sub-due timing. As a smoke check of the
  one user-facing ripple (the lineup suggester reads `owed()`), ran
  `live-quarters.spec.ts` + `quarter-break-rotation.spec.ts` in isolation
  (`--workers=1`): **3 passed (35.5s)**, E2E_EXIT=0.

## DoD Gates
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0; only pre-existing exhaustive-deps + `<img>` warnings) |
| `npm test` (Vitest) | PASS (817 tests, 45 files) |
| `npm run e2e` (targeted suggester specs, `--workers=1`) | PASS (3 passed) |
| Schema drift | NONE — no migration (latest unchanged at `0047_track_zone_time.sql`) |

## Next Phase Readiness
- **10-02 (SUB-01/B4 recency guard)** can proceed: it derives `minStintMs`
  from `subIntervalSeconds`, which is now the derived cadence. Both plans
  edit `fairness.ts`, so 10-02 executes serially after this (wave 2).
- WR-01 carry-forward from Phase 9 is now CLOSED.
