---
phase: 05-test-and-type-green
plan: 02
subsystem: e2e-helpers
tags: [side-finding-3, admin-hydration-helper, refactor, dry-pattern, web-first-assertion]

# Dependency graph
requires:
  - phase: 04-01
    provides: "e2e/helpers/ directory + seed-audit.ts pattern (file-header rationale block + JSDoc per-export)"
  - phase: 05-01
    provides: "Stable 52 PASS / 1 SKIP gauntlet baseline (super-admin Kotara membership pre-seeded; auth.setup.ts unblocked)"
provides:
  - "e2e/helpers/admin-hydration.ts — single source of truth for the Toggle `disabled={isPending || !isAdmin}` race rationale, exporting waitForAdminHydration(switchLocator, opts?)"
  - "Three call-site refactors: settings.spec.ts (×1) + roster.spec.ts (×2) now import + use the helper instead of inlining the 5s toBeEnabled-on-switch wait"
  - "game-edit.spec.ts comment cross-reference updated to point at the helper while clarifying that its DB-poll guard is a DIFFERENT race (not a candidate for the helper)"
  - "Side-finding #3 (CONTEXT D-CONTEXT-side-finding-3) CLOSED"
affects: [05-05]

# Tech tracking
tech-stack:
  added: []  # No new libraries; helper imports `expect` and `Locator` from @playwright/test (already in use)
  patterns:
    - "Helper-extraction pattern for repeated Web-First-assertion race guards: rationale lives once in the helper file's JSDoc + file header; call sites shrink to a one-liner cross-reference + the helper invocation. Mirrors e2e/helpers/seed-audit.ts (Plan 04-01) for file-header style."
    - "Signature-A (Locator-first) helper signature picked over Signature-B (page + matcher). Caller composes `getByRole('switch', { name: ... })` and passes the resulting Locator to the helper, keeping matcher control at the call site without forcing the helper to reproduce role/name lookup logic."
    - "Comment-only divergence pattern for non-fitting cross-references: game-edit.spec.ts uses a structurally similar but functionally different race (DB-poll for cascade-delete vs. toBeEnabled-on-switch). Updated its comment to point at the helper for context while making the divergence explicit, rather than forcing a fit."

key-files:
  created:
    - "e2e/helpers/admin-hydration.ts                                              # NEW — 67 lines (file-header rationale + JSDoc + thin wrapper)"
    - ".planning/phases/05-test-and-type-green/05-02-SUMMARY.md                    # this file"
  modified:
    - "e2e/tests/settings.spec.ts                                                  # +1 import, race-rationale comment shrunk 6→2 lines, inline toBeEnabled→waitForAdminHydration"
    - "e2e/tests/roster.spec.ts                                                    # +1 import, two race-rationale comments shrunk 7→2 lines each, two inline toBeEnabled→waitForAdminHydration"
    - "e2e/tests/game-edit.spec.ts                                                 # comment-only update — stale 'Same DB-poll shape as ...' line replaced with explicit cross-reference + divergence note"
  deleted: []

key-decisions:
  - "Picked Signature A (Locator-first) for waitForAdminHydration — matches existing call shape (`const toggle = getByRole('switch', ...); await waitForAdminHydration(toggle); await toggle.click()`) without forcing the helper to reproduce role/name lookup. Plan recommended this; executor confirmed no concrete reason to deviate."
  - "Helper is intentionally a thin wrapper around `expect(...).toBeEnabled(...)`, NOT a re-implementation. The behaviour (5s default timeout, override-able) matches all three call sites' previous inline pattern bit-for-bit. This is a hygiene refactor, not a behaviour change."
  - "game-edit.spec.ts is a comment-only update — its DB-poll wait is a structurally different race from the toBeEnabled-on-switch helper. Forcing a fit would have been wrong; the planner explicitly authorised this branch and the executor's read of the file confirmed the divergence."
  - "Shrank the verbose race-rationale comment blocks at all three sites to one-liner cross-references. Future contributors see the breadcrumb (`see e2e/helpers/admin-hydration.ts`) and can hover/peek the import to get the full rationale — a single source of truth, not three near-duplicates."

