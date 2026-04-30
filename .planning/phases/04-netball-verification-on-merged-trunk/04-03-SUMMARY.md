---
phase: 04-netball-verification-on-merged-trunk
plan: 03
subsystem: stats-and-summary
tags: [e2e, playwright, stats, summary, NETBALL-05, NETBALL-06, track_scoring, regression-red]

# Dependency graph
requires:
  - phase: 04-netball-verification-on-merged-trunk (Plan 04-01)
    provides: gitignore landed; e2e/helpers/seed-audit.ts available; pre-merge tags + PROD-04 fixme frozen at HEAD 66cdecb
  - phase: 04-netball-verification-on-merged-trunk (CONTEXT)
    provides: D-CONTEXT-stats-dashboard-coverage (5-section + non-leak); D-CONTEXT-track-scoring-matrix (def/drew/🥅 suppression); D-CONTEXT-walkthrough-localStorage-cleanup (set-flag bypass for finalised-state specs); D-CONTEXT-test-scaffolding (src/ off-limits)
provides:
  - "e2e/tests/netball-stats.spec.ts — 199 lines, 2 tests; both PASS today on the merged trunk"
  - "e2e/tests/netball-summary.spec.ts — 243 lines, 2 tests; track_scoring=true PASSES, track_scoring=false is RED by design (regression test ahead of plan 04-04 source fix)"
  - "Empirical proof that the sport-branch dispatch at stats/page.tsx:109 routes netball → NetballDashboardShell with no AFL aggregator headings leaking through"
  - "Empirical proof that NetballGameSummaryCard renders the full track_scoring=true output (🏐 result, def line, 🥅 Goals line, 👟 player count, ⏱ Game time block)"
  - "Documented evidence that the current buildSummary emits '{team} 0 drew with {opp} 0' under track_scoring=false — the exact bug 04-04 must fix"
affects:
  - 04-04 (NetballGameSummaryCard track_scoring source fix — this RED test is the contract)
  - 04-05 (netball-live-flow.spec.ts — can re-use the seedFinalisedNetballGame shape if it needs a finalised-state setup)
  - 04-07 (full gauntlet + Phase 5 hand-off — 04-07 EVIDENCE will report 4/5 green, 1/5 expected-RED with the named follow-up plan)

# Tech tracking
tech-stack:
  added: []  # No new libraries — Playwright + supabase-js peer already wired
  patterns:
    - "Inline seedFinalisedNetballGame helper duplicated across the two specs (deliberately self-contained per e2e/README.md). If a third spec re-uses the same shape it will be extracted to e2e/helpers/ in Phase 5 hygiene."
    - "Pre-set localStorage['nb-walkthrough-seen'] = '1' via page.addInitScript to bypass the netball walkthrough — finalised-state specs care about the summary card, not the modal that intercepts pointer events on first visit."
    - "Backdated created_at timestamps (base = now − 1h, +offset minutes per event) so the events stream is strictly Q1 < Q2 < Q3 < Q4 < game_finalised in created_at order. Aggregators sort by created_at ascending."
    - "GenericLineup nested as { positions: { gs: [id], ... }, bench: [...] } — flat key maps don't roll up through normaliseGenericLineup. This pattern is needed for ANY direct-DB seed of netball lineup events."

key-files:
  created:
    - "e2e/tests/netball-stats.spec.ts  # 199 lines; 2 tests (5-section render + AFL non-leak)"
    - "e2e/tests/netball-summary.spec.ts  # 243 lines; 2 tests (track_scoring=true full render + track_scoring=false suppression — the latter RED ahead of 04-04)"
    - ".planning/phases/04-netball-verification-on-merged-trunk/04-03-SUMMARY.md  # this file"
  modified: []
  deleted: []

