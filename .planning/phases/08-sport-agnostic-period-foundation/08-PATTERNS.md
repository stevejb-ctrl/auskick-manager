# Phase 8: Sport-agnostic period foundation - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 11 (1 new helper, 1 new test, 9 modified)
**Analogs found:** 11 / 11 (all in-repo; no RESEARCH.md fallback needed)

> Note: There is no AFL/netball component that already renders a non-4-period
> sport, so the canonical period-count analog for ALL of this work is the
> league surfaces (`LeagueLiveGame.tsx`, `LeagueLineupPicker.tsx`,
> `LeagueFullTimeReview.tsx`) which already drive everything off
> `ageGroup.periodCount` / `ageGroup.periodSeconds`. Mirror these verbatim —
> do not invent a new pattern.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| NEW `src/lib/live/periodPhase.ts` | utility (pure helper) | transform | `LeagueLiveGame.tsx` inline booleans (`:1222-1239`) | role-match (extract-from) |
| NEW `src/lib/live/__tests__/periodPhase.test.ts` | test | transform | `src/lib/__tests__/sports.test.ts` periodCount block (`:502-528`) | role-match |
| MODIFY `src/components/live/LiveGame.tsx` | component (AFL live orchestrator) | event-driven | `src/components/netball/NetballLiveGame.tsx` (already takes `ageGroup`) | exact |
| MODIFY `src/components/netball/NetballLiveGame.tsx` | component (netball live) | event-driven | `src/components/league/LeagueLiveGame.tsx` (`:529/613/1227/1231`) | exact |
| MODIFY `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | route (RSC server wiring) | request-response | self — league branch `ageCfgL` (`:331`) / netball `ageCfgN` (`:532`) | exact |
| MODIFY `src/lib/fairness.ts` | utility (pure scoring) | transform | self — existing trailing-optional-param convention (`suggestStartingLineup` `:526-554`) | exact |
| MODIFY `src/lib/sports/types.ts` | config (type def) | n/a | self — `minUnbrokenPeriods` field (`:117`) | exact |
| MODIFY `src/lib/sports/afl/index.ts` | config | n/a | self — `aflAgeGroups()` object literal (`:40-54`) | exact |
| MODIFY `src/lib/sports/netball/index.ts` | config | n/a | self — `NETBALL_AGE_GROUPS` entries (`:109-200`) | exact |
| MODIFY `src/lib/sports/rugby_league/index.ts` | config | n/a | self — `RL_AGE_GROUPS` entries (`:83+`) | exact |
| MODIFY `src/lib/__tests__/sports.test.ts` | test | n/a | self — periodCount assertion block (`:502-528`) | exact |
| EXTEND `e2e/tests/rugby-league-full-game-playthrough.spec.ts` | test (e2e) | event-driven | self — existing 2-half playthrough (`:1-21`) | exact |

## Pattern Assignments

### NEW `src/lib/live/periodPhase.ts` (utility, transform)

**Analog / extract source:** `src/components/league/LeagueLiveGame.tsx` — the
ONLY live surface that already derives these booleans from `periodCount`.
Replicate this logic as a pure function. The three components then call it.

**Canonical league booleans to mirror** (`LeagueLiveGame.tsx:1222-1239`):
```typescript
const isPeriodActive
  = state.currentQuarter >= 1 && !state.quarterEnded && !state.finalised;
const isAtQbreak
  = state.quarterEnded
  && state.currentQuarter >= 1
  && state.currentQuarter < ageGroup.periodCount   // ← between periods
  && !state.finalised;
const isAtFinalQ
  = state.quarterEnded
  && state.currentQuarter >= ageGroup.periodCount   // ← full time (pre-finalise)
  && !state.finalised;
