# Phase 2: Schema reconciliation - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 produces the **schema reconciliation plan and the schema-migration e2e spec**, not the merge itself. By the end of Phase 2 the team has:

1. **A verified renumbering plan** (`02-SCHEMA-PLAN.md`) that documents the exact file-ops Phase 3's merge resolution will perform on `supabase/migrations/`. Backed by re-confirmed sha256 equality between `main:supabase/migrations/0024_super_admin.sql` and `multi-sport:supabase/migrations/0025_super_admin.sql`.
2. **A migration-content audit** confirming SCHEMA-02 is satisfied as-shipped: `0024_multi_sport.sql` does `ADD COLUMN sport text NOT NULL DEFAULT 'afl' CHECK (sport IN ('afl','netball'))` in a single statement, so existing rows are valid the moment NOT NULL applies.
3. **A migration-content audit** for SCHEMA-04: confirms `0024_multi_sport.sql`, `0026_team_quarter_seconds.sql`, and `0027_game_quarter_seconds.sql` perform no DROP/RENAME on existing tables, no breaking RLS changes, and add only nullable or defaulted columns to existing rows. Live "queryable through merged code" verification is explicitly deferred to Phase 6's prod-clone preview.
4. **A new Playwright spec** (`e2e/tests/multi-sport-schema.spec.ts` or similar) authored on this branch, exercising `teams.sport`, `teams.track_scoring`, and `teams.quarter_length_seconds` end-to-end through the setup wizard and team settings UI for both AFL and netball. The spec is not expected to pass on this branch — it is expected to pass once Phase 3's merge lands the netball UI.

**Hard scope discipline — what this phase MUST NOT do:**
- **No writes to `supabase/migrations/` on this branch.** The rename/delete is part of Phase 3's merge resolution, NOT a Phase 2 task. The Phase 1 read-only-with-respect-to-merge invariant carries forward over the migrations tree.
- No actual merge of branches. That's Phase 3.
- No netball UI changes — they don't exist on this branch yet.
- No prod-clone validation. That's Phase 6.
- No `getEffectiveQuarterSeconds` consumer redirects on main-side surfaces. That's Phase 3 (D-07).

**What this phase MAY write to source:**
- One new file under `e2e/tests/` for the schema-migration spec.
- Possibly an extension to `e2e/fixtures/factories.ts` if existing factories don't accept `sport` / `quarter_length_seconds` overrides.

**What this phase writes to `.planning/`:**
- `.planning/phases/02-schema-reconciliation/02-CONTEXT.md` (this file)
- `.planning/phases/02-schema-reconciliation/02-PLAN.md` (next step — `/gsd-plan-phase 2`)
- `.planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md` (the renumbering + audit deliverable)
- `.planning/phases/02-schema-reconciliation/02-DISCUSSION-LOG.md` (audit trail of this discussion)

</domain>

<decisions>
## Implementation Decisions

### Migration de-dup mechanic (D-05 follow-up from Phase 1)

- **D-10:** Main's `supabase/migrations/0024_super_admin.sql` will be **deleted outright** during Phase 3's merge resolution. It is not preserved as a renamed-and-skipped no-op file. The byte-identical content is already canonical under multi-sport's `0025_super_admin.sql`.
  - Hash verification at write time:
    - `git show main:supabase/migrations/0024_super_admin.sql | sha256sum` → `1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051`
    - `git show multi-sport:supabase/migrations/0025_super_admin.sql | sha256sum` → `1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051`
    - Match confirmed at `main@80a04eb` / `multi-sport@1277068`.
  - Phase 2 plan task: re-run those two `git show ... | sha256sum` calls before issuing the SCHEMA-PLAN.md, to catch any divergence between Phase 1's check and Phase 2's recording.

### Phase 2 boundary — document-only on this branch