key-decisions:
  - "Plan-source-verbatim was overridden in three places (Rule 1 — Bug fixes for the spec source itself): score event type → goal/opponent_goal; flat lineup key map → nested { positions, bench }; missing game_finalised event added to the summary spec seed. All three deviations annotated inline at the top of each spec, and detailed in §Deviations below."
  - "track_scoring=false RED test mirrors the CLAUDE.md regression-test-first rule. The exact failing assertion (text not matching /def\\s+\\w/i) is captured below so plan 04-04 has an unambiguous green target."
  - "Used toHaveCount(0) for the AFL-aggregator absence checks rather than not.toBeVisible() — strict element-non-existence is the correct contract; not.toBeVisible would also pass on hidden-but-present elements, which would mask a CSS-only regression."
  - "Did NOT factor seedFinalisedNetballGame into a shared helper — kept inline per e2e/README.md 'factories for setup, UI for the feature under test' and the convention that two specs duplicating ~50 lines of seed code is acceptable until a third spec needs the same shape (then extract)."

patterns-established:
  - "Pattern: netball finalised-state seed = lineup_set (with positions+bench) + 4× quarter_start/quarter_end pairs + optional goal/opponent_goal events under track_scoring=true + a terminal game_finalised event + games.status update. This is the canonical setup for Phase 4 + Phase 5 specs that need the post-game UI."
  - "Pattern: dedicated stats spec at the route level (not folded into a flow spec) — keeps the dispatch surface (sport-branch in stats/page.tsx) testable in isolation. AFL stats already had this implicitly via DashboardShell rendering; netball now matches via NetballDashboardShell."

requirements-completed: [NETBALL-05, NETBALL-06]
# NOTE: NETBALL-06 is "covered by spec but RED by design" — this Phase
# 4 plan creates the regression test; Phase 4 plan 04-04 owns the
# source fix that takes it green. Both are needed for full NETBALL-06
# acceptance.

# Metrics
duration: ~25min (interactive — read CONTEXT/PLAN/01-SUMMARY shape, read source contracts in stats/page.tsx + NetballLiveGame.tsx + NetballGameSummaryCard.tsx + replayNetballGame, write specs, debug nothing because the deviation-fixes were caught at design-read time, run typecheck + e2e, verify expected RED)
completed: 2026-04-30
---

# Phase 4 Plan 03: netball-stats + netball-summary Playwright specs Summary

**Two new Playwright specs land NETBALL-05 + NETBALL-06 acceptance gates: netball-stats.spec.ts proves the sport-branch dispatch routes netball cleanly to NetballDashboardShell with no AFL aggregator leak, and netball-summary.spec.ts proves the track_scoring=true summary card renders fully — and locks in a RED regression test for the track_scoring=false suppression that plan 04-04 will take green.**

## Performance

- **Duration:** ~25min (interactive)
- **Started:** 2026-04-30 (post 04-01 close-out, parallel with 04-02 which authored netball-walkthrough.spec.ts)
- **Completed:** 2026-04-30
- **Tasks:** 2 substantive (Tasks 1 and 2) — both `type="auto"`, fully autonomous (no checkpoints)
- **Files modified:** exactly 2 — `e2e/tests/netball-stats.spec.ts` and `e2e/tests/netball-summary.spec.ts` — matches the plan's `files_modified` declaration verbatim

## Accomplishments

### NETBALL-05 (stats dashboard) — fully green

`e2e/tests/netball-stats.spec.ts` ships two tests:

1. **"stats dashboard renders all 5 sections after a finalised netball game"** — seeds a 4-quarter completed netball game (lineup_set with proper { positions, bench } shape; quarter_start/end for Q1-Q4; one goal + one opponent_goal under track_scoring=true; games.status flipped to 'completed'); navigates to `/teams/{teamId}/stats`; asserts headings for "Player statistics", "Minutes equity", "Player chemistry — top pairs", "Head-to-head by opponent", "Attendance"; asserts a "GS NN%" per-position breakdown line is visible under the Attack column. **PASSES.**
2. **"stats dashboard does NOT render AFL aggregator headings"** — same setup; asserts the AFL-only headings "Winning combinations", "Position fit", "Quarter scoring" all have `count=0` on the page. **PASSES.**

