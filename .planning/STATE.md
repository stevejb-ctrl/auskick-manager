---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Match Day Changes
status: in_progress
stopped_at: Phase 11 PLANNED — /gsd-plan-phase 11 done (no flags; "Plan directly now" — decisions folded into the PLAN.md files, matching the Phase 10 precedent; no separate discuss/ui pass). Driven INLINE on main (gsd-sdk unavailable; worktree-rooted agents produce false negatives). 2 plans + CONTEXT written for ROTPLAN-01/02 (F1+F2 share ONE projector-seeded surface — Success Criterion #3). 11-01 (Wave 1, ROTPLAN-01/F1 + shared foundation): pure projectUpcomingRotation adapter (src/lib/game-plan/live.ts — seeds projectGamePlan from live state, period[0]=current reality) + extend GamePlanModal (initialPlan + onPin, NOT a fork) + plannedRotation live-store slice (partialize, gameId-keyed, NO migration/event — D-04; rejected a rotation_plan_set event D-05) + AFL imminent-sub override-then-honour (advisory; stale-pin guard D-09 discards invalid → live suggester). 11-02 (Wave 2, depends 01, ROTPLAN-02/F2): final-minutes "plan next period" entry reusing the Wave-1 surface + each sport's break opens PRE-SEEDED from plannedRotation.nextPeriod* (AFL QuarterBreak draft, netball NetballQuarterBreak initialDraft, league LeagueLiveGame between-periods), stale-plan reconcile D-13, pin cleared on start D-14. Both plans red-first (unit + e2e override-then-honour + build-next-period); threat models = no new auth/network/migration (reuses persistSwap/recordLineupSet/start actions). NOT yet committed at this checkpoint. Next: commit Phase 11 plans, then /gsd-execute-phase 11.
last_updated: "2026-06-02T13:00:00Z"
last_activity: 2026-06-02
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 10
  completed_plans: 8
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across AFL, netball, and rugby league — coaches end every match confident every kid got their fair share.
**Current focus:** Milestone v1.1 — Match Day Changes (4 bugs + 4 features, all sport-agnostic). Spec: `.planning/MATCH-DAY-CHANGES-SPEC.md`.

## Current Position

Phase: Phase 11 — Plan the rotation ahead of the break — PLANNED 2026-06-02 (2 plans ready; not yet executed)
Plan: 2 plans written (Wave 1 → Wave 2). 11-01 (ROTPLAN-01/F1 + shared foundation, wave 1) + 11-02 (ROTPLAN-02/F2, wave 2, depends_on [01]). Next: /gsd-execute-phase 11.
Status: Phase 11 PLANNED via /gsd-plan-phase 11 (no flags; "Plan directly now" — decisions folded into the PLAN.md files matching the Phase 10 precedent, no separate discuss/ui pass). Driven INLINE on main (gsd-sdk query unavailable; worktree-rooted agents → false negatives + wrong-dir writes). F1+F2 share ONE projector-seeded "edit an upcoming rotation" surface (Success Criterion #3, non-negotiable). **11-01 (Wave 1, ROTPLAN-01/F1 + foundation):** pure `projectUpcomingRotation` adapter (`src/lib/game-plan/live.ts` — seeds `projectGamePlan` from live state, period[0]=current reality) + extend `GamePlanModal` (add `initialPlan` + `onPin`, NOT a fork) + `plannedRotation` live-store slice (in `partialize`, gameId-keyed, NO migration/event — D-04; rejected a `rotation_plan_set` event D-05) + AFL imminent-sub override-then-honour (SwapCard entry, advisory; `resolveHonouredSwaps`/`diffPlanToSwaps`; stale-pin guard D-09 discards invalid pins → falls back to live suggester). 4 tasks, red-first (projectUpcomingRotation contract + plannedRotation honour/stale unit specs; e2e override-then-honour). **11-02 (Wave 2, ROTPLAN-02/F2):** final-minutes "plan next period" entry reusing the Wave-1 surface + each sport's break opens PRE-SEEDED from `plannedRotation.nextPeriod*` (`seedNextPeriodLineup`): AFL `QuarterBreak` draft (must not let `lastAppliedModeRef` stomp the seed), netball `NetballQuarterBreak` `initialDraft`, rugby league `LeagueLiveGame` between-periods inline (no separate break component); stale-plan reconcile D-13, pin cleared on start D-14. 3 tasks, red-first (cross-sport next-period seed + stale-reconcile unit spec; e2e build-next-period). Both threat models = no new auth/network/migration (reuse persistSwap/recordLineupSet/start actions).
Last activity: 2026-06-02 — Phase 11 planned; 11-CONTEXT.md + 11-01-PLAN.md + 11-02-PLAN.md written; ROADMAP + STATE updated; ready to commit then execute.

Progress: [█████░░░░░] 50% (3/6 v1.1 phases — Phase 11 planned, not yet executed)

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

- ~~**WR-01:** `fairness.ts` compared `fullPeriodMs` (ms) against a season total in MINUTES → season-diversity nudge always-on.~~ RESOLVED in Phase 10 / 10-01 (commit `76b2050`): `fullPeriodMins = fullPeriodMs / 60000` then `seasonMins < fullPeriodMins`, with red-first `seasonDiversityUnits.test.ts`. Closed per 10-VERIFICATION.md.

### Blockers/Concerns

- **v1.0 PAUSED (not a v1.1 blocker):** Multi-sport merge is blocked at Phase 6 — Phases 6–7 (preview deploy + production cutover) need user-provided prod Supabase clone + Vercel preview env. Engineering (phases 1–5) is complete; DEPLOY-RUNBOOK.md is written. Resume: `/gsd-execute-phase 6 --wave 4`. Resume file: `.planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-RUNBOOK.md`.
- ~~v1.1 B1: availability-control discrepancy to reconcile during the B1 phase (Phase 9).~~ RESOLVED in Phase 9 (09-CONTEXT.md §B1 D-01: "the picker" = the dedicated AvailabilityList/AvailabilityRow surface, NOT the zones LineupPicker; no new control added; the draft→picker→lineup_set path is reconciled server-side).

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Deploy | v1.0 preview deploy + prod cutover (Phases 6–7) | Blocked on prod creds | 2026-05-01 |

## Session Continuity

Last session: 2026-06-02
Stopped at: Phase 11 PLANNED — `/gsd-plan-phase 11` done (no flags; user chose "Plan directly now" — fold the shared-surface + override-persistence decisions into the PLAN.md files matching the Phase 10 precedent, no separate `/gsd-discuss-phase` or `/gsd-ui-phase` pass). Driven INLINE on main (gsd-sdk query unavailable; worktree-rooted agents produce false negatives + wrong-dir writes). 2 plans + CONTEXT written for ROTPLAN-01/02; F1+F2 share ONE projector-seeded "edit an upcoming rotation" surface (Success Criterion #3, non-negotiable architecture).
- **11-CONTEXT.md:** decisions D-01..D-15 folded in. D-01 one surface = extend `GamePlanModal` (not fork); D-02 `projectUpcomingRotation` pure adapter seeds `projectGamePlan`, period[0]=current reality; D-04 `plannedRotation` store slice in `partialize`, gameId-keyed, NO migration; D-05 rejected a `rotation_plan_set` event (ephemeral single-device plan needs no replay/durability); D-06 `PlannedRotation` shape (`pinnedSwaps`/`pinnedForPeriod` for F1; `nextPeriodGroups`/`nextPeriodBench`/`nextPeriodIndex` for F2); D-07 F1 AFL-only via SwapCard entry; D-08 honour = validated pins replace suggestions (advisory); D-09 stale-guard discard→fallback to live suggester; D-10 clear on apply/advance; D-11..D-14 F2 final-minutes entry, each break pre-seeds, stale reconcile, clear on start; D-15 one-handed reachable.
- **11-01 (Wave 1, `depends_on: []`, ROTPLAN-01/F1 + shared foundation):** files = `src/lib/game-plan/{live.ts,types.ts,index.ts}`, `GamePlanModal.tsx`, `liveGameStore.ts`, `LiveGame.tsx`, `SwapCard.tsx` + `projectUpcomingRotation.test.ts` + `plannedRotationHonour.test.ts` + `e2e/tests/plan-ahead-rotation.spec.ts`. 4 tasks: (1) RED projectUpcomingRotation contract + plannedRotation honour/stale specs; (2) GREEN adapter + store slice + `resolveHonouredSwaps`; (3) GREEN extend GamePlanModal (`initialPlan`/`onPin`) + AFL SwapCard entry + honour-in-LiveGame (`diffPlanToSwaps`); (4) e2e override-then-honour + DoD gates. Threat model T-11-01-A stale plan / B unauthorized mutation / C cross-game bleed / D deadlock.
- **11-02 (Wave 2, `depends_on: [01]`, ROTPLAN-02/F2):** files = `LiveGame.tsx`, `QuarterBreak.tsx`, `NetballLiveGame.tsx`, `NetballQuarterBreak.tsx`, `LeagueLiveGame.tsx` + `nextPeriodPlanSeed.test.ts` + `e2e/tests/plan-ahead-rotation.spec.ts`. 3 tasks: (1) RED cross-sport next-period seed + stale-reconcile spec (`seedNextPeriodLineup`); (2) GREEN AFL final-minutes entry + QuarterBreak pre-seed (must not let `lastAppliedModeRef` stomp the seed); (3) GREEN mirror netball (`NetballQuarterBreak` `initialDraft`) + league (`LeagueLiveGame` between-periods inline) + DoD gates. Threat model T-11-02-A..D.
Both plans red-first (unit + e2e); threat models = no new auth/network/migration (reuse `persistSwap`/`recordLineupSet`/start actions).
**NOT yet committed at this checkpoint.** Next: commit Phase 11 plans, then `/gsd-execute-phase 11`.
**TOOLING NOTE (unchanged):** Glob/Grep/Read-without-abs-path default to a STALE/orphaned git worktree (`.claude/worktrees/exciting-hopper-7e19a5`, not in `git worktree list`); real work + commits live in the main checkout (`C:\Users\steve\OneDrive\Documents\Auskick manager`). Use Bash (cd into main checkout) or absolute paths for all file inspection; drive sub-agent-style steps INLINE.
Next: `/gsd-execute-phase 11` (ROTPLAN-01/02). Phase 13 (AUDIO-01) is independent and may run any time.
Resume file: .planning/phases/11-plan-the-rotation-ahead-of-the-break/11-01-PLAN.md
