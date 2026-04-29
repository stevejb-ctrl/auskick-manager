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

**Requirement:** SCHEMA-02 — migration backfills `teams.sport = 'afl'` for every existing team row before any code path treats sport as non-null (DEFAULT then NOT NULL, or backfill-then-alter pattern).

**Audit verdict:** SCHEMA-02 is satisfied **as-shipped** by `0024_multi_sport.sql`. No additional backfill statement is needed.

**Evidence — `0024_multi_sport.sql` lines 25-27 (verbatim from `sed -n '25,27p'` on 2026-04-29):**

```sql
alter table public.teams
  add column if not exists sport text not null default 'afl'
    check (sport in ('afl','netball'));
```

**Postgres atomicity proof** (per RESEARCH.md §1 "ADD COLUMN ... NOT NULL DEFAULT 'value' semantics", verified against Postgres docs):

A single `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT 'afl' CHECK (...)` statement, when executed inside Supabase CLI's implicit per-migration-file transaction:

1. Stores the default expression `'afl'` on the column metadata.
2. Populates existing rows with that default value (since Postgres 11, this is a metadata-only constant-time operation for non-volatile defaults — no full table rewrite).
3. Enforces the NOT NULL constraint — passes because every row already has `'afl'`.
4. Adds the CHECK constraint `sport IN ('afl','netball')` — passes because every existing row has `'afl'`.

**All four steps occur within the implicit transaction wrapping the file.** Either the entire migration succeeds atomically or rolls back. **There is no observable window in which existing rows have `sport IS NULL`.**

**Phase 6 runtime confirmation (deferred per D-17):** After Phase 3 merge + Phase 5 test-green, Phase 6 applies the migration set against a Supabase prod-clone and runs `select count(*) from teams where sport is null` — must return 0. Captured in §6.

## §4 SCHEMA-04 audit — destructive-ops absence on existing AFL data

**Requirement:** SCHEMA-04 — existing AFL data (teams, players, games, game_events, game_availability, share_tokens) survives the migration intact and is queryable through the merged code without RLS or null errors.

**Decision lock:** D-16 — Phase 2 covers the **migration-content side only**. D-17 — "queryable through merged code" is deferred to Phase 6 prod-clone validation; captured in §6.

**Note on SQL casing:** The three multi-sport migration files use lowercase SQL keywords (`alter`, `drop`, `add`, `create`). Audit 1 below uses `-i` (case-insensitive) to correctly capture matches. Audit 2 patterns (`DROP TABLE`, `DROP COLUMN`, etc.) exit 1 regardless of casing — confirmed with both uppercase and lowercase patterns.

**Audit 1 — DROP CONSTRAINT / RENAME / REVOKE scan across the three new migrations (verbatim stdout from 2026-04-29, using `grep -inE "drop constraint|rename|revoke"`):**

```bash
$ grep -inE "drop constraint|rename|revoke" \
    ../multi-sport/supabase/migrations/0024_multi_sport.sql \
    ../multi-sport/supabase/migrations/0026_team_quarter_seconds.sql \
    ../multi-sport/supabase/migrations/0027_game_quarter_seconds.sql
../multi-sport/supabase/migrations/0024_multi_sport.sql:48:    alter table public.teams drop constraint teams_age_group_check;
../multi-sport/supabase/migrations/0024_multi_sport.sql:67:    alter table public.game_events drop constraint game_events_type_check;
```

**Match accounting** (matches the live grep output above):

| File | Line | Statement | Classification | Safety |
|------|------|-----------|----------------|--------|
| `0024_multi_sport.sql` | 48 | `alter table public.teams drop constraint teams_age_group_check;` | Constraint relaxation | **SAFE** — relaxes AFL-only `U8..U17` whitelisting to allow netball age groups; existing AFL `age_group` text values (U8..U17) remain valid as plain strings (no narrow-enum enforcement after drop). Per CONTEXT D-16. |
| `0024_multi_sport.sql` | 67 | `alter table public.game_events drop constraint game_events_type_check;` | Constraint widen-and-replace | **SAFE** — immediately re-created (lines 75-92) with widened enum that includes `period_break_swap` plus all existing event types; no existing `game_events` row becomes invalid. |

**Zero matches** in `0026_team_quarter_seconds.sql` or `0027_game_quarter_seconds.sql`.
**Zero matches** of any `RENAME` or `REVOKE` across all three files.

**Audit 2 — destructive-ops scan across the three new migrations (verbatim stdout from 2026-04-29):**

```bash
$ grep -E "DROP TABLE|DROP COLUMN|DROP POLICY|DROP TRIGGER|DROP FUNCTION" \
    ../multi-sport/supabase/migrations/0024_multi_sport.sql \
    ../multi-sport/supabase/migrations/0026_team_quarter_seconds.sql \
    ../multi-sport/supabase/migrations/0027_game_quarter_seconds.sql
$ echo $?
1
```

**Verdict:** Zero `DROP TABLE`, zero `DROP COLUMN`, zero `DROP POLICY`, zero `DROP TRIGGER`, zero `DROP FUNCTION`. **SCHEMA-04 migration-content side is satisfied** — none of the three new migrations destroys data, columns, policies, triggers, or functions that existing AFL queries depend on.

**New columns added by these migrations:**

| File | Column | Type | NULL? | Existing rows after migration |
|------|--------|------|-------|-------------------------------|
| `0024_multi_sport.sql:25-27` | `teams.sport` | `text` | NOT NULL | Populated with `'afl'` via DEFAULT in same statement (atomic per §3) |
| `0026_team_quarter_seconds.sql:11-12` | `teams.quarter_length_seconds` | `integer` | NULL | Existing rows get `NULL` — semantically "use inherited age-group default" |
| `0027_game_quarter_seconds.sql:12-13` | `games.quarter_length_seconds` | `integer` | NULL | Existing rows get `NULL` — semantically "inherit team override or age-group default" |

**No NOT NULL constraint is ever enforced on existing rows that did not have a value provided.** SCHEMA-04 migration-content side is fully satisfied.

**Phase 6 deferred items (per D-17):** "Queryable through merged code without RLS or null errors" requires a running Postgres against the merged code. Captured in §6.

## §5 SCHEMA-03 e2e spec design (filled by Plan 03)

_To be filled by Plan 03 Task 2 — spec design notes pointing at `e2e/tests/multi-sport-schema.spec.ts`._

## §6 Phase 6 handoff — prod-clone acceptance criteria for SCHEMA-04 (filled by Plan 03)

_To be filled by Plan 03 Task 2 — five acceptance criteria from CONTEXT.md `<specifics>` "Phase 6 handoff acceptance criteria"._

*Generated: 2026-04-29 by /gsd-execute-phase 02 Plan 01.*