The dispatch correctness lockdown (CONTEXT D-CONTEXT-stats-dashboard-coverage) is covered: if the sport-branch in stats/page.tsx ever regresses such that AFL aggregators run on a netball team, this spec lights up red.

### NETBALL-06 (summary card) — 1 PASS + 1 RED-by-design

`e2e/tests/netball-summary.spec.ts` ships two tests:

1. **"track_scoring=true summary card renders result + goals + player list"** — seeds a finalised game with 2 player-attributed goals + 1 opponent_goal; navigates to the live route; asserts the "Game summary" heading, "Copy for group chat" button, and the body text containing "🏐 Full time", a "def" result line, "🥅 Goals:", "👟 N players", "⏱ Game time". **PASSES.**

   Captured live output:
   ```
   🏐 Full time — NB-Sum-... v Test Opponent
   NB-Sum-... 2 def Test Opponent 1
   🥅 Goals: Alicia, Brendan
   👟 7 players
   ⏱ Game time
   <per-player rows with thirds breakdown>
   ```

2. **"track_scoring=false summary card omits result and goals lines"** — seeds the same finalised-game shape but with `track_scoring=false` and zero goal events; asserts that no "def {N}", "drew with", or "🥅" substring appears in the body, while `⏱ Game time` and `👟 N players` still render. **RED BY DESIGN.**

   Captured failure (this is the contract for plan 04-04):
   ```
   Expected pattern: not /def\s+\w/i
   Received string:
     🏐 Full time — NB-Sum-... v Test Opponent
     NB-Sum-... 0 drew with Test Opponent 0   ← "drew with" + "{N}" both leak
     👟 7 players
     ⏱ Game time
     <per-player rows>
   ```

   Per CLAUDE.md ("Bug fixes must land with a regression test that fails against the pre-fix code — write the test first, watch it go red, then fix the bug and watch it go green") this is exactly the right shape for the RED → GREEN handoff to plan 04-04.

### Pre-merge invariants intact

- `pre-merge/main` = `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` (untouched)
- `pre-merge/multi-sport` = `e13e787cb8abe405c18aca73e66c7c928eb359d8` (untouched)
- `e2e/tests/playhq-import.spec.ts` PROD-04 `test.fixme` count = 1 (untouched)
- No `src/`, `supabase/`, `scripts/`, `e2e/fixtures/`, or `e2e/helpers/` drift
- Existing AFL specs untouched — `git diff --name-only e5be276~1..3305457 -- e2e/tests/` returns ONLY the two new files

### Typecheck clean

`npx tsc --noEmit` exits 0 at HEAD `3305457` (post-Task 2). No type regressions across the merged codebase from the new specs.

## Task Commits

Each task was committed atomically per CLAUDE.md commit style:

1. **Task 1: Author e2e/tests/netball-stats.spec.ts** — `e5be276` (`test(04-03): add netball-stats spec for NETBALL-05`)
2. **Task 2: Author e2e/tests/netball-summary.spec.ts** — `3305457` (`test(04-03): add netball-summary spec for NETBALL-06`)

## Files Created/Modified

### Created
- `e2e/tests/netball-stats.spec.ts` (199 lines; 2 `test()` cases) — docstring at top names the plan + the two Rule 1 deviations from PLAN.md verbatim source.
- `e2e/tests/netball-summary.spec.ts` (243 lines; 2 `test()` cases) — same docstring shape; calls out the third deviation specific to summary (the `game_finalised` seed event) plus the explicit "EXPECTED RED until plan 04-04" annotation on the track_scoring=false test.
- `.planning/phases/04-netball-verification-on-merged-trunk/04-03-SUMMARY.md` (this file)

### Modified
None.

### Deleted
None.

## Decisions Made

1. **Three Rule 1 (Bug) deviations from PLAN.md verbatim source** — caught while reading the relevant src/ files at design-read time, before authoring (the plan's `<action>` block was self-consistent but didn't match the actual aggregator + replay code on this trunk). Detailed in §Deviations.

