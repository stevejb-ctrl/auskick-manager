---
phase: 04-netball-verification-on-merged-trunk
plan: 07
subsystem: phase-close-out
tags: [gauntlet, evidence-aggregation, phase-5-handoff, NETBALL-N, ABSTRACT-03, TEST-05]

# Dependency graph
requires:
  - phase: 04-01
    provides: ".gitignore for playwright artefact dirs; auditKotaraKoalas helper"
  - phase: 04-02
    provides: "netball-walkthrough.spec.ts (NETBALL-07)"
  - phase: 04-03
    provides: "netball-stats.spec.ts + netball-summary.spec.ts (NETBALL-05/06)"
  - phase: 04-04
    provides: "trackScoring source-fix in NetballLiveGame + SummaryCard + live/page.tsx"
  - phase: 04-05
    provides: "netball-live-flow.spec.ts (NETBALL-01/03/04/08 + ABSTRACT-03)"
  - phase: 04-06
    provides: "netball-quarter-break.spec.ts (NETBALL-02)"
  - phase: 03-branch-merge-abstraction-integrity
    provides: "Phase 3 invariants — pre-merge tags, PROD-04 fixme, D-26/D-27 quarterMs wiring, ABSTRACT-01..03 baseline; the green-baseline this Phase 4 must not regress"
provides:
  - "04-EVIDENCE.md — close-out aggregate: per-NETBALL-N traceability, full gauntlet outputs, Phase 3 invariants re-verification, Phase 5 hand-off block"
  - "Phase 4 acceptance signal: full gauntlet (tsc + vitest + lint + e2e) all green; 8/8 NETBALL-N + ABSTRACT-03 covered; AFL non-regression intact; Phase 3 invariants frozen"
  - "Phase 5 entry signal: gauntlet green is the prerequisite for Phase 5 'Test + type green' to make its claims; this plan establishes that prerequisite"
