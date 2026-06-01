---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Match Day Changes
status: in_progress
stopped_at: Phase 9 context gathered (2026-06-01) — /gsd-discuss-phase 9 complete. All 4 gray areas resolved: (B1) "the picker" = the in-app Availability screen, NOT LineupPicker — no new control added there; the write persists fine, the bug is the stale lineup-draft seeding an unavailable player onto the field at startGame with no reconciliation against game_availability; fix = AUTO-REMOVE at kickoff via a server-side lineup∩availableIds filter in startGame (single chokepoint for all 3 sports) + a client-side picker-hydration filter for visible removal. (B2) one "Manage availability" entry on each break surface reusing AvailabilityList (add-arrived via addLateArrival, mark-out, mark-injured); mark-out mirrors the injury flow (reuse InjuryReplacementModal, forced replacement); ships to all 3 break surfaces (AFL QuarterBreak reference, netball, league). 09-CONTEXT.md + 09-DISCUSSION-LOG.md written. Next: /gsd-ui-phase 9 (UI hint: yes — UI safety gate requires the design contract for this frontend phase) then /gsd-plan-phase 9.
last_updated: "2026-06-01T00:00:00Z"
last_activity: 2026-06-01
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across AFL, netball, and rugby league — coaches end every match confident every kid got their fair share.
**Current focus:** Milestone v1.1 — Match Day Changes (4 bugs + 4 features, all sport-agnostic). Spec: `.planning/MATCH-DAY-CHANGES-SPEC.md`.

## Current Position

Phase: Phase 9 — Availability that holds (pre-game & at breaks) — context gathered, ready for UI/planning
Plan: not yet planned. /gsd-discuss-phase 9 complete → 09-CONTEXT.md written (10 decisions D-01..D-10). Phase 8 closed (4/4 plans on main).
Status: Phase 9 context locked. B1 = stale-lineup-draft bug, fix is server-side lineup∩availableIds filter in startGame (auto-remove) + client picker filter. B2 = single "Manage availability" entry reusing AvailabilityList + InjuryReplacementModal across all 3 sports. Next: /gsd-ui-phase 9 (UI hint yes) then /gsd-plan-phase 9.
Last activity: 2026-06-01 — Phase 9 discuss-phase complete (B1 root cause + auto-remove fix contract; B2 reuse AvailabilityList/addLateArrival/InjuryReplacementModal at breaks, all sports)

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
Stopped at: Phase 9 CONTEXT GATHERED — `/gsd-discuss-phase 9` complete (manual drive; gsd-sdk query unavailable). All 4 selected gray areas resolved across 9 AskUserQuestion turns and written to `09-CONTEXT.md` (D-01..D-10) + `09-DISCUSSION-LOG.md`. **B1 (AVAIL-01):** "the picker" = the in-app Availability screen (`availability/page.tsx` → AvailabilityList → AvailabilityRow → setAvailability) — recon discrepancy RESOLVED, NO new control on LineupPicker. Save path is fine (edit survives reload); bug is the stale `game_lineup_drafts` row seeding the picker → `startGame` (`live/actions.ts:131`) commits the client lineup as `lineup_set` with ZERO reconciliation vs `game_availability`. Fix contract = AUTO-REMOVE at kickoff: server-side `lineup ∩ availableIds` filter inside startGame (single chokepoint for all 3 sports, reuse the `availableIds` union from `live/page.tsx:211-221`) + client-side picker-hydration filter for visible removal. Red-first regression: set unavailable → start → assert not in lineup_set / not on field, all sports. **B2 (AVAIL-02):** single "Manage availability" entry on each break surface opening the SAME pre-game AvailabilityList (reuse) — add-arrived via `addLateArrival` (`:595`, canonical writer, do not fork), mark-out, mark-injured. Mark-out mirrors injury (reuse `InjuryReplacementModal`, forced replacement; differs only in recorded reason). Ships to all 3 break surfaces: AFL `QuarterBreak.tsx` (reference), `NetballQuarterBreak.tsx`, league break path. Next: `/gsd-ui-phase 9` (ROADMAP UI hint: yes — UI safety gate requires the design contract for this frontend phase) → `/gsd-plan-phase 9`.
Resume file: .planning/phases/09-availability-that-holds-pre-game-and-at-breaks/09-CONTEXT.md