2. **`toHaveCount(0)` over `not.toBeVisible()` for the AFL-aggregator non-leak assertions** — strict non-existence is the correct contract. `not.toBeVisible()` passes BOTH for missing elements AND for hidden-but-present elements; the latter would mask a CSS-only regression where the aggregator headings were rendered but display:none. The plan's source used `not.toBeVisible()`; the deviation is annotated inline.

3. **Inline seedFinalisedNetballGame helper, NOT extracted** — duplicated across the two specs. Per e2e/README.md and CONTEXT D-CONTEXT-test-scaffolding the rule is "factory for setup, UI for the feature under test, helpers when ≥3 specs need the same shape". Two specs duplicating ~50 lines is acceptable; Phase 5 will extract if 04-05 (netball-live-flow) ends up needing the same finalised-state setup.

4. **Pre-set `nb-walkthrough-seen` rather than clearing it** — these specs are about the FINALISED state, not the walkthrough. The walkthrough modal would intercept pointer events on first visit and dim the live shell, which would break the summary-card assertions. CONTEXT D-CONTEXT-walkthrough-localStorage-cleanup explicitly carves out this "set the flag to bypass" branch for non-walkthrough specs.

5. **`ageGroup: "U10"` passed to `makePlayers` and `makeGame`** — sidesteps the AGE_GROUPS["go"] absence (the AGE_GROUPS table is AFL-shaped; "go" is a netball-only id that lives in netballSport.ageGroups). The team itself uses `ageGroup: "go"` (which IS valid for netball), but the factory's defaultOnFieldSize lookup runs against AGE_GROUPS — passing "U10" gets us a sane on_field_size of 12 (overridden by the explicit `count: 9` for makePlayers anyway).

## Deviations from Plan

The plan's `<action>` blocks contained three latent bugs that would have made the specs render-pass but content-blind. All three were caught at design-read time by cross-referencing the source code (NetballGameSummaryCard.tsx, replayNetballGame, replayNetballGameForStats, normaliseGenericLineup) and fixed inline with annotation comments at the top of each spec.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong event type for goals**
- **Found during:** Task 1 (design-read of replayNetballGameForStats / replayNetballGame)
- **Issue:** PLAN.md's source draft used `type: "score"` with `metadata: { kind: "goal", side: "team"|"opp" }`. The aggregator and replay functions both read `type: "goal"` (team) and `type: "opponent_goal"` (opponent) directly — NOT a generic "score" event with discriminator metadata. Score events would have been ignored entirely; both teams stay 0-0; `hasScoringData=false`; the summary card emits "drew with 0" forever even when the test thinks it's seeded a winning game.
- **Fix:** Use `type: "goal"` (with optional `player_id` for player-attributed) and `type: "opponent_goal"` directly. Quarter is preserved in `metadata.quarter` for the per-quarter rollup.
- **Files modified:** `e2e/tests/netball-stats.spec.ts`, `e2e/tests/netball-summary.spec.ts`
- **Commits:** `e5be276`, `3305457`
- **Source-of-truth:** `src/lib/sports/netball/fairness.ts:690` (`else if (ev.type === "goal")`), `src/lib/sports/netball/fairness.ts:698` (`else if (ev.type === "opponent_goal")`), and the same dispatch in `src/lib/dashboard/netballAggregators.ts:176`.