affects: ["05-test-and-type-green", "06-preview-deploy", "07-production-cutover"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase close-out gauntlet pattern: tsc + vitest + lint + e2e --workers=1 sequential, capture exit codes + per-spec breakdown into a single EVIDENCE.md. PROD-01 per-spec re-run as carry-forward to ensure flake-free baseline."
    - "Phase 3 invariant re-verification at end-of-Phase-4: 6 invariants checked in §3 of EVIDENCE.md (pre-merge tags frozen, PROD-04 fixme = 1, D-26/D-27 quarterMs hits = 5+4, ABSTRACT-01 outside-sports-lib = 4 baseline). Establishes a reusable end-of-phase gate template for Phase 5+."

key-files:
  created:
    - ".planning/phases/04-netball-verification-on-merged-trunk/04-EVIDENCE.md  # 333 lines, the Phase 4 close-out artefact"
    - ".planning/phases/04-netball-verification-on-merged-trunk/04-07-SUMMARY.md  # this file"
  modified: []
  deleted: []

key-decisions:
  - "Phase 4 closure does NOT require fixing the Kotara Koalas seed (TEST-05). Rationale: NETBALL-02's 3 mandatory tests verify fairness-tier ordering with synthetic 1-quarter Q1 history (sufficient for the +100k unplayed-third bonus to dominate). The optional Kotara-history test is `test.skip`-when-absent, with a TEST-05 breadcrumb. Phase 5 owns the seeding decision (author seed script vs document as 'covered in spirit by audit + factories fallback')."
  - "Phase 4 closure does NOT require fixing the revalidatePath / router.refresh gaps in endNetballQuarter / startNetballQuarter / periodBreakSwap. Rationale: production users navigate naturally through Next.js, so the gap doesn't surface in coach-facing flows; only Playwright specs need the explicit page.reload() workaround. Phase 5 candidate for cleanup (small refactor: add `revalidatePath` to those server actions). Documented in EVIDENCE.md §5 deferred items."
  - "Phase 4 closure does NOT require landing side-findings #2 (stale-dev-server detection) and #3 (admin-membership hydration helper). Both are test-infra ergonomics, not netball verification. Phase 5 picks them up per CONTEXT.md D-CONTEXT-side-finding-triage."
  - "Human-verify checkpoint approved on automated evidence. The 51 e2e + 169 vitest + tsc + lint sweep covers every NETBALL-04 suppression point + every ABSTRACT-03 priority chain step + every AFL non-regression that the manual checklist names. User signed off without spinning up the dev server."

patterns-established:
  - "EVIDENCE.md template for phase close-out: §1 gauntlet outputs (per-suite exit + per-spec breakdown), §2 requirement traceability (NETBALL-N → plan → test → status), §3 invariant re-verification (named-and-numbered inherited invariants), §4 source-tree diff (path-scoped to ensure no drift outside the phase's owned files), §5 hand-off block (deferred items with explicit elevation, side-finding triage status), §6 plan summary index (plan → SUMMARY commit)."
  - "Two-spec deliberate-skip pattern at phase close: (a) PROD-04 test.fixme stays fixme (Phase 3 invariant; should NEVER flip green); (b) auditKotaraKoalas-gated test.skip when seed is absent (TEST-05 hand-off — Phase 5 owns the decision). EVIDENCE.md §1 names both skips so they don't surface as alarms in future gauntlets."

requirements-completed: [NETBALL-01, NETBALL-02, NETBALL-03, NETBALL-04, NETBALL-05, NETBALL-06, NETBALL-07, NETBALL-08, ABSTRACT-03]
requirements-deferred: [TEST-05]  # Kotara Koalas seed presence — covered in spirit by audit + skip-when-absent; Phase 5 owns the seeding decision

# Metrics
duration: 17min
commits: 2  # EVIDENCE.md + this SUMMARY
completed: 2026-05-01
---

# Phase 4 Plan 07: Final gauntlet + 04-EVIDENCE.md + Phase 5 hand-off Summary

**Full gauntlet (tsc + vitest 169/169 + lint + e2e 51/53 PASS / 2 INTENTIONAL SKIP + PROD-01 per-spec 9/9) all green on first attempt. EVIDENCE.md aggregates per-NETBALL-N + per-success-criterion + per-invariant evidence; 8 NETBALL-N + ABSTRACT-03 PASS, TEST-05 ABSENT-FOLLOWUP-NOTED. Phase 3 invariants frozen. Phase 4 closes; Phase 5 entry signal armed.**

## What was done

### Task 1 — Full gauntlet sweep

Ran the four-suite gauntlet sequentially on merge/multi-sport-trunk:

| Suite | Command | Exit | Result |
|---|---|---|---|
| tsc | `npx tsc --noEmit` | 0 | clean (log empty) |
| lint | `npm run lint` | 0 | 3 pre-existing warnings (LiveGame.tsx:810, FeatureSection.tsx:77, NetballLiveGame.tsx:489 — all pre-Phase-4); 0 errors |
| vitest | `npm test --run` | 0 | **169/169 PASS** in 1.65s (TEST-01 bar ≥153 → 16 above) |
| e2e (full suite, 23 specs) | `npm run e2e -- --workers=1 --reporter=line` | 0 | **51 PASS + 2 SKIP** in 2.4 min |
| PROD-01 per-spec re-run | `npm run e2e -- e2e/tests/{long-press,lineup,injury-replacement,live-swaps,live-scoring}.spec.ts --workers=1` | 0 | **9/9 PASS** in 35.4s |

**The 2 e2e skips are both intentional and documented:**
1. `playhq-import.spec.ts:28` — PROD-04 `test.fixme` (Phase 3 invariant; must remain fixme)
2. `netball-quarter-break.spec.ts:380` — Kotara-optional `test.skip` because `auditKotaraKoalas()` returns `{ present: false }` on local fresh-`db:reset` DB

**Zero flakes; zero retries; every test ran exactly once.**

### Task 2 — Author 04-EVIDENCE.md (commit `e121124`)

333-line close-out artefact with six sections:

- **§1 Full gauntlet output** — per-suite exit codes + Vitest tail + per-spec breakdown table for all 23 e2e specs + PROD-01 per-spec table
- **§2 NETBALL-N × ABSTRACT-03 × TEST-05 traceability** — 8/8 NETBALL-N + ABSTRACT-03 = PASS; TEST-05 = ABSENT-FOLLOWUP-NOTED with explicit hand-off
- **§3 Phase 3 invariants re-verified** — all 6 UNCHANGED:
  - `pre-merge/main` = `e9073dd205bdd8eae8e7b66097e3b2275c4b5958`
  - `pre-merge/multi-sport` = `e13e787cb8abe405c18aca73e66c7c928eb359d8`
  - PROD-04 fixme count = 1
  - D-26 quarterMs in LiveGame.tsx = 5
  - D-27 quarterMs in liveGameStore.ts = 4
  - ABSTRACT-01 outside src/lib/sports/ = 4 baseline (UI-presentation matches; pre-classified acceptable)
- **§4 Source-tree diff** — `git diff bd8761f..HEAD -- src/` shows exactly Plan 04-04's 3 files (NetballLiveGame.tsx, NetballGameSummaryCard.tsx, live/page.tsx), 119+/40-, no other drift
- **§5 Phase 5 hand-off** — final state table, 3 deferred items elevated (revalidatePath gap, router.refresh gap, Kotara seeding decision), side-finding triage status (#1 closed in 04-01; #2 + #3 deferred to Phase 5 per CONTEXT), open questions named
- **§6 Plan summary index** — plan → SUMMARY commit hash, for future phase auditors

### Task 3 — Human-verify checkpoint

Approved on automated evidence. The 51 e2e + 169 vitest + tsc + lint sweep covers every NETBALL-04 suppression point + every ABSTRACT-03 priority chain step + every AFL non-regression that the plan's manual-walkthrough checklist names. User signed off without spinning up the dev server.

## Phase 5 entry signal

> The gauntlet IS the Phase 5 entry signal; if it's red, Phase 4 isn't done.

**Gauntlet is green. Phase 4 is done.**

Phase 5's TEST-01 (vitest ≥153), TEST-02 (e2e green), TEST-03 (tsc clean), TEST-04 (lint clean) gates are already met by this plan's gauntlet. Phase 5 will mostly:
- Aggregate evidence into v1.0-MILESTONE-AUDIT format
- Address TEST-05 Kotara seeding decision (author seed script OR document as covered-in-spirit)
- Optionally land deferred items (revalidatePath gap, router.refresh gap, side-findings #2+#3) if scope and time allow
- Re-run gauntlet at end of Phase 5 to confirm no regression

## Hand-off to Phase 5

| Item | Status | Phase 5 action |
|---|---|---|
| TEST-01 (vitest ≥153) | DONE (169 passing) | Aggregate evidence; no fix needed |
| TEST-02 (e2e green) | DONE (51 PASS + 2 intentional SKIP) | Aggregate evidence; no fix needed |
| TEST-03 (tsc clean) | DONE (exit 0) | Aggregate evidence; no fix needed |
| TEST-04 (lint clean) | DONE (exit 0) | Aggregate evidence; no fix needed |
| TEST-05 (Kotara Koalas intact) | ABSENT — audit returns `{ present: false }` | Author netball seed script OR document as covered-in-spirit |
| Side-finding #1 (gitignore Playwright dirs) | CLOSED (Plan 04-01) | None |
| Side-finding #2 (stale-dev-server detection) | DEFERRED | Land per CONTEXT triage |
| Side-finding #3 (admin-membership hydration helper) | DEFERRED | Land per CONTEXT triage |
| Deferred: revalidatePath gap (endNetballQuarter non-final) | NEW (surfaced Plan 04-05) | Phase 5 candidate |
| Deferred: router.refresh gap (startNetballQuarter onStarted) | NEW (surfaced Plan 04-06) | Phase 5 candidate |

## Phase 3 invariants — final confirmation

All 6 invariants UNCHANGED at end-of-Phase-4. The merge trunk holds the source-of-truth for Phase 5+ work; no Phase 4 commit ever touched a forbidden surface.

## Total Phase 4 footprint

- 14 commits across 7 plans (3+3+3+4+4+2+2 by plan)
- 3 source files touched (Plan 04-04 only): NetballLiveGame.tsx, NetballGameSummaryCard.tsx, live/page.tsx
- 5 e2e specs created: netball-walkthrough, netball-stats, netball-summary, netball-live-flow, netball-quarter-break
- 1 e2e helper added: auditKotaraKoalas (Plan 04-01)
- 1 .gitignore update (Plan 04-01)
- 1 Rule-1 spec regex tighten (Plan 04-04 inline)
- 0 src/ deletions
- 0 supabase/ / scripts/ / e2e/fixtures/ / e2e/helpers/ drift outside the explicit Plan 04-01 helper add
