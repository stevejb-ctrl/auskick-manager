---
phase: 02-schema-reconciliation
plan: "02"
subsystem: test-infrastructure
tags: [e2e, factories, package-json, schema-prep]
dependency_graph:
  requires: [02-01-SUMMARY.md]
  provides: [npm run e2e script, makeTeam with sport param]
  affects: [e2e/fixtures/factories.ts, package.json]
tech_stack:
  added: []
  patterns: [conditional-spread in insert payload, ageGroup widened to string ahead of D-06]
key_files:
  modified:
    - package.json
    - e2e/fixtures/factories.ts
decisions:
  - "db:* values copied verbatim from multi-sport/package.json to prevent Phase 3 merge conflict"
  - "ageGroup widened to string in factory as post-merge type alignment ahead of D-06 (Phase 3)"
  - "sport uses string literal union afl|netball (no Sport type import — type not on this branch yet)"
  - "AgeGroup import retained — still used by MakePlayersOpts and MakeGameOpts"
metrics:
  duration: "5 min"
  completed: "2026-04-29"
  tasks_completed: 2
  files_modified: 2
---

# Phase 2 Plan 02: Test Infrastructure (package.json + factory) Summary

**One-liner:** Added `npm run e2e` script + `db:*` scripts to package.json, and extended `makeTeam` factory to accept optional `sport?: "afl" | "netball"` with `ageGroup` widened to `string` — prerequisite test infrastructure for Plan 03's e2e spec authoring.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add e2e + db:* scripts to package.json | e7270d4 | package.json |
| 2 | Extend makeTeam factory (sport param + ageGroup widened) | 0c992f3 | e2e/fixtures/factories.ts |

## package.json — Before / After scripts block

**Before (6 scripts):**
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

**After (11 scripts — 5 added):**
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "e2e": "node scripts/e2e-setup.mjs",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset --no-confirm",
  "db:status": "supabase status"
}
```

**Source provenance:**
- `"e2e"` — neither branch had this; `scripts/e2e-setup.mjs` existed but was not wired to npm (RESEARCH §6 L1). Adding it makes `npm run e2e` work per CLAUDE.md Quick commands.
- `"db:start"`, `"db:stop"`, `"db:reset"`, `"db:status"` — copied verbatim from `../multi-sport/package.json` (verified values match). No merge conflict in Phase 3 (same keys, same values, additive-only).

## e2e/fixtures/factories.ts — MakeTeamOpts shape before / after

**Before:**
```typescript
export interface MakeTeamOpts {
  name?: string;
  ageGroup?: AgeGroup;  // narrow AFL enum: U8..U17
  ownerId: string;
}

export async function makeTeam(
  admin: SupabaseClient,
  opts: MakeTeamOpts
): Promise<{ id: string; name: string; ageGroup: AgeGroup }> {
```

**After:**
```typescript
export interface MakeTeamOpts {
  name?: string;
  ageGroup?: string;                // widened from AgeGroup — post-merge type alignment
  sport?: "afl" | "netball";       // NEW — DB default 'afl' when omitted
  ownerId: string;
}

export async function makeTeam(
  admin: SupabaseClient,
  opts: MakeTeamOpts
): Promise<{ id: string; name: string; ageGroup: string }> {
```

**Insert payload diff (4-line change):**
```diff
  const { error: insertError } = await admin.from("teams").insert({
    name,
    age_group: ageGroup,
    created_by: opts.ownerId,
+   ...(opts.sport ? { sport: opts.sport } : {}),
  });
```

## Typecheck output

```
npx tsc --noEmit
(no output — exits 0)
```

All 16+ existing `makeTeam` callers still typecheck. Passing a narrow `AgeGroup` literal (`"U10"`, etc.) where `string` is expected is a superset relationship — no caller-visible breaking change.

## Two-step insert/fetch invariant preserved

The `makeTeam` function continues to use the two-step pattern:
1. `admin.from("teams").insert({...})` — NO `.select()` chained.
2. Separate `admin.from("teams").select("id, name, age_group").eq("name", ...).eq("created_by", ...).single()`.

The single chained `.insert(...).select(...)` found in the file is in `makePlayers` for the `players` table — a different factory unaffected by this plan's changes and without the same trigger constraint.

## Read-only invariant verification

```
git status --porcelain -- supabase/migrations/ src/ e2e/tests/ scripts/
(empty — clean)
```

Only the two expected files appear in `git diff HEAD~2..HEAD`:
- `package.json` (Task 1 — e7270d4)
- `e2e/fixtures/factories.ts` (Task 2 — 0c992f3)

`supabase/migrations/`, `src/`, `e2e/tests/`, `scripts/` are untouched. D-11 honoured.

## Deviations from Plan

None — plan executed exactly as written.

The chained `.insert().select()` grep check returned 1 instead of 0 because `makePlayers` uses this pattern for the `players` table (which has no AFTER INSERT trigger with this RLS constraint). This was anticipated by re-reading the factory file and is correct: the invariant applies to `teams` inserts only. The `makeTeam` teams insert correctly has no chained `.select()`.

## Hand-off note for Plan 03

Plan 03 may now use `npm run e2e` to invoke specs (currently expected red on this branch — the netball wizard UI and `<QuarterLengthInput>` do not exist here yet; they ship in Phase 3). The supported call shape for creating a netball team in the spec is:

```typescript
makeTeam(admin, { ownerId, ageGroup: "go", name: "QL-test", sport: "netball" })
```

This fast-forwards past the wizard for the team-settings quarter-length round-trip case (the `<QuarterLengthInput>` only renders when `team.sport === 'netball'` per `settings/page.tsx:110-125`).

For AFL teams (all existing callers), no change is needed — `sport` defaults to `'afl'` via the DB column default when omitted.

## Self-Check: PASSED

- [x] `package.json` modified — commit `e7270d4` exists
- [x] `e2e/fixtures/factories.ts` modified — commit `0c992f3` exists
- [x] `npx tsc --noEmit` exits 0
- [x] `sport?: "afl" | "netball"` present in MakeTeamOpts
- [x] `ageGroup?: string` present (widened)
- [x] Conditional spread `...(opts.sport ? { sport: opts.sport } : {})` present
- [x] No chained `.select()` on the teams `.insert()` call
- [x] `supabase/migrations/`, `src/`, `e2e/tests/`, `scripts/` clean
- [x] `package.json` has 11 scripts in documented order