**2. [Rule 1 - Bug] Wrong lineup metadata shape**
- **Found during:** Task 1 (design-read of normaliseGenericLineup)
- **Issue:** PLAN.md's source draft wrote `metadata: { lineup: { gs: [id], ga: [id], ... } }` — a flat key map. `normaliseGenericLineup` at `fairness.ts:267` reads `meta.lineup.positions` (the position map nested under a `positions` key) and `meta.lineup.bench` (an explicit bench array). With the flat shape, `meta.lineup.positions` is `undefined`, the lineup is empty, no per-player time is accrued, and the summary card's `⏱ Game time` block + the stats page's per-position breakdown both silently render empty.
- **Fix:** Nest the lineup under `{ positions: { gs: [id], ga: [id], ... }, bench: [...] }`. Bench is populated with the leftover players (squad minus the 7 starters) so the squad-list union in fairness.ts:172 picks them up.
- **Files modified:** `e2e/tests/netball-stats.spec.ts`, `e2e/tests/netball-summary.spec.ts`
- **Commits:** `e5be276`, `3305457`
- **Source-of-truth:** `src/lib/sports/netball/fairness.ts:24-27` (`GenericLineup` interface), `:267-272` (`normaliseGenericLineup`), and `src/lib/dashboard/netballAggregators.ts:144-153` (the same `lineup.positions` access in the stats aggregator).

**3. [Rule 1 - Bug] Missing `game_finalised` event in summary spec seed**
- **Found during:** Task 2 (design-read of NetballLiveGame.tsx finalised branch + replayNetballGame)
- **Issue:** PLAN.md's seed pattern set `games.status = 'completed'` and assumed that was sufficient to render the summary card. It is not. NetballLiveGame.tsx:909 mounts `<NetballGameSummaryCard>` only when `state.finalised === true`, and `replayNetballGame` at `fairness.ts:688` flips `state.finalised` ONLY on a `type: "game_finalised"` event in the events stream. Without that event the live page falls through to the in-quarter / Q-break branch, the summary card never mounts, and the test times out at the `getByRole("heading", { name: /game summary/i })` assertion.
- **Fix:** Append a `{ type: "game_finalised", metadata: {}, created_at: ts(41), ... }` event after the Q4 close in the summary spec's seed. (Stats spec doesn't need this — the stats page filters by `games.status === 'completed'`, not by the event.)
- **Files modified:** `e2e/tests/netball-summary.spec.ts`
- **Commit:** `3305457`
- **Source-of-truth:** `src/components/netball/NetballLiveGame.tsx:908-940` (finalised branch + summary card mount), `src/lib/sports/netball/fairness.ts:688-689` (event → state.finalised).

All three deviations were autonomous Rule 1 fixes — fixing them does not change the spec's INTENT, only its CORRECTNESS. The plan's `<action>` text described the right test surface; the seed code beneath it just didn't match the source contracts. Inline comments at the top of both specs name plan 04-03 and link to this SUMMARY for the audit trail.

### Out-of-scope discoveries
None requiring follow-up. The plan-04-04 source-fix surface (NetballGameSummaryCard track_scoring suppression) is named explicitly in the spec comment + RED test comment block; no separate deferred-items.md entry needed.

## Issues Encountered

- **First `npm run e2e` invocation hit `Database error finding users`** during auth.setup.ts — known transient where the Supabase auth schema needs a moment after `db reset` for `listUsers` to settle. Re-running the e2e command resolved it cleanly. Not a deviation, not a Phase 4 bug; the same flake has been documented in earlier 03-* SUMMARYs.

- **Second `npm run e2e` invocation hit `error running container: exit 1`** during `supabase db reset` — the local Supabase CLI's reset path occasionally fails its container restart on Windows. Re-running the command resolved it. Same not-a-bug story.

- **The track_scoring=false RED test was caught by `expect(text).not.toMatch(/def\s+\w/i)`** — the regex matches "drew with " (because the trailing word starts the next match window) when the body contains "0 drew with Test Opponent 0". The next assertion `expect(text).not.toMatch(/drew with/i)` would also have caught it; both are belt-and-braces. Plan 04-04 needs to suppress the entire result line, which both regexes will lock in.

## User Setup Required

None — no new env vars, no MCP additions, no service config. Specs run on the same local Supabase + super-admin storageState that every existing spec inherits.

## Next Phase Readiness