- **D-11:** Phase 2 does **not** modify `supabase/migrations/` on the current worktree. The rename/delete plan is documented in `02-SCHEMA-PLAN.md` for Phase 3 to act on. This preserves the merge as the single moment migrations are reconciled — avoids "main" branch state that lies about its history.
- **D-12:** Phase 2 **does** write the new e2e spec source file on this branch (under `e2e/tests/`). It is committed on `claude/vibrant-banzai-a73b2f` as part of the Phase 2 plan artifacts. Running it green is **not** a Phase 2 acceptance criterion — that's Phase 3 verification's job once the merged trunk has the netball UI.

### e2e spec scope (SCHEMA-03)

- **D-13:** One spec file, journey-level, exercising the new schema columns through real UI for both sports. Filename `e2e/tests/multi-sport-schema.spec.ts` (or similar — planner picks final).
- **D-14:** Test surfaces included:
  - **Setup wizard — AFL team:** click through wizard, select AFL, assert created team has `sport='afl'`. Verify default `track_scoring` lands per the existing migration default (`false`, from `0003_live_game.sql`) — i.e. the wizard does NOT silently flip it for AFL.
  - **Setup wizard — netball team:** click through wizard, select netball, assert created team has `sport='netball'`. Verify `track_scoring` is set per the netball wizard's default (likely `false` or wizard-controlled — planner reads multi-sport's NetballSetupWizard or equivalent to confirm).
  - **Team settings — quarter_length_seconds round-trip:** load team settings, set custom quarter length (e.g. 480 → 8 min), reload, verify persisted in DB and reflected in UI. Hits the per-team override (`teams.quarter_length_seconds` from `0026`).
- **D-15:** Test surfaces explicitly **excluded** from this spec:
  - `games.quarter_length_seconds` (per-game override from `0027`) — not in spec. Trade-off accepted: a column without a UI test in this milestone, but the resolution semantics are exercised by `getEffectiveQuarterSeconds` unit tests on multi-sport. Note for the Phase 5 test-green pass: if this gap matters, add a follow-up spec then.
  - `track_scoring=false` suppression on the live screen (score-bug numbers, walkthrough scoring step, summary card "Goals:" line, GS/GA tap no-op). This is **NETBALL-04 / Phase 4** scope and would be duplicate work to also test in Phase 2.

### SCHEMA-04 (existing AFL data survives migration intact)

- **D-16:** Phase 2 covers the **migration-content side only**. Concretely:
  - Code-read each multi-sport migration not present on main (`0024_multi_sport.sql`, `0026_team_quarter_seconds.sql`, `0027_game_quarter_seconds.sql`) and assert in `02-SCHEMA-PLAN.md`:
    - No `DROP TABLE` / `DROP COLUMN` on tables that hold existing AFL data (`teams`, `players`, `games`, `game_events`, `game_availability`, `share_tokens`).
    - No `RENAME` of columns existing AFL queries depend on.
    - No RLS policy changes that gate existing AFL reads (e.g. revoking `is_team_member()` checks that AFL relies on).
    - All new columns are either nullable (`teams.quarter_length_seconds`, `games.quarter_length_seconds`) or NOT NULL with a DEFAULT applied transactionally (`teams.sport`).
    - Confirm `0024_multi_sport.sql`'s drop of the `teams_age_group_check` constraint does not break existing AFL `age_group` values (existing values are AFL U8..U17, all valid as plain strings).
- **D-17:** "Queryable through merged code without RLS or null errors" is **deferred to Phase 6** prod-clone validation. Phase 2's `02-SCHEMA-PLAN.md` ends with an explicit handoff section listing the Phase 6 acceptance criteria for SCHEMA-04 ("apply migration set against prod clone, then load N existing AFL teams via merged code, observe no errors").

### Artifact location

- **D-18:** Phase 2's deliverables live in its own phase directory, not in Phase 1's MERGE-NOTES.md.
  - `02-SCHEMA-PLAN.md` — renumbering plan + Phase 3 file-op spec + SCHEMA-02/03/04 verification matrix + e2e spec design notes + Phase 6 handoff.
  - `02-PLAN.md` — the executable plan from `/gsd-plan-phase 2`.
  - `02-DISCUSSION-LOG.md` — written during this session.
  - This `02-CONTEXT.md`.

### Carrying forward from Phase 1 (re-affirmed, not re-decided)

