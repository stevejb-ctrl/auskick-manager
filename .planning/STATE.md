---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Match Day Changes
status: in_progress
stopped_at: Phase 12 PLANNED (PLAYERVIEW-01/02 / F3 long-press player insight). `/gsd-plan-phase 12` driven INLINE on main (gsd-sdk unavailable; worktree-rooted agents → false negatives). User chose: plan directly from spec (no discuss-phase), skip research, plan without a UI-SPEC (reuse existing long-press chrome). Wrote 12-CONTEXT.md (folded decisions D-01..D-08) + 12-01-PLAN.md (Wave 1: shared core — pure sport-agnostic `buildPlayerInsight` VM builder + shared `PlayerInsightSummary` block + AFL replay `playedZoneMsByPeriod` per-period datum + AFL long-press wiring inside the EXISTING LockModal via an optional `insight?` slot; red-first VM + per-period unit + AFL e2e) + 12-02-PLAN.md (Wave 2, depends_on [01]: netball + rugby-league mirror — `playedZoneMsByPeriod` in replayNetballGame/replayLeagueGame + `insight?` slot on NetballPlayerActions + wire both hosts reusing the shared builder/component verbatim; red-first per-period unit + netball/league e2e). Key design: cross-sport host split (LockModal = AFL+RL shared; NetballPlayerActions = netball fork) → reuse boundary is the SHARED summary content (builder + component) embedded via an `insight` slot, NOT the host. Per-period × per-zone breakdown is the one MISSING datum → derive additively at each engine's existing per-zone credit sites, red-first cross-checked to sum to existing per-zone outputs. Season = PERCENTAGES ONLY (no raw ms). Zones from `getAgeGroupConfig(...).zones`, never hardcoded ALL_ZONES. NO migration / GameEventType / store slice / server action — read-only. Plans self-verified (PLAYERVIEW-01/02 covered, no fork, sport-agnostic, two-wave serial sound). NEXT: `/gsd-execute-phase 12`, or Phase 13 (AUDIO-01, independent — may run any time). v1.0 Phase 6 still paused on user creds.
last_updated: "2026-06-02T13:00:00Z"
last_activity: 2026-06-02
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 12
  completed_plans: 10
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across AFL, netball, and rugby league — coaches end every match confident every kid got their fair share.
**Current focus:** Milestone v1.1 — Match Day Changes (4 bugs + 4 features, all sport-agnostic). Spec: `.planning/MATCH-DAY-CHANGES-SPEC.md`.

## Current Position

Phase: Phase 12 — Long-press player insight (PLAYERVIEW-01/02 / F3) — PLANNED 2026-06-02 (2 plans written + self-verified; ready to execute). Phase 11 ✓ COMPLETE 2026-06-02.
Plan: 2 plans (Wave 1 → Wave 2 serial). NOT YET EXECUTED. Next: `/gsd-execute-phase 12`. Phase 13 (AUDIO-01) independent — may run any time.
Status: `/gsd-plan-phase 12` driven INLINE on main (gsd-sdk query unavailable; worktree-rooted agents → false negatives + wrong-dir writes). User chose plan-directly-from-spec (no discuss-phase), skip research, no UI-SPEC (reuse existing long-press chrome). **Cross-sport host discovery (the pivotal design fact):** AFL (`LiveGame.tsx`) + rugby league (`LeagueLiveGame.tsx`) both use the SHARED `LockModal`; netball (`NetballLiveGame.tsx`) uses a FORKED `NetballPlayerActions`. So F3's reuse boundary is the **summary content** — a shared pure `buildPlayerInsight` builder (`src/lib/player-insight.ts`) + a shared `PlayerInsightSummary` component (`src/components/live/PlayerInsightSummary.tsx`) — embedded in each sport's EXISTING host via an optional `insight?: React.ReactNode` slot (added to LockModal in 12-01, mirrored onto NetballPlayerActions in 12-02). NO new modal. **The one MISSING datum** = per-period × per-zone minutes (replays only store the ENDING zone via `pastQuarterZones`) → derive additively as `playedZoneMsByPeriod` at each engine's EXISTING per-zone credit site (AFL `addPlayed` in `fairness.ts`, then `replayNetballGame` per-third + `replayLeagueGame` per-field), red-first cross-checked to sum to the existing per-zone outputs. Time-since-last-sub reuses Phase-10 `lastSubbedOnMs` (`msSinceLastSub = max(0, nowAbsMs - lastSubbedOnMs)`, null when never subbed). Season = PERCENTAGES ONLY (no raw season ms field). Zones enumerated from `getAgeGroupConfig(sport, ageGroup).zones` ∩ `SportConfig.zones` ZoneDef[], in config order — never hardcoded ALL_ZONES. RL config zones = single `["field"]` → RL per-zone view honestly degenerates to total field time + 100% season field (forwards/backs are vests, out of scope). NO migration / GameEventType / store slice / server action — read-only over already-loaded replay state + the already-fetched team-scoped `season` prop. **12-01 (Wave 1, depends_on []):** shared core + AFL reference + AFL e2e. **12-02 (Wave 2, depends_on [01]):** netball + rugby-league mirror + e2e; both touch the shared `LockModal`/`PlayerInsightSummary` seam → serial. Plans self-verified inline (gsd-plan-checker role): PLAYERVIEW-01 (in-game per-zone + last-sub + per-period) and PLAYERVIEW-02 (season % only) both covered; must_haves goal-derived; no fork (shared builder/component + slot reuse); sport-agnostic (config zones, no hardcoded "quarter"); two-wave serial dependency sound.
Last activity: 2026-06-02 — Phase 12 planned: 12-CONTEXT.md (D-01..D-08) + 12-01-PLAN.md + 12-02-PLAN.md written and self-verified; ROADMAP + STATE updated.

