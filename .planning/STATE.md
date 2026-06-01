---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Match Day Changes
status: in_progress
stopped_at: Phase 9 PLANNED (2026-06-01) — /gsd-plan-phase 9 complete. 2 plans created, plan-checker returned VERIFICATION PASSED (both AVAIL-01/AVAIL-02 covered, all 4 ROADMAP criteria mapped, D-01..D-10 covered, both pattern-mapping refinements honored: 3 start actions + league-before-vest ordering + RSC-mount constraint). 3 non-gating warnings noted (self-correcting at execution). 09-01 = AVAIL-01 (B1: shared server-side reconcileLineupToAvailability helper in all 3 start actions + client picker filter + red-first cross-sport regression). 09-02 = AVAIL-02 (B2: "Manage availability" break entry reusing addLateArrival + InjuryReplacementModal across all 3 break surfaces + red-first per-sport e2e). Both Wave 1, disjoint files. Ready to execute. Next: /clear then /gsd-execute-phase 9.
last_updated: "2026-06-01T00:00:00Z"
last_activity: 2026-06-01
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 6
  completed_plans: 4
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across AFL, netball, and rugby league — coaches end every match confident every kid got their fair share.
**Current focus:** Milestone v1.1 — Match Day Changes (4 bugs + 4 features, all sport-agnostic). Spec: `.planning/MATCH-DAY-CHANGES-SPEC.md`.

## Current Position

Phase: Phase 9 — Availability that holds (pre-game & at breaks) — PLANNED, ready to execute
Plan: 2 plans on main (09-01 AVAIL-01, 09-02 AVAIL-02), both Wave 1, plan-checker PASSED. /gsd-plan-phase 9 complete. Phase 8 closed (4/4 plans on main).
Status: Phase 9 ready to execute. 09-01 = B1 fix: shared server-side reconcileLineupToAvailability(lineup, availableIds) helper wired into all THREE start actions (startGame/startNetballGame/startLeagueGame; league before vest pre-flight) + client picker-hydration filter; red-first cross-sport regression. 09-02 = B2: single "Manage availability" break entry reusing addLateArrival (add-arrived) + InjuryReplacementModal (mark-out forced replacement, "out" reason) + existing markInjury, across AFL QuarterBreak (reference) / netball / league isAtQbreak; red-first per-sport e2e. Next: /clear then /gsd-execute-phase 9.
Last activity: 2026-06-01 — Phase 9 plan-phase complete (2 plans, plan-checker VERIFICATION PASSED, all gates green: AVAIL-01/02 covered, D-01..D-10 covered)

