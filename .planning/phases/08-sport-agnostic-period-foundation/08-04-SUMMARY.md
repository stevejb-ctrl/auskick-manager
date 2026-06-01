---
phase: 08-sport-agnostic-period-foundation
plan: 04
status: complete
wave: 3
requirements: [CONFIG-01]
commits:
  - c22da08 feat(08-...): replace fairness FULL_QUARTER_MS with trailing optional fullPeriodMs (CONFIG-01)
  - 196c295 feat(08-...): feed per-game effective fullPeriodMs to the suggester + de-hardcode AFL gameMinutes count (CONFIG-01)
  - 2e0c574 test(08-...): assert RL period boundaries (H1 between-periods, H2 full-time)
---

# 08-04 Summary — fairness fullPeriodMs param + 2-period rugby-league e2e

## Objective achieved

Made the fairness engine's season full-period diversity threshold sport-agnostic
and per-game accurate, and added 2-period BOUNDARY assertions to the rugby-league
e2e. `suggestStartingLineup` no longer hardcodes `FULL_QUARTER_MS = 12*60*1000`;
it takes a TRAILING OPTIONAL `fullPeriodMs` param (back-compat default = 12 min).
The three production callers feed the PER-GAME EFFECTIVE quarter ms where the
sports-config resolver is in scope, so the threshold now tracks this game's actual
clock (incl. per-game / per-team finals/short-game overrides) rather than a fixed
12 minutes (D-03). The sibling `gameMinutes` period-COUNT literal (`* 4`) is
de-hardcoded to `ageCfgSport.periodCount` at the AFL sports-config mount.

## What was built

- **Task 1 — `src/lib/fairness.ts`** (c22da08): added `fullPeriodMs: number =
  12 * 60 * 1000` as the LAST param of `suggestStartingLineup` (after
  `chipModeByKey`); deleted the `FULL_QUARTER_MS` const + its comment; changed
  the season bonus to `const seasonBonus = seasonMins < fullPeriodMs ?
  SEASON_DIVERSITY : 0`. The back-compat default keeps the ~20 fairness unit-test
  callers green UNCHANGED. `suggestSwaps` untouched (D-04a).
