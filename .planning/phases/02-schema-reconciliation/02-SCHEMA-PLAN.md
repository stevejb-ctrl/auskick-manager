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

## §5 SCHEMA-03 e2e spec design

**Spec file:** `e2e/tests/multi-sport-schema.spec.ts` (committed on `claude/vibrant-banzai-a73b2f` per Plan 03 Task 1).

**Decision locks:** D-12 (spec written here, expected red on this branch — Phase 3 flips green), D-13 (one journey-level spec file), D-14 (three test cases — AFL wizard, netball wizard, settings round-trip), D-15 (excludes games.quarter_length_seconds and track_scoring=false live-screen suppression).

**Test cases** (verbatim names — match `grep -E '^test\(' e2e/tests/multi-sport-schema.spec.ts`):

| # | Test name | Surfaces exercised | DB assertions | Pattern source |
|---|-----------|--------------------|---------------|----------------|
| 1 | `"AFL setup wizard creates team with sport='afl' and default track_scoring"` | `/teams/new` wizard (TeamBasicsForm), age select, Continue button, redirect to `/teams/[id]/setup`, then `/teams/[id]/settings` for L7 negative-presence | `teams.sport='afl'`, `teams.track_scoring=false`, `<QuarterLengthInput>` not visible on AFL settings | `e2e/tests/onboarding.spec.ts` (clean-context + user provisioning) + `e2e/tests/settings.spec.ts:39-51` (expect.poll DB round-trip) |
| 2 | `"netball setup wizard creates team with sport='netball' and netball-default track_scoring"` | `/teams/new` wizard, **Netball sport pill** (`page.getByRole("button", { name: "Netball" })` per L9), age select `"go"`, Continue, redirect | `teams.sport='netball'`, `teams.track_scoring=false` (L4 — wizard does not auto-flip) | Same as test 1 |
| 3 | `"team settings round-trips quarter_length_seconds for a netball team"` | Factory fast-forward (`makeTeam(admin, { ownerId, ageGroup: "go", sport: "netball", name: ... })` per L7), `/teams/[id]/settings`, `<QuarterLengthInput>` (8 min fill + Save), reload | `teams.quarter_length_seconds=480` via `expect.poll`, then `qlCard.getByLabel(/quarter length/i).toHaveValue("8")` after reload | `e2e/tests/settings.spec.ts:23-65` |

