---
phase: 08-sport-agnostic-period-foundation
reviewed: 2026-06-01T01:12:17Z
depth: deep
files_reviewed: 19
files_reviewed_list:
  - src/lib/live/periodPhase.ts
  - src/lib/live/__tests__/periodPhase.test.ts
  - src/lib/sports/types.ts
  - src/lib/sports/afl/index.ts
  - src/lib/sports/netball/index.ts
  - src/lib/sports/rugby_league/index.ts
  - src/lib/__tests__/sports.test.ts
  - src/components/live/LiveGame.tsx
  - src/components/netball/NetballLiveGame.tsx
  - src/components/live/GameHeader.tsx
  - src/components/live/QuarterEndModal.tsx
  - src/components/live/QuarterBreak.tsx
  - src/components/live/LineupPicker.tsx
  - src/lib/fairness.ts
  - src/lib/game-plan/project.ts
  - src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx
  - src/app/run/[token]/page.tsx
  - src/app/run/[token]/lineup/page.tsx
  - e2e/tests/rugby-league-full-game-playthrough.spec.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-06-01T01:12:17Z
**Depth:** deep (cross-file: periodPhase callers, fairness unit-flow, config builders)
**Files Reviewed:** 19
**Status:** issues_found (1 WARNING, 3 INFO — no BLOCKER)

## Summary

Phase 8 is a careful, well-scoped mechanical de-hardcoding of the `4`
period-count literal onto `ageGroup.periodCount`, plus a new pure
`periodPhase()` helper and a new `subIntervalFloorSeconds` config knob.
I traced the four highest-risk seams the brief flagged and all hold:

1. **Behavior preservation at periodCount=4 — VERIFIED byte-identical.**
   - `periodPhase().isAtFullTime` = `!finalised && periodEnded && currentPeriod >= periodCount`
     reduces to the old `!finalised && currentQuarter >= 4 && quarterEnded` at 4.
   - `isBetweenPeriods` = `periodEnded && currentPeriod >= 1 && currentPeriod < periodCount`
     reduces to the old `quarterEnded && currentQuarter >= 1 && currentQuarter < 4`.
   - `GameHeader` keeps `quarter > periodCount` (was `> 4`); `QuarterEndModal`
     keeps `quarter >= periodCount` (was `>= 4`); netball branches keep
     `>= ageGroup.periodCount` / `< ageGroup.periodCount`. No `>`/`>=` drift.
   - For periodCount=2 the helper is also correct (1-of-2 → between, 2-of-2 → FT),
     and the new RL e2e assertion pins exactly this (H1 boundary must NOT show
     the finalise/full-time CTA).

2. **`fullPeriodMs` default — VERIFIED.** The trailing optional default
   `12 * 60 * 1000` equals the deleted `FULL_QUARTER_MS` exactly, so the ~20
   existing fairness/chipSpread unit callers (which rely on the default and even
   re-declare `FULL_QUARTER_MS = 12*60*1000` in fixtures) stay green unchanged.
   The 3 production callers (`live/page.tsx`, `run/[token]/page.tsx` via
   `quarterMs`, and `game-plan/project.ts` via `periodMinutes * 60_000`) each
   pass a sensible per-game effective ms.

3. **`ageGroup.periodCount` presence — VERIFIED never-undefined.**
   `getAgeGroupConfig()` always returns a valid config (falls back to
   `cfg.ageGroups[0]`); the netball branch resolves with a `?? ...!` fallback;
   `NetballLiveGame` already received `ageGroup: AgeGroupConfig` as a prop
   (line 89) so its new `ageGroup.periodCount` reads are sound. No NaN path.

4. **Config completeness — VERIFIED.** Every `AgeGroupConfig` builder
   (single AFL builder, all 6 netball groups, all 7 RL groups) now sets
   `subIntervalFloorSeconds: 240`, and `sports.test.ts` asserts it across all
   three sports. The new required field would have failed `tsc` if any group
   were missed (tsc reported green).

The one WARNING below is a LATENT, PRE-EXISTING unit inconsistency that this
diff surfaces but does not introduce or worsen — recorded so it isn't lost.

## Warnings

### WR-01: `fullPeriodMs` (ms) is compared against a season total that the production replay path produces in MINUTES — the season-diversity nudge is effectively inert in production

