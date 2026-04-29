# Phase 2: Schema reconciliation - Research

**Researched:** 2026-04-29
**Domain:** Supabase migrations + Playwright e2e for schema-touching UI
**Confidence:** HIGH (every factual claim verified against the multi-sport worktree, current branch, or git refs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-10:** Main's `supabase/migrations/0024_super_admin.sql` deleted outright in Phase 3 (byte-identical to multi-sport's `0025_super_admin.sql`).
- **D-11:** Phase 2 does NOT modify `supabase/migrations/` on this worktree. The rename/delete plan is documented in `02-SCHEMA-PLAN.md` for Phase 3 to act on.
- **D-12:** Phase 2 DOES write the new e2e spec source file on this branch (under `e2e/tests/`). Running it green is NOT a Phase 2 acceptance criterion — Phase 3 verification flips it green.
- **D-13:** One spec file, journey-level, exercising the new schema columns through real UI for both sports. Filename suggested `e2e/tests/multi-sport-schema.spec.ts`.
- **D-14:** Spec covers AFL setup wizard + netball setup wizard + team-settings quarter-length round-trip.
- **D-15:** Spec excludes `games.quarter_length_seconds` (per-game override) and `track_scoring=false` live-screen suppression (Phase 4 / NETBALL-04).
- **D-16:** Phase 2 covers SCHEMA-04 migration-content side only (code-read audit, not live data verification).
- **D-17:** "Queryable through merged code without RLS or null errors" deferred to Phase 6 prod-clone validation. `02-SCHEMA-PLAN.md` ends with explicit Phase 6 handoff.
- **D-18:** Deliverables in own phase directory. New `02-SCHEMA-PLAN.md` is the audit deliverable, NOT an extension of `01-MERGE-NOTES.md`.
- **D-01..D-09:** Carried forward from Phase 1, still valid (multi-sport becomes trunk; same Supabase project; backfill via DEFAULT then NOT NULL; pre-merge tags exist; no force-push to main).

### Claude's Discretion
- Final spec filename (suggested `e2e/tests/multi-sport-schema.spec.ts`).
- Whether `e2e/fixtures/factories.ts` needs extending (reading the makeTeam signature — verified below: it does NOT currently accept `sport`).
- Cross-worktree reads from `../multi-sport/` while authoring spec (encouraged, required for accurate component naming).
- Format of `02-SCHEMA-PLAN.md` (markdown sections; suggested structure in CONTEXT.md §"Format of `02-SCHEMA-PLAN.md`").

### Deferred Ideas (OUT OF SCOPE)
- `games.quarter_length_seconds` UI test (Phase 5 follow-up if gap analysis flags it).
- `track_scoring=false` UI suppression on live screen / summary card / walkthrough (NETBALL-04 / Phase 4).
- Squash-merge vs merge-commit during Phase 3 (Phase 3 picks).
- `games.quarter_length_seconds` exposed in game-edit form (v2 milestone if ever).
- Per-sport `track_scoring` defaulting (revisit post-merge if friction surfaces).
- CI linter to flag duplicate migration numbers (follow-up milestone).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-01 | Migration ordering monotonic and unique; `supabase migration up` runs cleanly from scratch | §1 (Migration runtime semantics) confirms each `.sql` runs in its own transaction; Phase 1 §2 confirmed numbering plan; verification command in §5 |
| SCHEMA-02 | Backfill `teams.sport = 'afl'` BEFORE NOT NULL applies | §1 confirms `ADD COLUMN ... NOT NULL DEFAULT 'afl'` is atomic in Postgres — DEFAULT applies to existing rows then NOT NULL enforces, all within `0024_multi_sport.sql`'s implicit transaction. Verified line-by-line at `0024_multi_sport.sql:25-27` |
| SCHEMA-03 | Playwright spec exercises new columns through UI for both sports | §2 maps real component names; §3 names the closest analog spec (`settings.spec.ts`); §5 supplies acceptance commands |
| SCHEMA-04 | Existing AFL data survives migration intact, queryable through merged code | §1 documents NOT NULL DEFAULT atomicity for `teams.sport`; §6 enumerates landmines; verified zero `DROP TABLE/COLUMN/POLICY/TRIGGER/FUNCTION` in the three new migrations (only `DROP CONSTRAINT teams_age_group_check`, which is documented + safe per CONTEXT D-16); live "queryable" verification deferred to Phase 6 per D-17 |
</phase_requirements>

## 1. Phase Scope Summary

Phase 2 produces two artifacts: (a) `02-SCHEMA-PLAN.md` — a renumbering + audit deliverable that Phase 3's merge resolution acts on, and (b) `e2e/tests/multi-sport-schema.spec.ts` (or similar) — a journey-level Playwright spec exercising `teams.sport`, `teams.track_scoring`, and `teams.quarter_length_seconds` through the unified setup wizard and team-settings UI for both sports. The spec is committed on this branch and is **expected red on this branch** (the netball UI doesn't exist here yet); Phase 3's verification flips it green. No writes to `supabase/migrations/` on this branch — the rename/delete plan is documented for Phase 3 to execute during the merge.

## 2. Migration Runtime Semantics

### Supabase CLI `supabase db reset` / `supabase migration up` behaviour [VERIFIED via official docs + scripts/e2e-setup.mjs]

- The Supabase CLI runs each migration file as a single block. Postgres wraps DDL in an implicit transaction unless the file explicitly opts out (e.g. `CREATE INDEX CONCURRENTLY`). None of the three new multi-sport migrations use such opt-outs. **Each `.sql` file is therefore atomic** — if any statement fails the entire file rolls back. [VERIFIED: `0024_multi_sport.sql`, `0026_team_quarter_seconds.sql`, `0027_game_quarter_seconds.sql` reviewed line-by-line]
- The CLI applies migrations in lexicographic filename order. With multi-sport's `0017 → 0024 → 0025 → 0026 → 0027` set as trunk after de-dup, ordering is monotonic. [VERIFIED: directory listing on multi-sport @ `1277068`]
- `npm run db:reset` is **NOT defined** in this branch's `package.json`. It is defined on multi-sport's `package.json` as `supabase db reset --no-confirm` and via `scripts/e2e-setup.mjs` (which calls the same CLI command before Playwright). See landmines §6. [VERIFIED: read both branch package.json]

