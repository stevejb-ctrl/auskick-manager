---
phase: 05-test-and-type-green
plan: 04
subsystem: netball-server-actions
tags: [src-fix, revalidatePath, router-refresh, fragile-area-adjacent, deferred-from-phase-4]

# Dependency graph
requires:
  - phase: 05-01
    provides: "Kotara seed in supabase/seed.sql; Phase 5 source-code-fix-on-stable-baseline confidence"
  - phase: 05-02
    provides: "admin-hydration helper (no related blast radius)"
  - phase: 05-03
    provides: "stale-dev-server detection in scripts/e2e-setup.mjs (no related blast radius)"
  - phase: 04-05
    provides: "Surfaced the non-final-quarter revalidatePath gap and the page.reload() workaround pattern that this plan retires"
  - phase: 04-06
    provides: "Surfaced the periodBreakSwap router.refresh gap; one of the 3 page.reload() targets removed by this plan"
provides:
  - "revalidatePath in endNetballQuarter non-final branch (server-side rerender of /teams/[teamId]/games/[gameId]/live)"
  - "revalidatePath in startNetballQuarter (after insertEvent — both for new-quarter mount + Q-break dismissal)"
  - "router.refresh() in NetballLiveGame auto-hooter useEffect after endNetballQuarter resolves (3 callsites: auto-hooter, manual Start Q1, Finalise game)"
  - "router.refresh() in NetballQuarterBreak Start-Qn handler after onStarted callback"
  - "3 page.reload() spec workarounds removed: netball-live-flow.spec.ts:661, :709 (ABSTRACT-03 tests); netball-quarter-break.spec.ts:209 (enterQBreakView helper)"
  - "netball-walkthrough.spec.ts:154 page.reload() PRESERVED — legitimate localStorage-persistence-across-reload assertion, NOT a workaround"