- **D-01 → still valid:** Multi-sport branch becomes the new trunk; main absorbs into it via Phase 3 merge.
- **D-02 → still valid:** Same Vercel + same Supabase project; no fresh deploy.
- **D-03 → still valid:** `teams.sport = 'afl'` backfill — confirmed shipped via single-statement `NOT NULL DEFAULT 'afl'` in `0024_multi_sport.sql`.
- **D-05 → fully verified:** Multi-sport's migration set is the trunk numbering; main's `0024_super_admin.sql` byte-equals multi-sport's `0025_super_admin.sql`; net new migrations from main = 0.
- **D-06 (`Team.age_group: string` widening) → Phase 3 work, NOT Phase 2.** Phase 2 only confirms the `teams_age_group_check` drop in `0024_multi_sport.sql` does not break existing AFL data. The actual `tsc --noEmit` patch of narrowed-enum consumers is Phase 3.
- **D-07 (`getEffectiveQuarterSeconds` as sole quarter-length source) → Phase 3 work, NOT Phase 2.** Phase 2 spec round-trips `teams.quarter_length_seconds` through team settings UI; it does not redirect any live-game clock surface.
- **D-08 → done.** Pre-merge tags exist on origin.
- **D-09 → still valid for Phase 7:** No `git push --force` to main during cutover.

### Claude's Discretion

