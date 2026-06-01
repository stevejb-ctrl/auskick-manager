---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Match Day Changes
status: in_progress
stopped_at: Phase 10 COMPLETE + VERIFIED PASS (2026-06-02) — /gsd-execute-phase 10 done (no flags), driven INLINE on main (gsd-sdk unavailable; worktree-rooted agents produce false negatives). Both plans landed. 10-01 (SUB-02/F4 + WR-01): deriveSubIntervalSeconds at src/lib/sports/subInterval.ts wired into all 3 sport configs (commits 95e88a8 RED, dc2e2b4 GREEN, 76b2050 WR-01 fix). 10-02 (SUB-01/B4): replay-derived cross-period lastSubbedOnMs on all 3 replays (replayGame fairness.ts:1002/1133/1221, replayLeagueGame rugby_league/fairness.ts:62/150/199, replayNetballGame netball/fairness.ts:828/866 — NO migration, shared w/ F3) + recency guard in all 3 suggesters: AFL suggestSwaps SOFT minStintMs-window partition (fairness.ts:894, threaded from LiveGame.tsx via initialState.lastSubbedOnMs + completedQuarterMs+nowMs*clockMultiplier + minStintMs=subIntervalMs); league suggestLeagueSubs cross-period absolute stint fix (NO new param — msAt-desc off-sort honours recency naturally; suggestNextLeagueSub inherits); netball suggestNetballLineup PURE windowless tiebreak (period-granular; NOT minStintMs — DEVIATION) wired via NetballQuarterBreak.tsx. Commits: 2cd9d33 RED, 991df01 GREEN-AFL, 74bd51e GREEN-league+netball, 6d4ab08 docs(SUMMARY). DoD: tsc PASS, lint PASS, Vitest 821 PASS; e2e effective-PASS (full parallel 112p/7f were non-deterministic + unrelated to suggester — netball-live-flow 14/14 GREEN in isolation = known Windows cold-start contention, not a regression). 10-VERIFICATION.md PASS (4/4 SC met, SUB-01/SUB-02 delivered, WR-01 closed). Next: /gsd-plan-phase 11 (ROTPLAN-01/02 — depends on Phase 10).
last_updated: "2026-06-02T12:00:00Z"
last_activity: 2026-06-02
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across AFL, netball, and rugby league — coaches end every match confident every kid got their fair share.
**Current focus:** Milestone v1.1 — Match Day Changes (4 bugs + 4 features, all sport-agnostic). Spec: `.planning/MATCH-DAY-CHANGES-SPEC.md`.

## Current Position

