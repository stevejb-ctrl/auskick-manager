---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Match Day Changes
status: in_progress
stopped_at: Phase 11 COMPLETE (ROTPLAN-01/F1 + ROTPLAN-02/F2). Both waves landed, executed INLINE on main (gsd-sdk unavailable; worktree-rooted agents → false negatives). 11-01 (Wave 1, F1 + shared foundation): ba5bcf1 RED → 0b8d9a1 (projectUpcomingRotation adapter + plannedRotation slice + resolveHonouredSwaps) → 050aeea (extend GamePlanModal + AFL SwapCard plan-ahead entry + honour + diffPlanToSwaps) → 22eb1d9 (e2e override-then-honour + DoD). 11-02 (Wave 2, F2 cross-sport): 26f42c5 RED (nextPeriodPlanSeed.test.ts, 3 sports) → f72973c (pure seedNextPeriodLineup + AFL final-minutes "plan next period" entry + QuarterBreak pre-seed, lastAppliedModeRef seed-as-initial) → a138270 (mirror netball NetballQuarterBreak initialDraft + rugby-league LeagueLiveGame between-periods seed via recordLeagueLineupSet on explicit Start + e2e F2 build-next-period). F1+F2 share ONE GamePlanModal (no fork — Success Criterion #3); NO migration, NO new GameEventType, NO new store slice. D-11..D-15 all honoured (final-window entry gated !isLastPeriod; break pre-seeds from plannedRotation.nextPeriod*; D-13 stale reconcile drops unavailable players to bench; D-14 pin cleared on start; D-15 planned-seed-banner in all 3 break paths). DoD all green: tsc 0, lint 0 (2 pre-existing warnings), vitest (nextPeriodPlanSeed 13/13), e2e plan-ahead-rotation.spec.ts 3/3 (setup+F1+F2) --workers=1 per Phase-9 protocol. 11-01-SUMMARY.md + 11-02-SUMMARY.md + 11-VERIFICATION.md (verdict PASS) written; ROADMAP + STATE updated. NEXT: Phase 12 (PLAYERVIEW-01/02 / F3 long-press player insight) or Phase 13 (AUDIO-01, independent — may run any time). v1.0 Phase 6 still paused on user creds.
last_updated: "2026-06-02T12:00:00Z"
last_activity: 2026-06-02
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 11
  completed_plans: 10
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across AFL, netball, and rugby league — coaches end every match confident every kid got their fair share.
**Current focus:** Milestone v1.1 — Match Day Changes (4 bugs + 4 features, all sport-agnostic). Spec: `.planning/MATCH-DAY-CHANGES-SPEC.md`.

## Current Position

Phase: Phase 11 — Plan the rotation ahead of the break — ✓ COMPLETE 2026-06-02 (11-01 + 11-02 both landed; 11-VERIFICATION.md verdict PASS)
Plan: 2 plans (Wave 1 → Wave 2), BOTH COMPLETE ✓. Next milestone work: Phase 12 (PLAYERVIEW-01/02 / F3) via /gsd-plan-phase 12, or Phase 13 (AUDIO-01, independent — may run any time).
Status: Executed INLINE on main (gsd-sdk query unavailable; worktree-rooted agents → false negatives + wrong-dir writes). F1+F2 share ONE projector-seeded "edit an upcoming rotation" surface = the extended `GamePlanModal`, no fork (Success Criterion #3, satisfied). **11-01 (Wave 1, ROTPLAN-01/F1 + foundation) — DONE:** pure `projectUpcomingRotation` adapter (`src/lib/game-plan/live.ts`) + `resolveHonouredSwaps` honour/stale-guard + `diffPlanToSwaps` + `plannedRotation` live-store slice (in `partialize`, gameId-keyed, NO migration/event — D-04) + extend `GamePlanModal` (`initialPlan`/`onPin`/`pinLabel`/`initialPeriodIndex`; Reshuffle→Cancel in plan-ahead) + AFL imminent-sub override-then-honour (`plan-ahead-entry`, advisory; stale-pin guard D-09; `planned-sub-badge` D-15; `clearPlannedRotation` on apply D-10). Commits ba5bcf1 → 0b8d9a1 → 050aeea → 22eb1d9. **11-02 (Wave 2, ROTPLAN-02/F2) — DONE:** pure `seedNextPeriodLineup` (seed-match / wrong-period→null / D-13 stale-reconcile drops unavailable players to bench) + final-minutes "plan next period" entry (`plan-next-period-entry`, gated by sport-agnostic final-window predicate AND `!isLastPeriod`) on all 3 live surfaces opening the shared modal on the NEXT period (`initialPeriodIndex`) and pinning `nextPeriod*`; each sport's break opens PRE-SEEDED: AFL `QuarterBreak` draft (seed treated as `lastAppliedModeRef` initial applied state so `suggestedLineup` can't stomp it — D-12), netball `NetballQuarterBreak` `initialDraft`, rugby-league `LeagueLiveGame` between-periods via `recordLeagueLineupSet` on explicit Start tap (auth/RLS-guarded, never auto-commit — T-11-02-B); `planned-seed-banner` at all 3 breaks (D-15); pin cleared on start (D-14). Commits 26f42c5 (RED) → f72973c (GREEN AFL) → a138270 (GREEN netball+league+e2e). DoD all green: tsc 0, lint 0 (2 pre-existing warnings), vitest (`nextPeriodPlanSeed` 13/13), e2e `plan-ahead-rotation.spec.ts` 3/3 (setup+F1+F2) `--workers=1` per Phase-9 protocol. NO migration, NO new GameEventType, NO new store slice, NO new modal/component (only added file = `nextPeriodPlanSeed.test.ts`). 11-01-SUMMARY.md + 11-02-SUMMARY.md + 11-VERIFICATION.md (PASS) written.
Last activity: 2026-06-02 — Phase 11 completed end-to-end (both waves, 7 commits red-first); 11-02-SUMMARY.md + 11-VERIFICATION.md written; ROADMAP + STATE updated.

Progress: [███████░░░] 67% (4/6 v1.1 phases complete; Phase 11 ✓ done — Phases 12 + 13 remain)

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
Stopped at: Phase 11 COMPLETE (ROTPLAN-01/F1 + ROTPLAN-02/F2). Executed INLINE on main (gsd-sdk query unavailable; worktree-rooted agents produce false negatives + wrong-dir writes). Both waves done, 7 commits red-first (11-01: ba5bcf1 → 0b8d9a1 → 050aeea → 22eb1d9; 11-02: 26f42c5 → f72973c → a138270); 11-01-SUMMARY.md + 11-02-SUMMARY.md + 11-VERIFICATION.md (verdict PASS) written; ROADMAP + STATE updated. F1+F2 share ONE projector-seeded "edit an upcoming rotation" surface = the extended `GamePlanModal`, no fork (Success Criterion #3 satisfied); NO migration / event / store slice / modal added. NEXT: Phase 12 (PLAYERVIEW-01/02 / F3 long-press player insight) or Phase 13 (AUDIO-01, independent).
- **11-CONTEXT.md:** decisions D-01..D-15 folded in. D-01 one surface = extend `GamePlanModal` (not fork); D-02 `projectUpcomingRotation` pure adapter seeds `projectGamePlan`, period[0]=current reality; D-04 `plannedRotation` store slice in `partialize`, gameId-keyed, NO migration; D-05 rejected a `rotation_plan_set` event (ephemeral single-device plan needs no replay/durability); D-06 `PlannedRotation` shape (`pinnedSwaps`/`pinnedForPeriod` for F1; `nextPeriodGroups`/`nextPeriodBench`/`nextPeriodIndex` for F2); D-07 F1 AFL-only via SwapCard entry; D-08 honour = validated pins replace suggestions (advisory); D-09 stale-guard discard→fallback to live suggester; D-10 clear on apply/advance; D-11..D-14 F2 final-minutes entry, each break pre-seeds, stale reconcile, clear on start; D-15 one-handed reachable.
- **11-01 (Wave 1, `depends_on: []`, ROTPLAN-01/F1 + shared foundation) — ✓ COMPLETE 2026-06-02:** created `src/lib/game-plan/live.ts` (`projectUpcomingRotation` + `resolveHonouredSwaps` + `diffPlanToSwaps` + `PlannedRotation`), `__tests__/{projectUpcomingRotation,diffPlanToSwaps}.test.ts`, `src/lib/__tests__/plannedRotationHonour.test.ts`, `e2e/tests/plan-ahead-rotation.spec.ts`; modified `index.ts`, `liveGameStore.ts` (slice+partialize), `GamePlanModal.tsx` (initialPlan/onPin/pinLabel/initialPeriodIndex; Reshuffle→Cancel), `LiveGame.tsx` (plan-ahead-entry + honour + planned-sub-badge + clearPlannedRotation-on-apply), `SwapCard.tsx` (testids). 4 tasks all red-first: ba5bcf1 (RED) → 0b8d9a1 (GREEN adapter+slice+honour) → 050aeea (GREEN modal+entry+honour) → 22eb1d9 (e2e+DoD). DoD all green: tsc 0, lint 0 (warnings only), vitest 840/840 (49 files), e2e new spec green + 6 pre-existing multi-worker flakes confirmed green serially (Phase-9 protocol). See 11-01-SUMMARY.md. Threat model T-11-01-A..D all mitigated/accepted (no new auth/network/migration).
- **11-02 (Wave 2, `depends_on: [01]`, ROTPLAN-02/F2):** files = `LiveGame.tsx`, `QuarterBreak.tsx`, `NetballLiveGame.tsx`, `NetballQuarterBreak.tsx`, `LeagueLiveGame.tsx` + `nextPeriodPlanSeed.test.ts` + `e2e/tests/plan-ahead-rotation.spec.ts`. 3 tasks: (1) RED cross-sport next-period seed + stale-reconcile spec (`seedNextPeriodLineup`); (2) GREEN AFL final-minutes entry + QuarterBreak pre-seed (must not let `lastAppliedModeRef` stomp the seed); (3) GREEN mirror netball (`NetballQuarterBreak` `initialDraft`) + league (`LeagueLiveGame` between-periods inline) + DoD gates. Threat model T-11-02-A..D.
Both plans red-first (unit + e2e); threat models = no new auth/network/migration (reuse `persistSwap`/`recordLineupSet`/start actions).
**Phase 11 fully committed (7 commits, see above).** Both plans reused the Wave-1 foundation; no fork, no migration.
**TOOLING NOTE (unchanged):** Glob/Grep/Read-without-abs-path default to a STALE/orphaned git worktree (`.claude/worktrees/exciting-hopper-7e19a5`, not in `git worktree list`); real work + commits live in the main checkout (`C:\Users\steve\OneDrive\Documents\Auskick manager`). Use Bash (cd into main checkout) or absolute paths for all file inspection; drive sub-agent-style steps INLINE.
Next: `/gsd-plan-phase 12` (PLAYERVIEW-01/02 / F3 long-press player insight). Phase 13 (AUDIO-01) is independent and may run any time. v1.0 Phase 6 still paused on user creds.
Resume file: none (Phase 11 complete) — start Phase 12 planning.