const isFinished = state.finalised || isAtFinalQ;
```

**Also mirrored at** `LeagueLiveGame.tsx:529` (`periodForAssignment`) and `:613`
(`if (state.currentQuarter >= ageGroup.periodCount) return;` — suppress
auto-open of start-period modal at game end).

**Literals being replaced** — what the helper must reproduce with `periodCount`:
- `LiveGame.tsx:1019` `isAtFullTime = !finalised && currentQuarter >= 4 && quarterEnded`
- `LiveGame.tsx:1021` `isBetweenQuarters = quarterEnded && currentQuarter >= 1 && currentQuarter < 4`
- `NetballLiveGame.tsx:1659/1780` `if (quarterEnded && currentQuarter >= 4)`
- `NetballLiveGame.tsx:1696` `if (quarterEnded && currentQuarter < 4)`

**Suggested signature** (D-07; final shape is Claude's discretion):
```typescript
// (currentPeriod, periodCount, periodEnded, finalised)
//   → { isAtFullTime, isBetweenPeriods, isLastPeriod }
export function periodPhase(
  currentPeriod: number,
  periodCount: number,
  periodEnded: boolean,
  finalised: boolean,
): { isAtFullTime: boolean; isBetweenPeriods: boolean; isLastPeriod: boolean } {
  const isLastPeriod = currentPeriod >= periodCount;
  return {
    isAtFullTime: !finalised && periodEnded && isLastPeriod,
    isBetweenPeriods: periodEnded && currentPeriod >= 1 && currentPeriod < periodCount,
    isLastPeriod,
  };
}
```
**Conventions:** Pure leaf module — no store imports (mirror the `fairness.ts`
comment at `:599-600` "kept local here so fairness.ts stays a leaf module").
`@/lib/live/` is a new dir; default-import style follows existing `src/lib/*`.

---

### MODIFY `src/components/live/LiveGame.tsx` (component, event-driven)

**Analog:** `NetballLiveGame.tsx` — it ALREADY takes the full `ageGroup`
object as a prop and reads `ageGroup.periodCount` / `ageGroup.positions`. Thread
the same prop into AFL's LiveGame (D-01).

**Props pattern to copy** (`NetballLiveGame.tsx:89` + destructure `:233`):
```typescript
// in NetballLiveGameProps
ageGroup: AgeGroupConfig;
// and the import at the top of NetballLiveGame.tsx:
import type { AgeGroupConfig } from "@/lib/sports/types";
```

**Where to add it in LiveGame** — the props interface is
`LiveGameProps` (`LiveGame.tsx:146-225`); add `ageGroup: AgeGroupConfig;`
alongside the existing `quarterMs` field (`:211-214`). Destructure it in the
`export function LiveGame({ … })` block (`:235-263`) next to `quarterMs`
(`:261`). Keep all existing scalar props (`quarterMs`, `subIntervalSeconds`,
`positionModel`, `defaultOnFieldSize`) as-is — D-01b says do NOT rip them out.

**Booleans to replace** (`LiveGame.tsx:1019-1021`):
```typescript
const isAtFullTime = !finalised && currentQuarter >= 4 && quarterEnded;
const isFinished = finalised || isAtFullTime;
const isBetweenQuarters = quarterEnded && currentQuarter >= 1 && currentQuarter < 4;
```
→ call the new helper with `ageGroup.periodCount`:
```typescript
const { isAtFullTime, isBetweenPeriods: isBetweenQuarters }
  = periodPhase(currentQuarter, ageGroup.periodCount, quarterEnded, finalised);
const isFinished = finalised || isAtFullTime;
```
`currentQuarter` is read from the store at `:280`; `quarterEnded` and
`finalised` are already in scope at the same point.

---

### MODIFY `src/components/netball/NetballLiveGame.tsx` (component, event-driven)

**Analog:** `LeagueLiveGame.tsx` (`:1227/1231`). Netball already has `ageGroup`
in scope (`:89`, destructured `:233`) so no prop wiring needed — just swap the
3 literals for the helper / `ageGroup.periodCount`.

**The 3 render-gate literals** (all use the local `currentQuarter` / `quarterEnded`):
```typescript
// :1659  full-time review branch
if (quarterEnded && currentQuarter >= 4) { … NetballFullTimeReview … }
// :1696  quarter-break branch
if (quarterEnded && currentQuarter < 4) { … NetballQuarterBreak … }
// :1780  between-Q4-and-finalise branch
if (quarterEnded && currentQuarter >= 4) { … finalise button … }
```
→ replace `>= 4` with `>= ageGroup.periodCount` and `< 4` with
`< ageGroup.periodCount` (or derive once via the helper at the top of render
and reuse the booleans across all 3 branches — helper reuse preferred per D-07).

---

### MODIFY `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` (route, request-response)

**Analog:** the league branch in this same file already resolves and threads
the config object: `ageCfgL` (`:171/179`) → `<LeagueLiveGame ageGroup={ageCfgL} … />`
(`:326-331`). The netball branch does the same with `ageCfgN` (`:379/390`) →
`<NetballLiveGame ageGroup={ageCfgN} … />` (`:526-532`).

**AFL prop wiring (D-01a):** `ageCfgSport` is ALREADY resolved at `:603`
(`const ageCfgSport = getAgeGroupConfig("afl", ageGroup);`) and already passed
to QuarterBreak at `:845`. Thread it into the `<LiveGame>` mount (`:693-720`),
right beside `quarterMs={quarterMs}` (`:718`):
```typescript
<LiveGame
  …
  quarterMs={quarterMs}
  ageGroup={ageCfgSport}   // ← new
  …
/>
```

**Sticky-bar literals to replace** — two sites, both have `periodCount` in scope:
```typescript
// :493-496 (netball branch — ageCfgN.periodCount in scope)
const isAtQbreak =
  state.quarterEnded &&
  state.currentQuarter >= 1 &&
  state.currentQuarter < 4;        // → ageCfgN.periodCount
// :656-659 (AFL branch — ageCfgSport.periodCount in scope)
const isAtQbreak =
  state.quarterEnded &&
  state.currentQuarter >= 1 &&
  state.currentQuarter < 4;        // → ageCfgSport.periodCount
```
D-07/D-09 discretion: either call `periodPhase(...).isBetweenPeriods` here
(helper reuse preferred) or swap the literal inline for `…periodCount`.

---

### MODIFY `src/lib/fairness.ts` (utility, transform)

**Analog:** `suggestStartingLineup`'s OWN existing convention — every optional
behaviour knob is a trailing param with a back-compat default (`:529-554`,
e.g. `seed = 0`, `currentGame = {}`, `chipModeByKey = {}`). Add the new param
at the END of the list, after `chipModeByKey` (D-04).

**Literal to replace** (`fairness.ts:598-601`, used at `:607`):
```typescript
// "Played this zone for ≥ a full quarter all season" threshold (in ms).
const FULL_QUARTER_MS = 12 * 60 * 1000;
…
const seasonBonus = seasonMins < FULL_QUARTER_MS ? SEASON_DIVERSITY : 0;
```
→ add trailing optional param (name `fullPeriodMs` is a suggestion, D-04):
```typescript
// …after chipModeByKey at the end of the signature:
  fullPeriodMs: number = 12 * 60 * 1000,   // back-compat default keeps ~20 unit callers green
): Lineup {
…
const seasonBonus = seasonMins < fullPeriodMs ? SEASON_DIVERSITY : 0;
```

**Production call sites that must pass the per-game effective ms (D-03/D-04)** —
each already has the effective quarter ms or seconds available:
- `src/components/live/QuarterBreak.tsx:408-420` — AFL Q-break suggester. Append
  the per-game ms as the new last arg (after `chipModeByKey`). `quarterMs` is
  threaded into QuarterBreak (page.tsx `:718`→ LiveGame → QuarterBreak).
- `src/components/live/LineupPicker.tsx:278` — Q1 starting lineup.
- `src/lib/game-plan/project.ts:165-177` — projector. Uses `ag.periodCount`/
  `input.periodCount` already; pass `(input.periodSeconds ?? ag.periodSeconds) * 1000`.
- **Do NOT touch** the ~20 test callers (`src/lib/__tests__/*.test.ts`) — the
  default keeps them green (this is the whole point of D-04).

**Out of scope (D-04a):** the cumulative-minutes ranking in `suggestSwaps`
(`fairness.ts:839`) is B4 / Phase 10. Leave it.

---

### MODIFY `src/lib/sports/types.ts` (config, type def)

**Analog:** the existing optional rugby-league knobs on the same interface
(`AgeGroupConfig`, `:73-126`), e.g. `minUnbrokenPeriods?: number;` (`:111-117`).
But D-05 says this field is **REQUIRED** (no `?`), so place it beside the other
REQUIRED numeric fields (`periodCount`, `periodSeconds`, `subIntervalSeconds`
at `:84-86`):
```typescript
periodCount: number;
periodSeconds: number;
subIntervalSeconds: number;
/**
 * Floor (in seconds) for the auto-derived sub interval. Phase 10 (SUB-02)
 * reads this to compute the smallest even divisor of periodSeconds ≥ floor.
 * Phase 8 only DEFINES it. Every age group sets its own value (no central
 * default). Currently 240 (4 min) for all sports.
 */
