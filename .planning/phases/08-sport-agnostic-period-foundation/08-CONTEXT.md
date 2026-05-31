# Phase 8: Sport-agnostic period foundation - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Drive all live-game period logic and the sub-interval floor entirely from
age-group config — no AFL-hardcoded period literals remain in the shared
live surfaces, and every age-group config exposes a `subIntervalFloorSeconds`
that downstream sub-timing work (F4, Phase 10) can read.

**In scope (CONFIG-01 + CONFIG-02):**
- Replace hardcoded period-count literals (`currentQuarter >= 4` / `< 4`,
  `FULL_QUARTER_MS`) with values derived from `periodCount` / `periodSeconds`.
- Add a `subIntervalFloorSeconds` field to the `AgeGroupConfig` type and set it
  on every age-group entry across all three sports.

**Explicitly NOT in scope (lands later):**
- The F4 interval-derivation function `(periodSeconds, floor) → interval`
  (smallest even divisor) — **Phase 10 (SUB-02)**. Phase 8 only DEFINES the
  floor field; it does not consume it.
- B4 recency / per-player last-sub signal — **Phase 10**.
- Any change to how scalar props are derived beyond what CONFIG-01 requires.

</domain>

<decisions>
## Implementation Decisions

### AFL `LiveGame.tsx` — how period structure is threaded in (NOT discussed; recommended default applied)
- **D-01:** Thread the full `ageGroup` (`AgeGroupConfig`) object into
  `src/components/live/LiveGame.tsx` as a new prop, matching
  `NetballLiveGame.tsx` (already takes `ageGroup`) and `LeagueLiveGame.tsx`
  (the reference). Read `periodCount` / `periodSeconds` off it. This is the
  CLAUDE.md cross-sport-consistency choice — all three live components consume
  the same config shape.
- **D-01a:** The server already resolves this object —
  `ageCfgSport = getAgeGroupConfig("afl", ageGroup)` at `live/page.tsx:603`,
  and already passes it to QuarterBreak at `live/page.tsx:845`. Thread the same
  value into `<LiveGame ageGroup={ageCfgSport} … />`.
- **D-01b:** Keep `LiveGame`'s existing derived scalar props (`quarterMs`,
  `subIntervalSeconds`, `positionModel`, `defaultOnFieldSize`) as-is this phase.
  Do NOT rip them out — collapsing the redundancy is a deferred cleanup. (User
  left this area on the recommended default, so the implementer has discretion:
  if threading the full object proves awkward, a single `periodCount: number`
  scalar prop is an acceptable fallback — but the object is preferred.)

### fairness.ts full-period threshold — which period length feeds it
- **D-02:** `FULL_QUARTER_MS = 12 * 60 * 1000` (`src/lib/fairness.ts:601`, used
  at `:607`) is a SEASON threshold inside `suggestStartingLineup` — "has this
  player logged ≥ one full period in this zone all season?". Replace the
  hardcoded literal with a value derived from period length.
- **D-03:** **Use the per-game EFFECTIVE quarter length**, not the age-group
  default. Production callers feed
  `getEffectiveQuarterSeconds(team, ageGroup, game) * 1000` (already computed as
  `quarterMs` in the live path). Consequence the user explicitly accepted: the
  season diversity threshold now tracks THIS game's actual clock — including
  per-game / per-team overrides (finals, short games) — rather than a fixed
  12 min. This is the deliberate choice over "age-group default" and "fixed".
- **D-04:** Mechanism = add a **trailing optional param** to
  `suggestStartingLineup` (e.g. `fullPeriodMs: number = 12 * 60 * 1000`) so the
  ~20 existing unit-test callers stay green unchanged; the production call
  site(s) pass the effective per-game ms. (User did not pick "required param
  everywhere"; optional-with-back-compat-default is the mechanism, per-game
  effective length is the value.)
- **D-04a:** Only the single `FULL_QUARTER_MS` occurrence at `fairness.ts:601`
  is in Phase 8 scope. `suggestSwaps` (`:839`) cumulative-minutes ranking is a
  separate concern owned by B4 / Phase 10 — do not touch it here.