Phase: Phase 10 — Substitution timing that's fair — COMPLETE + VERIFIED PASS 2026-06-02 (2/2 plans on main)
Plan: 2/2 plans landed. 10-01 (SUB-02/F4 + WR-01, wave 1) + 10-02 (SUB-01/B4, wave 2). Next: /gsd-plan-phase 11 (ROTPLAN-01/02 — depends on Phase 10's derived interval + recency-aware suggestions).
Status: Phase 10 EXECUTED via /gsd-execute-phase 10 (no flags), driven INLINE on main (gsd-sdk query unavailable; both plans edit fairness.ts so serialized — 10-01 wave 1, 10-02 wave 2 depends_on [01]). **10-01 (SUB-02/F4 + WR-01):** pure deriveSubIntervalSeconds(periodSeconds, floorSeconds) at src/lib/sports/subInterval.ts (smallest CLEAN divisor ≥ floor; near-even fallback) wired into all 3 sport configs replacing the fixed constant; downstream (games.sub_interval_seconds seed, game-plan project.ts) inherits it; PLUS WR-01 fix (fullPeriodMins=fullPeriodMs/60000) w/ red-first seasonDiversityUnits.test.ts. Commits 95e88a8/dc2e2b4/76b2050 + dcb2b1e docs. **10-02 (SUB-01/B4):** replay-derived cross-period lastSubbedOnMs on all 3 replays (replayGame/replayLeagueGame/replayNetballGame — absolute game-elapsed ms of most-recent bench→field, PERSISTS across period boundaries, shared w/ F3/Phase 12, NO migration) + recency guard in all 3 suggesters: AFL suggestSwaps SOFT minStintMs-window partition (isRecent fairness.ts:894, threaded from LiveGame.tsx); league suggestLeagueSubs cross-period absolute-stint fix (DEVIATION: NO new param — the msAt-desc off-sort honours recency naturally once the quarter_start reset is removed; suggestNextLeagueSub inherits); netball suggestNetballLineup PURE windowless tiebreak (DEVIATION: period-granular, NOT the minStintMs window — a just-arrived netballer came on a whole period ago > any sub-interval) wired via NetballQuarterBreak.tsx; live pages pass whole replay state as initialState so lastSubbedOnMs flows through transitively (DEVIATION: no per-field thread in page.tsx). Commits 2cd9d33 RED / 991df01 GREEN-AFL / 74bd51e GREEN-league+netball / 6d4ab08 docs(SUMMARY). DoD gates: tsc PASS, lint PASS, Vitest 821 PASS (incl. 4 subRecencyGuard cases); e2e effective-PASS (full parallel 112p/7f were non-deterministic + unrelated to the suggester — netball-live-flow 14/14 GREEN in isolation = known Windows cold-start/worker-contention artifact + transient supabase-db-reset Docker error, NOT a product regression). 10-VERIFICATION.md verdict PASS (4/4 SC met across all 3 sports; SUB-01 + SUB-02 delivered; WR-01 carry-forward CLOSED).
Last activity: 2026-06-02 — Phase 10 executed + verified PASS; SUMMARY + VERIFICATION written; ROADMAP + STATE updated; docs committed.

Progress: [█████░░░░░] 50% (3/6 v1.1 phases)

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
Stopped at: Phase 10 COMPLETE + VERIFIED PASS — `/gsd-execute-phase 10` done end-to-end (no flags; manual drive — gsd-sdk query unavailable; driven INLINE on main because worktree-rooted agents produce false negatives). Both plans landed serially (both edit fairness.ts; 10-02 depends_on [01]); F4→B4 build order honoured.
- **10-01 (SUB-02/F4 + WR-01):** pure `deriveSubIntervalSeconds(periodSeconds, floorSeconds)` at `src/lib/sports/subInterval.ts` (smallest CLEAN divisor ≥ floor; near-even fallback) wired into all 3 sport configs replacing the fixed constant; downstream (`games.sub_interval_seconds` seed, game-plan `project.ts`) inherits it; PLUS WR-01 unit fix (`fullPeriodMins = fullPeriodMs/60000`). Commits `95e88a8` RED / `dc2e2b4` GREEN / `76b2050` WR-01 / `dcb2b1e` docs. (See 10-01-SUMMARY.md.)
- **10-02 (SUB-01/B4):** replay-derived cross-period `lastSubbedOnMs` on all 3 replays (replayGame `fairness.ts:1002/1133/1221`, replayLeagueGame `rugby_league/fairness.ts:62/150/199`, replayNetballGame `netball/fairness.ts:828/866` — absolute, persists across periods, shared w/ F3, NO migration) + recency guard in all 3 suggesters: AFL `suggestSwaps` SOFT `minStintMs`-window partition (`fairness.ts:894`, threaded from `LiveGame.tsx` via `initialState.lastSubbedOnMs` + `completedQuarterMs+nowMs*clockMultiplier` + `minStintMs=subIntervalMs`); league `suggestLeagueSubs` cross-period absolute-stint fix (**DEVIATION:** NO new param — removing the `quarter_start` reset makes the existing `msAt`-desc off-sort honour recency; `suggestNextLeagueSub` inherits); netball `suggestNetballLineup` **PURE windowless tiebreak** (**DEVIATION:** period-granular, NOT the `minStintMs` window — a just-arrived netballer came on a whole period ago > any sub-interval) wired via `NetballQuarterBreak.tsx`; **DEVIATION:** live pages pass the whole replay `state` as `initialState` so `lastSubbedOnMs`/`completedQuarterMs` flow through transitively (no per-field thread in `page.tsx`). Commits `2cd9d33` RED / `991df01` GREEN-AFL / `74bd51e` GREEN-league+netball / `6d4ab08` docs(SUMMARY). (See 10-02-SUMMARY.md.)
DoD gates: `tsc` PASS, `lint` PASS, Vitest **821** PASS (incl. all 4 subRecencyGuard cases); e2e **effective-PASS** — the full parallel run (112p/7f) failed non-deterministically on specs UNRELATED to the suggester (account-deletion, roster, live-scoring, netball-live-flow interactions); re-running serially passed 6/7 and failed 4 *different* netball-live-flow tests; `netball-live-flow.spec.ts` in isolation passed **14/14** (1 intentional skip). Pattern = known Windows cold-start/worker-contention (per `playwright.config.ts` comment) + a transient `supabase db reset` Docker `error running container: exit 1` (succeeded on retry), NOT a product regression. No spec ordering shifted, so no e2e spec required updating.
**10-VERIFICATION.md verdict PASS** — 4/4 ROADMAP success criteria met across AFL/netball/league; SUB-01 + SUB-02 delivered; WR-01 carry-forward CLOSED.
**TOOLING NOTE (unchanged):** Glob/Grep/Read-without-abs-path default to a STALE/orphaned git worktree (`.claude/worktrees/exciting-hopper-7e19a5`, not in `git worktree list`); real work + commits live in the main checkout (`C:\Users\steve\OneDrive\Documents\Auskick manager`). Use Bash (cd into main checkout) or absolute paths for all file inspection; drive sub-agent-style steps INLINE.
Next: `/gsd-plan-phase 11` (ROTPLAN-01/02 — Phase 11 depends on Phase 10's derived interval + recency-aware suggestions). Phase 13 (AUDIO-01) is independent and may run any time.
Resume file: .planning/phases/10-substitution-timing-thats-fair/10-VERIFICATION.md