- **Task 2 — production callers** (196c295):
  - `QuarterBreak.tsx`: `fullPeriodMs: number;` added to `QuarterBreakProps`,
    destructured, appended as the new last arg of the suggestStartingLineup call.
  - `LiveGame.tsx`: `<QuarterBreak>` mount passes `fullPeriodMs={quarterMs}`
    (LiveGame's `quarterMs` is the per-game effective ms).
  - `LineupPicker.tsx`: `fullPeriodMs: number;` added to `LineupPickerProps`,
    destructured, appended as the new last call arg.
  - `live/page.tsx` (AFL mount): `<LineupPicker>` passes `fullPeriodMs={quarterMs}`
    (reusing the in-scope effective-ms local — the preferred form per the plan).
  - `run/[token]/lineup/page.tsx` (legacy share-token mount): passes
    `fullPeriodMs={ageCfg.quarterSeconds * 1000}` (age-group DEFAULT — the legacy
    `ageGroups` shape has no effective resolver; accepted D-03 divergence).
  - `game-plan/project.ts` (`projectAflGamePlan`): appended `periodMinutes *
    60_000` as the new last arg (DEVIATION — see below).
- **Task 3 — gameMinutes period-count literal** (196c295):
  - `live/page.tsx:842`: `gameMinutes={(ageCfg.quarterSeconds *
    ageCfgSport.periodCount) / 60}` (was `* 4`).
  - `run/[token]/lineup/page.tsx`: `* 4` intentionally RETAINED with a documented
    comment block (legacy shape has no `periodCount`) — known residual.
- **Task 4 — `rugby-league-full-game-playthrough.spec.ts`** (2e0c574): added an
  explicit H1-boundary assertion that the full-time / "Finalise game" review
  surface is HIDDEN at the H1 break (periodCount=2, currentQuarter=1 → between
  periods). The H1 between-periods "Start H2" surface (visible) and the H2
  full-time "Finalise game" surface (visible) were already asserted; the new
  `.toBeHidden()` completes the D-10 boundary coverage.

## Key files

- modified (in plan): `src/lib/fairness.ts`, `src/components/live/QuarterBreak.tsx`,
  `src/components/live/LiveGame.tsx`, `src/components/live/LineupPicker.tsx`,
  `src/lib/game-plan/project.ts`,
  `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx`,
  `src/app/run/[token]/lineup/page.tsx`,
  `e2e/tests/rugby-league-full-game-playthrough.spec.ts`

## Deviation from plan

**`src/lib/game-plan/project.ts` — `periodMinutes * 60_000` instead of the plan's
`(input.periodSeconds ?? ag.periodSeconds) * 1000`.** The plan's prescribed
expression does not typecheck: `ProjectGamePlanInput` has NO `periodSeconds` field
(it exposes `periodMinutes?: number`, types.ts:110). The projector already computes
a local `periodMinutes = input.periodMinutes ?? ag.periodSeconds / 60` (:127) that
honours the per-game override → age default fallback — exactly the effective-length
intent of D-03. So I passed `periodMinutes * 60_000`, which is the correct effective
full-period ms AND matches the existing netball/RL projector idiom (`periodMinutes *
60_000`) elsewhere in the same file. Semantically identical to the plan's intent;
the plan simply named a field that does not exist. tsc-green and idiom-consistent.

## Decisions honored

- D-02 / D-04: `FULL_QUARTER_MS` replaced by a trailing optional `fullPeriodMs`
  with a 12-min back-compat default; ~20 unit-test callers stay green unchanged.
- D-03: the three production callers pass the per-game EFFECTIVE ms where the
  resolver is in scope (AFL `live/page.tsx` + `QuarterBreak` via `quarterMs`;
  `project.ts` via `periodMinutes`); the legacy share-token page passes the
  age-group DEFAULT (accepted divergence).
- D-04a: `suggestSwaps` NOT touched.
- D-10: the rugby-league (periodCount=2) e2e asserts H1 → between-periods (NOT
  full time) and H2 → full time.
- CONFIG-01: the `gameMinutes` `* 4` period-COUNT literal de-hardcoded to
  `ageCfgSport.periodCount` at the sports-config mount.
- D-11: all four DoD gates green (see Verification); fairness unit callers green
  via the default.

## Known residuals / accepted divergences (documented, not dropped)

- **Legacy share-token lineup uses the age-group DEFAULT, not the per-game
  effective override** (`run/[token]/lineup/page.tsx`): runs on the legacy
  `@/lib/ageGroups` shape (`quarterSeconds` only — no `periodSeconds`/`periodCount`,
  no `getEffectiveQuarterSeconds`), so `fullPeriodMs={ageCfg.quarterSeconds * 1000}`.
  Wiring the sports-config resolver into this legacy page is a separate refactor,
  out of Phase 8 scope. NOT a bug.
- **Legacy share-token `gameMinutes` retains `* 4`** (same page, same reason — no
  `periodCount` on the legacy shape). De-hardcoded only at the AFL sports-config
  mount.
- **`liveGameStore.ts:32 QUARTER_MS = 12*60*1000`** — a period-LENGTH constant (not
  a COUNT), already parameterised at runtime via `quarterMs`; out of CONFIG-01 scope.

## TDD note

Tasks 1–3 are behaviour-preserving at the default (the new param's default = the
deleted constant; the de-hardcoded count = 4 for AFL). Coverage is the EXISTING
~20 fairness unit-test callers (green unchanged via the default) — no new red-first
unit test was warranted. Task 4 is the test deliverable itself: a new e2e boundary
assertion (`.toBeHidden()` on the full-time surface at the H1 break) that would go
red if the periodPhase refactor (08-01/08-03) ever collapsed the between-periods
and full-time surfaces for a 2-period sport.

## Verification

- `npx tsc --noEmit` → exits 0.
- `npm run lint` → exits 0 (pre-existing warnings only; the `QuarterBreak`
  `useMemo` exhaustive-deps warning now lists `fullPeriodMs` alongside the
  pre-existing `chipModeByKey`/`players` entries — same intentional pattern, no
  behaviour change).
- `npm test` (Vitest) → 43 files / 781 tests passed.
- Per-task grep gates (all PASS): T1 `fullPeriodMs: number = 12*60*1000` =1,
  `FULL_QUARTER_MS` =0, `seasonMins < fullPeriodMs` =1; T2 QuarterBreak `fullPeriodMs`
  =3, `fullPeriodMs={quarterMs}` in LiveGame =1, LineupPicker `fullPeriodMs` =3,
  legacy default =1, project.ts effective-ms =2, `getEffectiveQuarterSeconds` in
  live/page =5; T3 AFL `* ageCfgSport.periodCount` =1, no `* 4` count in sports page
  =0, legacy `* 4` retained =1; T4 boundary terms =7.
- `npm run e2e` (period-boundary regression set, serial on a warm stack) → 9/9 PASS:
  `afl-hooter-freezes-player-time`, `full-game-playthrough` (AFL Q-break + finalise),
  `netball-full-game-playthrough`, `netball-quarter-break` (×4), and
  `rugby-league-full-game-playthrough` (Task 4 boundary assertions). All three
  sports' period-boundary paths verified green.

### e2e environmental-flake investigation (NOT a regression)

The first full-suite `npm run e2e` (default `fullyParallel`) reported 11 failures
spread across UNRELATED specs (account-deletion, availability, feedback-fab,
demo-picker, game-create login "Test ended", plus afl-hooter, full-game-playthrough,
and one netball test). Rigorous discrimination established these are
cold-start / parallel-load environmental flake, NOT Phase 8 regressions:

1. On serial re-run, `afl-hooter-freezes-player-time`, `full-game-playthrough`, and
   `availability` PASSED — the two AFL specs directly exercise the modified live
   period code.
2. `netball-live-flow` initially failed 6 tests on a COLD stack; on a WARM stack
   HEAD passes 13/14 (only the load-sensitive `:745` late-arrival flakes), and
   `:745` alone passed 4/4 with `--repeat-each=4`. The local Supabase stack itself
   returned a hard 502 during one `db reset`, confirming the Docker stack — not the
   code — was the failure source.
3. Empirical isolation of the netball edit: the only Phase 8 netball change is 3
   lines in `NetballLiveGame.tsx`, all `quarterEnded`-gated (full-time /
   between-periods / finalise branches) which active-play scoring/long-press/
   late-arrival never reach; `PositionToken` (the tap/long-press detector) is
   untouched by the entire milestone. A revert-and-rerun experiment was run to
   guard against over-confidence; combined with the warm-stack HEAD pass (13/14)
   and the 4/4 isolated `:745` pass, the netball failures are confirmed
   environmental, byte-identical at netball's periodCount=4.

(This matches the 08-03 SUMMARY finding of parallel-load flake on this machine and
the Playwright config note about Supabase-startup flakiness / CI retries.)

## Self-Check: PASSED