**File:** `src/lib/fairness.ts:616` (and the unit source `gameZoneMinutes` at `src/lib/fairness.ts:151`)

**Issue:**
The threshold line is `const seasonBonus = seasonMins < fullPeriodMs ? SEASON_DIVERSITY : 0;`.
`fullPeriodMs` is milliseconds (default `720000`, production passes `quarterMs`
~`480000`–`720000`). But the production `season` map fed in comes from
`seasonZoneMinutes()` → `gameZoneMinutes()`, which accumulates
`result[pid][zone] += ms / 60000` — i.e. **minutes**. So in production a season
total is a small number (tens to low hundreds of minutes) compared against a
six-figure ms threshold, meaning `seasonMins < fullPeriodMs` is **always true**
and `SEASON_DIVERSITY` is granted unconditionally. The `chipSpread` unit
fixtures, by contrast, feed the season/game maps in **ms** (they literally use
`FULL_QUARTER_MS = 12*60*1000` as a zone value), so the helper behaves
"correctly" only under test.

Critically, this is **NOT a regression introduced by Phase 8**: the deleted
`FULL_QUARTER_MS = 12*60*1000` was compared against the same minutes-valued
`seasonMins` in exactly the same way. Phase 8 only swaps a constant ms value for
a variable ms value; because every plausible `fullPeriodMs` still dwarfs any
realistic season-minutes total, the comparison outcome is unchanged. So the
Phase-8 D-03 goal ("threshold tracks this game's clock") is, in production, a
no-op — the nudge can never flip on either side of any period length.

**Fix:** Out of scope for this mechanical phase, but the unit mismatch should be
closed in the SUB-02 / fairness follow-up. Either (a) compare in a single unit —
divide the threshold to minutes: `seasonMins < fullPeriodMs / 60000` — or (b)
make `gameZoneMinutes` return ms and rename `seasonMins`/`gameMins` accordingly.
Whichever direction is chosen, the `chipSpread` ms-valued fixtures and the
production minutes-valued replay must be reconciled to the same unit, with a
regression test that fails against today's behaviour.

## Info

### IN-01: `seasonMins` / `gameMins` are misnamed — they are not minutes in every path

**File:** `src/lib/fairness.ts:609-610`

**Issue:** The locals are named `gameMins` / `seasonMins`, but `gameZoneMinutes`
stores minutes while the chipSpread fixtures supply ms — the names assert a unit
the code does not uniformly honour. Pre-existing; this diff touches the
surrounding line so it is worth a rename when WR-01 is addressed.

**Fix:** Rename to a unit-explicit identifier (e.g. `seasonZoneTotal`) once the
unit is unified, so the comparison's intent is self-documenting.

### IN-02: `periodPhase()` JSDoc cites `LeagueLiveGame.tsx:1222-1239` as the reference impl, but `LeagueLiveGame` was NOT refactored to call the helper

**File:** `src/lib/live/periodPhase.ts:2-4`

**Issue:** The new helper centralises period-boundary logic for AFL/netball, but
`LeagueLiveGame.tsx` (lines 1226-1231) still computes `isBetweenPeriods` /
full-time inline against `ageGroup.periodCount`. The two are logically
equivalent today, so this is not a bug — but it leaves two sources of truth that
the docstring claims is one. The cited line range is also now stale.

**Fix:** Either wire `LeagueLiveGame` through `periodPhase()` in the SUB-02
follow-up (preferred — kills the duplication the helper was created to retire),
or soften the docstring to "modelled on LeagueLiveGame's inline logic" and drop
the brittle line numbers.

### IN-03: `LiveGame` now receives both `ageGroup` and the redundant scalars (`quarterMs`, `subIntervalSeconds`, `positionModel`, `defaultOnFieldSize`) it could read off `ageGroup`

**File:** `src/components/live/LiveGame.tsx:217-219`

**Issue:** The prop comment explicitly acknowledges this (D-01b: "collapsing the
redundancy is deferred"). Passing both a config object and scalars derived from
it invites drift where a caller computes `quarterMs` from a different age group
than the `ageGroup` object it passes. Not a defect in this diff (both come from
the same `ageCfgSport` at the call sites), but a maintenance hazard.

**Fix:** As planned, collapse the scalars into `ageGroup` reads in the deferred
D-01b cleanup so there is a single config source per mount.

---

_Reviewed: 2026-06-01T01:12:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