subIntervalFloorSeconds: number;
```
**D-06a:** Do NOT add this to the legacy `src/lib/ageGroups.ts` `AgeGroupConfig`
interface — the sports-config type here is the single source of truth.

---

### MODIFY `src/lib/sports/afl/index.ts` (config)

**Analog / target:** the object returned by `aflAgeGroups()` (`:40-54`). AFL
entries are GENERATED via `.map()`, so ONE added line covers all AFL ages:
```typescript
periodCount: 4,
periodSeconds: cfg.quarterSeconds,
subIntervalSeconds: cfg.subIntervalSeconds,
subIntervalFloorSeconds: 240,        // ← add (D-06)
tracksScoreDefault: cfg.tracksScoreDefault,
```

### MODIFY `src/lib/sports/netball/index.ts` (config)

**Analog / target:** `NETBALL_AGE_GROUPS` — 6 literal entries (`:109-200`).
Add `subIntervalFloorSeconds: 240,` to EACH (set / go / 11u / 12u / 13u / open),
next to the existing `subIntervalSeconds:` line in each block (e.g. `:121`).

### MODIFY `src/lib/sports/rugby_league/index.ts` (config)

**Analog / target:** `RL_AGE_GROUPS` — 7 literal entries (`:83+`, U6…U12).
Add `subIntervalFloorSeconds: 240,` to EACH, beside the existing
`subIntervalSeconds: QUARTER_SUB_INTERVAL,` / `HALF_SUB_INTERVAL` line
(e.g. `:95`, `:118`). The U10–U12 halves entries are the period-count-2 cases
the e2e exercises.

---

### NEW `src/lib/live/__tests__/periodPhase.test.ts` (test, transform)

**Analog:** `src/lib/__tests__/sports.test.ts` Vitest structure
(`import { describe, expect, it } from "vitest";` `:9`) and its
periodCount-by-age block (`:502-528`).

**Coverage required (D-08)** — proves the AFL/netball refactor is
period-count-correct (the e2e CANNOT, per CONTEXT `code_context`):
```typescript
// periodCount = 4 (AFL / netball)
// period 4-of-4 ended → isAtFullTime
// period 3-of-4 ended → isBetweenPeriods
// periodCount = 2 (rugby league halves)
// period 2-of-2 ended → isAtFullTime
// period 1-of-2 ended → isBetweenPeriods
// finalised → not isAtFullTime (finished branch owns it)
```

### MODIFY `src/lib/__tests__/sports.test.ts` (test)

**Analog:** the existing per-sport periodCount assertions (`:502-528`) — same
`rugbyLeagueSport.ageGroups.find((a) => a.id === …)!` lookup style. Add (D-09):
```typescript
it("every age group exposes subIntervalFloorSeconds === 240", () => {
  for (const sport of [aflSport, netballSport, rugbyLeagueSport]) {
    for (const ag of sport.ageGroups) {
      expect(ag.subIntervalFloorSeconds).toBe(240);
    }
  }
});
```

### EXTEND `e2e/tests/rugby-league-full-game-playthrough.spec.ts` (e2e)

**Analog:** the spec itself already drives a U10 (2 × 20-min halves) game end
to end (`:1-21`) with `clock_multiplier=60`. D-10 asks to assert the period
BOUNDARY semantics: after H1 hooter assert a "between periods" / "Ready for
half 2" break surface (NOT full time), and after H2 hooter assert full-time /
finalise. Most of this flow already exists — add explicit assertions on the
break-vs-fulltime surface at the H1 boundary. Fixtures:
`createAdminClient` + `makeTeam/makePlayers/makeGame` (`:24-25`). The existing
AFL/netball period-boundary specs (`live-full-time.spec.ts`,
`live-quarters.spec.ts`, `netball-quarter-break.spec.ts`) must stay green.

## Shared Patterns

### Period-phase derivation (the core cross-cutting pattern)
**Source of truth (reference impl):** `src/components/league/LeagueLiveGame.tsx:1222-1239`
**New home:** `src/lib/live/periodPhase.ts` (pure helper)
**Apply to:** `LiveGame.tsx`, `NetballLiveGame.tsx`, and `live/page.tsx` sticky bars
```typescript
const isAtQbreak = state.quarterEnded
  && state.currentQuarter >= 1
  && state.currentQuarter < ageGroup.periodCount   // ← never `< 4`
  && !state.finalised;
