# Phase 4 plan-set verification

**Phase:** 04-netball-verification-on-merged-trunk  
**Plans verified:** 7 (04-01 through 04-07)  
**Status:** revisions_needed  
**Date:** 2026-04-30

## Verdict

REVISIONS_NEEDED. Plan structure is sound (waves, dependencies, autonomy markers, hand-off invariants) but several specs assert against UI strings and patterns that DO NOT exist in the source code. Plans 04-02, 04-04, 04-05, 04-06 will produce non-trivial test failures that are NOT the intentional regression test the planner labels them as. They are spec authoring mistakes that misread the actual netball component surface.

## Section 1: Goal-coverage matrix

| Roadmap success criterion | Plan(s) | Coverage | Notes |
|--|--|--|--|
| 1. NetballLiveGame six-state machine (pre-kickoff -> pre-Q1 -> live -> Q-break -> live -> finalised) with countdown + pause/resume + auto-end-at-hooter | 04-05 | automated | GAP: pre-kickoff + live + auto-hooter covered; pause/resume + between-Q4-and-finalise + finalised states NOT explicitly asserted |
| 2. NetballQuarterBreak rotation suggestions with all 5 fairness tiers + tie-breaks | 04-06 + Vitest netballFairness.test.ts | automated | Vitest covers tier ordering; e2e covers tier 1 (unplayed-third) end-to-end. Tiers 2-5 unit-tested only. Acceptable per CONTEXT |
| 3. Goal scoring flow fully wired: GS/GA tap -> confirm sheet -> recordNetballGoal -> 8s undo toast -> persistent chip -> per-player counts | 04-05 | automated | GAP: 8s toast + score_undo asserted; persistent-chip-replaces-toast transition NOT explicitly asserted |
| 4. track_scoring=false suppresses scoring on every surface | 04-02 + 04-03 + 04-04 + 04-05 | automated + checkpoint | Covered, but several assertions fail on actual UI copy - see Section 4 BLOCKERS |
| 5. Stats dashboard renders 5 sections + sport-branched aggregator | 04-03 | automated | Covered |
| 6. First-visit walkthrough fires + persistence + scoring step gate | 04-02 + Vitest | automated | BLOCKER: asserts heading Starting the game without first dismissing Welcome to Game Manager phase - see Section 4 |
| 7. Long-press actions modal + mid-quarter replacement + late-arrival | 04-05 | automated | Covered |

## Section 2: Requirements coverage matrix

| Req | Acceptance gate | Plan(s) | Status |
|--|--|--|--|
| NETBALL-01 | Six-state machine | 04-05 | Partial (pause/resume not tested) |
| NETBALL-02 | 5 fairness tiers + tie-breaks | 04-06 + Vitest | Covered |
| NETBALL-03 | Goal flow + 8s undo + persistent chip | 04-05 | Partial (persistent chip post-8s not asserted) |
| NETBALL-04 | track_scoring=false suppression | 04-02 + 04-03 + 04-04 + 04-05 + checkpoint | Covered |
| NETBALL-05 | Stats - 5 sections + AFL non-leak | 04-03 | Covered |
| NETBALL-06 | Summary card with track_scoring gates | 04-03 + 04-04 | Covered |
| NETBALL-07 | Walkthrough + persistence + scoring step gate | 04-02 + Vitest | Covered logically (assertions broken by welcome-phase blocker) |
| NETBALL-08 | Long-press + replacement + late-arrival | 04-05 | Covered |
| ABSTRACT-03 | quarter_length priority chain (game -> team -> ageGroup) for netball | 04-05 (two ABSTRACT-03 tests) | Covered (assertion target needs B-4 fix) |
| TEST-05 | Kotara Koalas presence | 04-01 + 04-06 + 04-07 | Correctly handled as audit + skip + Phase 5 follow-up. PASS |

## Section 3: Wave-dependency soundness

- Wave 1: 04-01 (depends_on: []) - no deps
- Wave 2: 04-02 + 04-03 (depends_on: [04-01]) - parallel-independent (different specs)
- Wave 3: 04-04 (depends_on: [04-02, 04-03]) - source fix consumes both red specs
- Wave 4: 04-05 (depends_on: [04-04]) - live-flow needs trackScoring source fix in place
- Wave 5: 04-06 (depends_on: [04-01, 04-05]) - Kotara helper + Q-break entry pattern
- Wave 6: 04-07 (depends_on: [04-01..06]) - gauntlet

No cycles. Parallel waves write disjoint files. Wave numbering matches max(deps) + 1. Autonomy markers correctly identify fragile-area plans (04-04, 04-05) and gauntlet (04-07) as autonomous: false. PASS.