Progress: [██░░░░░░░░] 17% (1/6 v1.1 phases)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.1 init: Match Day Changes is a NEW milestone; v1.0 (multi-sport merge) is paused, not abandoned. Phase numbering CONTINUES from v1.0 (next phase = 8); v1.0's phase dirs are preserved untouched.
- v1.1 init: Everything sport-agnostic by rule — never hardcode "quarter"; read `periodCount`/`periodSeconds`/`periodLabel` from age-group config; zones/positions come from `getAgeGroupConfig(sport, ageGroup).zones`.
- v1.1 init: F4 sub-interval floor lives PER AGE GROUP as `subIntervalFloorSeconds` with a ~240s (4-min) default.
- v1.1 init: B1 repro per user is "in the picker screen" — recon found no availability toggle on LineupPicker.tsx; reconcile during the B1 phase discussion (recon may have missed a control, or the user's mental model maps a different control to "the picker").
- v1.1 init: Research skipped (config default) — brownfield work on own codebase; read-only recon already mapped each item to its root cause.
- v1.1 roadmap: 11 v1.1 requirements mapped to 6 phases (8–13). CONFIG-01/02 = foundation (Phase 8); AVAIL-01/02 together (Phase 9); SUB-02/SUB-01 together as substitution timing (Phase 10); ROTPLAN-01/02 share one upcoming-rotation surface (Phase 11); PLAYERVIEW-01/02 one long-press summary (Phase 12); AUDIO-01 independent (Phase 13, can run any time). B4 recency signal is shared between Phase 10 and Phase 12's F3 last-sub derivation.

### Pending Todos

- **WR-01 (carry to Phase 10 / SUB-02):** `fairness.ts:616` compares `fullPeriodMs` (milliseconds) against a season total produced in MINUTES by `gameZoneMinutes` (ms/60000) → the season-diversity nudge is effectively always-on in production and D-03's per-game threshold is a no-op there. This is a PRE-EXISTING unit mismatch (the deleted `FULL_QUARTER_MS` had the same bug), NOT a Phase 8 regression. Reconcile in the SUB-02 fairness follow-up (Phase 10) with a failing-first regression test. Also rename the misleading `seasonMins` local. (Source: 08 REVIEW.md WR-01 + Info findings.)

### Blockers/Concerns

- **v1.0 PAUSED (not a v1.1 blocker):** Multi-sport merge is blocked at Phase 6 — Phases 6–7 (preview deploy + production cutover) need user-provided prod Supabase clone + Vercel preview env. Engineering (phases 1–5) is complete; DEPLOY-RUNBOOK.md is written. Resume: `/gsd-execute-phase 6 --wave 4`. Resume file: `.planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-RUNBOOK.md`.
- v1.1 B1: availability-control discrepancy to reconcile during the B1 phase (Phase 9) (see Decisions).

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Deploy | v1.0 preview deploy + prod cutover (Phases 6–7) | Blocked on prod creds | 2026-05-01 |

## Session Continuity

Last session: 2026-06-01
Stopped at: Phase 9 PLANNED — `/gsd-plan-phase 9` complete (manual drive; gsd-sdk query unavailable, all steps emulated with native tools; UI phase skipped per user). gsd-pattern-mapper produced `09-PATTERNS.md` and corrected two CONTEXT decisions before planning: D-05 (NOT a single chokepoint — THREE per-sport start actions each commit their own `lineup_set`: `startGame` actions.ts:131, `startNetballGame` netball-actions.ts:114, `startLeagueGame` league-actions.ts:150; for league reconcile BEFORE the vest pre-flight at ~:208) and D-08 (`AvailabilityList` is an async RSC — cannot mount inline in the `"use client"` break surfaces; reuse the client `AvailabilityRow` + writers instead). gsd-planner wrote 2 plans; gsd-plan-checker returned **VERIFICATION PASSED** (AVAIL-01/AVAIL-02 covered, all 4 ROADMAP criteria mapped, D-01..D-10 covered, both refinements honored; 3 non-gating warnings — lineup generic may need a cast at the tsc gate, confirm game_fill_ins/game_availability column names, 09-02 Task 3 is the heaviest task). **09-01 (AVAIL-01 / B1):** shared `reconcileLineupToAvailability(supabase, gameId, lineup)` helper (`src/lib/live/reconcileLineupToAvailability.ts`, new) builds the availableIds union (game_availability 'available' + game_fill_ins + player_arrived) and strips absent ids; wired into ALL 3 start actions before each `lineup_set` insert (league before vest pre-flight) + client picker-hydration filter on all 3 branches in `live/page.tsx`; red-first `availability-honoured-at-kickoff.spec.ts` (3 sports). **09-02 (AVAIL-02 / B2):** single "Manage availability" break entry — add-arrived via canonical `addLateArrival` (actions.ts:595), mark-out via `InjuryReplacementModal` forced replacement with a distinct "out" reason, existing markInjury retained — on AFL `QuarterBreak.tsx` (reference; must IMPORT InjuryReplacementModal, not currently imported), `NetballQuarterBreak.tsx`, and league `isAtQbreak` in `LeagueLiveGame.tsx` (NOT the isAtFinalQ review surface); red-first `break-availability-{afl,netball,league}.spec.ts`. Both plans Wave 1, depends_on:[], disjoint files → safe parallel execution. Carry-forward unchanged: WR-01 fairness ms/min mismatch → Phase 10/SUB-02. Next: `/clear` then `/gsd-execute-phase 9`.
Resume file: .planning/phases/09-availability-that-holds-pre-game-and-at-breaks/09-01-PLAN.md
