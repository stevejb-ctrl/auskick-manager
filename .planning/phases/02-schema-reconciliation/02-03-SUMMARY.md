---
phase: 02-schema-reconciliation
plan: "03"
subsystem: e2e-tests
tags:
  - playwright
  - schema-migration
  - multi-sport
  - SCHEMA-03
  - SCHEMA-04
dependency_graph:
  requires:
    - "02-01-PLAN.md (02-SCHEMA-PLAN.md §§1-4 written)"
    - "02-02-PLAN.md (factories.ts sport param + package.json e2e script)"
  provides:
    - "e2e/tests/multi-sport-schema.spec.ts — SCHEMA-03 Playwright spec (three test cases)"
    - "02-SCHEMA-PLAN.md §§5-6 — spec design notes + Phase 6 prod-clone acceptance criteria"
  affects:
    - "Phase 3 verification (spec flips green post-merge)"
    - "Phase 6 validation (§6 acceptance criteria consumed)"
tech_stack:
  added: []
  patterns:
    - "expect.poll DB-write round-trip assertion (settings.spec.ts:39-51 verbatim)"
    - "Clean-context wizard test with admin-API user provisioning (onboarding.spec.ts pattern)"
    - "Section-scoped locator (page.locator('section').filter({ hasText: ... }))"
key_files:
  created:
    - e2e/tests/multi-sport-schema.spec.ts
  modified:
    - .planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md
decisions:
  - "D-12 applied: spec committed on this branch but expected red — Phase 3 verification flips green"
  - "D-14 applied: exactly three test cases (AFL wizard, netball wizard, settings round-trip)"
  - "D-15 applied: no games.quarter_length_seconds tests, no track_scoring=false live-screen tests"
  - "D-17 applied: Phase 6 prod-clone runtime verification captured in §6 (five acceptance criteria)"
  - "L9 encoded: netball pill clicked BEFORE team name fill (brand defaults AFL on localhost)"
  - "L7 encoded: makeTeam passes sport='netball' so QuarterLengthInput renders"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-29"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 2 Plan 03: SCHEMA-03 Playwright Spec + SCHEMA-PLAN §§5-6 Summary

**One-liner:** SCHEMA-03 Playwright spec with three test cases (AFL wizard `sport='afl'`, netball wizard `sport='netball'`, team-settings `quarter_length_seconds` round-trip) committed as expected-red per D-12, plus `02-SCHEMA-PLAN.md` §§5-6 finalized with spec design notes and five Phase 6 prod-clone acceptance criteria.

## Tasks Completed

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | Author e2e/tests/multi-sport-schema.spec.ts | `f995ce9` | `e2e/tests/multi-sport-schema.spec.ts` (created, 246 lines) |
| 2 | Finalize 02-SCHEMA-PLAN.md §§5-6 | `ce1b59f` | `.planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md` (§§5-6 stub → substantive) |

## What Was Built

### Task 1 — SCHEMA-03 Playwright spec

Created `e2e/tests/multi-sport-schema.spec.ts` with **exactly three test cases** as locked by D-13 / D-14:

1. **`"AFL setup wizard creates team with sport='afl' and default track_scoring"`**
   - Clean-context + admin-API user provisioning (onboarding.spec.ts pattern)
   - Navigates to `/teams/new`, relies on AFL as the brand default on localhost (L9 — no sport pill click needed for AFL)
   - Fills team name + age group `"U10"`, clicks Continue
   - `waitForURL` with 10s timeout (L5 — RLS race protection)
   - `expect.poll` asserts `{ sport: "afl", track_scoring: false }` (L4 — wizard does not auto-flip)
   - Navigates to `/teams/[id]/settings` and asserts `<QuarterLengthInput>` is NOT visible (L7 negative-presence)
   - `try/finally deleteTestUser` cleanup

2. **`"netball setup wizard creates team with sport='netball' and netball-default track_scoring"`**
   - Same clean-context pattern
   - Clicks `page.getByRole("button", { name: "Netball" })` **BEFORE** filling team name (L9 — brand defaults AFL on localhost, must be explicit)
   - Age group `"go"` (netball default per TeamBasicsForm.tsx:33-34)
   - `expect.poll` asserts `{ sport: "netball", track_scoring: false }` (L4)
   - `try/finally deleteTestUser` cleanup

