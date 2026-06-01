---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Match Day Changes
status: in_progress
stopped_at: Phase 10 PLANNED (2026-06-02) — /gsd-plan-phase 10 done (no flags). Drove the workflow MANUALLY (gsd-sdk query unavailable): missing-CONTEXT.md gate → user chose "Continue without context" (no discuss-phase); research skipped (config research:false); UI gate skipped (0 UI keywords); pattern-map + plan-check + verifier driven INLINE (worktree-rooted agents produce false negatives — same as Phase 9). Created 2 plans in .planning/phases/10-substitution-timing-thats-fair/. 10-01 (SUB-02/F4 + WR-01): NEW pure deriveSubIntervalSeconds(periodSeconds, floorSeconds) at src/lib/sports/subInterval.ts (smallest CLEAN divisor ≥ floor; near-even fallback N=floor(period/floor) when only divisor≥floor is the period; D-01 "even"="evenly-dividing") wired into all 3 sport configs replacing the fixed constant (afl/index.ts:51, rugby_league:80-81 QUARTER/HALF_SUB_INTERVAL, netball:121+ 10*60) — downstream (games.sub_interval_seconds seed via playhq/demo/cron, game-plan project.ts:229) inherits it; PLUS WR-01 carry-forward fix fairness.ts:616 (seasonMins MINUTES vs fullPeriodMs MS → always-on; fix via fullPeriodMins=fullPeriodMs/60000) with red-first seasonDiversityUnits.test.ts. 10-02 (SUB-01/B4): NEW replay-derived cross-period lastSubbedOnMs on all 3 replays (replayGame/replayLeagueGame/replayNetballGame — persists across period boundaries, shared with F3/Phase 12, NO migration) + SOFT recency partition (minStintMs=subIntervalSeconds*1000) in all 3 suggesters (AFL suggestSwaps reference, league suggestLeagueSubs fix the quarter_start startedAt reset at rugby_league/fairness.ts:2073-2080, netball suggestNetballLineup) + red-first cross-sport subRecencyGuard.test.ts; token path (run/[token]/page.tsx:518) threaded not forked. depends_on:[01] wave 2 (both edit fairness.ts → serialized). Inline plan-check verdict PASS (4/4 criteria mapped, reqs SUB-01/SUB-02 covered, STRIDE blocks present). Next: /gsd-execute-phase 10.
last_updated: "2026-06-02T00:00:00Z"
last_activity: 2026-06-02
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 8
  completed_plans: 6
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across AFL, netball, and rugby league — coaches end every match confident every kid got their fair share.
**Current focus:** Milestone v1.1 — Match Day Changes (4 bugs + 4 features, all sport-agnostic). Spec: `.planning/MATCH-DAY-CHANGES-SPEC.md`.

## Current Position

