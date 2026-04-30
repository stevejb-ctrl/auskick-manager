---
phase: 04-netball-verification-on-merged-trunk
plan: 02
subsystem: walkthrough
tags: [e2e, playwright, walkthrough, netball, NETBALL-07, track_scoring, regression-test]

# Dependency graph
requires:
  - phase: 04-netball-verification-on-merged-trunk
    provides: Wave 1 (.gitignore + e2e/helpers/seed-audit.ts); CONTEXT D-CONTEXT-walkthrough-localStorage-cleanup; CONTEXT D-CONTEXT-track-scoring-matrix; merge/multi-sport-trunk HEAD 66cdecb (Wave 1 close-out)
  - phase: 04-netball-verification-on-merged-trunk (CONTEXT)
    provides: D-CONTEXT-test-scaffolding (e2e/tests new files allowed; src/ off-limits); D-CONTEXT-seed-strategy (factories.makeTeam fallback used — Kotara not required for walkthrough)
provides:
  - "e2e/tests/netball-walkthrough.spec.ts — 237-line, 4-test Playwright spec covering NETBALL-07 (first-visit fire, persistence, scoring-step gate both branches, '?' button reopen)"
  - "Regression test ahead of fix for plan 04-04 — track_scoring=false case is intentionally RED on the merged trunk; goes GREEN once 04-04 wires team.track_scoring through NetballLiveGame.tsx:801"
  - "sessionStorage-guarded addInitScript pattern — clears nb-walkthrough-seen ONLY on first navigation in a test context, so reload-based persistence assertions actually work (deviation 1, generalisable)"