### `ADD COLUMN ... NOT NULL DEFAULT 'value'` semantics [VERIFIED via Postgres docs + 0024_multi_sport.sql:25-27]

```sql
alter table public.teams
  add column if not exists sport text not null default 'afl'
    check (sport in ('afl','netball'));
```

Postgres semantics for this single ALTER TABLE statement:

1. The default expression (`'afl'`) is evaluated and stored on the column metadata.
2. Existing rows are populated with that default value (since Postgres 11, this is a metadata-only operation for non-volatile defaults — no full table rewrite, just constant-time).
3. The NOT NULL constraint is then enforced — and because every row already has `'afl'`, the enforcement passes.
4. The CHECK constraint (`sport IN ('afl','netball')`) is added.

**All four steps occur within the implicit transaction wrapping the file.** Either the entire migration succeeds atomically or rolls back. There is no observable window in which existing rows have `sport IS NULL`. SCHEMA-02 is satisfied **as-shipped** by the existing multi-sport migration; no additional backfill statement is needed. [VERIFIED]

### `0026_team_quarter_seconds.sql` and `0027_game_quarter_seconds.sql` [VERIFIED]

Both add `quarter_length_seconds integer NULL` (no default, no constraint) to `teams` and `games` respectively. Existing rows get `NULL` (semantically: "use the inherited default"). No backfill needed. No NOT NULL ever applied. Resolution at read time happens in JS via `getEffectiveQuarterSeconds(team, ageGroup, game?)`. [VERIFIED: `0026:11-12`, `0027:12-13`]

### Constraint drop in `0024_multi_sport.sql` [VERIFIED]

The migration drops `teams_age_group_check` inside a `do $$ ... if exists ... drop constraint ... end $$` block (lines 40-50). This is the **only** destructive operation in any of the three new migrations and is by design — it relaxes AFL-only `U8..U17` whitelisting to allow netball age groups (`set`, `go`, `11u`, `12u`, `13u`, `open`). Existing AFL `age_group` values remain valid as plain text. [VERIFIED]

The migration also drops + re-creates `game_events_type_check` (lines 59-92) to widen the enum whitelist with `period_break_swap`. All existing event types remain valid. [VERIFIED]

### `grep -E "DROP|RENAME|REVOKE"` audit result [VERIFIED]

Running:
```bash
grep -nE "DROP|RENAME|REVOKE" \
  ../multi-sport/supabase/migrations/0024_multi_sport.sql \
  ../multi-sport/supabase/migrations/0026_team_quarter_seconds.sql \
  ../multi-sport/supabase/migrations/0027_game_quarter_seconds.sql
```

Returns matches **only** at:
- `0024_multi_sport.sql:48` — `alter table public.teams drop constraint teams_age_group_check;` (documented relaxation)
- `0024_multi_sport.sql:67` — `alter table public.game_events drop constraint game_events_type_check;` (immediately re-created with widened enum)

Zero matches in `0026_*` or `0027_*`. Zero `DROP TABLE`, `DROP COLUMN`, `DROP POLICY`, `DROP TRIGGER`, `DROP FUNCTION`, `RENAME`, or `REVOKE` across all three files. [VERIFIED via direct grep]

### `DROP TABLE|DROP COLUMN|DROP POLICY|DROP TRIGGER|DROP FUNCTION` audit [VERIFIED]

```bash
grep -E "DROP TABLE|DROP COLUMN|DROP POLICY|DROP TRIGGER|DROP FUNCTION" \
  ../multi-sport/supabase/migrations/0024_multi_sport.sql
```

Exits 1 with no output. **No destructive operations on tables, columns, policies, triggers, or functions exist.** SCHEMA-04 migration-content side is satisfied. [VERIFIED]

## 3. Multi-sport Branch Landscape (real component names)

### The unified setup wizard

**There is NO separate `NetballSetupWizard` component.** [VERIFIED — `grep -ri "NetballSetupWizard|NetballSetup" multi-sport/src/` returns no files] The setup wizard is **sport-aware**, not sport-branched. CONTEXT.md `<canonical_refs>` hints at "`../multi-sport/src/components/netball/`" being where the wizard lives — that directory contains the live-game and walkthrough components, not setup. The planner must NOT reference a netball-specific wizard component in `read_first` / `action` fields.

**Real entry points and components** (all paths absolute under `../multi-sport/`):