Phase: Phase 10 — Substitution timing that's fair — PLANNED 2026-06-02 (2 plans, ready to execute)
Plan: 0/2 plans. 10-01 (SUB-02/F4 + WR-01, wave 1, depends_on []) + 10-02 (SUB-01/B4, wave 2, depends_on [01]). Phase 9 COMPLETE (2/2 on main, verified PASS). Next: /gsd-execute-phase 10.
Status: Phase 10 PLANNED via /gsd-plan-phase 10 (no flags). Drove the workflow MANUALLY (gsd-sdk query unavailable): missing-CONTEXT.md gate → user chose "Continue without context" (no discuss-phase); research skipped (config research:false); UI gate skipped (0 UI keywords); pattern-map + plan-check + verifier driven INLINE (worktree-rooted agents produce false negatives). Inline plan-check verdict PASS (4/4 ROADMAP criteria mapped, reqs SUB-01/SUB-02 covered, STRIDE blocks present, wave/dependency serialization correct, reuse-before-fork honored). **10-01 (SUB-02/F4 + WR-01):** NEW pure deriveSubIntervalSeconds(periodSeconds, floorSeconds) at src/lib/sports/subInterval.ts (smallest CLEAN divisor ≥ floor; near-even fallback N=floor(period/floor) when only divisor≥floor is the period; D-01 "even"="evenly-dividing") wired into all 3 sport configs replacing the fixed constant (afl/index.ts:51, rugby_league:80-81 QUARTER/HALF_SUB_INTERVAL, netball:121+ 10*60) — downstream (games.sub_interval_seconds seed, game-plan project.ts:229) inherits it; PLUS WR-01 carry-forward fix fairness.ts:616 (seasonMins MINUTES vs fullPeriodMs MS → always-on; fix via fullPeriodMins=fullPeriodMs/60000) with red-first seasonDiversityUnits.test.ts. **10-02 (SUB-01/B4):** NEW replay-derived cross-period lastSubbedOnMs on all 3 replays (replayGame/replayLeagueGame/replayNetballGame — persists across period boundaries, shared with F3/Phase 12, NO migration) + SOFT recency partition (minStintMs=subIntervalSeconds*1000) in all 3 suggesters (AFL suggestSwaps reference, league suggestLeagueSubs fixes the quarter_start startedAt reset at rugby_league/fairness.ts:2073-2080, netball suggestNetballLineup) + red-first cross-sport subRecencyGuard.test.ts; token path (run/[token]/page.tsx:518) threaded not forked. depends_on:[01] wave 2 (both edit fairness.ts → serialized).
Last activity: 2026-06-02 — Phase 10 plan-phase complete (2 plans created + plan-check PASS; ROADMAP + STATE updated; docs commit). No code executed yet.

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

- **WR-01 (NOW FOLDED INTO 10-01-PLAN.md, Task 3 — no longer a loose note):** `fairness.ts:616` compares `fullPeriodMs` (milliseconds) against a season total produced in MINUTES by `gameZoneMinutes` (ms/60000) → the season-diversity nudge is effectively always-on in production and D-03's per-game threshold is a no-op there. Pre-existing unit mismatch (the deleted `FULL_QUARTER_MS` had the same bug), NOT a Phase 8 regression. Fix in 10-01: `const fullPeriodMins = fullPeriodMs / 60000;` then compare `seasonMins < fullPeriodMins`; rename misleading local; red-first `seasonDiversityUnits.test.ts`. (Source: 08 REVIEW.md WR-01 + 09-VERIFICATION carry-forward.) Resolves when /gsd-execute-phase 10 lands 10-01.

### Blockers/Concerns

- **v1.0 PAUSED (not a v1.1 blocker):** Multi-sport merge is blocked at Phase 6 — Phases 6–7 (preview deploy + production cutover) need user-provided prod Supabase clone + Vercel preview env. Engineering (phases 1–5) is complete; DEPLOY-RUNBOOK.md is written. Resume: `/gsd-execute-phase 6 --wave 4`. Resume file: `.planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-RUNBOOK.md`.
- ~~v1.1 B1: availability-control discrepancy to reconcile during the B1 phase (Phase 9).~~ RESOLVED in Phase 9 (09-CONTEXT.md §B1 D-01: "the picker" = the dedicated AvailabilityList/AvailabilityRow surface, NOT the zones LineupPicker; no new control added; the draft→picker→lineup_set path is reconciled server-side).

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Deploy | v1.0 preview deploy + prod cutover (Phases 6–7) | Blocked on prod creds | 2026-05-01 |

## Session Continuity