### `subIntervalFloorSeconds` — shape, value, and scope
- **D-05:** Add `subIntervalFloorSeconds: number` as a **REQUIRED** field on
  `AgeGroupConfig` (`src/lib/sports/types.ts:73-126`) — not optional, and **no
  central default constant**. Every age-group entry carries its own explicit
  value (the user's choice over "optional field + central default").
- **D-06:** Set the value to **`240`** (4 min) on every age-group entry across
  all three sports:
  - **AFL** — add `subIntervalFloorSeconds: 240` to the object returned by
    `aflAgeGroups()` (`src/lib/sports/afl/index.ts:40-54`). AFL sport-config age
    groups are generated, so this single line makes all AFL entries carry 240
    explicitly.
  - **Netball** — add `subIntervalFloorSeconds: 240` to all 6 entries in
    `src/lib/sports/netball/index.ts` (lines ~109-200).
  - **Rugby league** — add `subIntervalFloorSeconds: 240` to all 7 entries in
    `src/lib/sports/rugby_league/index.ts` (lines ~83-244).
- **D-06a:** The legacy `src/lib/ageGroups.ts` has its OWN separate
  `AgeGroupConfig` interface (quarterSeconds / subIntervalSeconds) — do NOT add
  the floor there. The sports-config type (`src/lib/sports/types.ts`) is the
  source of truth for this knob.

### Verification strategy — unit AND e2e (belt-and-suspenders)
- **D-07:** Extract the last-period / between-periods / full-time boolean logic
  into a **pure, testable helper** (e.g. `src/lib/live/periodPhase.ts`),
  signature roughly
  `(currentPeriod, periodCount, periodEnded, finalised) → { isAtFullTime, isBetweenPeriods, isLastPeriod }`.
  Both AFL `LiveGame.tsx` and `NetballLiveGame.tsx` consume this single helper
  (and ideally `page.tsx`'s sticky-bar booleans too) so there is ONE source of
  truth for "is the game over / between periods".
- **D-08:** **Unit-test the helper at `periodCount = 4` (AFL/netball) AND
  `periodCount = 2` (rugby league halves)** — e.g. period 4-of-4 ended →
  `isAtFullTime`; period 3-of-4 ended → `isBetweenPeriods`; period 2-of-2 ended
  → `isAtFullTime`; period 1-of-2 ended → `isBetweenPeriods`. This is what
  actually proves the AFL/netball-component refactor is period-count-correct
  (see Existing Code Insights for why the e2e alone cannot).
- **D-09:** Extend `src/lib/__tests__/sports.test.ts` to assert every age group
  across all three sports exposes `subIntervalFloorSeconds === 240`.
- **D-10:** Add/extend a **2-period e2e**: drive a rugby-league halves age group
  (`periodCount = 2`) through end-of-period-1 (assert "between periods" break
  surface, NOT full time) then end-of-period-2 (assert full-time / review).
  Prefer extending `e2e/tests/rugby-league-full-game-playthrough.spec.ts`.
- **D-11:** Definition of done per CLAUDE.md: `npm test`, `npm run e2e`,
  `npx tsc --noEmit`, `npm run lint` all green before commit. Small reviewable
  commits.

### Claude's Discretion
- Exact module path / name and signature of the extracted period-phase helper.
- Whether to extend an existing e2e spec or add a new one for D-10.
- Whether `page.tsx`'s sticky-bar booleans call the same helper or just swap the
  literal for `…periodCount` inline (helper reuse preferred).
- Exact param name for the fairness full-period length (`fullPeriodMs` is a
  suggestion).

</decisions>

<specifics>
## Specific Ideas

- `LeagueLiveGame.tsx` is the **reference implementation** — mirror how it reads
  `ageGroup.periodCount`: `state.currentQuarter < ageGroup.periodCount` (between
  periods), `state.currentQuarter >= ageGroup.periodCount` (full time). Do not
  invent a new pattern; match it.
- Sport-agnostic rule (milestone-wide): never hardcode "quarter"; period
  structure and zones come from `getAgeGroupConfig(sport, ageGroup)`.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone spec + recon (root-cause file:line mapping)
- `.planning/MATCH-DAY-CHANGES-SPEC.md` §"Global rule — sport-agnostic, always"
  — the never-hardcode-quarter rule.
- `.planning/MATCH-DAY-CHANGES-SPEC.md` §"Phase 0 — sport-config centralization
  (prerequisite)" — the exact literals to remove and the LeagueLiveGame
  reference.
- `.planning/MATCH-DAY-CHANGES-SPEC.md` §"Sport config — where it lives
  (confirmed)" — where `AgeGroupConfig` / `periodCount` / `periodSeconds` /
  `subIntervalSeconds` and `getEffectiveQuarterSeconds` live.

### Phase requirements + success criteria
- `.planning/ROADMAP.md` §"Phase 8: Sport-agnostic period foundation" — goal,
  4 success criteria, dependency note (first v1.1 phase; prerequisite for 9-13).
- `.planning/REQUIREMENTS.md` — CONFIG-01 (no hardcoded period literals; all
  read periodCount/periodSeconds) and CONFIG-02 (subIntervalFloorSeconds,
  default 240s) acceptance criteria.

### Project conventions (binding)
- `CLAUDE.md` §"Reuse before you fork" — shared live components must stay
  consistent across AFL/netball/league.
- `CLAUDE.md` §"Testing is part of done" — DoD gates (tsc/test/e2e/lint green;
  regression test red-first for bugs; e2e through the UI).

</canonical_refs>

<code_context>
## Existing Code Insights

### CONFIG-01 targets — literals to centralize (verified by scout 2026-06-01)
- `src/components/live/LiveGame.tsx:1019` — `isAtFullTime = !finalised && currentQuarter >= 4 && quarterEnded`
- `src/components/live/LiveGame.tsx:1021` — `isBetweenQuarters = quarterEnded && currentQuarter >= 1 && currentQuarter < 4`
- `src/components/netball/NetballLiveGame.tsx:1659` — `if (quarterEnded && currentQuarter >= 4)`
- `src/components/netball/NetballLiveGame.tsx:1696` — `if (quarterEnded && currentQuarter < 4)`
- `src/components/netball/NetballLiveGame.tsx:1780` — `if (quarterEnded && currentQuarter >= 4)`
- `src/lib/fairness.ts:601` — `const FULL_QUARTER_MS = 12 * 60 * 1000` (D-02..D-04)
- **ADDITIONAL targets found by scout (not in original recon, must also fix):**
  - `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx:496` — netball
    branch sticky-bar `state.currentQuarter < 4` (`ageCfgN.periodCount` is
    already in scope here).
  - `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx:659` — AFL branch
    sticky-bar `state.currentQuarter < 4` (`ageCfgSport.periodCount` is already
    in scope here).

### Reusable Assets
- `getEffectiveQuarterSeconds(team, ageGroup, game)` — `src/lib/sports/index.ts:36-45`.
  3-level resolver (game → team → age default). The production source for the
  per-game effective quarter ms in D-03. Already used at `page.tsx:174/388/604`.
- `getAgeGroupConfig(sport, ageGroup)` — barrel `src/lib/sports/index.ts:9`
  (impl in `src/lib/sports/registry.ts`). Server already calls it at
  `page.tsx:603` (`ageCfgSport`).
- `AgeGroupConfig` type — `src/lib/sports/types.ts:73-126`. Add the required
  `subIntervalFloorSeconds` field here.

### Established Patterns (REFERENCE — mirror, don't reinvent)
- `src/components/league/LeagueLiveGame.tsx:529,613,1227,1231` — canonical
  `ageGroup.periodCount` usage for between-periods / full-time gating.
- `src/components/league/LeagueFullTimeReview.tsx:100,171` and
  `LeagueLineupPicker.tsx:253,698,737,1198,1217` — further `periodCount` /
  `periodSeconds` reads.
- `src/lib/game-plan/project.ts:126,274,373` — `input.periodCount ?? ag.periodCount`
  pattern (period-count already abstracted in the projector).

### Integration Points
- Server prop wiring: `page.tsx` netball branch passes `ageGroup={ageCfgN}` to
  `NetballLiveGame`; league branch passes `ageGroup={ageCfgL}`; AFL branch
  passes `quarterMs={quarterMs}` to `LiveGame` (`:718`) and `ageGroup={ageCfgSport}`
  to QuarterBreak (`:845`). D-01 threads `ageCfgSport` into `LiveGame` too.
- `suggestStartingLineup` call sites must pass the effective quarter ms (D-04).
  Planner should trace runtime callers (QuarterBreak suggester / LiveGame) —
  `quarterMs` is already available there.

### Why the e2e alone cannot prove CONFIG-01 (read before planning verification)
The `>= 4` literals being centralized live in `LiveGame.tsx` (AFL) and
`NetballLiveGame.tsx` (netball) — components that ONLY ever render 4-period
sports. A 2-period sport (rugby league halves) renders `LeagueLiveGame.tsx`,
which ALREADY uses `periodCount`. So the D-10 rugby-league e2e exercises
`LeagueLiveGame` + the shared `page.tsx` booleans, NOT the refactored
AFL/netball component literals. The D-07/D-08 **pure-helper unit test at
periodCount=2** is therefore the test that actually proves the AFL/netball
refactor is period-count-correct (the helper is the single source those
components now call). Plan both; don't treat the e2e as sufficient on its own.

### Test files to extend
- `src/lib/__tests__/sports.test.ts` — already asserts `periodCount` values
  (e.g. `:507-515`); extend for `subIntervalFloorSeconds === 240` (D-09).
- `e2e/tests/rugby-league-full-game-playthrough.spec.ts` — candidate for the
  2-period boundary e2e (D-10).
- `e2e/tests/live-full-time.spec.ts`, `live-quarters.spec.ts`,
  `netball-quarter-break.spec.ts` — existing AFL/netball period-boundary specs
  that must stay green.

</code_context>

<deferred>
## Deferred Ideas

- **Collapse LiveGame's redundant scalar props** (`quarterMs` etc.) now that the
  full `ageGroup` object is threaded — a cleanup, out of scope for Phase 8.
- **F4 interval-derivation function** `(periodSeconds, floor) → smallest even
  divisor ≥ floor, near-even fallback` — Phase 10 (SUB-02). Phase 8 only defines
  the floor field.
- **B4 recency / per-player last-sub signal** — Phase 10 (SUB-01).

</deferred>

---

*Phase: 08-sport-agnostic-period-foundation*
*Context gathered: 2026-06-01*