| Component | Path | Role in spec |
|-----------|------|--------------|
| Create-team page | `src/app/(app)/teams/new/page.tsx` | Server component. Reads `getBrand()` for `defaultSport`. Renders `<TeamBasicsForm userId={...} defaultSport={...} />`. Spec navigates here via `page.goto('/teams/new')`. |
| `TeamBasicsForm` | `src/components/setup/TeamBasicsForm.tsx` | Client component. **The sport picker.** Two `<SportPill>` buttons (`role="button"`, `aria-pressed={active}`) with titles `"AFL / Auskick"` and `"Netball"`. Calls `createTeam(userId, name, ageGroup, sport)` server action and redirects to `/teams/[id]/setup?step=config`. Sport pill is hidden when `lockSport={true}`. |
| `createTeam` action | `src/app/(app)/dashboard/actions.ts:13` | Server action. Signature: `createTeam(userId: string, name: string, ageGroup: string = "U10", sport: Sport = "afl")`. Inserts `{ id, name, created_by, age_group, sport }` into `teams`. Validates ageGroup against `getSportConfig(sport).ageGroups`. Redirects via `redirect(\`/teams/\${teamId}/setup?step=config\`)`. |
| Setup wizard router | `src/app/(app)/teams/[teamId]/setup/page.tsx` | Server component. Reads `team.sport`, `team.age_group`, `team.track_scoring`, `team.quarter_length_seconds`. Routes `?step=config\|squad\|games\|done` to step components. Uses **service-role client** for the team fetch (RLS workaround for just-created teams — see auto-memory note in §6). |
| `ScoringStep` | `src/components/setup/ScoringStep.tsx` | Server-rendered component. Renders `<TrackScoringToggle>` always. Conditionally renders `<QuarterLengthInput>` ONLY when `sportId === "netball"` (lines 69-75). Heading is always `"How we play"`. Blurb varies by sport. |
| `TrackScoringToggle` | `src/components/games/TrackScoringToggle.tsx` | Client toggle (existing on main, multi-sport extends with `sportId` prop). Uses `role="switch"` or `role="checkbox"` per existing `settings.spec.ts:72` query pattern. |
| `QuarterLengthInput` | `src/components/team/QuarterLengthInput.tsx` | Client component. Inputs labelled `"Quarter length (minutes)"` (`<Label htmlFor={\`quarter-length-${teamId}\`}>`). Buttons: `"Save"` and (when override active) `"Use default"`. Validates 1-30 min integer in browser; converts minutes×60 to seconds before action. Calls `setQuarterLengthSeconds(teamId, overrideSeconds | null)`. **Visible on team-settings only when `team.sport === 'netball'`** (per `settings/page.tsx:110-125`). |
| `setQuarterLengthSeconds` action | `src/app/(app)/teams/[teamId]/games/actions.ts:117` | Server action. Persists `teams.quarter_length_seconds`. |
| Team-settings page | `src/app/(app)/teams/[teamId]/settings/page.tsx` | Server component. Reads `id, name, sport, age_group, track_scoring, quarter_length_seconds, song_*`. Renders `<TeamNameSettings>` → `<TeamMembersSettings>` → `<TrackScoringToggle>` → (netball only) `<QuarterLengthInput>` → `<TeamSongSettings>`. |

### Sport-specific defaults (drives spec assertions)

[VERIFIED via `src/lib/sports/netball/index.ts` and `src/lib/ageGroups.ts`]

- **AFL** `tracksScoreDefault` per age group: U8/U9/U10 = `false` (typical), U11+ = `true` (typical). Source: `src/lib/sports/afl/index.ts` reads from `AGE_GROUPS[id].tracksScoreDefault` in `src/lib/ageGroups.ts`.
- **Netball** `tracksScoreDefault` per age group:
  - `set` (5–7): **false**
  - `go` (8–10): **false**
  - `11u`, `12u`, `13u`: **true**
  - `open`: **true**
- **The setup wizard does NOT auto-flip `track_scoring`** — the column ships `NOT NULL DEFAULT false` from `0003_live_game.sql` and the team row keeps that until the coach toggles it. The `ScoringStep` shows the age-group default as a *hint* in the UI ("Default for {ageGroup.label}: on/off") but does not change the DB value. **DO NOT assert that newly-created teams have `track_scoring` matching the age-group default** — assert only that it equals the default (`false`) until toggled.
- **Default age group** for new teams: AFL → `"U10"`, netball → `"go"` (`TeamBasicsForm.tsx:33-34: const defaultAgeFor = (s) => s === "afl" ? "U10" : "go"`).
- **All netball age groups default `periodSeconds = 600`** (10 min). Spec assertion target for the round-trip: change minutes from 10 → 8, verify DB row has `quarter_length_seconds = 480`.

### Hash equality re-confirmed [VERIFIED in this session]

```
$ git show main:supabase/migrations/0024_super_admin.sql | sha256sum
1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051 *-

$ git show multi-sport:supabase/migrations/0025_super_admin.sql | sha256sum
1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051 *-
```

Both hashes match. D-10 deletion of main's `0024_super_admin.sql` is safe. [VERIFIED at vibrant-banzai-a73b2f@8d561da on 2026-04-29]

## 4. Closest Analog e2e Specs

### Primary pattern source: `e2e/tests/settings.spec.ts` [VERIFIED on this branch]

Use this as the prose template for the team-settings round-trip case. Specifically:

- The `expect.poll()` idiom for DB-write round-trip assertions (lines 39-51): poll the `teams` table for the persisted value, with `intervals: [200, 200, 500, 500, 1000]` and `timeout: 5_000`. **Inherit this verbatim** for the `quarter_length_seconds` round-trip — coach types into the input, clicks Save, the spec polls the DB until the value updates, then reloads the page and asserts the UI reflects it.
- The pattern of using `makeTeam` to fast-forward past wizard, then driving the settings UI directly. Lines 23-30 + 61-65 show this twice.
- The pattern of looking up `ownerId` from super-admin's `email` env var (lines 18-22 / 56-60). Inherit verbatim.
- Section-scoped locators using `page.locator("section").filter({ hasText: "..." })` (line 35) when multiple cards on the same page have similar inputs. Use this for QuarterLengthInput.

### Secondary pattern source: `e2e/tests/onboarding.spec.ts` [VERIFIED on this branch]

Use this as the template for the wizard cases (AFL + netball). Specifically:

- Clean-context pattern (lines 16-17): `await browser.newContext({ storageState: undefined })` for tests that should NOT inherit super-admin storageState. **The wizard cases SHOULD use this pattern** — they exercise a fresh-coach flow.
- Admin-API user provisioning + password sign-in (lines 33-50). Reusable verbatim.
- Form-driven team creation (lines 56-63): `page.getByLabel(/team name/i).fill(...)`, `page.getByLabel(/age group/i).selectOption(...)`, `page.getByRole("button", { name: /continue/i }).click()`. **Note:** existing pre-merge code has no sport picker; the spec's wizard cases must add a click on the netball/AFL `<SportPill>` (`role="button"`, name = `"AFL / Auskick"` or `"Netball"`) **between** the URL load and the team-name fill.

