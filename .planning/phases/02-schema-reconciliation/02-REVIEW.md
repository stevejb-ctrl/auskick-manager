---
phase: 02-schema-reconciliation
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - package.json
  - e2e/fixtures/factories.ts
  - e2e/tests/multi-sport-schema.spec.ts
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-04-29
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found (2 warnings, 0 critical)

## Summary

256 lines across three files were reviewed: a `package.json` scripts block
extension, a 4-line diff to the test fixture factory, and a new 246-line e2e
spec (`multi-sport-schema.spec.ts`). The implementation is well-bounded and
follows the established patterns from `onboarding.spec.ts` and `settings.spec.ts`
closely. The two-step insert/fetch invariant is correctly preserved in
`factories.ts`. No secrets are present. No critical issues were found.

Two warnings are raised: a silently-swallowed cleanup error in the round-trip
test's `finally` block, and a misleading test title that implies a
netball-specific `track_scoring` default when none exists. Both are fixable in
a single-line change each.

The `AgeGroup` import on `factories.ts:13` was examined: it remains live (used
by `MakePlayersOpts` on line 55 and `MakeGameOpts` on line 104), so it is not
dead code.

---

## Warnings

### WR-01: Silent error swallow in team-delete cleanup

**File:** `e2e/tests/multi-sport-schema.spec.ts:244`

**Issue:** The `finally` block deletes the test team via the admin client but
discards the result entirely:

```typescript
} finally {
  await admin.from("teams").delete().eq("id", team.id);
}
```

If the delete fails (FK constraint not yet cascaded, network glitch, RLS edge
case in a future migration), the error is silently swallowed and leaves a leaked
team in the database. The established pattern for best-effort cleanup in this
codebase (`deleteTestUser` in `e2e/fixtures/supabase.ts:95-100`) at least emits
a `console.warn` so the runner log surfaces the problem.

**Fix:**

```typescript
} finally {
  const { error: cleanupErr } = await admin.from("teams").delete().eq("id", team.id);
  if (cleanupErr) {
    console.warn(`[multi-sport-schema] team cleanup failed for ${team.id}: ${cleanupErr.message}`);
  }
}
```

---

### WR-02: Misleading test title implies netball-specific `track_scoring` default

**File:** `e2e/tests/multi-sport-schema.spec.ts:114`

**Issue:** The test is named:

```
"netball setup wizard creates team with sport='netball' and netball-default track_scoring"
```

The phrase "netball-default track_scoring" implies this test is asserting a
netball-specific default value for the column. The actual assertion at line 184
is `track_scoring: false` — the same value the AFL wizard test asserts. There is
no netball-specific default; both sports default to `false` per migration
`0003_live_game.sql`. A reader scanning the test names would reasonably infer
that netball has a different (non-false) default, which is incorrect. The inline
comment at line 173 explains this correctly, but the test title contradicts it.

The AFL wizard test title at line 32 uses "default track_scoring" (not
"AFL-default track_scoring"), making the two titles inconsistent in their
framing as well.

**Fix:** Remove "netball-default" from the title to match the wording of the AFL
test:

```typescript
test("netball setup wizard creates team with sport='netball' and default track_scoring", async ({
```

Or, if the intent is to make the titles explicitly parallel:

```typescript
// AFL test (line 32):
test("AFL setup wizard creates team with sport='afl' and default track_scoring", ...)
// Netball test (line 114):
test("netball setup wizard creates team with sport='netball' and default track_scoring", ...)
```

---

## Files with no findings

### `package.json`

Five scripts added (`e2e`, `db:start`, `db:stop`, `db:reset`, `db:status`).
Script values are clean — no hardcoded credentials, correct CLI flags
(`--no-confirm` on `db:reset` is appropriate for automation). The `e2e` script
correctly delegates to `scripts/e2e-setup.mjs` which handles env loading,
Supabase bootstrap, and Playwright invocation. No `pre`/`post` hook gaps vs
multi-sport (multi-sport has none either).

### `e2e/fixtures/factories.ts`

The 4-line diff (widen `ageGroup` to `string`, add `sport?: "afl" | "netball"`,
conditional spread in insert payload) is correct. The two-step insert/fetch
invariant is preserved. The `AgeGroup` import is still live. All 16 existing
callers that omit `sport` remain backward-compatible via the DB default. The
conditional spread `...(opts.sport ? { sport: opts.sport } : {})` is the
correct idiom for an optional column that has a DB-side default.

---

_Reviewed: 2026-04-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
