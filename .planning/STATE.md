---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Match Day Changes
status: in_progress
stopped_at: Phase 11 / Plan 11-01 COMPLETE (ROTPLAN-01/F1 + shared foundation). Executed INLINE on main (gsd-sdk unavailable; worktree-rooted agents → false negatives). 4 tasks, red-first TDD, all committed: (1) RED ba5bcf1; (2) GREEN 0b8d9a1 — pure projectUpcomingRotation adapter (src/lib/game-plan/live.ts, seeds projectGamePlan, current period mirrors live reality) + plannedRotation live-store slice (partialize, gameId-keyed, NO migration/event — D-04) + resolveHonouredSwaps honour/stale-guard; (3) GREEN 050aeea — extend GamePlanModal (initialPlan/onPin/pinLabel/initialPeriodIndex, NOT a fork; Reshuffle→Cancel in plan-ahead) + AFL SwapCard plan-ahead entry + honour-in-LiveGame + diffPlanToSwaps + planned-sub-badge; (4) 22eb1d9 — e2e plan-ahead-rotation.spec.ts (override-then-honour: Alicia OFF→Octavia ON, Octavia LAST bench player so the pin beats the engine default) + SwapCard testids. DoD all green: tsc 0, lint 0 (warnings only), vitest 840/840 (49 files), e2e new spec green + 6 pre-existing multi-worker flakes confirmed green serially (--workers=1, Phase-9 protocol). 11-01-SUMMARY.md written. NEXT: 11-02 (Wave 2, depends 01, ROTPLAN-02/F2) — final-minutes "plan next period" entry reusing the Wave-1 surface + each sport's break opens PRE-SEEDED from plannedRotation.nextPeriod* (AFL QuarterBreak draft, netball NetballQuarterBreak initialDraft, league LeagueLiveGame between-periods), stale-plan reconcile D-13, pin cleared on start D-14; red-first cross-sport unit + e2e build-next-period. Both 11-01 + 11-02 edit LiveGame.tsx → run 11-02 serially after 11-01.
last_updated: "2026-06-02T11:20:00Z"
last_activity: 2026-06-02
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 11
  completed_plans: 9
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across AFL, netball, and rugby league — coaches end every match confident every kid got their fair share.
**Current focus:** Milestone v1.1 — Match Day Changes (4 bugs + 4 features, all sport-agnostic). Spec: `.planning/MATCH-DAY-CHANGES-SPEC.md`.

## Current Position