const isAtFinalQ = state.quarterEnded
  && state.currentQuarter >= ageGroup.periodCount   // ← never `>= 4`
  && !state.finalised;
```
Rule (CLAUDE.md "Reuse before you fork" + milestone "sport-agnostic"): never
hardcode 4; period structure always comes from `ageGroup.periodCount`.

### Threading the AgeGroupConfig object as a prop
**Source:** `NetballLiveGame.tsx:89` (`ageGroup: AgeGroupConfig`) +
`live/page.tsx` league/netball mounts (`:331`, `:532`)
**Apply to:** `LiveGame.tsx` (D-01) — all three live components consume the
same config shape (cross-sport muscle-memory, CLAUDE.md).
```typescript
import type { AgeGroupConfig } from "@/lib/sports/types";
// prop: ageGroup: AgeGroupConfig;
// server resolves via getAgeGroupConfig(sport, ageGroup) — already at page.tsx:603
```

### Trailing-optional-param with back-compat default (fairness)
**Source:** `suggestStartingLineup` signature (`fairness.ts:526-554`)
**Apply to:** the new `fullPeriodMs` param (D-04) — keeps ~20 unit-test callers
green; only production sites pass the per-game effective ms.

### Config-field-on-every-age-group (no central default)
**Source:** existing per-entry numeric fields (`subIntervalSeconds`, `periodSeconds`)
in all three sport configs
**Apply to:** `subIntervalFloorSeconds: 240` (D-05/D-06) — required field, set
explicitly on every entry; sports config type (`types.ts`) is the source of
truth, NOT legacy `ageGroups.ts`.

## No Analog Found

None. Every file has an in-repo analog (the league live surfaces are the
canonical period-count reference; the rest are self-analogs within the file or
sibling test/config). RESEARCH.md fallback not required.

## Metadata

**Analog search scope:** `src/components/{live,netball,league}/`,
`src/lib/{fairness.ts,sports/**,live/**,game-plan/,__tests__/}`,
`src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx`, `e2e/tests/`
**Pattern extraction date:** 2026-06-01
**Correction vs CONTEXT:** the e2e path in the brief
(`e2e/tests/rugby-league-full-game-playthrough.spec.ts`) DOES exist and is the
right target (Glob was scoped to a worktree cwd; verified via `git ls-files`).