affects:
  - 04-03 (netball-stats / netball-summary specs — same factory-driven setup pattern)
  - 04-04 (track_scoring wiring fix — this spec's track_scoring=false case is the green-light proof)
  - 04-05 (netball-live-flow spec — sessionStorage-guarded addInitScript pattern reusable verbatim)
  - 04-07 (full gauntlet — 1 known-RED case must be tracked in the gauntlet header until 04-04 lands)
  - phase 5 (test+type green — NETBALL-07 satisfied modulo the documented regression-test red case)

# Tech tracking
tech-stack:
  added: []  # No new libraries
  patterns:
    - "Regression-test-ahead-of-fix per CLAUDE.md — the failing case ships in the same commit as its assertion; 04-04 watches it go green"
    - "sessionStorage-guarded addInitScript — clears localStorage on first navigation but NOT on reload, so persistence assertions survive the page.reload() in test 2"
    - "Last-step-only `done` regex — narrow termination button match (`/let.?s go/i`) so step-walking loops actually walk every step (the wider `|skip walkthrough` alternation matches every non-last step and exits the loop at idx=0)"
    - "factories.makeTeam({ sport: 'netball', ageGroup: 'go' }) + makePlayers({ count: 9, ageGroup: 'U10' }) — netball seed fallback per CONTEXT D-CONTEXT-seed-strategy; explicit count + AFL ageGroup dodges the AGE_GROUPS['go'] absence on factories.ts:77"

key-files:
  created:
    - "e2e/tests/netball-walkthrough.spec.ts  # 237 lines; 4 test() cases; 7 addInitScript refs; 8 nb-walkthrough-seen refs; describe.configure parallel mode"
    - ".planning/phases/04-netball-verification-on-merged-trunk/04-02-SUMMARY.md  # this file"
  modified: []
  deleted: []

key-decisions:
  - "Two conservative deviations from the verbatim spec source — both Rule 1 fixes for authoring bugs that would have made the assertion structure unsound (test 2 reload-unsafe init, test 4 vacuous loop). Both fixes documented inline in the spec + commit body so future readers see the reasoning."
  - "Kept the planned addInitScript-with-/skip walkthrough/-OR for tests 1, 2, 3 — the documented intent there is 'either Skip or Let's go closes the modal', and the count-of-addInitScript invariant (≥4) plus the architectural dismissal-via-Skip path are all preserved. Only the track_scoring=false test 4 needs the narrowed regex because it's the only test that depends on visiting every step."
  - "Track_scoring=false case ships RED-by-design — the test exists precisely to catch the trackScoring hard-coding at NetballLiveGame.tsx:801. Plan 04-04 (Wave 3) is the source-fix plan and will turn this case green."
  - "Used factories.makeTeam fallback (CONTEXT D-CONTEXT-seed-strategy point 2) over Kotara — walkthrough doesn't need season history, fresh team is the right path."

patterns-established:
  - "Pattern: sessionStorage guard for addInitScript-driven localStorage cleanup. Use this whenever a Playwright spec needs to clear a localStorage key on the first navigation but assert that the key persists across page.reload() afterwards."
  - "Pattern: 'last-step-only done regex' for stepping-through-modal loops. The Skip/Let's go alternation is fine for any test that just wants to dismiss the modal; tests that need to visit every step must narrow to the last-step-only button."
  - "Pattern: regression test ships in the SAME commit as the assertion that targets a known-but-unfixed source-bug. The bug fix in a future plan flips the case green; the spec lands first, watches it red, then watches it green."

requirements-completed: [NETBALL-07]  # ⚠ partial: 3/4 cases green, 1/4 red-by-design pending plan 04-04. Full NETBALL-07 acceptance is reached when 04-04 lands and the track_scoring=false case turns green in the gauntlet.

# Metrics
duration: ~25min (interactive — read plan + CONTEXT + Wave 1 SUMMARY + WalkthroughModal source, author spec, run typecheck, run spec, fix two real authoring bugs, re-run, commit)
completed: 2026-04-30
---

# Phase 4 Plan 02: netball-walkthrough Playwright spec Summary

**One atomic commit lands `e2e/tests/netball-walkthrough.spec.ts` — 237 lines, 4 test() cases — proving NETBALL-07 on the merged trunk: walkthrough fires on first visit, `nb-walkthrough-seen` persists across reload, the "?" button reopens on demand, and the "Recording scores" step is correctly gated on `team.track_scoring`. Three of the four cases pass; the fourth (`track_scoring=false omits scoring step`) is the regression test ahead of plan 04-04's fix at NetballLiveGame.tsx:801 — RED-by-design per CLAUDE.md's "write the test first, watch it go red, then fix the bug" rule.**

## Performance

- **Duration:** ~25min (interactive)
- **Started:** 2026-04-30 (post Wave 1 plan 04-01 close-out, parallel with plan 04-03)
- **Completed:** 2026-04-30
- **Tasks:** 1 substantive (Task 1) — `type="auto"`, fully autonomous (no checkpoints, two Rule 1 fixes)
- **Files modified:** exactly 1 (`e2e/tests/netball-walkthrough.spec.ts`) — matches the plan's `files_modified` declaration verbatim

## Accomplishments

- **NETBALL-07 e2e coverage authored.** The spec covers all four facets the requirement names:
  1. First-visit fire (welcome heading visible after navigation when `nb-walkthrough-seen` is absent).
  2. Persistence + reopen — closing the modal writes `nb-walkthrough-seen="1"`, reload no longer surfaces the welcome heading, AND the "?" button in the top utility row re-opens the walkthrough on demand (`skipWelcome=true` — first step renders directly).
  3. `track_scoring=true` includes the "Recording scores" step (visited via Next-button stepping).
  4. `track_scoring=false` omits the "Recording scores" step — fails today by design; will pass once plan 04-04 wires the prop.
- **Spec authoring invariants all green.**
  - 237 lines (≥180 required) — `wc -l` confirms.
  - 4 `test(` cases (=4 required) — `grep -cE '^test\(' e2e/tests/netball-walkthrough.spec.ts` returns 4.
  - 7 `addInitScript` references (≥4 required) — every test that mounts the live page clears `nb-walkthrough-seen` before navigation.
  - 8 `nb-walkthrough-seen` references (≥4 required) — every test references the localStorage key.
- **Run outcome confirmed: 3 PASS / 1 FAIL, with the FAIL being the intentional regression case** (`NETBALL-07: track_scoring=false walkthrough OMITS the recording-scores step`). The error message at line 227 — `Expected: false, Received: true` on `expect(scoringHeading.isVisible()).toBe(false)` — is exactly what we want: the "Recording scores" heading IS visible because `NetballLiveGame.tsx:801` hard-codes `trackScoring: true`. Plan 04-04 fixes the source; the assertion will then succeed.
- **Phase 3 invariants intact.**
  - `pre-merge/main` = `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` (untouched).
  - `pre-merge/multi-sport` = `e13e787cb8abe405c18aca73e66c7c928eb359d8` (untouched).
  - `e2e/tests/playhq-import.spec.ts` PROD-04 fixme: `git diff` is empty; `grep -c "test\.fixme"` returns 1.
  - `src/`, `supabase/`, `scripts/`, `e2e/fixtures/`, `e2e/helpers/`, all existing AFL specs: zero drift — `git diff --name-only HEAD~1 HEAD` shows only `e2e/tests/netball-walkthrough.spec.ts`.
- **`npx tsc --noEmit` exits 0** at HEAD `d701ebe`. No type regressions across the merged codebase.

## Task Commits

Each task was committed atomically per CLAUDE.md commit style:

1. **Task 1: Author e2e/tests/netball-walkthrough.spec.ts with four NETBALL-07 cases** — `d701ebe` (`test(04-02): add netball-walkthrough spec covering NETBALL-07`)

## Files Created/Modified

### Created
- `e2e/tests/netball-walkthrough.spec.ts` (237 lines) — Module-level header explains the regression-test-ahead-of-fix rationale, the `addInitScript`-must-clear-pre-goto requirement (CONTEXT D-CONTEXT-walkthrough-localStorage-cleanup), and the explicit reason the `track_scoring=false` case is RED. Inline JSDoc-ish comments document each fixture-call's why (e.g., why `count: 9` + `ageGroup: "U10"` is needed on `makePlayers` despite the team being `ageGroup: "go"`). Exports nothing — Playwright auto-discovers `test()` calls.
- `.planning/phases/04-netball-verification-on-merged-trunk/04-02-SUMMARY.md` (this file).

### Modified
None.

### Deleted
None.

## Decisions Made

1. **Two conservative deviations from the verbatim spec source** — both Rule 1 fixes for authoring bugs that I verified empirically by running the spec:

   **Deviation 1 — Test 2 persistence (sessionStorage-guarded `addInitScript`).** The original draft used `addInitScript` to call `localStorage.removeItem("nb-walkthrough-seen")`. But Playwright's `addInitScript` runs on EVERY navigation in the page — including `page.reload()`. So after the test closes the modal (writing `nb-walkthrough-seen=1`) and then reloads, the init script re-clears the key, the welcome modal re-opens, and the "reload skips walkthrough" assertion fails. Empirically observed in run #2: test 2 timed out at the `?` button click because the welcome dialog was intercepting pointer events. Fix: guard the clear with a `sessionStorage` flag — the first navigation clears `nb-walkthrough-seen` AND sets `nb-walkthrough-cleared`; subsequent navigations (including reload) see the flag and skip the clear. `sessionStorage` is per-tab and survives reload but resets per Playwright context, so each test starts fresh. Inline comment in the spec at lines 102-110 explains the why for future readers.

   **Deviation 2 — Test 4 loop termination (narrow `done` regex).** The original draft used `done = page.getByRole("button", { name: /let.?s go|skip walkthrough/i })` — i.e., dismiss button OR skip-link. But the WalkthroughModal renders the "Skip walkthrough" link on EVERY non-last step (per `WalkthroughModal.tsx:168`). So the original loop would see `done.isVisible() === true` on idx=0 and `break` immediately, never advancing through the modal — and never asserting on the step where "Recording scores" would render. Empirically observed in run #2: test 4 reported PASS when it should have failed, because the loop body's `expect(scoringHeading.isVisible()).toBe(false)` ran exactly once at idx=0 (where the heading is genuinely not visible) and then exited. This made the assertion vacuous and would silently mask the very source-bug the test is meant to catch. Fix: narrow `done` to `/let.?s go/i` only — the loop now walks every step, evaluating the assertion at each idx, and fails when "Recording scores" appears (as it does today at idx=7 due to the hard-coded `trackScoring: true`). Inline comment at lines 222-228 of the spec explains the why.

2. **Tests 1, 2, 3 keep the wider `done` regex.** The Skip-vs-LetsGo alternation is fine in those tests:
   - Test 1 doesn't loop through steps at all.
   - Test 2 actively wants either path to close the modal — the documented intent is "either Skip or Let's go closes the walkthrough; localStorage gets the persistence write either way". The wider regex makes the test robust to which step the loop happens to enter.
   - Test 3's loop has a different exit condition (`foundScoringStep = true`), so the `done` regex is irrelevant in the success path.

3. **Track_scoring=false case ships RED-by-design.** Per CLAUDE.md: "Bug fixes must land with a regression test that fails against the pre-fix code — write the test first, watch it go red, then fix the bug and watch it go green." The plan's task spec explicitly designs this test to fail until plan 04-04 wires `team.track_scoring` through to `buildNetballWalkthroughSteps`. The header comment in the spec, the commit body, and this SUMMARY all document the red-by-design state so the gauntlet operator knows it's not a regression.

4. **Used `factories.makeTeam` fallback rather than Kotara Koalas seed.** CONTEXT D-CONTEXT-seed-strategy point 2 explicitly enumerates this — fresh teams are the right primitive for spec isolation. Walkthrough has no dependency on season history, so the Kotara branch (which is `{ present: false }` locally per Wave 1) is moot.

5. **`count: 9` + `ageGroup: "U10"` on `makePlayers`** despite the team being created with `ageGroup: "go"`. The factory's `defaultOnFieldSize + 4` lookup at `factories.ts:77` reads from `AGE_GROUPS`, which is AFL-shaped — `AGE_GROUPS["go"]` doesn't exist. Passing `count: 9` short-circuits the lookup, and `ageGroup: "U10"` keeps the destructure non-undefined for any future code paths. Documented inline at lines 60-66.

## Deviations from Plan

Two Rule 1 fixes (covered above as "Decisions Made #1"). Re-stated here for the deviation register:

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 2's `addInitScript` re-clears localStorage on reload, defeating persistence assertion**
- **Found during:** Task 1 — first spec run (run #2 in /tmp/04-02-spec-run2.log)
- **Issue:** `addInitScript` runs on every navigation including `page.reload()`. The naive `localStorage.removeItem` re-clears the key after persistence is established. Welcome modal re-opens on reload, intercepts pointer events, "?" button click times out at 30s.
- **Fix:** Wrapped the clear in a `sessionStorage` guard so it runs only on the first navigation per test context. SessionStorage survives reload but resets per Playwright context, preserving test isolation while making the persistence assertion correct.
- **Files modified:** `e2e/tests/netball-walkthrough.spec.ts` (lines 102-114, in test 2's setup)
- **Commit:** `d701ebe`

**2. [Rule 1 - Bug] Test 4's `done` regex matches every non-last step's "Skip walkthrough" link, terminating loop at idx=0 and making the assertion vacuous**
- **Found during:** Task 1 — first spec run, where test 4 was reporting PASS despite the source-bug it's supposed to catch still being present
- **Issue:** The `WalkthroughModal` renders "Skip walkthrough" on every non-last step (`WalkthroughModal.tsx:168`). The draft's `/let.?s go|skip walkthrough/i` matched at idx=0, making the loop break before reaching the scoring step. The assertion `expect(scoringHeading.isVisible()).toBe(false)` ran exactly once at idx=0 (where it's genuinely not visible) and then exited — silently masking the very source-bug the test is meant to catch.
- **Fix:** Narrowed test 4's `done` regex to `/let.?s go/i` (last-step button only). The loop now walks every step; the assertion fires at the scoring step's idx and fails as designed.
- **Files modified:** `e2e/tests/netball-walkthrough.spec.ts` (lines 222-238, in test 4's loop)
- **Commit:** `d701ebe`

## Issues Encountered

- **Transient `supabase db reset` failure on first re-run.** After making the two fixes and re-running `npm run e2e`, the `supabase db reset` step failed with "failed to create migration table: unexpected EOF" then "error running container: exit 1" on the next attempt. Cause: the local Supabase Docker stack was still settling from the previous run's restart. Polled `supabase status` for ~60s until "supabase local development setup is running" was reported, then re-ran the spec successfully. No spec changes needed; this is a known docker-startup race documented in CONTEXT (Phase 5 hand-off side-finding #2 — "stale-dev-server detection in scripts/e2e-setup.mjs"). Recording it here so Phase 5 has another data point if it eventually addresses that hygiene gap.

- **track_scoring=false test FAIL is the only failure** in the spec run — exactly as the plan author designed. The error is `Expected: false, Received: true` on the scoring-heading visibility assertion at line 227. This is the regression test waiting for plan 04-04's source fix.

## User Setup Required

None — no external service configuration required. The spec runs against the same local Supabase that all e2e specs already target (`http://127.0.0.1:54321` with the deterministic CLI demo keys from `.env.test`).

## Next Phase Readiness

**Hand-off to Plan 04-03 (netball-stats / netball-summary specs):**
- Same factory-driven setup pattern is reusable: `setupNetballGame({ trackScoring })` helper here is a model for similar setup helpers in those specs.
- The sessionStorage-guarded `addInitScript` pattern is generally useful for any spec that needs to clear a localStorage key on first navigation but assert it survives reload.

**Hand-off to Plan 04-04 (track_scoring wiring fix at NetballLiveGame.tsx:801):**
- This spec's failing test 4 is the green-light proof. Once 04-04 reads `team.track_scoring` from the live page's data and threads it through `buildNetballWalkthroughSteps({ trackScoring: <real value> })`, test 4 turns green automatically.
- 04-04 should re-run `npm run e2e -- e2e/tests/netball-walkthrough.spec.ts --workers=1 --reporter=line` and verify 4/4 PASS as part of its done-block.

**Hand-off to Plan 04-05 (netball-live-flow spec):**
- The factory caveat documented in this spec (`count: 9` + `ageGroup: "U10"` on `makePlayers` despite the team being `ageGroup: "go"`) is the same constraint 04-05 will hit. Reuse the same idiom.

**Hand-off to Plan 04-07 (full gauntlet + Phase 5 hand-off):**
- The 04-EVIDENCE.md should call out: "netball-walkthrough.spec.ts ships at 4 tests; 3/4 PASS; 1/4 RED-by-design on track_scoring=false until plan 04-04 lands. The RED case is NOT a regression — it is the regression test ahead of fix per CLAUDE.md."
- Once 04-04 lands and the case turns green, the gauntlet header should be updated to reflect the now-fully-green NETBALL-07 status.

**Hand-off to Phase 5 (test + type green):**
- NETBALL-07 acceptance is partially met by this spec: 3/4 cases prove the requirement on the trunk, and the 4th case is queued for 04-04. Phase 5's "test + type green" milestone is achievable as soon as 04-04 ships and flips test 4 green.
- The sessionStorage pattern is a candidate for a shared helper (`e2e/helpers/walkthrough.ts`?) if Phase 5 wants to canonicalise it across multiple netball specs (04-05's live-flow is the most likely consumer).

**No blockers carried into Plan 04-03 or 04-04.**

## Self-Check: PASSED

Verification commands run on `merge/multi-sport-trunk` worktree (HEAD = `d701ebe`):

| Check | Command | Result |
|-------|---------|--------|
| Task 1 commit exists | `git log --oneline \| grep d701ebe` | match present |
| Spec file exists | `ls -la e2e/tests/netball-walkthrough.spec.ts` | present (237 lines) |
| 4 `test()` cases | `grep -cE '^test\(' e2e/tests/netball-walkthrough.spec.ts` | 4 |
| ≥4 `addInitScript` refs | `grep -c 'addInitScript' e2e/tests/netball-walkthrough.spec.ts` | 7 |
| ≥4 `nb-walkthrough-seen` refs | `grep -c 'nb-walkthrough-seen' e2e/tests/netball-walkthrough.spec.ts` | 8 |
| Spec ≥180 lines | `wc -l e2e/tests/netball-walkthrough.spec.ts` | 237 |
| `npx tsc --noEmit` exits 0 | `npx tsc --noEmit; echo $?` | 0 |
| No `netball-walkthrough` in tsc errors | `grep -c 'netball-walkthrough' /tmp/04-02-tsc2.log` | 0 |
| Spec run reports 3 PASS / 1 FAIL | `tail -5 /tmp/04-02-spec-run5.log` | "1 failed ... 4 passed" |
| Failure is the track_scoring=false case | grep error in /tmp/04-02-spec-run5.log | "track_scoring=false walkthrough OMITS the recording-scores step" — line 227 expectation |
| Failure file path | `ls test-results/` after run | `netball-walkthrough-NETBAL-a38ea-S-the-recording-scores-step-chromium/` |
| No `src/` drift | `git diff --name-only HEAD~1 HEAD; git status --short src/` | only `e2e/tests/netball-walkthrough.spec.ts`; nothing in src/ |
| No `supabase/` drift | `git status --short supabase/` | (empty) |
| No `scripts/` drift | `git status --short scripts/` | (empty) |
| No `e2e/fixtures/` drift | `git status --short e2e/fixtures/` | (empty) |
| No `e2e/helpers/` drift | `git status --short e2e/helpers/` | (empty) |
| `pre-merge/main` tag frozen (D-21) | `git rev-parse pre-merge/main` | `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` |
| `pre-merge/multi-sport` tag frozen (D-21) | `git rev-parse pre-merge/multi-sport` | `e13e787cb8abe405c18aca73e66c7c928eb359d8` |
| PROD-04 fixme intact | `grep -c "test\.fixme" e2e/tests/playhq-import.spec.ts` | 1 |
| `playhq-import.spec.ts` unchanged | `git diff e2e/tests/playhq-import.spec.ts \| wc -l` | 0 |

All 19 self-check items PASSED.

---
*Phase: 04-netball-verification-on-merged-trunk*
*Plan: 02*
*Completed: 2026-04-30*