## Section 4: BLOCKERS - assertions that contradict source code

### B-1 [04-02] WalkthroughModal welcome phase blocks every walkthrough test

Severity: BLOCKER

Source: src/components/live/WalkthroughModal.tsx:82-117 - when the modal is in the welcome phase, it renders a Welcome to Game Manager screen with a Yes show me button. The Starting the game heading from netballWalkthroughSteps.ts only renders AFTER tapping Yes show me (which advances the phase to steps).

Plan claim: every walkthrough test does page.goto then immediately asserts getByRole heading name /starting the game/i visible within 5s.

Actual rendered first heading: Welcome to Game Manager (h2 id=wt-welcome-title).

Impact: All 4 tests in netball-walkthrough.spec.ts fail on the first assertion. Plan 04-04 task 1 step 5 then re-runs the spec expecting 4/4 PASS - that will not happen. Cascade: 04-04 verify check fails, blocking Wave 3 to Wave 6.

Fix: Insert a click on getByRole button name /yes, ? show me/i between page.goto and the Starting the game assertion in every test that needs to reach step content. Two of the four tests (localStorage persistence) only need the welcome heading visible to count as walkthrough fired - those two could assert against /welcome to game manager/i instead.

### B-2 [04-02] Close-button copy is Lets go (rocket emoji), not Got it / Done / Finish

Severity: BLOCKER

Source: src/components/live/WalkthroughModal.tsx:164 - close-button copy on the last step is Lets go followed by a rocket emoji. Earlier steps show Next. The Skip walkthrough link at line 174 is the on-demand close affordance.

Plan claim: persistence test bounded loop tries getByRole button name /^(got it|close|done|finish)/i.

Actual button copy: Lets go (last step) or Skip walkthrough (mid-walkthrough escape hatch).

Impact: Persistence test bounded loop never clicks the close button via that regex. Escape keyboard fallback may work for role=dialog only if the modal handles keydown - verify before relying. localStorage assertion (nb-walkthrough-seen === 1) fails because onClose never fires.

Fix: Update regex to /lets go|skip walkthrough/i (with the appropriate apostrophe).

### B-3 [04-05] Lineup picker confirm button is Start game, not Confirm lineup / Start Q1 / Begin

Severity: BLOCKER

Source: src/components/netball/NetballLiveGame.tsx:901 - passes confirmLabel=Start game to NetballLineupPicker.

Plan claim: NETBALL-01 pre-kickoff test expects getByRole button name /(confirm lineup|start q1|begin)/i.

Actual button copy: Start game.

Impact: First clause of .or() never matches. Second clause (getByText /lineup|starting lineup/i) MAY match generic chrome but is fragile.

Fix: Add /start game/i to the regex, or assert directly on Start-game button visibility.

### B-4 [04-05 + 04-06] Netball has NO Select team for Q2 modal - auto-transitions directly

Severity: BLOCKER

Source:
- src/components/netball/NetballLiveGame.tsx:184-198 - auto-hooter fires endNetballQuarter directly when remainingMs less-than-or-equal 0. NO QuarterEndModal exists on netball.
- src/components/netball/NetballLiveGame.tsx:959-1027 - the quarterEnded AND currentQuarter less-than 4 branch renders NetballQuarterBreak immediately. No intermediate user click required.

Plan claim (04-05 ABSTRACT-03 tests): expects getByRole button name /select team for q2/i to be visible.
Plan claim (04-06 enterQBreakView helper): clicks Select team for Q2 button before checking Start Q2.

Actual flow: After auto-hooter fires, the netball page re-renders straight into the Q-break shell. The Q-break shell shows Apply suggested reshuffle plus Start Q2 buttons. There is NO Select team for Q2 CTA - that is an AFL-only string from QuarterEndModal.tsx.

Impact:
- Two ABSTRACT-03 tests in 04-05 (the only verification of NETBALL-relevant ABSTRACT-03 priority chain) fail at the visibility check.
- All 4 tests in 04-06 fail at enterQBreakView step.
- The single most critical multi-game-history test (NETBALL-02 + Kotara) never reaches its real assertion.

Fix: Drop the getByRole button name /select team for q2/i step entirely from the netball flow. After backdating quarter_start past the hooter and page.goto, assert directly on getByRole button name /apply suggested reshuffle/i or /start q2/i - both render without an intermediate click.

### B-5 [04-05] No data-testid player-tile prefix exists on netball position tokens

Severity: BLOCKER

Source: grep -rn data-testid src/components/netball/ returns zero matches. Netball position tokens use aria-label only (PositionToken.tsx:157).