Last session: 2026-06-02
Stopped at: Phase 10 PLANNED — `/gsd-plan-phase 10` done end-to-end (manual drive; gsd-sdk query unavailable, all steps emulated with native tools). NO code executed — planning only. At the missing-CONTEXT.md gate the user chose **"Continue without context"** → planned straight from REQUIREMENTS.md + MATCH-DAY-CHANGES-SPEC.md F4/B4 sections (planner made the gray-area calls and documented them as locked decisions). research skipped (config research:false); UI gate skipped (0 UI keywords); pattern-map + plan-check + verifier driven INLINE (worktree-rooted agents would produce false negatives). **2 plans created** in `.planning/phases/10-substitution-timing-thats-fair/`:
- **10-01-PLAN.md (SUB-02/F4 + WR-01, wave 1, depends_on []):** NEW pure `deriveSubIntervalSeconds(periodSeconds, floorSeconds)` at `src/lib/sports/subInterval.ts` = smallest CLEAN (evenly-dividing) divisor ≥ floor; near-even fallback `N=floor(period/floor)`→`round(period/N)` when N≥2 else `period`, only when the sole divisor≥floor is the period itself (D-01 "even"="evenly-dividing", pick smallest). Wired into all 3 sport configs replacing the fixed constant — afl/index.ts:51, rugby_league/index.ts:80-81 (QUARTER_SUB_INTERVAL/HALF_SUB_INTERVAL), netball/index.ts (10*60). Downstream (games.sub_interval_seconds seed via playhq/demo/cron, game-plan project.ts:229) inherits it (D-02 replace-at-config). Worked: derive(480,240)=240; derive(1200,240)=240 (was 600); derive(600,240)=300; derive(251,120)=126; derive(130,70)=130. PLUS WR-01 fix (D-04, folded here): fairness.ts:616 `fullPeriodMins = fullPeriodMs/60000` then `seasonMins < fullPeriodMins`. Tasks: (1) RED subInterval.test.ts + seasonDiversityUnits.test.ts; (2) GREEN derive + wire 3 configs; (3) GREEN WR-01 + ripple snapshots + DoD gates. STRIDE T-10-01-A/B/C.
- **10-02-PLAN.md (SUB-01/B4, wave 2, depends_on [01]):** NEW replay-derived cross-period `lastSubbedOnMs` on all 3 replays (replayGame/replayLeagueGame/replayNetballGame — absolute game-elapsed ms of most-recent bench→field transition, PERSISTS across period boundaries, shared with F3/Phase 12, NO migration — D-05/D-06) + SOFT recency partition `minStintMs=subIntervalSeconds*1000`, `isRecent(id)=elapsedMs-lastSubbedOnMs[id]<minStintMs`, off-candidates non-recent-first w/ fallback to recent (never deadlocks — D-07/D-08) in all 3 suggesters: AFL `suggestSwaps` (reference, new trailing optional params `lastSubbedOnMs={},elapsedMs=0,minStintMs=0` → inert for legacy callers), league `suggestLeagueSubs` (fixes the quarter_start `startedAt`→0 reset at rugby_league/fairness.ts:2073-2080 = the B4 gap), netball `suggestNetballLineup`. Token path `run/[token]/page.tsx:518` threaded NOT forked (mirrors Phase 9 D-06). Red-first cross-sport `subRecencyGuard.test.ts`. Tasks: (1) RED; (2) GREEN AFL replayGame+suggestSwaps+thread args; (3) GREEN league+netball mirror + DoD gates. STRIDE T-10-02-A/B/C.
Both edit fairness.ts → MUST serialize (10-02 depends_on [01]); also F4→B4 build order from spec. ROADMAP (Phase 10 detail + v1.1 table → "0/2 | Planned") + STATE updated; `docs(10): create phase plan` committed on main. **TOOLING NOTE (unchanged):** Glob/Grep/Read-without-abs-path default to a STALE/orphaned git worktree (`.claude/worktrees/exciting-hopper-7e19a5`, not in `git worktree list`); real work + commits live in the main checkout (`C:\Users\steve\OneDrive\Documents\Auskick manager`). Use Bash (cd into main checkout) or absolute paths for all file inspection; drive sub-agent-style steps INLINE. Next: `/gsd-execute-phase 10`.
Resume file: .planning/phases/10-substitution-timing-thats-fair/10-01-PLAN.md