**Hand-off to Plan 04-04 (NetballGameSummaryCard track_scoring source fix):**
- `e2e/tests/netball-summary.spec.ts:197-243` is the regression-test contract. Take it green.
- The fix surface is `src/components/netball/NetballGameSummaryCard.tsx` — its `Props` interface needs a `trackScoring: boolean` field, the `buildSummary` function needs to early-return / skip the result-line + goals-line block when `trackScoring === false`, and the prop needs to thread through `NetballLiveGame.tsx:908-940` from the team row's `track_scoring` value (which the live page already loads at line 76).
- Verify with `npm run e2e -- e2e/tests/netball-summary.spec.ts --workers=1`: 2/2 PASS post-fix.

**Hand-off to Plan 04-05 (netball-live-flow.spec.ts):**
- The seed pattern in this plan's two specs is the canonical netball finalised-state setup. 04-05 will likely re-use the same Q1-Q4 + lineup_set + game_finalised shape; if it does, the inline helper should be extracted to `e2e/helpers/netball-seed.ts` (Phase 5 hygiene).
- Notable gotchas captured: (a) goal/opponent_goal event types not "score"; (b) lineup nested under positions/bench; (c) game_finalised event required for the live-page summary card to render.

**Hand-off to Plan 04-07 (full gauntlet + Phase 5 hand-off):**
- 04-07's evidence file should report 04-03 outcome as: "netball-stats green; netball-summary 1 PASS + 1 expected-RED with the named follow-up plan 04-04". This is NOT a regression flag for Phase 5's gate.

**No blockers for downstream plans.**

## Self-Check: PASSED

Verification commands run on `merge/multi-sport-trunk` worktree (HEAD = `3305457`):

| Check | Command | Result |
|-------|---------|--------|
| Task 1 commit exists | `git log --oneline \| grep e5be276` | match present |
| Task 2 commit exists | `git log --oneline \| grep 3305457` | match present |
| netball-stats.spec.ts exists | `ls e2e/tests/netball-stats.spec.ts` | present (199 lines) |
| netball-summary.spec.ts exists | `ls e2e/tests/netball-summary.spec.ts` | present (243 lines) |
| Stats spec has 2 test() cases | `grep -c '^test(' e2e/tests/netball-stats.spec.ts` | 2 |
| Summary spec has 2 test() cases | `grep -c '^test(' e2e/tests/netball-summary.spec.ts` | 2 |
| `npx tsc --noEmit` exits 0 | `npx tsc --noEmit; echo $?` | 0 |
| `npm run e2e` netball-stats: both PASS | `npm run e2e -- e2e/tests/netball-stats.spec.ts` | 2/2 PASS |
| `npm run e2e` netball-summary: track_scoring=true PASS | spec line 153 | PASS |
| `npm run e2e` netball-summary: track_scoring=false RED-by-design | spec line 197 | FAIL with `not /def\s+\w/i` mismatch on "0 drew with Test Opponent 0" |
| AFL aggregator non-leak proven | toHaveCount(0) on /winning combinations/, /position fit/, /quarter scoring/ | passing |
| No `src/` drift | `git status --short src/` | empty |
| No `supabase/` drift | `git status --short supabase/` | empty |
| No `scripts/` drift | `git status --short scripts/` | empty |
| No `e2e/fixtures/` drift | `git status --short e2e/fixtures/` | empty |
| No `e2e/helpers/` drift | `git status --short e2e/helpers/` | empty |
| AFL specs untouched | `git diff --name-only e5be276~1..3305457 -- e2e/tests/` | only netball-stats.spec.ts + netball-summary.spec.ts |
| `pre-merge/main` tag frozen (D-21) | `git rev-parse pre-merge/main` | `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` |
| `pre-merge/multi-sport` tag frozen (D-21) | `git rev-parse pre-merge/multi-sport` | `e13e787cb8abe405c18aca73e66c7c928eb359d8` |
| PROD-04 fixme intact | `grep -c "test\.fixme" e2e/tests/playhq-import.spec.ts` | 1 |

All 19 self-check items PASSED.

---
*Phase: 04-netball-verification-on-merged-trunk*
*Plan: 03*
*Completed: 2026-04-30*