affects: ["05-05 (final gauntlet must run clean without reload workarounds)", "future netball spec authoring (no longer need the reload workaround pattern)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-side revalidatePath + client-side router.refresh() combined: revalidatePath alone keeps fresh server-renders correct (a parent navigating in via /run/[token] sees post-action state) but won't auto-update an already-mounted client. router.refresh() alone fixes the mounted-client side but leaves stale server-render cache for downstream visitors. Both layers needed; this plan establishes the pattern for future netball/AFL server actions that mutate game state."
    - "Two-stage source-fix verification: Tasks 1+2 land the source change; checkpoint runs the gauntlet WITH the workarounds STILL in place (proves source fix didn't regress); Task 4 removes the workarounds; final gauntlet WITHOUT workarounds proves source fix actually fixed the underlying issue. Reusable for any future spec-workaround-retirement plan."

key-files:
  created:
    - ".planning/phases/05-test-and-type-green/05-04-SUMMARY.md  # this file"
  modified:
    - "src/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions.ts  # +29 / -1; revalidatePath added to endNetballQuarter non-final branch + startNetballQuarter post-insertEvent"
    - "src/components/netball/NetballLiveGame.tsx  # +40 / -3; useRouter import + 3 router.refresh() callsites (auto-hooter useEffect, manual Start Q1, Finalise game)"
    - "src/components/netball/NetballQuarterBreak.tsx  # +10 / -0; useRouter import + 1 router.refresh() callsite (Start-Qn handler)"
    - "e2e/tests/netball-live-flow.spec.ts  # 2 page.reload() removed (ABSTRACT-03 tests); replaced with comments documenting the Plan-05-04 source-fix"
    - "e2e/tests/netball-quarter-break.spec.ts  # 1 page.reload() removed (enterQBreakView helper); replaced with comment"
  deleted: []

key-decisions:
  - "revalidatePath is added ONLY to non-final endNetballQuarter (the final-quarter Q4 branch already had it because of the existing finalisation flow). Avoiding broad changes minimizes blast radius on the FRAGILE netball live shell."
  - "router.refresh() is added in 3 NetballLiveGame callsites (auto-hooter, manual Start Q1, Finalise game) PLUS 1 NetballQuarterBreak callsite (Start-Qn). The auto-hooter useEffect's dep array gains `router` per react-hooks/exhaustive-deps + correctness (effect closure captures router)."
  - "netball-walkthrough.spec.ts:154 reload PRESERVED. That reload is the assertion 'after closing walkthrough, the localStorage key persists across page navigation' — fundamentally different from the auto-hooter Q-break-entry race. Grep gate enforces 1 occurrence stays."
  - "Spec workaround removal proven correct by running the 3 affected specs (netball-live-flow + netball-quarter-break + netball-walkthrough) without the reloads: 20/20 PASS in 49.5s. Validates the source fix actually fixed the underlying behaviour, not just the spec assertions."

patterns-established:
  - "FRAGILE-area-adjacent source fix template: identify the affected actions (server-side) + components (client-side); add revalidatePath at server-action mutation point; add router.refresh() at client-side onStarted/onFinalised callback sites; keep the dep array honest. Paired with two-stage gauntlet verification."
  - "page.reload() workaround retirement: after landing the source fix, run the affected specs WITHOUT the reloads and confirm green. Workarounds are technical debt — retire them in the same plan that fixes the underlying issue."

requirements-completed: []  # No new requirements; closes Phase 4 deferred items #1 + #2

# Metrics
duration: 22min  # Tasks 1-2: ~10min; checkpoint pause; Tasks 3-5: ~12min
commits: 5  # 3 source + 1 spec cleanup + 1 SUMMARY
completed: 2026-05-01
---

# Phase 5 Plan 04: revalidatePath + router.refresh source fix Summary

**3 source files modified to land the deferred Phase 4 revalidatePath + router.refresh fixes; 3 page.reload() spec workarounds retired; netball-walkthrough.spec.ts:154 reload preserved (legitimate localStorage-persistence test); full gauntlet 52 PASS / 1 SKIP stable both with-workarounds (checkpoint state) and without-workarounds (final state).**

## What was done

### Task 1 — revalidatePath in netball server actions (commit `3be666a`)

`src/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions.ts` (+29/-1):
- Added non-final-quarter `else` branch with `revalidatePath` in `endNetballQuarter`
- Added `revalidatePath` block to `startNetballQuarter` after the `insertEvent`
- Final-quarter (≥4) branch UNTOUCHED (existing finalisation flow already revalidates)

### Task 2a — router.refresh in NetballLiveGame (commit `e613899`)

`src/components/netball/NetballLiveGame.tsx` (+40/-3):
- Added `useRouter` import + `const router = useRouter()`
- Auto-hooter useEffect now `await endNetballQuarter` → `if (result.success) router.refresh()`
- Manual Start Q1 + Finalise game buttons get the same `router.refresh()` treatment
- Auto-hooter dep array gains `router` (correctness + react-hooks/exhaustive-deps lint)

### Task 2b — router.refresh in NetballQuarterBreak (commit `32bf256`)

`src/components/netball/NetballQuarterBreak.tsx` (+10/-0):
- Added `useRouter` import + `const router = useRouter()` adjacent to existing `useTransition`
- Start-Qn handler now calls `router.refresh()` after `onStarted()`

### Task 3 — Human-verify checkpoint

Approved on automated evidence:
- tsc + lint + vitest 169/169 + e2e 52/1 ALL green WITH workarounds STILL in specs
- D-26/D-27 quarterMs hits unchanged (5 + 3 — D-27 had been 3 in liveGameStore.ts, not 4 — corrected)
- trackScoring count in NetballLiveGame.tsx unchanged at 16
- PROD-04 fixme intact at 1
- pre-merge tags frozen
- Walkthrough reload at line 154 untouched (executor confirmed: "I haven't edited spec files yet")

User signed off without spinning up the dev server. Source fix landed clean.

### Task 4 — Remove page.reload() workarounds (commit `de72b60`)

Orchestrator applied directly (mechanical work; SendMessage tool wasn't available to relay back to the paused executor):
- `e2e/tests/netball-live-flow.spec.ts:661` removed; comment added: "Plan 05-04 wired router.refresh() into NetballLiveGame's auto-hooter useEffect after endNetballQuarter resolves; the page now self-rerenders into the Q-break shell. NO page.reload() needed."
- `e2e/tests/netball-live-flow.spec.ts:709` removed; comment added (similar rationale)
- `e2e/tests/netball-quarter-break.spec.ts:209` removed (in enterQBreakView helper); comment added
- `e2e/tests/netball-walkthrough.spec.ts:154` UNCHANGED (verified via grep)

### Task 5 — SUMMARY (this commit)

Phase 5 close-out plan (05-05) is the next dispatch.

## Verification — automated evidence

### Source-fix gauntlet (Task 3 checkpoint state — workarounds STILL in place)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors, 3 pre-existing warnings |
| Vitest | `npm test --run` | 169/169 PASS |
| Affected netball specs | `npm run e2e -- e2e/tests/netball-live-flow.spec.ts --workers=1` | 12/12 PASS |
| AFL non-regression | `npm run e2e -- e2e/tests/live-quarters.spec.ts --workers=1` | 2/2 PASS |
| Full Phase 4+5 gauntlet | `npm run e2e -- --workers=1 --reporter=line` | **52 PASS / 1 SKIP** |

### Workaround-removal gauntlet (Task 4+5 final state — workarounds REMOVED)

| Check | Command | Result |
|---|---|---|
| Affected 3 specs | `npm run e2e -- netball-live-flow + netball-quarter-break + netball-walkthrough --workers=1` | **20/20 PASS** in 49.5s |
| Full Phase 4+5 gauntlet (run 1) | `npm run e2e -- --workers=1 --reporter=line` | 51 PASS / 1 SKIP / 1 FAIL (late-arrival flake; non-fatal deleteTestUser cleanup error logged) |
| Full Phase 4+5 gauntlet (retry) | same | **52 PASS / 1 SKIP** in 2.3 min ← clean |
| Non-comment reload calls | `grep -nE "^\s*await page\.reload" e2e/tests/netball-{live-flow,quarter-break,walkthrough}.spec.ts` | only 1 hit (netball-walkthrough.spec.ts:154 — legitimate, preserved) |

### Phase 3 + Phase 4 invariants verified intact

| Invariant | Status |
|---|---|
| pre-merge/main = `e9073dd…` | frozen |
| pre-merge/multi-sport = `e13e787c…` | frozen |
| PROD-04 fixme count in playhq-import.spec.ts | 1 (unchanged) |
| D-26 quarterMs in LiveGame.tsx | 5 hits (unchanged) |
| D-27 quarterMs in liveGameStore.ts | 3 hits (unchanged from baseline) |
| trackScoring count in NetballLiveGame.tsx | 16 (unchanged) |
| File deletions | 0 across all 5 plan-05-04 commits |
| supabase/, scripts/, e2e/fixtures/, e2e/helpers/ | zero drift |
| AFL specs (live-quarters, live-scoring, multi-sport-schema, etc.) | unchanged, all green |
| netball-walkthrough.spec.ts:154 reload | preserved (legitimate localStorage test) |

## Flake observation (one-off)

First full-gauntlet run after workaround removal showed `NETBALL-08: late arrival` failing once. Same test passed in isolation (focused 3-spec run: 20/20) and on full-gauntlet retry (52 PASS / 1 SKIP). The failure correlated with a logged "[deleteTestUser] non-fatal cleanup error for {uuid}: Database error deleting user" from team-invite.spec.ts running just before — a known auth.users cleanup race that surfaced once during Phase 5 Plan 01 too.

This is a pre-existing flake, NOT introduced by Plan 05-04's source change. Documenting per the plan's flake-tolerance policy ("ONE retry under --workers=1 is acceptable; document the flake. More than one consecutive flake = STOP and report.")

Phase 6/7 candidate cleanup: improve the team-invite.spec.ts deleteTestUser cleanup race so the spec ordering doesn't surface the issue. Out of scope for Phase 5 (purely test-infra ergonomics, not a milestone-blocker).

## Hand-off to Plan 05-05

- TEST-01..04 still met by Phase 4 baseline + Phase 5 plans
- TEST-05 closed by Plan 05-01 (Kotara seed)
- Side-finding #2 closed by Plan 05-03 (port-3000 probe)
- Side-finding #3 closed by Plan 05-02 (admin-hydration helper)
- Phase 4 deferred items #1 + #2 closed by THIS plan (revalidatePath + router.refresh)
- Phase 5 close-out plan 05-05 = full gauntlet + 05-EVIDENCE.md + Phase 6 hand-off (mirror 04-EVIDENCE.md template)
- Document the late-arrival cleanup-race flake in 05-EVIDENCE.md as a Phase 6/7 follow-up candidate
