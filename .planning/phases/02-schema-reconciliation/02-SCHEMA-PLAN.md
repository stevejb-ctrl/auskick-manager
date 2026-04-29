# Phase 2 — Schema reconciliation plan: migration de-dup, audit, e2e spec design, Phase 6 handoff

**Generated:** 2026-04-29
**Phase:** 02-schema-reconciliation
**Requirements:** SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04
**Consumers:** Phase 3 (merge resolution acts on §2), Phase 6 (prod-clone validation acts on §6)
**Read-only invariant on this branch:** No writes to `supabase/migrations/` (D-11). The rename/delete documented in §2 is executed by Phase 3, not Phase 2.

## §1 Hash verification (D-10 lock)

**Decision lock:** D-10 — main's `supabase/migrations/0024_super_admin.sql` is byte-identical to multi-sport's `supabase/migrations/0025_super_admin.sql`. Phase 3's merge resolution deletes main's 0024 outright (no rename, no preservation as no-op).

**Re-verification commands run on `claude/vibrant-banzai-a73b2f` HEAD 8232f26 on 2026-04-29:**

```bash
$ git show main:supabase/migrations/0024_super_admin.sql | sha256sum
1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051 *-

$ git show multi-sport:supabase/migrations/0025_super_admin.sql | sha256sum
1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051 *-
```

Both hashes equal `1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051`. **D-10 deletion of main:0024_super_admin.sql is safe.** Phase 1 §2 captured the same equality at main@80a04eb / multi-sport@1277068; this re-verification at vibrant-banzai-a73b2f@8232f26 confirms no drift.

## §2 File ops for Phase 3 (D-10 + D-11 — documented, not executed)

**Decision locks:** D-10 (delete main's 0024_super_admin.sql), D-11 (this branch does NOT modify `supabase/migrations/` — Phase 3 executes during merge resolution).

**File ops Phase 3's merge resolution MUST execute (in this order, on the merged trunk — NOT this branch):**

| # | Operation | File | Rationale |
|---|-----------|------|-----------|
| 1 | DELETE | `supabase/migrations/0024_super_admin.sql` (main's copy — coming from main side of the merge) | Byte-identical to multi-sport's `0025_super_admin.sql` per §1 hash verification. Keeping both would produce duplicate-numbered migrations and a redundant SQL run. |
| 2 | KEEP unchanged | `supabase/migrations/0024_multi_sport.sql` (from multi-sport side) | Sport column + age-group constraint relaxation; no main-side equivalent. |
| 3 | KEEP unchanged | `supabase/migrations/0025_super_admin.sql` (from multi-sport side) | The canonical super-admin migration after the rename equivalence; identical to main's old 0024. |
| 4 | KEEP unchanged | `supabase/migrations/0026_team_quarter_seconds.sql` (from multi-sport side) | Per-team quarter-length override; no main-side equivalent. |
| 5 | KEEP unchanged | `supabase/migrations/0027_game_quarter_seconds.sql` (from multi-sport side) | Per-game quarter-length override; no main-side equivalent. |

**Post-merge migration ordering** (final state Phase 3 produces):

```
supabase/migrations/
  0001_… through 0023_…    (shared between branches, identical)
  0024_multi_sport.sql      (multi-sport-only)
  0025_super_admin.sql      (formerly main's 0024 — same bytes, renumbered)
  0026_team_quarter_seconds.sql
  0027_game_quarter_seconds.sql
```

**This is monotonic and unique** — SCHEMA-01 satisfied as-of-Phase-3-merge-resolution. Phase 2 documents the plan; Phase 3 executes it.

**Phase 3 verification command (NOT to be run on this branch):**

```bash
# After Phase 3 merge resolution lands the file ops above:
npm run db:reset  # equivalent to: supabase db reset --no-confirm
supabase migration list  # must show 27 migrations applied in order, no pending, no duplicates
```

**Read-only invariant verification (run NOW, on this branch, after writing this doc):**

```bash
git status -- supabase/migrations/  # must be clean — Phase 2 does NOT modify migrations
```

## §3 SCHEMA-02 audit — backfill atomicity

[fill — Task 2]

## §4 SCHEMA-04 audit — destructive-ops absence on existing AFL data

[fill — Task 2]

## §5 SCHEMA-03 e2e spec design (filled by Plan 03)

_To be filled by Plan 03 Task 2 — spec design notes pointing at `e2e/tests/multi-sport-schema.spec.ts`._

## §6 Phase 6 handoff — prod-clone acceptance criteria for SCHEMA-04 (filled by Plan 03)

_To be filled by Plan 03 Task 2 — five acceptance criteria from CONTEXT.md `<specifics>` "Phase 6 handoff acceptance criteria"._

*Generated: 2026-04-29 by /gsd-execute-phase 02 Plan 01.*