The spec's three test cases will use these patterns mixed:
1. **AFL wizard case** → onboarding.spec pattern, no sport pill click (AFL is default per brand or per `defaultSport="afl"`).
2. **Netball wizard case** → onboarding.spec pattern + sport pill click on "Netball".
3. **Team-settings quarter-length round-trip** → settings.spec pattern, factory-fast-forward + UI round-trip.

## 5. Verification Commands Library

For the planner to drop into `acceptance_criteria` blocks. Every command was tested in this session on the user's Windows bash setup unless noted.

### Hash verification (SCHEMA-PLAN §1) [TESTED]
```bash
# Both must produce identical sha256:
git show main:supabase/migrations/0024_super_admin.sql | sha256sum
git show multi-sport:supabase/migrations/0025_super_admin.sql | sha256sum
# Expected: 1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051 *-
```
**Windows bash portability:** Confirmed working in git-bash. `sha256sum` is part of msys/git-bash core. The trailing `*-` is normal for stdin input. No portability issues.

### Migration audit grep (SCHEMA-PLAN §4) [TESTED]
```bash
# Should return ONLY two matches: drop constraint teams_age_group_check
# (line 48) and drop constraint game_events_type_check (line 67), both
# in 0024_multi_sport.sql. Zero matches in 0026 or 0027 expected.
grep -nE "DROP|RENAME|REVOKE" \
  ../multi-sport/supabase/migrations/0024_multi_sport.sql \
  ../multi-sport/supabase/migrations/0026_team_quarter_seconds.sql \
  ../multi-sport/supabase/migrations/0027_game_quarter_seconds.sql
```
A clean output is **two lines**, both from `0024_multi_sport.sql` and both `drop constraint` (constraint relaxation, not destructive). Anything else is a red flag.

### Destructive-op audit (SCHEMA-PLAN §4) [TESTED]
```bash
# MUST exit 1 with no output. Any match here means SCHEMA-04 is in danger.
grep -E "DROP TABLE|DROP COLUMN|DROP POLICY|DROP TRIGGER|DROP FUNCTION" \
  ../multi-sport/supabase/migrations/0024_multi_sport.sql \
  ../multi-sport/supabase/migrations/0026_team_quarter_seconds.sql \
  ../multi-sport/supabase/migrations/0027_game_quarter_seconds.sql
```
Confirmed clean as of multi-sport @ `1277068`.

### Migration-content sanity reads [TESTED]
```bash
# 0024_multi_sport.sql lines 25-27 — the NOT NULL DEFAULT 'afl' line:
sed -n '25,27p' ../multi-sport/supabase/migrations/0024_multi_sport.sql
# Expected:
#   alter table public.teams
#     add column if not exists sport text not null default 'afl'
#       check (sport in ('afl','netball'));
```

### e2e spec invocation
```bash
# CRITICAL: this branch's package.json has NO 'e2e' or 'db:reset' script
# defined. The e2e setup script exists at scripts/e2e-setup.mjs but is
# not wired to npm run. See landmines §6.
#
# On this branch, run the spec directly via:
node scripts/e2e-setup.mjs e2e/tests/multi-sport-schema.spec.ts
#
# OR (if the planner wants to add the script as part of Phase 2 — it's a
# pre-existing gap that's worth fixing):
npm run e2e -- e2e/tests/multi-sport-schema.spec.ts   # only after adding "e2e": "node scripts/e2e-setup.mjs" to package.json scripts
#
# EXPECTED RED on this branch — the netball UI doesn't exist here yet.
# The spec is committed for Phase 3 to flip green.
```

### `tsc --noEmit` after factory extension (if planner extends `makeTeam` to accept `sport`)
```bash
npx tsc --noEmit
# Must exit 0. The factory will need a Sport import, which doesn't yet
# exist on this branch (Sport type ships in multi-sport). The planner
# should NOT add the Sport type to types.ts on this branch — that's
# Phase 3 work. Instead, the spec uses string literals "afl"/"netball"
# directly and does not extend the factory; the wizard cases drive UI
# (no factory needed for sport selection) and the settings round-trip
# uses makeTeam unchanged (default ageGroup "U10" + UI-driven settings).
```

### Phase-3 dry-run preview (NOT a Phase 2 task; recorded for SCHEMA-PLAN §6 handoff)
```bash
# Phase 3 will run this on the merged trunk (NOT on this branch):
npm run db:reset && supabase migration list
# Expected after Phase 3: 24 migrations applied in order, no pending,
# no duplicates.
```

## 6. Landmines (repo-specific gotchas)

For the planner to encode in `read_first` blocks of relevant tasks.

### L1. The `npm run e2e` script is NOT in this branch's package.json [VERIFIED]
- This branch's `package.json` has only: `dev`, `build`, `start`, `lint`, `typecheck`, `test`. **No `e2e`, no `db:reset`, no `db:start`.**
- multi-sport's `package.json` has `db:reset`, `db:start`, `db:stop`, `db:status` but still **no `e2e`**.
- `scripts/e2e-setup.mjs` exists on both branches and is the de-facto e2e runner. It self-bootstraps Supabase (status → start if needed → reset → playwright test).
- **Implication for spec acceptance criteria:** the planner cannot drop `npm run e2e -- path/to/spec.ts` into a verification block as-is. Either invoke `node scripts/e2e-setup.mjs path/to/spec.ts` directly, or **add the missing `e2e` script in this phase** (which is in scope per CONTEXT D-12: "may write… possibly an extension to e2e/fixtures/factories.ts" — script-wiring is a similar workflow gap that the spec needs in order to be runnable). Recommended: Phase 2 adds `"e2e": "node scripts/e2e-setup.mjs"` to package.json — this is a non-merge-conflicting addition since neither branch has it.
- `npx tsc --noEmit` is the script CLAUDE.md cites; this branch maps it via `typecheck` script, but `npx tsc --noEmit` works directly without the script alias.
- `npm test` IS defined and works (Vitest).

