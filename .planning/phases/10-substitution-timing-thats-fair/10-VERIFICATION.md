---
phase: 10-substitution-timing-thats-fair
verified: 2026-06-02
verdict: PASS
requirements: [SUB-01, SUB-02]
plans: [10-01, 10-02]
---

# Phase 10 Verification — Substitution timing that's fair

**Method:** goal-backward. For each ROADMAP success criterion, confirm the
codebase actually delivers it (file:line evidence) rather than trusting that
tasks were marked complete. Inspection run against the `main` working tree
(`C:\Users\steve\OneDrive\Documents\Auskick manager`) — the live-game tools'
default search root is a stale git worktree, so all evidence below was
gathered via the main-checkout shell.

**Phase goal:** Substitution cadence is driven by the actual period length
and individual sub recency — the suggester stops pulling a kid who just came
on and the interval adapts to the sport's period.

**Overall verdict: PASS** — all 4 success criteria met across AFL, netball,
and rugby league; both requirements (SUB-01, SUB-02) delivered; all four DoD
gates green (e2e flakiness analysed and ruled non-regression).

---

## Success Criteria

### Criterion 1 — sub interval derived from period length, all sports — ✅ PASS

> The sub interval is derived from period length — a pure function returns the
> smallest even divisor of the period length that is >= the age-group
> `subIntervalFloorSeconds`, with a near-even fallback when no clean divisor
> exists — replacing the fixed constant, across all sports.

**Evidence:**
- Pure helper `deriveSubIntervalSeconds(periodSeconds, floorSeconds)` —
  `src/lib/sports/subInterval.ts:28`. "Even" = evenly-dividing/clean divisor
  (D-01); picks the smallest clean divisor ≥ floor, with a near-even fallback
  (`round(period/N)`, `N = floor(period/floor)`) when the only divisor ≥ floor
  is the whole period.
- Wired into all three sport configs, replacing the hand-set literal:
  `src/lib/sports/afl/index.ts`, `src/lib/sports/netball/index.ts`,
  `src/lib/sports/rugby_league/index.ts` (all three contain
  `deriveSubIntervalSeconds`). Downstream consumers
  (`games.sub_interval_seconds` seed, game-plan `project.ts`) inherit it via
  the config (D-02 derive-at-config).
- Behaviour deltas confirmed in 10-01-SUMMARY: AFL 10/12/15-min groups
  180→240–300s; netball 600→300s; rugby-league half 600→240s.

### Criterion 2 — a late-subbed-on player is not pulled early next period, all sports — ✅ PASS

> A player subbed on late in one period is not suggested off again early in the
> next period — the suggester accounts for time-since-last-sub, derived from
> existing stint/swap events (no schema migration), across all sports.

**Evidence:** all three suggesters now factor in recency:
- **AFL** `suggestSwaps` — soft recency partition: `isRecent` helper
  (`src/lib/fairness.ts:894`, STRICT `<` window) pushes field players who came
  on within the last rotation window to the back of their zone queue while
  keeping them eligible. Inert when `minStintMs <= 0` (legacy callers
  unchanged). Threaded live from `LiveGame.tsx` (`initialState.lastSubbedOnMs`,
  absolute `completedQuarterMs + nowMs*clockMultiplier`, `minStintMs =
  subIntervalMs`).
- **Rugby league** `suggestLeagueSubs`
  (`src/lib/sports/rugby_league/fairness.ts:2073+`) — the per-quarter stint
  that reset at `quarter_start` is replaced with an ABSOLUTE cross-period
  stint (`completedQuarterMs` accumulator; only a genuine bench→field
  transition restarts a stint). The existing `msAt`-desc off-sort then ranks
  the longest-serving player first and the just-arrived one last. No new
  param; `suggestNextLeagueSub` (`:2233`) delegates and inherits the fix.
- **Netball** `suggestNetballLineup`
  (`src/lib/sports/netball/fairness.ts:717`) — pure period-granular recency
  tiebreak among game-time ties (more-recent stays on court; longer-serving
  benches). Wired from `NetballQuarterBreak.tsx` via
  `replayNetballGame(thisGameEvents).lastSubbedOnMs`.
- Red-first coverage: `src/lib/__tests__/subRecencyGuard.test.ts` — one case
  per sport asserting the just-arrived player is NOT pulled first while a
  longer-serving teammate is available, plus an AFL soft-guard no-deadlock
  case. All GREEN.

### Criterion 3 — recency derived at replay time, shared with F3, no DB column — ✅ PASS

> The recency signal is derived at replay time from existing events and shared
> with the F3 last-sub derivation (no per-player last-sub timestamp added to
> the DB).

