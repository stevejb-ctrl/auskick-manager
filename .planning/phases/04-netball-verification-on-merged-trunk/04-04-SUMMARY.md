---
phase: 04-netball-verification-on-merged-trunk
plan: 04
subsystem: netball-live-shell
tags: [src-fix, NETBALL-04, NETBALL-07, NETBALL-06, track_scoring, fragile-area, prop-threading]

# Dependency graph
requires:
  - phase: 04-02
    provides: "netball-walkthrough.spec.ts with track_scoring=false case RED-by-design (NETBALL-07 regression test ahead of fix)"
  - phase: 04-03
    provides: "netball-summary.spec.ts with track_scoring=false case RED-by-design (NETBALL-06 regression test ahead of fix)"
  - phase: 03-branch-merge-abstraction-integrity
    provides: "merge/multi-sport-trunk source-tree green baseline; D-26/D-27 quarterMs wiring at LiveGame.tsx + liveGameStore.ts (this plan must NOT touch those sites)"
provides:
  - "trackScoring prop wired through NetballLiveGame → NetballGameSummaryCard → buildSummary (3-layer threading)"
  - "Six NETBALL-04 suppression sites correctly gated: +G opponent-goal button, GS/GA tap-to-score confirm flow, undo chip, score-bug numeric counts (em-dash placeholder when off), score-bug bottom hint copy, walkthrough scoring step"
  - "Two NETBALL-06 suppression sites correctly gated: summary card result line ('def with' / 'drew with' / 'lost to'), summary card 🥅 Goals line"
  - "live/page.tsx hoists `const trackScoring = teamRow?.track_scoring ?? false;` above the netball/AFL branch fork; both branches consume the same value"
  - "Wave 2's two intentional REDs flipped GREEN: walkthrough track_scoring=false omits scoring step (NETBALL-07); summary track_scoring=false omits result + goals lines (NETBALL-06)"
  - "Spec regex tightened in netball-summary.spec.ts (Rule-1 deviation): /def\\s+\\w/i → /\\bdef\\s+\\w/ to disambiguate the buildSummary result-line emit from the per-third uppercase 'DEF 100%' breakdown label"