3. **`"team settings round-trips quarter_length_seconds for a netball team"`**
   - Inherits super-admin storageState (no clean-context)
   - `makeTeam(admin, { ownerId, ageGroup: "go", sport: "netball", name: ... })` — MUST pass `sport: "netball"` for QuarterLengthInput to render (L7)
   - Section-scoped locator: `page.locator("section").filter({ hasText: /quarter length/i })`
   - Clears input, fills `"8"` (8 minutes = 480 seconds), clicks Save
   - `expect.poll` asserts `quarter_length_seconds === 480` in DB
   - Reloads and asserts UI shows `"8"`
   - `try/finally admin.from("teams").delete()` cleanup

### Task 2 — 02-SCHEMA-PLAN.md §§5-6

Replaced both stubs:
- **§5** documents the three test cases, locator references (verified against multi-sport components), landmines L4-L9, and the explicit "expected red on this branch" note (D-12).
- **§6** adds all five Phase 6 prod-clone acceptance criteria from CONTEXT.md `<specifics>`: apply migration set; load AFL team without errors; `count(*) where sport is null = 0`; `distinct sport = 'afl'`; AFL share token resolves via `/run/[token]`.

The audit deliverable is now complete — all six §-numbered sections are substantive.

## Spec Is Committed but Expected Red on This Branch

**This is expected behavior per D-12.** The spec fails on `claude/vibrant-banzai-a73b2f` for three reasons:
1. `<SportPill name="Netball">` in `TeamBasicsForm` doesn't exist on this branch.
2. `<QuarterLengthInput>` doesn't exist on this branch.
3. `teams.sport` and `teams.quarter_length_seconds` columns don't exist in this branch's local Supabase (migrations `0024_multi_sport.sql` / `0026` / `0027` are multi-sport-only).

**Phase 3's verification flips this spec green** — once the merge lands the migrations and the netball UI components, all three test cases run as intended.

**Phase 2 acceptance for SCHEMA-03 is met:** spec file exists with the three named test cases; `npx tsc --noEmit` exits 0; structure matches the `onboarding.spec.ts` + `settings.spec.ts` analog patterns.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the spec's locators are string-based and do not depend on component imports. The factory call passes `sport: "netball"` through the DB default path. No hardcoded empty values or placeholder text in the test bodies.

## Read-Only Invariant Verification

```
git status --porcelain -- supabase/migrations/ src/ scripts/ package.json e2e/fixtures/factories.ts
(empty)
```

No writes outside the two allowed files (`e2e/tests/multi-sport-schema.spec.ts`, `02-SCHEMA-PLAN.md`).

## Acceptance Criteria Checklist

- [x] `e2e/tests/multi-sport-schema.spec.ts` exists with EXACTLY three `test(...)` blocks
- [x] Spec uses the wizard pattern from `onboarding.spec.ts` (clean storageState + admin-API user provisioning + try/finally cleanup)
- [x] Spec uses the `expect.poll` round-trip pattern from `settings.spec.ts:39-51` for team-settings DB assertion
- [x] Netball wizard test clicks the netball pill BEFORE filling team name
- [x] Team-settings test creates a netball team via `makeTeam(admin, { ownerId, ageGroup: 'go', sport: 'netball' })`
- [x] Spec does NOT test `games.quarter_length_seconds` (`grep -c` returns 0)
- [x] Spec does NOT test live-screen `track_scoring=false` suppression
- [x] `npx tsc --noEmit` exits 0
- [x] `02-SCHEMA-PLAN.md` §5 documents the spec's three test cases with expected-red note (D-12)
- [x] `02-SCHEMA-PLAN.md` §6 contains all five Phase 6 prod-clone acceptance criteria
- [x] `02-SCHEMA-PLAN.md` §§1-4 unchanged
- [x] `git status -- supabase/migrations/ src/ scripts/ package.json e2e/fixtures/factories.ts` is CLEAN

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. Spec uses existing service-role admin client (bounded to e2e/fixtures/ scope).

## Self-Check

Files created/modified:
- `e2e/tests/multi-sport-schema.spec.ts` — created at Task 1 commit `f995ce9`
- `.planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md` — updated at Task 2 commit `ce1b59f`

Commits:
- `f995ce9` — `feat(02-03): add SCHEMA-03 Playwright spec (multi-sport-schema)`
- `ce1b59f` — `docs(02-03): finalize 02-SCHEMA-PLAN.md §§5-6 (spec design + Phase 6 handoff)`