- **Spec filename.** `e2e/tests/multi-sport-schema.spec.ts` is suggested but the planner can pick a different name if it fits the e2e/README.md "one file per journey family" convention better (e.g. `team-creation.spec.ts` if there isn't already one).
- **Whether `e2e/fixtures/factories.ts` needs extending.** The planner reads the existing `makeTeam` signature; if it already accepts `{ sport }` overrides, no factory change. If not, extending the factory is in scope for Phase 2 (it serves the SCHEMA-03 spec). The wizard-driven test cases must still drive UI, not factories — factories are only for fast-forwarding past prerequisites in the team-settings round-trip case.
- **Whether to read `multi-sport` branch source while authoring the spec.** Yes — cross-worktree reads from `../multi-sport/` are fine and necessary so the spec can name real components (`NetballSetupWizard`, the team-settings page route, etc.). The spec is authored against the post-merge contract.
- **Format of `02-SCHEMA-PLAN.md`.** A markdown doc with clear sections; planner picks structure. Suggested sections: §1 Hash verification, §2 File ops for Phase 3, §3 SCHEMA-02 audit (backfill correctness), §4 SCHEMA-04 audit (existing-data safety), §5 SCHEMA-03 spec design, §6 Phase 6 handoff (prod-clone acceptance criteria).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project guidance
- `CLAUDE.md` — project rules. Critical: §"Testing is part of done" — schema migrations require an e2e spec exercising the new column/table through the UI. SCHEMA-03 is a direct application of this rule.
- `e2e/README.md` — "When to add a test" table; especially the "Running a schema migration" row.
- `.planning/PROJECT.md` — milestone context, locked decisions table, "Notable engineering details from multi-sport worth preserving".
- `.planning/REQUIREMENTS.md` — SCHEMA-01..04 wording (lines 18-21).
- `.planning/ROADMAP.md` — Phase 2 success criteria (lines 36-46).

### Phase 1 outputs (consumed directly)
- `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` — especially:
  - §1 Branch summary (HEAD shas, fork point)
  - §2 Migration-number conflicts (the original D-05 analysis Phase 2 verifies and acts on)
  - §5 Shared types and schemas (column-by-column inventory of what `0024_multi_sport.sql`, `0026_team_quarter_seconds.sql`, `0027_game_quarter_seconds.sql` add)
  - §9 D-01..D-09 locked decisions
- `.planning/phases/01-divergence-inventory-merge-plan/01-SUMMARY.md` — "Hand-off to Phase 2 (schema reconciliation)" section explicitly enumerates Phase 2's three handoff items.

### Codebase intel
- `.planning/codebase/STACK.md` — Supabase + Playwright versions, e2e setup chain, env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TEST_SUPER_ADMIN_*`).
- `.planning/codebase/TESTING.md` — e2e fixture/factory patterns, `auth.setup.ts` storageState pattern, "no DB mocks" cardinal rule, `expect.poll()` idiom for DB round-trip assertions.
- `.planning/codebase/CONCERNS.md` §"Live game state machine" — why netball-related schema additions touch a fragile area; informs the Phase 6 handoff in `02-SCHEMA-PLAN.md`.

### Multi-sport source (cross-worktree reads — required for SCHEMA-03 spec authoring)
- `../multi-sport/supabase/migrations/0024_multi_sport.sql` — verified content; the migration that adds `teams.sport` and widens `game_events.type`.
- `../multi-sport/supabase/migrations/0026_team_quarter_seconds.sql` — adds `teams.quarter_length_seconds nullable`.
- `../multi-sport/supabase/migrations/0027_game_quarter_seconds.sql` — adds `games.quarter_length_seconds nullable`.
- `../multi-sport/src/lib/sports/index.ts` — `getEffectiveQuarterSeconds` resolution priority (informs the team-settings round-trip assertion).
- `../multi-sport/src/components/team/QuarterLengthInput.tsx` — the actual UI control for the team-settings round-trip case.
- `../multi-sport/src/components/netball/` — netball setup-wizard / live components the spec needs to know about by name.

### Branch references
- `main` HEAD `80a04eb` — production trunk at the time of writing.
- `multi-sport` HEAD `1277068` — netball MVP trunk.
- `pre-merge/main`, `pre-merge/multi-sport` — annotated tags on origin (Phase 1 D-08).

### Auto-memory (auto-loaded via MEMORY.md)
- `feedback_supabase_insert_returning.md` — never chain `.select()` to `.insert()` when an AFTER INSERT trigger creates rows the SELECT policy depends on. The schema spec's data-creation paths (factories or admin client writes) need to respect this.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`e2e/fixtures/supabase.ts`** — `createAdminClient()`, `createTestUser()`, `deleteTestUser()`. The schema spec uses these to provision a clean user per test, with try/finally cleanup. Already proven across 20+ specs on main.
- **`e2e/fixtures/factories.ts`** — `makeTeam`, `makePlayers`, `makeGame`. The team-settings round-trip case uses `makeTeam` to fast-forward; the wizard cases drive UI directly. `makeTeam` may need a `sport` parameter on the post-merge codebase — the planner checks multi-sport's signature.
- **`playwright/.auth/super-admin.json`** — auth state reused via `storageState`; the schema spec inherits the standard chromium project, no setup change needed.
- **`expect.poll()`** — the established idiom for DB round-trip assertions (see `availability.spec.ts`). The team-settings round-trip case will likely use this to confirm `quarter_length_seconds` is persisted before reloading the UI.
- **Pixel 7 viewport** — Playwright default device. Setup-wizard UI on multi-sport is mobile-first; the spec inherits this.

### Established Patterns
- **"Factories for setup, UI for feature under test"** (from e2e/README.md). The wizard tests MUST click through the form — they are the feature under test. The team-settings round-trip MAY use `makeTeam` to fast-forward past wizard, then drive the settings UI for the round-trip step itself.
- **Single-word player names** in factories (e.g. "Alicia") so `getByText(player.full_name)` works without abbreviation logic. Inherit unchanged.
- **No DB mocks.** Tests run against the real local Supabase container started by `npm run dev`. The spec's `track_scoring` and `sport` assertions read the actual DB row.
- **Per-test cleanup** via try/finally + `deleteTestUser()`. The schema spec follows the same pattern — each test owns its team and tears it down.

### Integration Points
- **`scripts/e2e-setup.mjs`** runs once before Playwright; loads `.env.test`. The schema spec inherits this — no env var changes.
- **`e2e/tests/auth.setup.ts`** — runs once, seeds super-admin, saves storageState. The schema spec runs as a normal chromium project, inherits storageState. No setup change.
- **Migration application chain.** The `npm run db:reset` flow (Supabase CLI) applies all migrations in numeric order. Once Phase 3 lands the merged migration set, `npm run db:reset` on the merged trunk will exercise the renumbering plan. Phase 2's `02-SCHEMA-PLAN.md` calls this out as the natural Phase 3 verification step.

</code_context>

<specifics>
## Specific Ideas

- **Hash verification commands** that go directly into Phase 2 plan tasks:
  - `git show main:supabase/migrations/0024_super_admin.sql | sha256sum` (expected `1761d40…`)
  - `git show multi-sport:supabase/migrations/0025_super_admin.sql | sha256sum` (expected same)
- **Migration content audit commands** (read-only; cross-worktree):
  - `cat ../multi-sport/supabase/migrations/0024_multi_sport.sql` — confirm transactional `NOT NULL DEFAULT 'afl'` (verified: line 25-27).
  - `cat ../multi-sport/supabase/migrations/0026_team_quarter_seconds.sql` — confirm `teams.quarter_length_seconds integer null` (no constraint, app-validated).
  - `cat ../multi-sport/supabase/migrations/0027_game_quarter_seconds.sql` — confirm `games.quarter_length_seconds integer null`.
  - `grep -E "DROP|RENAME|REVOKE" ../multi-sport/supabase/migrations/0024_multi_sport.sql ../multi-sport/supabase/migrations/0026*.sql ../multi-sport/supabase/migrations/0027*.sql` — expected: only the `teams_age_group_check` constraint drop, nothing destructive on tables.
- **e2e spec test names** (suggested):
  - `"AFL setup wizard creates team with sport='afl' and default track_scoring"`
  - `"netball setup wizard creates team with sport='netball' and netball-default track_scoring"`
  - `"team settings round-trips quarter_length_seconds for both AFL and netball"`
- **Phase 6 handoff acceptance criteria** that go into `02-SCHEMA-PLAN.md` §6 (so Phase 6 doesn't drop them):
  - Apply the merged migration set against a Supabase prod-clone DB.
  - Load at least one pre-existing AFL team through the merged code; verify no RLS errors, no null-sport panics.
  - Verify `select count(*) from teams where sport is null` returns 0.
  - Verify `select distinct sport from teams` returns only `'afl'` (since prod has only ever been AFL).
  - Verify at least one pre-existing AFL share token still resolves through `/run/[token]`.
- **Spec is committed but expected red on this branch.** Phase 2's `02-PLAN.md` `verification` block notes that `npm run e2e` will fail on this branch because the netball wizard / team-settings UI doesn't exist here. That is expected. Phase 3's verification is what flips the spec green.

</specifics>

<deferred>
## Deferred Ideas

- **`games.quarter_length_seconds` (per-game override) UI test.** Not in Phase 2's spec. If a Phase 5 test-green gap analysis flags this column as untested, add a follow-up spec then. The resolution semantics are still covered by `getEffectiveQuarterSeconds` unit tests on multi-sport.
- **`track_scoring=false` suppression on the live screen / summary card / walkthrough.** Belongs to Phase 4 (NETBALL-04). Phase 2's spec only asserts the `track_scoring` value persists at team level, not its UI consequences.
- **Squash-merge vs merge-commit during Phase 3.** Surfaced in Phase 1 §9; still deferred. Phase 2 doesn't lock this — Phase 3 picks based on PR-review preference.
- **Whether the merged trunk eventually gets `games.quarter_length_seconds` exposed in the game-edit form.** UI/UX scope, not schema. If exposed, it would need its own UI design pass and probably belongs in a v2 milestone.
- **Whether `teams.track_scoring` should be defaultable per-sport instead of a single global default.** Currently `not null default false` from `0003_live_game.sql`. AFL teams typically toggle it on; netball teams may toggle independently. If a coach friction issue surfaces post-merge, revisit. Not in this milestone.
- **CI integration of the migration ordering check.** A linter that flags any new migration sharing a number with an existing one would prevent recurrence of the 0024 collision. Defer to a follow-up milestone — manual is fine for this one-shot reconciliation.

</deferred>

---

*Phase: 02-schema-reconciliation*
*Context gathered: 2026-04-29 via /gsd-discuss-phase*