patterns-established:
  - "Pattern: helpers/ directory is the canonical home for repeated test-infrastructure rationale blocks. Plan 04-01 established this with seed-audit.ts; Plan 05-02 extends it with admin-hydration.ts. Future spec authors hitting a non-obvious cross-spec pattern (race guard, fixture-setup quirk, etc.) should default to extracting into helpers/ rather than copy-pasting the comment block."
  - "Pattern: when extracting a Web-First-assertion guard, keep the helper a THIN wrapper. Do not bake additional behaviour (e.g. brief settle delay, retry loops) unless empirically needed. The original CONTEXT draft of the helper signature included `+ a brief settle delay`; the executor and planner both correctly omitted that — Playwright's toBeEnabled IS the settle-delay primitive, no nested wrapping needed."
  - "Pattern: comment-only updates cross-referencing a new helper count as part of the helper-extraction blast radius even when the body doesn't change. Stale 'same shape as ...' references are future-contributor traps; updating them is part of the extraction's scope."

requirements-completed: [TEST-02]   # e2e green — this prevents future hydration-race flakes; the gauntlet remains at 52/1.

# Metrics
duration: ~14min (mechanical refactor — no detours, no deviations needed; planner's draft was lift-and-shift ready)
completed: 2026-04-30
---

# Phase 5 Plan 02: Admin-hydration helper extraction (side-finding #3 closure) Summary

**Side-finding #3 closed. The `waitForAdminHydration` helper now lives at `e2e/helpers/admin-hydration.ts`, three call sites (settings ×1, roster ×2) refactored to import + use it, and game-edit.spec.ts's stale cross-reference comment updated. Behaviour identical pre- and post-refactor — the focused gauntlet (settings + roster + game-edit) is 4/4 PASS, the broader sanity gauntlet (+ netball-live-flow + live-quarters + live-scoring) is 18/18 PASS, and the full e2e suite holds at 52 PASS / 1 SKIP exactly matching Plan 05-01's baseline. tsc + lint + 169/169 vitest all green. Pure mechanical extraction; zero source/migration/fixture/script drift.**

## Performance

- **Duration:** ~14min (mechanical refactor — no detours, no Rule-1/2/3 auto-fixes triggered, planner's draft was lift-and-shift ready)
- **Started:** 2026-04-30 (UTC 2026-05-01T01:23:57Z)
- **Completed:** 2026-04-30 (UTC 2026-05-01T01:38:13Z)
- **Tasks:** 4 substantive (Task 1 helper authoring + Tasks 2/3/4 spec refactors) — all `type="auto"`, no checkpoints
- **Files modified:** exactly 4 (1 created, 3 modified) — matches plan's `files_modified` declaration

## Accomplishments

- **Helper landed.** `e2e/helpers/admin-hydration.ts` exists, exports `waitForAdminHydration(switchLocator: Locator, opts?: { timeout?: number }): Promise<void>`, embeds the canonical race-rationale block from settings.spec.ts in both the file header and the JSDoc, and cross-references `D-CONTEXT-side-finding-3` so future maintainers can find the original decision boundary.
- **Three call sites refactored to use the helper.**
  - `settings.spec.ts:79` — track-scoring toggle: inline `expect(toggle).toBeEnabled({ timeout: 5_000 })` → `waitForAdminHydration(toggle)`. Verbose 6-line race-rationale comment shrunk to a 2-line one-liner cross-reference.
  - `roster.spec.ts:56-58` — deactivate switch: same shape. Verbose 7-line comment shrunk to 2 lines.
  - `roster.spec.ts:84-86` — reactivate switch: same shape. Verbose 5-line comment shrunk to 2 lines.
- **game-edit.spec.ts comment updated.** The stale "Same DB-poll shape as roster.spec.ts and settings.spec.ts" line (which would have been a future-contributor trap once the other two specs migrated to the helper) is replaced with an explicit divergence note: this DB-poll waits for a cascade-delete row count, NOT a hydrated control — different race, not a candidate for the helper. Cross-reference to the helper file kept for context.
- **Behaviour identical, code DRYer.** The 5_000 ms default timeout and the underlying `expect(...).toBeEnabled(...)` primitive are unchanged at the call sites — the helper is a thin wrapper. The three specs run with the same wall-clock + same race-guard semantics as before the refactor.
- **Quality bar preserved at 100%.**
  - `npx tsc --noEmit` → exit 0 (no output)
  - `npm run lint` → 0 errors, 3 pre-existing warnings (LiveGame.tsx:810, FeatureSection.tsx:77, NetballLiveGame.tsx:489) — exact same set as Plan 05-01's baseline.
  - `npm test --run` (Vitest) → 169/169 PASS (9 files, 1.96s)
  - Full e2e gauntlet (`npm run e2e -- --workers=1 --reporter=line`) → **52 PASS / 0 FAIL / 1 SKIP** in 2.4 minutes. Lone SKIP is the PROD-04 fixme in `playhq-import.spec.ts:28` (intentional from Phase 3). Identical to the Plan 05-01 baseline.
- **Phase 3 + Phase 4 invariants intact.**
  - `pre-merge/main` = `e9073dd…` (frozen, unchanged)
  - `pre-merge/multi-sport` = `e13e787c…` (frozen, unchanged)
  - PROD-04 fixme count in `playhq-import.spec.ts` = 1 (unchanged)
  - No `src/` drift, no `scripts/` drift, no `supabase/` drift, no `e2e/fixtures/` drift (verified via `git status --short`)
  - Inline `toBeEnabled({ timeout: 5_000 })` count outside comments in the three specs = 0 (the pattern is gone from the call sites; the rationale lives in the helper)

## Task Commits

Each commit stands alone per CLAUDE.md commit style — small, focused, reviewable in isolation:

1. **Task 1 — `d98ef69` `feat(05-02): add waitForAdminHydration helper for admin-gated switch race`**
   New file `e2e/helpers/admin-hydration.ts` (67 lines). File header explains the post-merge race (Toggle's `disabled={isPending || !isAdmin}`, async membership query on mount, parallel-worker click-before-hydration race). JSDoc on the export documents the parameters + provides the canonical example call pattern. Helper is a one-line wrapper around `expect(switchLocator).toBeEnabled({ timeout: opts?.timeout ?? 5_000 })`. Cross-references `D-CONTEXT-side-finding-3` and notes that game-edit's DB-poll variant is a different race not covered by the helper.

2. **Task 2 — `3bbbcf0` `refactor(05-02): use waitForAdminHydration helper in settings.spec.ts`**
   `+1 import / -8 lines, +4 lines`. Replaces the inline `expect(toggle).toBeEnabled({ timeout: 5_000 })` at the track-scoring toggle site with `waitForAdminHydration(toggle)`. Shrinks the verbose 6-line race-rationale comment to a 2-line cross-reference. settings.spec.ts 2/2 PASS verified post-edit.

3. **Task 3 — `b67af89` `refactor(05-02): use waitForAdminHydration helper in roster.spec.ts (×2 sites)`**
   `+1 import / -12 lines, +7 lines`. Same shape as Task 2 applied to both deactivate + reactivate switch sites. Both verbose 5–7-line comment blocks shrunk to one-liner cross-references. roster.spec.ts 1/1 PASS verified post-edit.

4. **Task 4 — `8a2490f` `docs(05-02): point game-edit.spec.ts comment at the new admin-hydration helper`**
   Comment-only change in game-edit.spec.ts (lines 49-55). Stale "Same DB-poll shape as roster.spec.ts and settings.spec.ts (commit b014ef9 / fa26cd1)" line replaced with: "This is a DIFFERENT race from the admin-membership hydration helper at e2e/helpers/admin-hydration.ts (which guards switch clicks); here we wait for the cascade-delete row count, not for a hydrated control." Behaviour 100% unchanged; game-edit.spec.ts 1/1 PASS in the focused gauntlet.

## Files Created/Modified

### Created
- `e2e/helpers/admin-hydration.ts` (NEW, 67 lines)
- `.planning/phases/05-test-and-type-green/05-02-SUMMARY.md` (this file)

### Modified
- `e2e/tests/settings.spec.ts` — net `+4 / -8` lines:
  - Added `import { waitForAdminHydration } from "../helpers/admin-hydration";` to the import block.
  - Replaced inline `expect(toggle).toBeEnabled({ timeout: 5_000 })` with `await waitForAdminHydration(toggle);`.
  - Shrunk the 6-line "Post-merge: TrackScoringToggle disables itself …" comment to a 2-line cross-reference pointing at the helper.
- `e2e/tests/roster.spec.ts` — net `+7 / -12` lines:
  - Added the same import.
  - Replaced two inline `expect(switch).toBeEnabled({ timeout: 5_000 })` calls (deactivateSwitch + reactivateSwitch) with `await waitForAdminHydration(switch);` calls.
  - Shrunk the two verbose race-rationale comment blocks (one ~7 lines, one ~5 lines) to two-line cross-references.
- `e2e/tests/game-edit.spec.ts` — net `+4 / -2` lines (comment-only):
  - Updated the cascade-delete DB-poll comment block to remove the now-stale "Same DB-poll shape as roster.spec.ts and settings.spec.ts (commit b014ef9 / fa26cd1)" line.
  - Replaced with an explicit divergence note: this is a DIFFERENT race from the admin-hydration helper; cross-link to `e2e/helpers/admin-hydration.ts` for context.

### Deleted
None.

## Decisions Made

1. **Signature A (Locator-first) for `waitForAdminHydration`.** The plan recommended Signature A and the executor confirmed no concrete reason to deviate. Caller composes the Locator (`getByRole('switch', { name: /track scoring/i })`) and passes it to the helper. The alternative (Signature B: `page + matcher`) would have forced the helper to reproduce the `getByRole('switch', ...)` lookup, which would (a) reduce flexibility (callers couldn't scope to a card or use `.first()` without extending the helper) and (b) couple the helper to the specific role/name pattern, locking out future use cases.

2. **Helper is a thin wrapper, not a re-implementation.** The helper body is exactly one line: `await expect(switchLocator).toBeEnabled({ timeout: opts?.timeout ?? 5_000 });`. This is intentional — Playwright's `toBeEnabled` IS the Web-First-assertion primitive, and wrapping it in any additional logic (settle delay, retry loop, log lines) would break the bit-for-bit-identical-behaviour invariant. The behaviour at all three call sites is exactly what they had inline before; only the source of the call moved.

3. **5-second default timeout, override via `opts.timeout`.** Matches all three call sites' previous inline `{ timeout: 5_000 }`. The signature exposes `opts?: { timeout?: number }` so a future contributor on a slow CI runner can dial it up without forking the helper.

4. **game-edit.spec.ts is comment-only — divergence captured in plain English.** game-edit's race is a cascade-delete row-count poll, which is a fundamentally different shape from `toBeEnabled` on a hydrated control. The plan explicitly authorised this branch ("If game-edit's DB-poll variant doesn't fit the helper's interface, document the divergence in a comment block + SUMMARY without forcing a fit"), and the executor's read of the file confirmed it didn't fit. The updated comment cross-references the helper for navigability while making clear why this spec doesn't use it — keeping the helper the single answer to "where does the admin-hydration race live" without misleadingly implying that game-edit is also using the helper.

5. **Verbose race-rationale comments shrunk to one-liners with cross-references.** Future contributors reading the spec see the breadcrumb (`// Wait for admin-membership hydration before clicking — see e2e/helpers/admin-hydration.ts.`) and can hover/peek the import to get the full rationale. Three near-duplicates of the same 6-line comment is a smell; one canonical block in the helper file is the DRY answer. The breadcrumbs at each call site keep the spot-the-non-obvious-wait signal — we don't fully delete the comment, we just shrink it to its irreducible minimum.

## Deviations from Plan

**None.** Plan executed exactly as written. No Rule-1/Rule-2/Rule-3 auto-fixes triggered. The planner's draft of the helper file was lift-and-shift ready — no edits to the file content beyond a single addition (a paragraph noting that game-edit's DB-poll variant is NOT covered, mirroring Task 4's comment-update rationale, so a future contributor reading the helper alone learns the boundary). All four tasks landed in single commits with no follow-up fix-ups required.

## Authentication Gates

None. Refactor stayed entirely within e2e/ space; no auth changes, no service-role changes, no GoTrue interactions touched.

## Issues Encountered

- **Three pre-existing benign log noise items** (still present from Plan 05-01): `[deleteTestUser] non-fatal cleanup error` warnings in multi-sport-schema (×2), onboarding (×1), team-invite (×1) cleanup blocks. Documented in `e2e/fixtures/supabase.ts:97-99` as expected behaviour — those specs leave FK references behind that GoTrue's `admin.deleteUser` can't cascade through. Not new; not caused by this plan.
- **Pre-existing lint warnings unchanged:** 3 warnings (LiveGame.tsx:810, FeatureSection.tsx:77, NetballLiveGame.tsx:489) — all from prior phases. Plan 05-02 added zero new warnings.
- **No flakiness observed.** All gauntlet runs (focused 4-test, broader 18-test, full 52-test) passed first-try with `--workers=1`. The race the helper guards against is precisely the one that would have surfaced as a flake — keeping it guarded is the whole point.

## User Setup Required

None. Pure mechanical refactor; no new dependencies; no new environment variables; no manual configuration steps.

## Next Phase Readiness

**Hand-off to Plan 05-03 (stale-dev-server detection in `scripts/e2e-setup.mjs`):**
- The helpers/ directory pattern is now used twice (seed-audit + admin-hydration) — Plan 05-03's `scripts/e2e-setup.mjs` work doesn't share the helpers/ surface, so there's no coupling. No blockers.
- The full e2e suite remains at 52 PASS / 1 SKIP — Plan 05-03's port-detection guard should preserve that count exactly. If 05-03's changes cause a regression, it would surface against this plan's known-good baseline.

**Hand-off to Plan 05-05 (final gauntlet + 05-EVIDENCE.md):**
- Side-finding #3 status: **CLOSED**. The helper is the canonical answer to "where does the admin-membership hydration race live"; three specs use it, one references it for divergence context. CONTEXT D-CONTEXT-side-finding-3 fully discharged.
- TEST-02 (e2e green) acceptance criterion remains met — gauntlet still 52/1 with the lone SKIP being PROD-04 (intentional fixme from Phase 3).
- Helper-extraction pattern is now established (×2 helpers) — future spec-infra refactors can reach for `e2e/helpers/{thing}.ts` as the default home.
- No source-tree drift, no migration drift, no fixture drift, no script drift — the refactor is fully isolated to e2e/helpers/ + e2e/tests/.

**No blockers carried into Plan 05-03.**

## Self-Check: PASSED

Verification commands run on `merge/multi-sport-trunk` worktree (HEAD = `8a2490f`):

| Check | Command | Result |
|-------|---------|--------|
| Task 1 commit exists | `git log --oneline \| grep d98ef69` | match present |
| Task 2 commit exists | `git log --oneline \| grep 3bbbcf0` | match present |
| Task 3 commit exists | `git log --oneline \| grep b67af89` | match present |
| Task 4 commit exists | `git log --oneline \| grep 8a2490f` | match present |
| Helper file exists | `test -f e2e/helpers/admin-hydration.ts` | found |
| Helper exports waitForAdminHydration | `grep -q "export async function waitForAdminHydration" e2e/helpers/admin-hydration.ts` | found |
| Race rationale present in helper | `grep -q "isPending \|\| !isAdmin" e2e/helpers/admin-hydration.ts` | found |
| settings.spec.ts imports helper | `grep -q "from \"../helpers/admin-hydration\"" e2e/tests/settings.spec.ts` | found |
| roster.spec.ts imports helper | `grep -q "from \"../helpers/admin-hydration\"" e2e/tests/roster.spec.ts` | found |
| settings.spec.ts inline pattern gone | `grep -v '^[[:space:]]*//' e2e/tests/settings.spec.ts \| grep -c "toBeEnabled({ timeout: 5_000 })"` | 0 |
| roster.spec.ts inline pattern gone | `grep -v '^[[:space:]]*//' e2e/tests/roster.spec.ts \| grep -c "toBeEnabled({ timeout: 5_000 })"` | 0 |
| game-edit.spec.ts inline pattern gone | `grep -v '^[[:space:]]*//' e2e/tests/game-edit.spec.ts \| grep -c "toBeEnabled({ timeout: 5_000 })"` | 0 |
| settings.spec.ts uses helper | `grep -c "waitForAdminHydration(toggle)" e2e/tests/settings.spec.ts` | 1 |
| roster.spec.ts uses helper ×2 | `grep -c "waitForAdminHydration(" e2e/tests/roster.spec.ts` | 2 |
| game-edit.spec.ts cross-references helper | `grep -c "admin-hydration" e2e/tests/game-edit.spec.ts` | 1 |
| game-edit.spec.ts stale ref removed | `grep -c "Same DB-poll shape as roster.spec.ts and settings.spec.ts" e2e/tests/game-edit.spec.ts` | 0 |
| Focused 3-spec gauntlet PASS | `npm run e2e -- e2e/tests/{settings,roster,game-edit}.spec.ts --workers=1 --reporter=line` | 5 passed (29.4s) |
| Broader sanity gauntlet PASS | `npm run e2e -- {settings,roster,game-edit,netball-live-flow,live-quarters,live-scoring}.spec.ts --workers=1 --reporter=line` | 19 passed (59.1s) |
| Full e2e suite PASS | `npm run e2e -- --workers=1 --reporter=line` | 52 passed / 1 skipped (2.4m) — matches Plan 05-01 baseline exactly |
| `npx tsc --noEmit` exits 0 | exit code | 0 (no output) |
| `npm run lint` clean | exit code + warning count | 0 errors, 3 pre-existing warnings (unchanged) |
| `npm test --run` passes | exit code + output | 169 passed (9 files) |
| `pre-merge/main` tag frozen | `git rev-parse pre-merge/main` | `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` (unchanged) |
| `pre-merge/multi-sport` tag frozen | `git rev-parse pre-merge/multi-sport` | `e13e787cb8abe405c18aca73e66c7c928eb359d8` (unchanged) |
| PROD-04 fixme intact | `grep -c 'test\.fixme' e2e/tests/playhq-import.spec.ts` | 1 |
| No `src/` drift | `git status --short src/` | (empty) |
| No `scripts/` drift | `git status --short scripts/` | (empty) |
| No `supabase/` drift | `git status --short supabase/` | (empty) |
| No `e2e/fixtures/` drift | `git status --short e2e/fixtures/` | (empty) |

All 28 self-check items PASSED.

---
*Phase: 05-test-and-type-green*
*Plan: 02*
*Completed: 2026-04-30*
