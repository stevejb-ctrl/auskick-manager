---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
stopped_at: Phase 5 Plan 02 complete (2026-04-30) — waitForAdminHydration helper extracted to e2e/helpers/admin-hydration.ts; settings.spec.ts (×1) + roster.spec.ts (×2) refactored to use it; game-edit.spec.ts comment cross-reference updated (DB-poll race documented as DIFFERENT from helper); side-finding #3 CLOSED; full e2e gauntlet stable at 52 PASS / 1 SKIP (PROD-04 fixme only — matches Plan 05-01 baseline); tsc/lint/vitest all green; pre-merge tags + Phase 3/4 invariants intact
last_updated: "2026-05-01T01:38:13Z"
last_activity: 2026-04-30
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 23
  completed_plans: 19
  percent: 79
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-29)

**Core value:** Live-game time-on-ground fairness must be effortless and trustworthy across both AFL and netball — coaches end every match confident every kid got their fair share.
**Current focus:** Phase 05 — test-and-type-green

## Current Position

Phase: 05 (test-and-type-green) — IN PROGRESS
Plan: 2 of 5 (05-01 + 05-02 complete; 05-03 pending)
Status: Plan 05-02 complete — `waitForAdminHydration` helper extracted to `e2e/helpers/admin-hydration.ts` (67 lines, file-header rationale + JSDoc + thin wrapper around `expect(...).toBeEnabled(...)`). Three call sites refactored: settings.spec.ts (track-scoring toggle), roster.spec.ts (deactivate + reactivate switches). game-edit.spec.ts is a comment-only update — its DB-poll cascade-delete wait is a DIFFERENT race (not a helper candidate); cross-reference updated to make the divergence explicit. Side-finding #3 (CONTEXT D-CONTEXT-side-finding-3) CLOSED. Pure mechanical refactor; zero deviations triggered. Full e2e gauntlet stable at 52 PASS / 1 SKIP — matches Plan 05-01 baseline exactly. tsc/lint/vitest all green; pre-merge tags + PROD-04 fixme + Phase 3/4 invariants all intact.
Resume file: .planning/phases/05-test-and-type-green/05-03-PLAN.md (next: stale-dev-server detection in scripts/e2e-setup.mjs)
Last activity: 2026-04-30

Progress: [████████░░] 79%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: see per-phase table

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02-schema-reconciliation | 3 | 27 min | 9 min |
| 03-branch-merge-abstraction-integrity | 6 | (per-plan SUMMARY) | varied |
| 04-netball-verification-on-merged-trunk | 7 | (per-plan SUMMARY) | varied |
| 05-test-and-type-green | 2 of 5 | 64 min (Plan 05-01: 50 min, Plan 05-02: 14 min) | 32 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Milestone init: Multi-sport becomes new trunk; pull main's 60 commits in via merge/rebase (not cherry-pick)
- Milestone init: Backfill `teams.sport = 'afl'` in migration — prod has only ever been AFL
- Milestone init: Stage on Vercel preview + Supabase clone before fast-forwarding main
- Milestone init: Same Vercel + Supabase project; no fresh deploy; same repo target
- 03-06: Phase 4 strategy — keep both branches; PR merge/multi-sport-trunk into main at Phase 7 (do NOT fast-forward multi-sport to this trunk in Phase 4). Phase 4's job is netball verification, not branch hygiene.
- 03-06: ABSTRACT-01 4 matches outside `src/lib/sports/` classified as legitimate UI-presentation toggles (showJersey, sport-pill active state, AFL-vs-netball placeholder copy) — none dispatch business logic.
- 03-06: QUARTER_MS still appears outside the three D-26 redirect targets in GameHeader.tsx (banner display), fairness.ts (season-bonus local constant), and applyInjurySwap.test.ts (Vitest contract) — out of scope for Phase 3; future-proof flag for Phase 5+ if netball banner display surfaces a non-12-minute oddity.
- 05-01: Option A pure-SQL extension of `supabase/seed.sql` chosen over Option B standalone script — auth.users direct INSERT works at this Supabase CLI version (v2.90.0); pgcrypto bcrypt at cost 10 produces hashes GoTrue verifies cleanly.
- 05-01: Pre-seed the test-super-admin in seed.sql with a deterministic UUID + bcrypt hash. Required because the Kotara-optional spec navigates to a team-RLS-gated route as the super-admin, but is_super_admin doesn't bypass team RLS in the current schema. Pre-seeding lets us add a team_memberships row in seed-time. Converges with auth.setup.ts via ensureTestUser's idempotent listUsers-by-email flow.
- 05-01: Populate ALL token columns on auth.users with empty strings, not NULL — GoTrue's admin.listUsers() concatenates internally and surfaces NULL-bearing rows as `Database error finding users`. 22-column INSERT is the documented safe shape.
- 05-02: Signature A (Locator-first) chosen for `waitForAdminHydration(switchLocator: Locator, opts?: { timeout?: number })` over Signature B (page + matcher). Caller composes the role/name lookup; helper stays a thin wrapper around `expect(...).toBeEnabled(...)`. More flexible (callers can scope to a card or use `.first()`) and matches existing call shape with zero refactor friction.
- 05-02: Helper is intentionally a thin one-line wrapper, NOT a re-implementation. Playwright's `toBeEnabled` IS the Web-First-assertion primitive; wrapping it in extra logic (settle delay, retry loop) would break the bit-for-bit-identical-behaviour invariant. Behaviour at all three call sites is exactly what they had inline before; only the source of the call moved.
- 05-02: game-edit.spec.ts uses a DB-poll for cascade-delete completion — fundamentally different race from toBeEnabled-on-switch. NOT a candidate for the helper. Updated its comment to make the divergence explicit (cross-link to helper for navigability, but call out that here we wait for a row count, not a hydrated control). Plan explicitly authorised this branch and the executor confirmed it didn't fit the helper interface.
- 05-02: Verbose race-rationale comments at all three call sites shrunk to one-liner cross-references. Three near-duplicates of the same 6-line comment is a smell; one canonical block in helpers/admin-hydration.ts is the DRY answer. Breadcrumbs at each call site keep the spot-the-non-obvious-wait signal without re-deriving the rationale in three places.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 6 prerequisite: Supabase prod clone must be provisioned before Phase 6 can begin — user action required
- Phase 6: Vercel preview deploy auth/credentials may be needed at execute time

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-04-30
Stopped at: Completed 05-02-PLAN.md (admin-hydration helper extraction; side-finding #3 closed). Full e2e gauntlet stable at 52 PASS / 1 SKIP — matches Plan 05-01 baseline exactly. tsc/lint/vitest green. Next: 05-03 stale-dev-server detection in scripts/e2e-setup.mjs.
Resume file: .planning/phases/05-test-and-type-green/05-03-PLAN.md