### L2. Factory `makeTeam` does NOT accept `sport` on either branch [VERIFIED]
- Both `vibrant-banzai-a73b2f/e2e/fixtures/factories.ts` and `multi-sport/e2e/fixtures/factories.ts` have the same `makeTeam` signature: `({ name?, ageGroup?, ownerId })` with `ageGroup: AgeGroup` (the narrow AFL enum). No `sport` parameter.
- The factory inserts `{ name, age_group: ageGroup, created_by: opts.ownerId }` — no `sport` column reference.
- After the merge, `teams.sport` is `NOT NULL DEFAULT 'afl'`, so `makeTeam` calls without `sport` produce AFL teams (DB default applies). **The factory needs no extension to support the team-settings round-trip case** — that case operates on a netball team. The planner has two choices:
  1. **Extend `makeTeam`** to accept `sport: "afl" | "netball"` (no `Sport` type import — string literal type) and pass it through. This is in scope per CONTEXT discretion: "Whether `e2e/fixtures/factories.ts` needs extending."
  2. **Insert a netball team via raw admin client** in the spec body (skip the factory). Less reusable but doesn't expand the factory surface during Phase 2.
- **Recommendation:** extend the factory. The settings round-trip needs `sport: 'netball'` to see the `<QuarterLengthInput>` (it only renders for netball teams per `settings/page.tsx:110`). Doing this once in the factory is cleaner than inline raw insert.

### L3. `Team.age_group: AgeGroup` is a narrow enum on this branch [VERIFIED]
- `src/lib/types.ts` on this branch has `Team.age_group: AgeGroup` (narrowed). Multi-sport widens it to `string` (D-06).
- Phase 2's spec writes `e2e/tests/...spec.ts` AGAINST the post-merge contract, so it's fine to use string literals like `"go"` or `"11u"` for netball age groups even though they don't exist in this branch's `AgeGroup` enum. **But:** if the planner extends `makeTeam` to accept those values, TypeScript on this branch will fail (the enum is narrow). Workarounds:
  - Use `as unknown as AgeGroup` (ugly but contained).
  - Loosen the factory's `ageGroup` parameter type to `string` — this matches the post-merge type and avoids a cast. Cleaner. Phase 3's typecheck pass will accept this unchanged.
  - Avoid using netball age groups in the factory entirely; insert raw via admin client for the netball settings test.
- **Recommendation:** loosen the factory parameter to `string` ageGroup. Documented in the change as "post-merge type alignment, lands ahead of D-06 widening."

### L4. `track_scoring` ships `NOT NULL DEFAULT false` from `0003_live_game.sql` [VERIFIED]
- Existing column. The wizard does **NOT** flip it based on age-group default; it stays `false` until the coach toggles. The `ScoringStep` shows the default as a *hint* but doesn't write it.
- **Spec assertion implication:** for both the AFL and netball wizard cases, after team creation `track_scoring` will be `false` (until the coach interacts with `<TrackScoringToggle>`). Don't assert anything else.

### L5. Setup wizard server-component uses service-role admin client (RLS workaround) [VERIFIED at setup/page.tsx:60-80]
- Comment in `setup/page.tsx` documents an intermittent RLS race on freshly-created teams: the cookie client occasionally fails to see the team that was just inserted (despite an AFTER INSERT trigger creating the membership in the same transaction).
- **Implication:** the spec's "create team via wizard, navigate to settings" path may have a similar timing edge case. Use `await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 })` per `onboarding.spec.ts:65` after submission. Don't assume immediate stability.

### L6. AFTER INSERT trigger on `teams` — never chain `.select()` to `.insert()` [VERIFIED via auto-memory + factories.ts:31-44]
- `handle_new_team` trigger creates the admin membership row AFTER INSERT. Chaining `.select()` to `.insert()` causes an RLS violation because the SELECT policy depends on the membership row that the trigger hasn't committed yet (within the same statement context).
- The factory uses two-step insert/select with explicit `.eq("name", name).eq("created_by", ownerId)` to dodge this.
- **Implication:** if the planner writes raw inserts in the spec (instead of using/extending the factory), the same two-step pattern must be used. The `setQuarterLengthSeconds` server action being used by the round-trip case does an UPDATE not an INSERT, so this concern is scoped to team creation only.

### L7. `<QuarterLengthInput>` renders ONLY when `sport === 'netball'` [VERIFIED at settings/page.tsx:110-125 and ScoringStep.tsx:69-75]
- On both team-settings and the wizard's ScoringStep, the input is **conditionally rendered** behind `sport === "netball"`.
- **Implication:** the team-settings round-trip test case MUST create a netball team. An AFL team will not render the input and the test will fail with "input not found." The third test case in the spec is therefore implicitly netball-only despite "for both sports" framing — the AFL test surface for `quarter_length_seconds` is "the input is not rendered" (which is essentially a non-test).
- **Spec design suggestion:** add a fourth assertion in the AFL wizard case that the QuarterLengthInput is NOT visible on team-settings for AFL teams. Easy negative-presence assertion: `await expect(page.getByLabel(/quarter length/i)).not.toBeVisible()`.

### L8. The unified setup wizard (NO separate NetballSetupWizard) [VERIFIED]
- Despite CONTEXT.md `<canonical_refs>` pointing at `../multi-sport/src/components/netball/` for "the wizard," that directory contains live-game and walkthrough components only.
- `TeamBasicsForm` is sport-aware via the `<SportPill>` toggle. `ScoringStep` is sport-aware via the `sportId` prop. The flow is **one wizard, two sports** — not two wizards.
- **Implication:** the planner must not write `read_first: ../multi-sport/src/components/netball/NetballSetupWizard.tsx`. The correct refs are:
  - `../multi-sport/src/app/(app)/teams/new/page.tsx` (entry)
  - `../multi-sport/src/components/setup/TeamBasicsForm.tsx` (sport pill + age picker)
  - `../multi-sport/src/components/setup/ScoringStep.tsx` (track_scoring + conditional QuarterLengthInput)
  - `../multi-sport/src/components/team/QuarterLengthInput.tsx`
  - `../multi-sport/src/app/(app)/dashboard/actions.ts` (createTeam server action with `sport` param)