affects: ["04-05 (live-flow spec presumes trackScoring is wired correctly through the live shell)", "04-06 (q-break spec inherits the same source baseline)", "04-07 (full Phase 4 gauntlet)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prop threading from page → component → render-helper (trackScoring): the canonical pattern for any future per-team-config flag whose evaluation must reach internal helpers (here: buildSummary). Mirrors quarterMs threading pattern from Phase 3 Plans 03-03/03-04."
    - "Universal-content vs gated-content split in summary card: 🏐 Full time + 👟 N players + ⏱ Game time render unconditionally; result + 🥅 Goals lines render only when trackScoring=true. The split lives at a single `if (trackScoring) { ... }` block in buildSummary so future contributors see the gate boundary at a glance."
    - "Em-dash placeholder pattern in NetballScoreBug numeric counts: when showScores=false, '—' replaces the bound goal counts rather than nulling the entire score bug — preserves visual rhythm + screenreader-readable value."

key-files:
  created:
    - ".planning/phases/04-netball-verification-on-merged-trunk/04-04-SUMMARY.md  # this file"
  modified:
    - "src/components/netball/NetballLiveGame.tsx  # +trackScoring prop + 6 NETBALL-04 gates + summary-card pass-through; 15 trackScoring references (plan invariant ≥8); zero hard-coded `trackScoring: true`"
    - "src/components/netball/NetballGameSummaryCard.tsx  # +trackScoring prop + buildSummary signature update + result+goals lines wrapped in `if (trackScoring) { ... }`; 5 trackScoring references (plan invariant ≥4)"
    - "src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx  # hoist trackScoring const above sport branch; pass trackScoring={trackScoring} to <NetballLiveGame>"
    - "e2e/tests/netball-summary.spec.ts  # Rule-1 regex tighten — case-insensitive `def\\s+\\w` was a false-positive against the per-third 'DEF 100%' label; tightened to /\\bdef\\s+\\w/ + word boundary"
  deleted: []

key-decisions:
  - "NetballLiveGame trackScoring defaults to false (matches the codebase `teamRow?.track_scoring ?? false` convention used at the page-level call site). A team row with no track_scoring column-value is treated as scoring-off — conservative default."
  - "NetballScoreBug gains a new `showScores?: boolean` prop (defaults true) so non-netball callers retain backward-compatible behaviour. Passed `showScores={trackScoring}` from all 4 NetballScoreBug call sites in NetballLiveGame (PRE / Q-BRK / Q4-END / LIVE / FT branches) — single source of truth."
  - "buildSummary signature change is breaking — added required `trackScoring: boolean` param at the end. Justified: buildSummary is internal to NetballGameSummaryCard.tsx (no external callers), and the prop has no sensible default for production semantics. Caller (the component itself) updated in the same commit."
  - "Rule-1 spec regex tighten in netball-summary.spec.ts is a CLAUDE.md-compliant Rule-1 deviation (correctness, not intent). Original draft assumed lowercase `def` would only appear in result-line emits, but the per-third breakdown ('Felix — 10:00  (DEF 100%)') uses uppercase DEF that case-insensitive matched. Tightened regex catches only the result line emit per buildSummary's actual contract."
  - "src/app/run/[token]/page.tsx confirmed AFL-only (renders <LiveGame>, no NetballLiveGame import). NOT touched in this plan — frontmatter files_modified updated to reflect this. Phase 4 hand-off captures this fact for downstream plans."

patterns-established:
  - "Per-team config flag prop threading template (trackScoring): page-level fetch → const hoist above sport-branch fork → prop on <NetballLiveGame> → useMemo dep on internal walkthrough builder → gates at every UI affordance the flag controls → forwarded to NetballGameSummaryCard → summary helper receives it as a typed param. Reusable pattern for future flags (e.g., positions-based-rotation, region-overrides, ageGroup-overrides)."
  - "RED-then-GREEN regression-test handoff between Wave-2 spec plans and Wave-3 source-fix plan: the spec author writes the assertion against the contract, the source-fix author flips it green by satisfying the contract. Plan 04-04 made this concrete by re-running both Wave-2 specs at task-3 verify and confirming both flips."

requirements-completed: [NETBALL-04, NETBALL-06, NETBALL-07]

# Metrics
duration: 25min
commits: 4
completed: 2026-05-01
---

# Phase 4 Plan 04: trackScoring source-fix in netball live shell + summary card Summary

**6 NETBALL-04 + 2 NETBALL-06 + 1 NETBALL-07 suppression points wired through `trackScoring` prop chain. Wave 2's two intentional REDs flipped GREEN. Full 6-spec gauntlet (14 tests + 1 setup) all green; AFL specs unchanged; Phase 3 invariants intact.**

## What was done

### Task 1 — NetballLiveGame.tsx (commit `b80c91d`)

Added `trackScoring?: boolean` to the component's prop interface (default `false`). Threaded through the six NETBALL-04 gating sites:

1. Walkthrough builder (was `trackScoring: true` hard-coded at line 801) — useMemo dep on prop
2. `handleTokenTap` short-circuit: `if (!trackScoring) return;` after SCORING_POSITIONS check — GS/GA tap becomes a scoring no-op while long-press flow stays intact
3. +G button: `onOpponentGoal={trackScoring ? handleOpponentGoal : undefined}` (relies on existing `{onOpponentGoal && ...}` gate inside NetballScoreBug)
4. Undo chip: `{trackScoring && lastScore && (...)}` wrapper
5. Score-bug numeric counts: NetballScoreBug gains `showScores?: boolean` prop; renders em-dash placeholder when false; passed `showScores={trackScoring}` from all 4 call sites
6. Bottom hint copy: conditional ternary drops "Tap GS or GA to score" when scoring isn't tracked

### Task 2 — NetballGameSummaryCard.tsx + summary-card mount in NetballLiveGame (commit `733cb52`)

`NetballGameSummaryCard` gains `trackScoring?: boolean` prop. `buildSummary` signature updated to require `trackScoring: boolean`. Result line ("def with"/"drew with"/"lost to") AND `🥅 Goals:` block wrapped in single `if (trackScoring) { ... }` gate. `🏐 Full time` header, `👟 N players` line, and `⏱ Game time` block stay unconditional (universal regardless of scoring). NetballLiveGame's finalised-branch `<NetballGameSummaryCard>` mount passes `trackScoring={trackScoring}`.

### Task 3 — live/page.tsx (commit `9c3a6e3`)

Hoisted `const trackScoring = teamRow?.track_scoring ?? false;` ABOVE the `if (sport === "netball")` branch fork. Removed the now-duplicate const inside the AFL branch (replaced with comment pointing to the hoisted definition). NetballLiveGame call site gains `trackScoring={trackScoring}`. AFL branch behaviour unchanged.

`src/app/run/[token]/page.tsx` was originally listed in plan files_modified; verified AFL-only and dropped from the modify list (revision per 04-VERIFICATION.md B-7).

### Task 3.x — Spec regex tighten (commit `37f0293`, Rule-1 deviation)

After the source fix, netball-summary.spec.ts's track_scoring=false case was still failing — but the failure was a spec authoring bug, not a source-side gap. The original assertion `expect(text).not.toMatch(/def\s+\w/i)` was case-insensitive and matched the legitimate per-third breakdown row "Felix — 10:00  (DEF 100%)". buildSummary emits lowercase `def` only in the result line; per-third labels are always uppercase ATK/CEN/DEF (THIRD_LABEL constant). Tightened to `/\bdef\s+\w/` (drop `i`, add word boundary) — catches ONLY the result-line emit. Rationale comment added inline. CLAUDE.md-compliant Rule-1 fix (correctness, not intent).

## Verification — automated evidence

| Check | Command | Result |
| ----- | ------- | ------ |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 (3 pre-existing warnings, none new) |
| Plan invariant: NetballLiveGame ≥8 trackScoring refs | grep -c | 15 |
| Plan invariant: SummaryCard ≥4 trackScoring refs | grep -c | 5 |
| Plan invariant: zero hard-coded `trackScoring: true` | grep -nE | 0 matches |
| 6-spec gauntlet (workers=1) | `npm run e2e -- ...` | **14/14 PASS** + 1 setup |

### Per-spec breakdown

| Spec | Cases | Result |
| ---- | ----- | ------ |
| netball-walkthrough.spec.ts | 4 | **4/4 PASS** — including the previously-RED `track_scoring=false omits recording-scores step` |
| netball-summary.spec.ts | 2 | **2/2 PASS** — including the previously-RED `track_scoring=false omits result and goals lines` |
| netball-stats.spec.ts | 2 | **2/2 PASS** — unchanged from Wave 2 |
| multi-sport-schema.spec.ts | 3 | **3/3 PASS** — unchanged from Phase 2/3 |
| live-quarters.spec.ts | 1 | **1/1 PASS** — AFL flow unchanged |
| live-scoring.spec.ts | 2 | **2/2 PASS** — AFL scoring + undo unchanged |

## Phase 3 invariants

| Invariant | Status |
| --------- | ------ |
| pre-merge/main = `e9073dd…` | frozen |
| pre-merge/multi-sport = `e13e787c…` | frozen |
| PROD-04 fixme count in playhq-import.spec.ts | 1 (unchanged) |
| D-26/D-27 quarterMs wiring at LiveGame.tsx | 5 hits (matches MERGE-LOG §4 baseline) |
| D-26/D-27 quarterMs wiring at liveGameStore.ts | 4 hits (matches baseline) |
| File deletions | 0 across all 4 commits |
| supabase/, scripts/, e2e/fixtures/, e2e/helpers/ | zero drift |
| AFL specs (live-quarters, live-scoring, multi-sport-schema) | zero diff against this commit chain; all green |

## Human-verify checkpoint

The plan's `task type="checkpoint:human-verify" gate="blocking"` block was approved on automated evidence. The 14/14 gauntlet exercises every NETBALL-04 suppression point and the AFL non-regression that the plan's manual-walkthrough checklist names. User signed off without spinning up the dev server because the e2e coverage is materially equivalent.

## Hand-off to Plan 04-05

- The trackScoring prop chain is **fully wired** through NetballLiveGame → NetballScoreBug + handleTokenTap + walkthrough builder + NetballGameSummaryCard. Plan 04-05's heaviest spec (NETBALL-01/03/04/08 + ABSTRACT-03) can rely on this.
- For specs that need to exercise `track_scoring=true` paths, set `trackScoring: true` on the team row before the spec runs (factories.makeTeam supports this).
- For specs that need to exercise `track_scoring=false` paths, set the flag false; the suppression behaviour is now consistent across all 6 NETBALL-04 sites + 2 NETBALL-06 sites.
- The Rule-1 spec regex pattern from this plan (word-boundary + case-sensitive for buildSummary's lowercase emits) is reusable in any future netball-summary assertion that needs to disambiguate the result line from the per-third breakdown labels.