**Locator references** (verified against multi-sport's components — RESEARCH §3):

- Sport pill: `page.getByRole("button", { name: "Netball" })` — `<SportPill>` renders `role="button"` with verbatim title `"Netball"` (also `"AFL / Auskick"`); component at `../multi-sport/src/components/setup/TeamBasicsForm.tsx`.
- Team name input: `page.getByLabel(/team name/i)`.
- Age group select: `page.getByLabel(/age group/i).selectOption("U10")` (AFL) or `selectOption("go")` (netball).
- Submit: `page.getByRole("button", { name: /continue/i })`.
- Post-submit URL match: `/\/teams\/[0-9a-f-]+/` (regex; `waitForURL` with 10_000 ms timeout per L5).
- QuarterLengthInput card scope: `page.locator("section").filter({ hasText: /quarter length/i })`; component at `../multi-sport/src/components/team/QuarterLengthInput.tsx`.

**Landmines encoded in the spec body** (RESEARCH §6):
- L4 — `track_scoring=false` is the post-creation expectation for both sports (wizard does not auto-flip).
- L5 — `waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 })` after wizard submission, protects against the AFTER INSERT trigger RLS race.
- L6 — Two-step insert/fetch via `makeTeam` (no `.insert(...).select(...)` chain).
- L7 — `<QuarterLengthInput>` renders only for `sport === 'netball'`; the round-trip test passes `sport: "netball"` explicitly to the factory.
- L8 — There is no separate `NetballSetupWizard`; one wizard, two sports.
- L9 — Brand defaults AFL on localhost; the netball case clicks the `Netball` pill explicitly.

**Expected red on this branch** (D-12):

The spec is committed but is NOT expected to pass on `claude/vibrant-banzai-a73b2f`. Reasons:
1. The netball setup wizard (`<SportPill>` toggle in `TeamBasicsForm`) doesn't exist on this branch.
2. `<QuarterLengthInput>` doesn't exist on this branch.
3. `teams.sport` and `teams.quarter_length_seconds` columns don't exist in this branch's local Supabase.

**Phase 2 acceptance for SCHEMA-03:** spec FILE exists with the three named test cases; `npx tsc --noEmit` passes; structure matches the patterns above. Acceptance is NOT "spec runs green."

**Phase 3 verification flips green** — once Phase 3 lands the migrations and the netball UI components, all three test cases run as intended. Per ROADMAP Phase 3 success criterion 4 ("All existing AFL e2e specs pass unchanged on the merged trunk") and the implicit corollary that this new spec joins the green set.

**Excluded test surfaces (D-15 — do NOT add to this spec without re-discussion):**
- Per-game quarter length override (`games` table, migration `0027`) — Phase 5 follow-up if a gap analysis flags it. Resolution semantics covered by `getEffectiveQuarterSeconds` Vitest unit tests on multi-sport.
- `track_scoring=false` UI suppression on the live screen, score bug, summary card "Goals:" line, walkthrough scoring step, GS/GA tap no-op — Phase 4 / NETBALL-04.

## §6 Phase 6 handoff — prod-clone acceptance criteria for SCHEMA-04

**Decision lock:** D-17 — "queryable through merged code without RLS or null errors" is deferred from Phase 2 (migration-content audit, §3 + §4) to Phase 6 (prod-clone runtime verification).

**SCHEMA-04 split:**
- Phase 2 owns the migration-content side — already complete in §4 (zero `DROP TABLE`/`DROP COLUMN`/`DROP POLICY`/`DROP TRIGGER`/`DROP FUNCTION`; the two safe `drop constraint` lines accounted for).
- **Phase 6 owns the runtime side** — the five acceptance criteria below.

**Phase 6 acceptance criteria for SCHEMA-04 (verbatim from CONTEXT.md `<specifics>`):**

1. **Apply the merged migration set against a Supabase prod-clone DB.** Use `supabase db reset` against a Supabase project populated from a prod snapshot (or a prod-clone instance per DEPLOY-01). All 27 migrations apply in order with zero errors. (Note: depends on Phase 3 having executed the §2 file ops — main's `0024_super_admin.sql` deleted; multi-sport's `0024_multi_sport.sql` + `0025_super_admin.sql` + `0026_team_quarter_seconds.sql` + `0027_game_quarter_seconds.sql` retained.)

2. **Load at least one pre-existing AFL team through the merged code.** Verify no RLS errors and no null-sport panics in either the dashboard team-list page or the live-game shell. Existing AFL teams' `age_group` text values (U8..U17) remain valid plain strings after the constraint drop in `0024_multi_sport.sql:48`.

3. **Verify `select count(*) from teams where sport is null` returns 0.** This confirms the `0024_multi_sport.sql:25-27` atomic backfill (NOT NULL DEFAULT 'afl') correctly populated all pre-existing rows during migration application.

4. **Verify `select distinct sport from teams` returns only `'afl'`.** Production has only ever been AFL — the only post-migration `sport` value across pre-existing rows must be `'afl'`. Any `'netball'` value would indicate a corruption (prod has no netball teams yet).

5. **Verify at least one pre-existing AFL share token still resolves through `/run/[token]`.** Loads the public-facing share-link route against the prod-clone-backed code. No 404, no RLS error, no null-sport panic.

**Phase 6 hand-off pointer:** `/gsd-execute-phase 6` (or successor) reads this §6 list and turns each into a manual or automated check. The five items map 1:1 to a Phase 6 verification block. SCHEMA-04 is closed when all five pass on prod-clone.

**SCHEMA-04 closure summary:**

| Side | Phase | Verification |
|------|-------|--------------|
| Migration-content audit | Phase 2 (this plan §4) | `grep -E "DROP TABLE\|DROP COLUMN\|DROP POLICY\|DROP TRIGGER\|DROP FUNCTION"` exits 1 across all three new migrations; the two `drop constraint` matches are safe (constraint relaxation/widen) |
| Live-data runtime | Phase 6 | Five criteria above against prod-clone |

*02-SCHEMA-PLAN.md is now complete. All six §-numbered sections substantive. Phase 2's audit deliverable is sealed.*

*Generated: 2026-04-29 by /gsd-execute-phase 02 Plan 01.*