Plan claim: const tile = page.getByTestId(player-tile-PLAYER_ID).or(page.getByText(...).first());

Impact: Primary getByTestId returns empty locator. Playwright .or() falls through to text lookup - but if text matches multiple elements (court + bench + scoring confirm sheet), the locator may throw. Risk: long-press tests target wrong DOM node.

Fix: Drop the testid clause and use getByRole button name new RegExp(player.full_name, i) scoped to the court area. Alternative: plan 04-04 also adds data-testid netball-position-token-POSITION on PositionToken (borderline scope creep, defensible if it unblocks NETBALL-N test).

### B-6 [04-05] Test Opponent assumed but factory exposes only the id

Severity: WARNING

Source: e2e/fixtures/factories.ts:120 - makeGame defaults opponent: Test Opponent but does NOT return opponent name in output (returns only id, on_field_size, share_token).

Plan claim: await expect(page.getByText(/test opponent/i)).toBeVisible();

Impact: String is hardcoded in factories.ts so regex matches in practice - but spec reads Test Opponent by inference, not from factory output. If factory default ever changes, assertion breaks silently.

Fix: Pass explicit opponent option to makeGame and assert against captured value.

### B-7 [04-04 frontmatter] src/app/run/[token]/page.tsx listed in files_modified but planner already knows it does not dispatch netball

Severity: WARNING

Source: src/app/run/[token]/page.tsx:96-119 - only renders LiveGame (AFL); never imports NetballLiveGame. Plan 04-04 task 3 step 2 correctly says: If no, no change required for this file. Drop it from the modify list.

Impact: Frontmatter files_modified includes this file, but action conditional says do not touch. Cosmetic mismatch; verifier flags inclusion as unused.

Fix: Remove src/app/run/[token]/page.tsx from 04-04 frontmatter files_modified.

### B-8 [04-05 task 2] Bench replacement getByRole regex too broad

Severity: WARNING

Source: e2e/fixtures/factories.ts:66-70 - player names are single-word (Brendan). After picking GS player[0]=Alicia and marking injured, plan 04-05 picks bench player[7] by RegExp(player.full_name, i). PickReplacementSheet bench candidate buttons may share name fragments with on-court time-on-court rows, producing multiple matches.

Impact: .or() chain falls through to .first() which may pick the wrong element.

Fix: Scope locator to modal: page.getByRole(dialog, name: /replace/i).getByRole(button, name: ...).

## Section 5: Hand-off invariant compliance

| Phase 3 invariant | Plan-set enforcement | Status |
|--|--|--|
| pre-merge/main + pre-merge/multi-sport tags frozen | All 7 plans cite and re-verify | PASS |
| PROD-04 fixme intact | Every plan verification block greps for the fixme | PASS |
| AFL e2e specs unchanged | 04-04 explicitly runs live-quarters + live-scoring + multi-sport-schema as regression check; 04-07 re-runs PROD-01 per-spec gauntlet | PASS |
| ABSTRACT-01 4 UI-presentation matches not refactored | Implicit (plans only modify netball + helpers + 04-04 specific 3 src files) | PASS |
| D-26/D-27 quarterMs wiring sites untouched | 04-04 verification: grep quarterMs in LiveGame.tsx and liveGameStore.ts matches Phase 3 baseline | PASS |
| Pause-event persistence bug not addressed | All 7 plans note deferred per CONTEXT | PASS |
| src/ touched only for NETBALL-N blockers (plan 04-04 only) | Plans 04-01, 04-02, 04-03, 04-05, 04-06, 04-07 all note DO NOT modify src/ | PASS |

## Section 6: Context compliance (CONTEXT.md decisions)

All 10 locked decisions have implementing plan tasks (PASS):

- D-CONTEXT-verification-approach: every NETBALL-N has at least one automated test
- D-CONTEXT-test-coverage-scope: per-capability spec files; AFL specs untouched
- D-CONTEXT-failure-handling: 04-04 in-Phase fix; 04-07 gap-closure path
- D-CONTEXT-seed-strategy: 04-01 audit helper; 04-06 Kotara-optional + factory fallback
- D-CONTEXT-track-scoring-matrix: both branches tested at every surface
- D-CONTEXT-stats-dashboard-coverage: dedicated 04-03 spec
- D-CONTEXT-side-finding-triage: 04-01 inline gitignore; 04-07 hand-off names side-findings to Phase 5
- D-CONTEXT-walkthrough-localStorage-cleanup: every netball-flow spec calls addInitScript
- D-CONTEXT-quarter-length-override: 04-05 has team-override AND game-override tests
- D-CONTEXT-test-scaffolding: src/ only touched in plan 04-04