Progress: [███████░░░] 67% (4/6 v1.1 phases complete; Phase 11 ✓ done; Phase 12 PLANNED — Phases 12 + 13 remain to execute)

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
Stopped at: Phase 12 PLANNED (PLAYERVIEW-01/02 / F3 long-press player insight). `/gsd-plan-phase 12` driven INLINE on main (gsd-sdk query unavailable; worktree-rooted agents → false negatives + wrong-dir writes). User chose plan-directly-from-spec (no discuss-phase), skip research, no UI-SPEC (reuse existing long-press chrome). Wrote + self-verified 3 docs: 12-CONTEXT.md (folded decisions D-01..D-08), 12-01-PLAN.md (Wave 1, depends_on []), 12-02-PLAN.md (Wave 2, depends_on [01]). NOT YET EXECUTED. NEXT: `/gsd-execute-phase 12`. Phase 13 (AUDIO-01) independent. v1.0 Phase 6 still paused on user creds.
- **12-CONTEXT.md:** decisions D-01..D-08 folded. D-01 reuse the existing long-press host + add an optional `insight?: React.ReactNode` slot (LockModal for AFL+RL, NetballPlayerActions for netball) — NO new modal; D-02 one shared pure `buildPlayerInsight` (`src/lib/player-insight.ts`, no Supabase/React) + one shared `PlayerInsightSummary` (`src/components/live/PlayerInsightSummary.tsx`), consumed verbatim by all 3 sports; D-03 zones from `getAgeGroupConfig(...).zones` ∩ `SportConfig.zones` ZoneDef[], in config order, never hardcoded ALL_ZONES; D-04 season PERCENTAGES ONLY (no raw season ms field; all-zero when no season data); D-05 per-period × per-zone derived from the event replay via an additive `playedZoneMsByPeriod` accumulator at each engine's existing per-zone credit site, current period overlaid live in the component (same stint-overlay pattern as `zoneMsByPlayer`); D-06 time-since-last-sub reuses Phase-10 `lastSubbedOnMs` (`max(0, nowAbsMs - lastSubbedOnMs)`, null when never subbed); D-07 two waves serial (12-01 core+AFL; 12-02 netball+league mirror, depends_on [01], both touch the shared LockModal/PlayerInsightSummary seam); D-08 NO migration / GameEventType / store slice / server action — read-only over loaded replay state + the already-fetched team-scoped `season` prop.
- **12-01 (Wave 1, ROTPLAN n/a — PLAYERVIEW-01/02 / F3 shared core + AFL reference):** files_modified = `src/lib/player-insight.ts` + `src/lib/__tests__/playerInsight.test.ts` + `src/lib/fairness.ts` + `src/lib/__tests__/playedZoneMsByPeriod.test.ts` + `src/components/live/PlayerInsightSummary.tsx` + `src/components/live/LockModal.tsx` + `src/components/live/LiveGame.tsx` + `e2e/tests/player-insight.spec.ts`. 3 tasks: (1) RED `playerInsight.test.ts` (season %-only/no-ms, zones-from-config 3-zone+5-zone, msSinceLastSub incl. null+clamp, per-period rows, purity) + `playedZoneMsByPeriod.test.ts` (AFL replay per-period×per-zone, cross-check sum to `basePlayedZoneMs`); (2) GREEN implement `buildPlayerInsight` (pure) + AFL `GameState.playedZoneMsByPeriod` accumulated in `addPlayed` (existing outputs unchanged) + `PlayerInsightSummary` (testids `player-insight-ingame`/`-periods`/`-season`) + optional `insight?` on `LockModalProps`; (3) GREEN wire AFL LiveGame (config zones, `zoneMsByPlayer` in-game, perPeriod from replay + current overlay `displayNowMs - stintStartMs[pid]`, season→pct, `nowAbsMs = completedQuarterMs + displayNowMs*clockMultiplier`) into the EXISTING LockModal via `insight={<PlayerInsightSummary .../>}` + AFL e2e + 4 DoD gates. Builder interface in `<interfaces>`: input {zones ZoneDef[], inGameZoneMs, perPeriod[], seasonZoneMs, lastSubbedOnMs, nowAbsMs} → output {inGameZones[], inGameTotalMs, perPeriod[], msSinceLastSub, seasonZonePct[] with pct ONLY}. Threat model T-12-01-A..D (info-disclosure accept, integrity mitigate, elevation accept read-only, DoS mitigate).
- **12-02 (Wave 2, depends_on [01], netball + rugby-league mirror):** files_modified = `src/lib/sports/netball/fairness.ts` + `src/lib/sports/rugby_league/fairness.ts` + `playedZoneMsByPeriod.netball.test.ts` + `playedZoneMsByPeriod.league.test.ts` + `src/components/netball/NetballPlayerActions.tsx` + `src/components/netball/NetballLiveGame.tsx` + `src/components/league/LeagueLiveGame.tsx` + `e2e/tests/player-insight.spec.ts`. 3 tasks: (1) RED netball per-third + league per-field per-period replay specs (cross-check to `playerThirdMs` / `playerMsOnField`; league period count from `ageGroup.periodCount`, no literal); (2) GREEN extend `replayNetballGame`/`replayLeagueGame` with `playedZoneMsByPeriod` keyed by config zone id + add `insight?` slot to NetballPlayerActions + wire NetballLiveGame (config thirds, `playerThirdMs` in-game, season via `seasonPositionCounts`→thirds %) and LeagueLiveGame (single "field" config zone, `playerMsOnField`, existing LockModal slot) both reusing the SHARED `buildPlayerInsight`/`PlayerInsightSummary` verbatim; (3) GREEN netball + league e2e cases + 4 DoD gates. DEV note: RL single-"field" zone degeneracy is honest/in-config (forwards/backs are vests, re-modelling out of scope); meaningful RL signals = time-since-last-sub + per-period field minutes. Threat model T-12-02-A..D (incl. T-12-02-D cross-sport drift mitigated by reusing the shared core).
Both plans red-first (unit + e2e per task); threat models = no new auth/network/migration (read-only derivation + presentational reuse).
- **Phase 11 (prior, ✓ COMPLETE 2026-06-02):** ROTPLAN-01/F1 + ROTPLAN-02/F2 — F1+F2 share ONE projector-seeded surface = the extended `GamePlanModal` (no fork); `projectUpcomingRotation`/`resolveHonouredSwaps`/`diffPlanToSwaps` (`src/lib/game-plan/live.ts`) + `plannedRotation` store slice (partialize, gameId-keyed, NO migration/event) + pure `seedNextPeriodLineup` + each sport's break pre-seeded. 7 commits (11-01: ba5bcf1→0b8d9a1→050aeea→22eb1d9; 11-02: 26f42c5→f72973c→a138270). 11-01/11-02-SUMMARY.md + 11-VERIFICATION.md (PASS) written. Phase 10's `lastSubbedOnMs` recency signal (on all 3 replays) is what Phase 12's F3 last-sub derivation reuses.
**TOOLING NOTE (unchanged):** Glob/Grep/Read-without-abs-path default to a STALE/orphaned git worktree (`.claude/worktrees/exciting-hopper-7e19a5`, not in `git worktree list`); real work + commits live in the main checkout (`C:\Users\steve\OneDrive\Documents\Auskick manager`). Use Bash (cd into main checkout) or absolute paths for all file inspection; drive sub-agent-style steps INLINE.
Next: `/gsd-execute-phase 12` (PLAYERVIEW-01/02 / F3 — execute the 2 planned waves: 12-01 shared core + AFL, then 12-02 netball + league mirror). Phase 13 (AUDIO-01) is independent and may run any time. v1.0 Phase 6 still paused on user creds.
Resume file: none — Phase 12 plans are written + self-verified; start execution with `/gsd-execute-phase 12`.