Phase: Phase 11 — Plan the rotation ahead of the break — IN PROGRESS (11-01 ✓ 2026-06-02; 11-02 next)
Plan: 2 plans (Wave 1 → Wave 2). **11-01 (ROTPLAN-01/F1 + shared foundation, wave 1) COMPLETE** ✓. 11-02 (ROTPLAN-02/F2, wave 2, depends_on [01]) NEXT. Next: /gsd-execute-phase 11 (resumes at 11-02).
Status: Executed INLINE on main (gsd-sdk query unavailable; worktree-rooted agents → false negatives + wrong-dir writes). F1+F2 share ONE projector-seeded "edit an upcoming rotation" surface (Success Criterion #3, non-negotiable). **11-01 (Wave 1, ROTPLAN-01/F1 + foundation) — DONE, 4 tasks red-first, all committed:** pure `projectUpcomingRotation` adapter (`src/lib/game-plan/live.ts` — seeds `projectGamePlan`, current period mirrors live reality) + `resolveHonouredSwaps` honour/stale-guard + `diffPlanToSwaps` edited-period→off/on/zone derivation + `plannedRotation` live-store slice (in `partialize`, gameId-keyed, NO migration/event — D-04; rejected `rotation_plan_set` D-05) + extend `GamePlanModal` (`initialPlan`/`onPin`/`pinLabel`/`initialPeriodIndex`, NOT a fork; Reshuffle→Cancel in plan-ahead) + AFL imminent-sub override-then-honour (SwapCard `plan-ahead-entry`, advisory; stale-pin guard D-09 → falls back to live suggester; `planned-sub-badge` D-15; `clearPlannedRotation` on apply D-10). Commits: ba5bcf1 (RED) → 0b8d9a1 (GREEN adapter+slice+honour) → 050aeea (GREEN modal+entry+honour) → 22eb1d9 (e2e+DoD). e2e `plan-ahead-rotation.spec.ts` proves Alicia OFF→Octavia ON (Octavia = LAST bench player, so the pin demonstrably beats the engine default). DoD all green: tsc 0, lint 0 (warnings only), vitest 840/840 (49 files), e2e new spec green + 6 pre-existing multi-worker flakes confirmed green serially (--workers=1, Phase-9 protocol). **11-02 (Wave 2, ROTPLAN-02/F2) — NEXT:** reuses pieces 1–3 UNCHANGED (`projectUpcomingRotation` + extended `GamePlanModal` + `plannedRotation` slice; `PlannedRotation` already carries `nextPeriod*` fields D-06). Final-minutes "plan next period" entry + each sport's break opens PRE-SEEDED from `plannedRotation.nextPeriod*` (`seedNextPeriodLineup`): AFL `QuarterBreak` draft (must not let `lastAppliedModeRef` stomp the seed), netball `NetballQuarterBreak` `initialDraft`, rugby league `LeagueLiveGame` between-periods inline; stale-plan reconcile D-13, pin cleared on start D-14. 3 tasks, red-first (cross-sport next-period seed + stale-reconcile unit spec; e2e build-next-period). Both 11-01 + 11-02 edit `LiveGame.tsx` → 11-02 runs serially after 11-01. Both threat models = no new auth/network/migration (reuse persistSwap/recordLineupSet/start actions).
Last activity: 2026-06-02 — 11-01 executed + committed (4 commits, red-first); 11-01-SUMMARY.md written; ROADMAP + STATE updated. Ready to execute 11-02.

Progress: [█████░░░░░] 50% (3/6 v1.1 phases complete; Phase 11 in progress — 11-01 of 2 done)

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
Stopped at: Phase 11 / Plan 11-01 COMPLETE (ROTPLAN-01/F1 + shared foundation). Executed INLINE on main (gsd-sdk query unavailable; worktree-rooted agents produce false negatives + wrong-dir writes). 4 tasks red-first, all committed (ba5bcf1 RED → 0b8d9a1 → 050aeea → 22eb1d9); 11-01-SUMMARY.md written; ROADMAP + STATE updated. F1+F2 share ONE projector-seeded "edit an upcoming rotation" surface (Success Criterion #3, non-negotiable architecture) — 11-01 landed the 3 reusable pieces (`projectUpcomingRotation` + extended `GamePlanModal` + `plannedRotation` slice) + AFL F1 consumption. NEXT: execute 11-02 (Wave 2, ROTPLAN-02/F2) which reuses those 3 pieces unchanged.
- **11-CONTEXT.md:** decisions D-01..D-15 folded in. D-01 one surface = extend `GamePlanModal` (not fork); D-02 `projectUpcomingRotation` pure adapter seeds `projectGamePlan`, period[0]=current reality; D-04 `plannedRotation` store slice in `partialize`, gameId-keyed, NO migration; D-05 rejected a `rotation_plan_set` event (ephemeral single-device plan needs no replay/durability); D-06 `PlannedRotation` shape (`pinnedSwaps`/`pinnedForPeriod` for F1; `nextPeriodGroups`/`nextPeriodBench`/`nextPeriodIndex` for F2); D-07 F1 AFL-only via SwapCard entry; D-08 honour = validated pins replace suggestions (advisory); D-09 stale-guard discard→fallback to live suggester; D-10 clear on apply/advance; D-11..D-14 F2 final-minutes entry, each break pre-seeds, stale reconcile, clear on start; D-15 one-handed reachable.
- **11-01 (Wave 1, `depends_on: []`, ROTPLAN-01/F1 + shared foundation) — ✓ COMPLETE 2026-06-02:** created `src/lib/game-plan/live.ts` (`projectUpcomingRotation` + `resolveHonouredSwaps` + `diffPlanToSwaps` + `PlannedRotation`), `__tests__/{projectUpcomingRotation,diffPlanToSwaps}.test.ts`, `src/lib/__tests__/plannedRotationHonour.test.ts`, `e2e/tests/plan-ahead-rotation.spec.ts`; modified `index.ts`, `liveGameStore.ts` (slice+partialize), `GamePlanModal.tsx` (initialPlan/onPin/pinLabel/initialPeriodIndex; Reshuffle→Cancel), `LiveGame.tsx` (plan-ahead-entry + honour + planned-sub-badge + clearPlannedRotation-on-apply), `SwapCard.tsx` (testids). 4 tasks all red-first: ba5bcf1 (RED) → 0b8d9a1 (GREEN adapter+slice+honour) → 050aeea (GREEN modal+entry+honour) → 22eb1d9 (e2e+DoD). DoD all green: tsc 0, lint 0 (warnings only), vitest 840/840 (49 files), e2e new spec green + 6 pre-existing multi-worker flakes confirmed green serially (Phase-9 protocol). See 11-01-SUMMARY.md. Threat model T-11-01-A..D all mitigated/accepted (no new auth/network/migration).
- **11-02 (Wave 2, `depends_on: [01]`, ROTPLAN-02/F2):** files = `LiveGame.tsx`, `QuarterBreak.tsx`, `NetballLiveGame.tsx`, `NetballQuarterBreak.tsx`, `LeagueLiveGame.tsx` + `nextPeriodPlanSeed.test.ts` + `e2e/tests/plan-ahead-rotation.spec.ts`. 3 tasks: (1) RED cross-sport next-period seed + stale-reconcile spec (`seedNextPeriodLineup`); (2) GREEN AFL final-minutes entry + QuarterBreak pre-seed (must not let `lastAppliedModeRef` stomp the seed); (3) GREEN mirror netball (`NetballQuarterBreak` `initialDraft`) + league (`LeagueLiveGame` between-periods inline) + DoD gates. Threat model T-11-02-A..D.
Both plans red-first (unit + e2e); threat models = no new auth/network/migration (reuse `persistSwap`/`recordLineupSet`/start actions).
**11-01 committed (4 commits, see above).** Next: execute 11-02 (Wave 2) — reuses 11-01's 3 pieces unchanged; runs serially after 11-01 since both edit `LiveGame.tsx`.
**TOOLING NOTE (unchanged):** Glob/Grep/Read-without-abs-path default to a STALE/orphaned git worktree (`.claude/worktrees/exciting-hopper-7e19a5`, not in `git worktree list`); real work + commits live in the main checkout (`C:\Users\steve\OneDrive\Documents\Auskick manager`). Use Bash (cd into main checkout) or absolute paths for all file inspection; drive sub-agent-style steps INLINE.
Next: `/gsd-execute-phase 11` resumes at 11-02 (ROTPLAN-02/F2). Phase 13 (AUDIO-01) is independent and may run any time.
Resume file: .planning/phases/11-plan-the-rotation-ahead-of-the-break/11-02-PLAN.md