No deferred ideas surfaced in plans.

## Section 7: CLAUDE.md compliance - regression test first rule

CLAUDE.md says: Bug fixes must land with a regression test that fails against the pre-fix code - write the test first, watch it go red, then fix the bug and watch it go green.

Plans honor this:
- Wave 2 (04-02 + 04-03) writes track_scoring=false tests deliberately RED
- Wave 3 (04-04) ships source fix that flips them green
- Plan 04-02 contains explicit inline comments naming plan 04-04 so red state is intentional, not flaky
- Plan 04-03 mirrors pattern for summary card

PASS - RED-then-GREEN sequencing correctly waved.

HOWEVER, the BLOCKERS in Section 4 mean the tests will not be RED for the intended reason. They will be RED because spec assertions do not match actual UI strings, so 04-04 source fix will not flip them green either. Plans regression-test-first intent is correct; spec authoring lets it down.

## Section 8: Scope and context-budget assessment

| Plan | Tasks | Files | Context | Status |
|--|--|--|--|--|
| 04-01 | 2 | 2 | 10% | OK |
| 04-02 | 1 | 1 | 18% | OK |
| 04-03 | 2 | 2 | 22% | OK |
| 04-04 | 4 (3 auto + 1 cp) | 4 | 28% | OK |
| 04-05 | 4 (3 auto + 1 cp) | 1 | 35% | Borderline - heaviest spec, single file, OK |
| 04-06 | 1 | 1 | 22% | OK |
| 04-07 | 3 (2 auto + 1 cp) | 1 | 22% | OK |

Plan 04-05 at ceiling (35%, 9-11 tests). Acceptable per CONTEXT D-CONTEXT-test-coverage-scope (one spec by design for fragile-area focus). No splits required.

## Section 9: Top 3 concerns (priority order for revision)

1. **B-4 (auto-transition vs Select team for Q2 modal):** Affects ABSTRACT-03 verification AND every NETBALL-02 test. Single biggest cascade - fixing it unblocks 04-05 + 04-06 simultaneously.
2. **B-1 (welcome phase blocks all walkthrough tests):** Affects all 4 NETBALL-07 tests. Fix is a single click before each Starting the game assertion.
3. **B-3 (lineup picker confirm copy):** Affects NETBALL-01 entry-point test. Trivial regex update.

B-2, B-5, B-6, B-7, B-8 are smaller cleanup items, batch into the same revision pass.

## Section 10: Required revision pass

Revise plans 04-02, 04-04, 04-05, 04-06 with corrected UI assertions per Section 4:

1. **04-02 Task 1:** Add Yes show me click between page.goto and Starting the game assertion in every test needing step content. Update close-button regex to /lets go|skip walkthrough/i. Two tests can collapse to asserting welcome-phase visibility instead of stepping into content.

2. **04-04 Task 1 step 5:** Acknowledge the e2e re-run only goes green AFTER 04-02 is also revised (implicit dependency made explicit reduces cascade risk).

3. **04-05 Tasks 1 + 2 + 3:**
   - Task 1 NETBALL-01 pre-kickoff: add /start game/i to lineup-picker confirm regex.
   - Task 2 long-press / replacement: drop getByTestId player-tile clause; scope name lookup to court.
   - Task 3 ABSTRACT-03 tests: replace getByRole button name /select team for q2/i visibility check with assertion on getByRole button name /apply suggested reshuffle/i or /start q2/i.

4. **04-06 Task 1:**
   - Drop enterQBreakView helper getByRole button name /select team for q2/i .click() step.
   - Helper reduces to: await expect(page.getByRole(button, name: /start q2/i)).toBeVisible({timeout: 5000}) after page.goto - auto-rendered Q-break entry signal.

5. **04-04 frontmatter:** Move src/app/run/[token]/page.tsx from files_modified to a comment in objective explaining why not touched on this branch.

After revisions, re-verify with this checker.

## Section 11: What is right (do not regress in revision)

- Wave structure + dependency graph correct (PASS)
- Autonomy markers correctly distinguish fragile-area plans (PASS)
- Phase 3 invariants enforced in every plan verification block (PASS)
- TEST-05 absent-state hand-off path correctly handled - Plan 04-01 audits non-throwingly, Plan 04-06 has skip-when-absent test, Plan 04-07 records final state for Phase 5 (PASS)
- D-26/D-27 wiring sites explicitly NOT touched anywhere (PASS)
- RED-then-GREEN sequencing correctly waved (PASS - though RED is for wrong reasons under current spec assertions)
- CONTEXT.md decisions all implemented (PASS)
- AFL e2e regression check built into 04-04 + 04-07 (PASS)
