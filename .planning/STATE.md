---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Match Day Changes
status: in_progress
stopped_at: Phase 9 COMPLETE (2026-06-01) — /gsd-execute-phase 9 done. Both plans on main + verified. 09-01 (AVAIL-01/B1): shared server-side reconcileLineupToAvailability helper wired into all 3 start actions (actions.ts:168, netball-actions.ts:150, league-actions.ts:192 before vest pre-flight) + client picker-hydration filter (live/page.tsx, all 3 branches) + red-first availability-honoured-at-kickoff.spec.ts (3 sports green). 09-02 (AVAIL-02/B2): one "Manage availability" break entry on QuarterBreak (AFL ref) / NetballQuarterBreak / LeagueLiveGame(isAtQbreak) — add-arrived reuses addLateArrival, mark-out = InjuryReplacementModal forced replacement + markInjury(reason:"out") jsonb flag (no migration; AFL/league also fire a swap, netball stages into next-Q draft), mark-injured plain markInjury; red-first break-availability-{afl,netball,league}.spec.ts. 09-VERIFICATION.md = PASS (all 4 ROADMAP criteria met, evidence file:line). Gates: tsc 0, lint 0, Vitest 781, targeted e2e 4 passed (full suite environmentally flaky on Windows under multi-worker libuv UV_HANDLE_CLOSING — break specs + gates green in isolation). No schema drift. Commits: 0404347/eb4289d/873dc42 (09-01), ddb6aef/14ac34a/ca65eeb (09-02). Next: /gsd-plan-phase 10 (Substitution timing — SUB-01/SUB-02; carry WR-01 fairness ms/min fix here).
last_updated: "2026-06-01T00:00:00Z"
last_activity: 2026-06-01
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across AFL, netball, and rugby league — coaches end every match confident every kid got their fair share.
**Current focus:** Milestone v1.1 — Match Day Changes (4 bugs + 4 features, all sport-agnostic). Spec: `.planning/MATCH-DAY-CHANGES-SPEC.md`.

## Current Position

Phase: Phase 9 — Availability that holds (pre-game & at breaks) — COMPLETE 2026-06-01 (verified PASS)
Plan: 2/2 plans on main + verified (09-01 AVAIL-01, 09-02 AVAIL-02). /gsd-execute-phase 9 complete. Phase 8 closed (4/4). Next phase to plan: Phase 10 (Substitution timing).
Status: Phase 9 DONE. 09-01 = B1 fix: shared server-side reconcileLineupToAvailability helper wired into all THREE start actions (startGame actions.ts:168 / startNetballGame netball-actions.ts:150 / startLeagueGame league-actions.ts:192 before vest pre-flight) + client picker-hydration filter (live/page.tsx, all 3 branches; netball backfills vacated court slot) + red-first availability-honoured-at-kickoff.spec.ts (3 sports). 09-02 = B2: single "Manage availability" break entry reusing addLateArrival (add-arrived) + InjuryReplacementModal forced replacement with markInjury(reason:"out") jsonb flag (no migration) + plain markInjury (mark-injured), across AFL QuarterBreak (reference) / NetballQuarterBreak / LeagueLiveGame isAtQbreak; red-first break-availability-{afl,netball,league}.spec.ts. 09-VERIFICATION.md = PASS (4/4 criteria, file:line evidence). Next: /gsd-plan-phase 10.
Last activity: 2026-06-01 — Phase 9 execute-phase complete (both plans on main, 09-VERIFICATION PASS, gates green: tsc 0 / lint 0 / Vitest 781 / targeted e2e 4 passed; no schema drift)

Progress: [███░░░░░░░] 33% (2/6 v1.1 phases)

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
- ~~v1.1 B1: availability-control discrepancy to reconcile during the B1 phase (Phase 9).~~ RESOLVED in Phase 9 (09-CONTEXT.md §B1 D-01: "the picker" = the dedicated AvailabilityList/AvailabilityRow surface, NOT the zones LineupPicker; no new control added; the draft→picker→lineup_set path is reconciled server-side).

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Deploy | v1.0 preview deploy + prod cutover (Phases 6–7) | Blocked on prod creds | 2026-05-01 |

## Session Continuity

Last session: 2026-06-01
Stopped at: Phase 9 COMPLETE — `/gsd-execute-phase 9` done end-to-end (manual drive; gsd-sdk query unavailable, all steps emulated with native tools). Both plans executed, committed on main, and verified. **09-01 (AVAIL-01 / B1):** shared `reconcileLineupToAvailability(supabase, gameId, lineup)` helper (recursive structural filter — covers AFL/league flat zone arrays AND netball nested `positions` map) wired into all 3 start actions before each `lineup_set` insert (league before vest pre-flight) + client picker-hydration filter on all 3 branches in `live/page.tsx` (netball backfills vacated court slot — Deviation #2); red-first `availability-honoured-at-kickoff.spec.ts` (3 sports green). Commits 0404347 / eb4289d / 873dc42. **09-02 (AVAIL-02 / B2):** one "Manage availability" break entry — add-arrived via canonical `addLateArrival`, mark-out via `InjuryReplacementModal` forced replacement recorded `markInjury(reason:"out")` (jsonb flag, no migration; AFL/league also fire a swap, netball stages the replacement into the next-Q draft → `period_break_swap` on Start Qn), mark-injured plain `markInjury` — on AFL `QuarterBreak.tsx` (reference), `NetballQuarterBreak.tsx`, and league `isAtQbreak` in `LeagueLiveGame.tsx`; red-first `break-availability-{afl,netball,league}.spec.ts`. Commits ddb6aef / 14ac34a / ca65eeb. **Post-execution gates:** `09-VERIFICATION.md` = PASS (4/4 ROADMAP criteria, file:line evidence); no schema drift (no migrations); tsc 0 / lint 0 / Vitest 781 / targeted e2e 4 passed (full 122-spec suite environmentally flaky on this Windows box under multi-worker libuv `UV_HANDLE_CLOSING` — break + kickoff specs and all gates green in isolation after a clean dev/Supabase reset). ROADMAP + STATE updated. **TOOLING NOTE:** Glob/Grep/Read-without-abs-path default to a STALE git worktree (`.claude/worktrees/exciting-hopper-7e19a5`); the real work + commits live in the main checkout (`C:\Users\steve\OneDrive\Documents\Auskick manager`). Use Bash (cd into main checkout) or absolute paths for all file inspection. Carry-forward unchanged: WR-01 fairness ms/min mismatch → Phase 10/SUB-02. Next: `/gsd-plan-phase 10`.
Resume file: .planning/phases/09-availability-that-holds-pre-game-and-at-breaks/09-VERIFICATION.md