### L9. The `getBrand()` default-sport hint [VERIFIED at teams/new/page.tsx:20-21]
- The wizard's default sport pill is set from `brand.brand.defaultSport`, which depends on the request host. `sirennetball.com.au` defaults netball; everything else defaults AFL.
- **Implication:** in tests, the host is `localhost:3000` — the brand resolution defaults to AFL. Both wizard cases must explicitly click the sport pill rather than relying on default. Or rely on AFL default for the AFL case and click "Netball" for the netball case. The brand resolution is host-based, not env-var-based; tests cannot easily mock the brand.

### L10. CLAUDE.md regression-test-first rule does NOT apply to Phase 2 [VERIFIED via reading CLAUDE.md]
- "Bug fixes must land with a regression test that fails against the pre-fix code" applies only to bug fixes. Phase 2 is a feature/migration phase, not a bug fix. The schema-migration rule (line 13 of CLAUDE.md) **does** apply: "Schema migrations must be accompanied by a spec that exercises the new column/table end-to-end through the UI." That's exactly SCHEMA-03.

## 7. Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.59.1 + Vitest 4.1.4 |
| Config files | `playwright.config.ts`, `vitest.config.ts` |
| Quick run command | `node scripts/e2e-setup.mjs e2e/tests/multi-sport-schema.spec.ts` (because `npm run e2e` script is missing — see L1) |
| Full suite command | `node scripts/e2e-setup.mjs` |
| Type check | `npx tsc --noEmit` |
| Unit tests | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SCHEMA-01 | Migration ordering monotonic; `migration up` clean from scratch | manual + Phase 3 verification | `npm run db:reset` (post-merge only — this branch can't verify because merge hasn't happened) | Phase 6 prod-clone validation |
| SCHEMA-02 | Backfill atomic with NOT NULL | static audit (read 0024_multi_sport.sql) + Phase 3 runtime | `sed -n '25,27p' ../multi-sport/supabase/migrations/0024_multi_sport.sql` (audit), `select count(*) from teams where sport is null` post-migration (Phase 6) | n/a — static |
| SCHEMA-03 — AFL wizard | Setup wizard creates AFL team with `sport='afl'`, `track_scoring=false` | e2e | `node scripts/e2e-setup.mjs e2e/tests/multi-sport-schema.spec.ts` (red on this branch, green Phase 3+) | ❌ Wave 0 |
| SCHEMA-03 — netball wizard | Setup wizard creates netball team with `sport='netball'` | e2e | (same) | ❌ Wave 0 |
| SCHEMA-03 — team-settings round-trip | `quarter_length_seconds` UI persists 480 in DB; reload reflects it | e2e | (same) | ❌ Wave 0 |
| SCHEMA-04 | No DROP TABLE/COLUMN/POLICY/TRIGGER/FUNCTION; existing AFL data survives | static audit | `grep -E "DROP TABLE\|DROP COLUMN\|DROP POLICY\|DROP TRIGGER\|DROP FUNCTION" ../multi-sport/supabase/migrations/{0024,0026,0027}*.sql` (must exit 1) | n/a — static |
| SCHEMA-04 (live) | AFL data queryable through merged code without RLS errors | manual | Phase 6 prod-clone validation (deferred per D-17) | n/a — Phase 6 |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` (after factory extension, if any) + the four `grep`/`sed` audit commands (cheap, sub-second).
- **Per wave merge:** Try running the e2e spec — **expected red on this branch**, that's fine; record the failure mode in `02-PLAN.md` verification block as "expected red, Phase 3 flips green."
- **Phase gate:** All audit commands return their expected outputs; spec source committed; no writes to `supabase/migrations/`.

### Dimensions that matter for Phase 2

| Dimension | What's checked | How |
|-----------|----------------|-----|
| **dim-1 Syntactic correctness of the spec** | Spec parses, types check, locators are valid Playwright API | `npx tsc --noEmit` + Playwright's `--list` mode |
| **dim-2 Component naming accuracy** | Spec references real components on multi-sport (`TeamBasicsForm`, `ScoringStep`, `QuarterLengthInput`, `setQuarterLengthSeconds`) | Cross-worktree grep against `../multi-sport/src/` (verified in §3 above) |
| **dim-3 Backfill semantics audit** | `0024_multi_sport.sql:25-27` is unchanged and atomic; SCHEMA-02 satisfied as-shipped | `sed -n '25,27p'` on the file; line-by-line audit logged in `02-SCHEMA-PLAN.md §3` |
| **dim-4 Phase 6 handoff completeness** | `02-SCHEMA-PLAN.md §6` enumerates the prod-clone acceptance criteria so Phase 6 doesn't drop them | Plan-checker reviews §6 has all five items from CONTEXT `<specifics>` "Phase 6 handoff acceptance criteria" |
| **dim-5 Read-only invariant** | No writes to `supabase/migrations/` on this branch (D-11); writes ONLY to `e2e/`, `.planning/phases/02-.../`, possibly `e2e/fixtures/factories.ts`, possibly `package.json` (for the missing `e2e` script) | `git status -- supabase/migrations/` clean before/after every task |
| **dim-6 Hash equality re-confirmation** | sha256 of main:0024_super_admin equals sha256 of multi-sport:0025_super_admin | Two `git show ... | sha256sum` calls; both = `1761d40…3051` |

### Wave 0 Gaps
- [ ] `e2e/tests/multi-sport-schema.spec.ts` (or planner-chosen filename) — covers SCHEMA-03 across three test cases.
- [ ] `e2e/fixtures/factories.ts` extension — `makeTeam` accepts `sport?: "afl" | "netball"` (default `"afl"` for backward compat) and `ageGroup` parameter widened to `string` (post-merge type alignment).
- [ ] `package.json` — add `"e2e": "node scripts/e2e-setup.mjs"` script. **Optional but recommended** — without it, the spec can only be invoked via the raw `node` command, which is brittle for CI integration. CONTEXT.md doesn't explicitly mention this; planner can choose to scope in or defer to Phase 3.
- [ ] `.planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md` — the audit + handoff deliverable (six suggested sections per CONTEXT discretion).

## 8. Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Phase 2 doesn't touch auth — `auth.setup.ts` storageState pattern is inherited unchanged |
| V3 Session Management | no | Inherited via Playwright `storageState` — no changes |
| V4 Access Control | partial | The `<QuarterLengthInput>` and `<TrackScoringToggle>` server actions both check `is_team_admin()` server-side; the spec runs as super-admin (full membership). No new authz surface introduced. |
| V5 Input Validation | partial | `QuarterLengthInput` validates 1-30 minutes client-side AND server-side (`setQuarterLengthSeconds` checks range). Spec verifies the happy path; a defence-in-depth bonus would add an out-of-range case, but that's out of scope per D-15. |
| V6 Cryptography | no | No crypto changes |
| V8 Data Protection | no | No PII added; `quarter_length_seconds` is a config integer |
| V11 Business Logic | partial | Sport selection is the entry point for sport-specific business logic; spec exercises the happy path but does not test "AFL coach cannot create a netball team if they're locked to one" (no such constraint exists post-merge — coaches can run multi-sport teams). |

### Known Threat Patterns for Supabase + Next.js

| Pattern | STRIDE | Standard Mitigation | Phase 2 Posture |
|---------|--------|---------------------|------------------|
| RLS bypass via service-role client in browser | Information Disclosure | Service-role only in server actions / server components / scripts. **Never `NEXT_PUBLIC_`-prefixed.** | Inherited; spec uses `createAdminClient()` only in `e2e/fixtures/`, never in browser code |
| Migration drops table → data loss | Tampering / DoS | Pre-merge tags + audit + Phase 6 prod-clone validation | Audit confirms zero `DROP TABLE/COLUMN/POLICY/TRIGGER/FUNCTION`; D-08 tags exist; Phase 6 validation deferred per D-17 |
| Trigger-RLS race on AFTER INSERT | Information Disclosure | Two-step insert/select pattern in factories | Factory already implements (factories.ts:31-44); spec inherits |
| `.select()` chained to `.insert()` after RLS-policy-dependent trigger | Tampering | Memory note: never chain (auto-memory `feedback_supabase_insert_returning.md`) | Spec must respect; documented in L6 |
| Hard-coded test credentials in committed code | Information Disclosure | `.env.test` not committed; `TEST_SUPER_ADMIN_*` env vars resolved at runtime | Inherited; spec uses `process.env.TEST_SUPER_ADMIN_EMAIL` per `settings.spec.ts:19-22` |

**Security verdict:** Phase 2 introduces minimal new attack surface. Migration-content side has been audited (no destructive ops). Spec writes test data via service-role in test scope only. No `block_on: high` threats triggered.

## 9. Out-of-Scope Reminders (locked-decision guardrails for the planner)

The planner must NOT, under any circumstances:

1. **Propose alternatives to D-05 / D-10** (delete main's `0024_super_admin.sql`). Hash equality is verified twice. The de-dup is locked.
2. **Propose a multi-spec test design.** D-13 locks one spec file, journey-level. Multi-file spec design is out of scope.
3. **Add `games.quarter_length_seconds` UI tests.** D-15 explicitly defers this to Phase 5 if a gap analysis flags it.
4. **Add `track_scoring=false` UI suppression tests** (live screen, summary card, walkthrough scoring step). D-15 locks this to Phase 4 / NETBALL-04.
5. **Write to `supabase/migrations/` on this branch.** D-11 locks the migrations tree as read-only with respect to merge. The rename/delete is documented in `02-SCHEMA-PLAN.md` for Phase 3.
6. **Run prod-clone validation in Phase 2.** D-04 / D-17 defer this to Phase 6.
7. **Redirect main-side clock surfaces to `getEffectiveQuarterSeconds`.** D-07 locks this to Phase 3.
8. **Patch `tsc --noEmit` errors from the `Team.age_group: AgeGroup` widening.** D-06 locks this to Phase 3.
9. **Add new framework dependencies.** No new dependencies in this milestone per the project CONSTRAINTS (Playwright 1.59.1 + Vitest 4.1.4 + Supabase JS 2.45.4 — no upgrades).
10. **Expect the spec to pass on this branch.** D-12 locks: spec source committed here, runs green only post-Phase-3. The Phase 2 plan's `verification` block must explicitly say "expected red on this branch."

## Architectural Responsibility Map

For Phase 2's deliverables:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Migration de-dup planning (delete main's 0024) | Documentation (`02-SCHEMA-PLAN.md`) | Phase 3 file-op | Read-only on this branch per D-11; Phase 3 acts on the plan |
| Migration content audit (DROP/RENAME/REVOKE absence) | Documentation (`02-SCHEMA-PLAN.md`) | — | Pure static audit, recorded in plan |
| Backfill atomicity audit (NOT NULL DEFAULT) | Documentation (`02-SCHEMA-PLAN.md`) | — | Static audit + Phase 6 runtime confirmation |
| AFL setup wizard test | E2E spec (Playwright on Pixel 7) | — | Drives Next.js dev server end-to-end; no API/Backend tier alone |
| Netball setup wizard test | E2E spec (Playwright on Pixel 7) | — | Same |
| Team-settings quarter-length round-trip | E2E spec (Playwright) + DB poll via service-role | — | UI drives, DB confirms via `expect.poll()` |
| Factory extension (`makeTeam` sport param) | Test infrastructure (`e2e/fixtures/factories.ts`) | — | Service-role admin client writes |
| Phase 6 handoff doc | Documentation (`02-SCHEMA-PLAN.md §6`) | — | Pure planning artifact |

## Sources

### Primary (HIGH confidence)
- `../multi-sport/supabase/migrations/0024_multi_sport.sql` — read line-by-line in this session
- `../multi-sport/supabase/migrations/0026_team_quarter_seconds.sql` — read full
- `../multi-sport/supabase/migrations/0027_game_quarter_seconds.sql` — read full
- `../multi-sport/src/lib/sports/index.ts` — `getEffectiveQuarterSeconds` resolution priority verified
- `../multi-sport/src/lib/sports/netball/index.ts` — netball age groups, `tracksScoreDefault` per age group
- `../multi-sport/src/lib/sports/afl/index.ts` — AFL config adapter
- `../multi-sport/src/components/setup/TeamBasicsForm.tsx` — sport picker, default age group logic
- `../multi-sport/src/components/setup/ScoringStep.tsx` — conditional `<QuarterLengthInput>` rendering
- `../multi-sport/src/components/team/QuarterLengthInput.tsx` — input control + save action
- `../multi-sport/src/app/(app)/teams/new/page.tsx` — wizard entry point
- `../multi-sport/src/app/(app)/teams/[teamId]/setup/page.tsx` — setup router
- `../multi-sport/src/app/(app)/teams/[teamId]/settings/page.tsx` — team settings
- `../multi-sport/src/app/(app)/dashboard/actions.ts` — `createTeam` server action signature
- `../multi-sport/e2e/fixtures/factories.ts` — `makeTeam` signature (no `sport` param)
- `vibrant-banzai-a73b2f/e2e/fixtures/factories.ts` — same
- `vibrant-banzai-a73b2f/e2e/tests/settings.spec.ts` — primary analog for round-trip case
- `vibrant-banzai-a73b2f/e2e/tests/onboarding.spec.ts` — primary analog for wizard case
- `vibrant-banzai-a73b2f/scripts/e2e-setup.mjs` — e2e bootstrap (replaces missing `npm run e2e`)
- `vibrant-banzai-a73b2f/playwright.config.ts` — config + storageState behaviour
- `vibrant-banzai-a73b2f/package.json` — confirmed missing `e2e` and `db:reset` scripts
- `vibrant-banzai-a73b2f/CLAUDE.md` — schema-migration-needs-e2e rule
- `vibrant-banzai-a73b2f/e2e/README.md` — "When to add a test" table
- `vibrant-banzai-a73b2f/.planning/REQUIREMENTS.md` — SCHEMA-01..04 wording
- `vibrant-banzai-a73b2f/.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` — §2 migration conflicts, §5 schema additions, §9 D-01..D-09
- `vibrant-banzai-a73b2f/.planning/phases/01-divergence-inventory-merge-plan/01-SUMMARY.md` — Hand-off to Phase 2 section
- `vibrant-banzai-a73b2f/.planning/codebase/TESTING.md` — fixture/factory patterns
- `vibrant-banzai-a73b2f/.planning/codebase/STACK.md` — Supabase + Playwright versions
- `vibrant-banzai-a73b2f/.planning/phases/02-schema-reconciliation/02-CONTEXT.md` — locked decisions D-10..D-18

### Verified live in this session
- `git show main:supabase/migrations/0024_super_admin.sql | sha256sum` ⇒ `1761d40…3051`
- `git show multi-sport:supabase/migrations/0025_super_admin.sql | sha256sum` ⇒ `1761d40…3051`
- `grep -nE "DROP|RENAME|REVOKE"` across the three new migrations ⇒ exactly 2 hits, both `drop constraint` (relaxation, not destructive)
- `grep -E "DROP TABLE|DROP COLUMN|DROP POLICY|DROP TRIGGER|DROP FUNCTION"` across the three ⇒ exit 1 (no matches)
- Directory listing of multi-sport `src/components/netball/` (10 files; none match `*Setup*`)

### Tertiary (None) — every claim above was verified against a concrete file or shell output.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| (none) | — | — | All claims verified against multi-sport@1277068, vibrant-banzai-a73b2f@8d561da, or live shell output in this session |

## Project Constraints (from CLAUDE.md)

Directives that the planner must encode in task `acceptance_criteria` or `verification` blocks:

1. **Schema migrations require an e2e spec exercising the new column/table through the UI, not just the DB layer.** SCHEMA-03 is the direct application. The spec must drive UI (`page.click(...)`, `page.getByLabel(...).fill(...)`) — not write directly via the admin client and assert.
2. **Testing is part of "done."** The phase is not complete until: (a) the relevant spec is committed, (b) `npm run e2e` (or `node scripts/e2e-setup.mjs` per L1) has been run locally — **expected red on this branch**, that's fine, (c) `npx tsc --noEmit` passes, (d) `npm test` (Vitest) passes. The Phase 2 verification block must capture each of these explicitly.
3. **Bug fixes need regression-test-first.** **Does NOT apply** to Phase 2 (this is feature/migration work, not a bug fix).
4. **Small, reviewable commits.** The phase plan should split into discrete commits: hash re-verification + audit grep, then SCHEMA-PLAN.md write, then factory extension (if any), then spec author, then SUMMARY/COMPLETE. Mega-commits are anti-pattern.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version pinned and verified against `package.json` on both branches.
- Architecture: HIGH — every component path read in full, sport-conditional rendering confirmed at line numbers.
- Pitfalls: HIGH — landmines L1 (missing e2e script), L2 (factory needs `sport`), L7 (QuarterLengthInput netball-only) verified in this session against the actual files.
- Migration semantics: HIGH — `0024_multi_sport.sql:25-27` reviewed; Postgres NOT NULL DEFAULT semantics are well-documented.

**Research date:** 2026-04-29
**Valid until:** Until Phase 3 merges — once the merge happens, "main" branch behaviour and "vibrant-banzai-a73b2f" branch behaviour diverge from these snapshots, but the locked decisions remain intact.

## RESEARCH COMPLETE