**Evidence:**
- `lastSubbedOnMs` is exposed by ALL THREE replay functions on an absolute
  game-elapsed timeline that persists across period boundaries:
  - AFL `replayGame` — `GameState.lastSubbedOnMs` (`fairness.ts:1002`),
    stamped at `lineup_set` (`:1133`) + `swap` (`:1221`); plus
    `completedQuarterMs` anchor for live callers.
  - league `replayLeagueGame` — `LeagueGameState.lastSubbedOnMs`
    (`rugby_league/fairness.ts:62`), stamped at `lineup_set` (`:150`) + `swap`
    (`:199`).
  - netball `replayNetballGame` — `NetballGameState.lastSubbedOnMs`
    (`netball/fairness.ts:828`), stamped at `lineup_set` / `period_break_swap`
    (`:866`).
- No schema migration: latest migration unchanged at
  `0047_track_zone_time.sql` (no Phase 10 migration). Derivation is purely
  from existing `swap` / `lineup_set` / `period_break_swap` / `quarter_end`
  events.
- Shared with F3 (Phase 12): the map is documented in all three state
  interfaces as the reuse point for the long-press "time since last sub" line.

### Criterion 4 — red-first regression coverage (derivation + recency) — ✅ PASS

> Regression tests (written red-first) cover the interval derivation pure
> function (clean-divisor and near-even-fallback cases) and the recency guard
> preventing the early-re-sub case.

**Evidence:**
- Interval derivation: `src/lib/__tests__/subInterval.test.ts` (10-01 Task 1,
  RED commit `95e88a8`) — contract/floor/degenerate/near-even cases +
  per-age-group derived-value snapshot.
- Recency guard: `src/lib/__tests__/subRecencyGuard.test.ts` (10-02 Task 1,
  RED commit `2cd9d33`) — cross-sport early-re-sub prevention, committed as a
  failing spec before the GREEN implementation.
- Plus the WR-01 carry-forward regression
  `src/lib/__tests__/seasonDiversityUnits.test.ts` (folded into 10-01).
- All present and green within the 821-test Vitest run.

---

## Gate Results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0; only pre-existing exhaustive-deps + `<img>` warnings) |
| `npm test` (Vitest) | PASS (821 tests, 46 files) |
| `npm run e2e` (Playwright) | Effective PASS — see note |
| Schema drift | NONE — no Phase 10 migration (latest unchanged at `0047_track_zone_time.sql`) |

**e2e environmental note:** the full parallel run reported 112 passed / 7
failed. The failures were **non-deterministic and unrelated to the suggester**:
re-running the 7 serially (`--workers=1`) passed 6 and failed 4 *different*
`netball-live-flow` tests (tap-to-score / long-press modal / injury-switch
flows — none touch the quarter-break suggester this phase changed); running
`netball-live-flow.spec.ts` in isolation passed **14/14** (1 intentional
skip), including every test that had flaked. Different tests failing each run +
full green in isolation is the known Windows cold-start/worker-contention
artifact the `playwright.config.ts` comment calls out, not a product
regression. The `supabase db reset` step also hit an intermittent Docker
`error running container: exit 1` on two runs (transient; succeeded on retry).
No spec ordering shifted from the recency change, so no e2e spec required
updating.

---

## Requirements Traceability

| Requirement | Plan | Status |
|-------------|------|--------|
| SUB-02 (F4: sub interval derived from period length) | 10-01 | ✅ Delivered |
| SUB-01 (B4: suggester respects time-since-last-sub recency) | 10-02 | ✅ Delivered |
| WR-01 (carry-forward: season-diversity minutes-vs-ms unit fix) | 10-01 | ✅ Closed |

## Deviations (carried from plan summaries, none scope-creep)

1. **10-01:** WR-01 unit fix folded into the plan (Task 3); no snapshot ripple
   because the corrected threshold only affects season totals in a range no
   existing fairness test exercises.
2. **10-02 league:** no new `minStintMs` parameter — fixing the cross-period
   stint reset makes the existing longest-stint-first off-sort honour recency
   for free; `suggestNextLeagueSub` inherits it via delegation.
3. **10-02 netball:** pure windowless recency tiebreak (not the AFL
   `minStintMs` window) because netball subs are period-granular — a
   just-arrived player came on a whole period ago, exceeding any derived
   sub-interval. `elapsedMs`/`minStintMs` stay on the input for cross-sport
   shape parity but are unused.
4. **10-02 live pages:** the AFL live entry points pass the whole
   `replayGame(...)` state as `initialState`, so `lastSubbedOnMs` /
   `completedQuarterMs` flow through to `LiveGame` transitively without an
   explicit per-field thread in `page.tsx`.

---
*Phase 10 verified PASS — ready to mark complete and advance to Phase 11.*
