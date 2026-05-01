---
phase: 05-test-and-type-green
plan: 01
subsystem: seed-data
tags: [TEST-05, kotara-koalas, supabase-seed, netball-fixture, auth-bcrypt]

# Dependency graph
requires:
  - phase: 04-01
    provides: "e2e/helpers/seed-audit.ts auditKotaraKoalas() — verification primitive"
provides:
  - "Kotara Koalas team (5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11) + 9 active players + 5 simulated games queryable in local Supabase after `npm run db:reset`"
  - "TEST-05 acceptance gate closed (auditKotaraKoalas returns { present: true, gameCount: 5, playerCount: 9 })"
  - "netball-quarter-break.spec.ts:380 Kotara-optional test FLIPPED from SKIP to PASS"
  - "Pre-seeded test-super-admin auth row (deterministic UUID 00000000-…-bbbb, bcrypt hash of TEST_SUPER_ADMIN_PASSWORD) — converges with ensureTestUser idempotent path; auth.setup.ts uses it as-is"
  - "team_memberships row granting test-super-admin admin access to Kotara so the live-game route loads (RLS is_team_member needs the row; is_super_admin doesn't bypass team RLS)"
affects: [05-05]

# Tech tracking
tech-stack:
  added: []  # Pure SQL — no new libraries; pgcrypto already shipped via migration 0001
  patterns:
    - "Idempotent DO-block seed using ON CONFLICT DO NOTHING per row + per-game guard SELECT for game_events (skip if events already present for that game). Re-running `psql -f seed.sql` outside of `db:reset` is safe."
    - "Synthetic auth.users seeding via direct INSERT — populate ALL text/varchar token columns with empty strings (not NULL) so GoTrue's listUsers() doesn't choke on the implicit string concatenation it does. Populate raw_app_meta_data + raw_user_meta_data with empty jsonb."
    - "pgcrypto crypt('<password>', gen_salt('bf', 10)) for the test-super-admin's encrypted_password — produces a real bcrypt $2a$10$… hash that GoTrue's verifier accepts. Cost factor 10 matches GoTrue's default."
    - "Pre-seed pattern that converges with admin-API-driven ensureTestUser: insert with deterministic UUID; ensureTestUser's listUsers() finds-by-email and skips the create path. Lets the seed reach into team-RLS-gated rows that the runtime spec setup couldn't reach."

key-files:
  created:
    - ".planning/phases/05-test-and-type-green/05-01-SUMMARY.md  # this file"
  modified:
    - "supabase/seed.sql  # 16-line stub → 235-line idempotent DO-block; Kotara team + 9 players + 5 finalised games + 50 game_events + seed-bot + test-super-admin pre-seed + super-admin Kotara membership"
  deleted: []

key-decisions:
  - "Option A (pure-SQL extension of supabase/seed.sql) succeeded — Option B (standalone scripts/seed-kotara-koalas.mjs) NOT needed at this Supabase CLI version (v2.90.0). The auth.users direct INSERT path works; pgcrypto bcrypt at cost 10 produces hashes GoTrue verifies cleanly."
  - "Pre-seed the test-super-admin auth row in addition to the seed-bot. Without this, the Kotara-optional NETBALL-02 test (netball-quarter-break.spec.ts:380) renders a 404 page because the spec's navigating user (super-admin) isn't in team_memberships for Kotara — and the is_super_admin profile flag doesn't bypass team RLS in the current schema. The fix lives in seed.sql space (no spec edits, no migration changes per plan constraints)."
  - "Use deterministic UUIDs for both synthetic users (seed-bot=...-aaaa, super-admin=...-bbbb) so re-runs are stable and the team_memberships INSERT can reference them by const without a SELECT lookup."
  - "Populate ALL token columns on auth.users with empty strings, not NULL. GoTrue's admin.listUsers() concatenates these columns internally and surfaces NULL-bearing rows as `Database error finding users`. Verified empirically by initial commit failing the auth.setup spec."
  - "Skip the 50-event idempotency check by checking 'any game_events row exists for this game_id' before inserting — simpler than tracking each event type separately, and re-runs after a partial seed would correctly skip games whose events already landed."

patterns-established:
  - "Pattern: `supabase/seed.sql` as the canonical home for deterministic test fixtures that need to land BEFORE auth.setup.ts runs. State-creating helpers (factories.makeTeam, ensureTestUser) can rendezvous with seed-pre-created rows via deterministic UUIDs + idempotent get-or-create."
  - "Pattern: when a synthetic auth.users INSERT needs to support GoTrue admin API operations (listUsers, deleteUser), populate ALL nullable text/varchar columns with empty strings — Supabase's GoTrue does string ops that don't tolerate NULL. The 17-column INSERT is the documented safe shape."
  - "Pattern: pre-seeded super-admin enables team-RLS-gated specs without spec edits — pre-create the row + drop a team_memberships INSERT into the seed. ensureTestUser idempotently re-uses the existing row, so auth.setup.ts doesn't need to know about the seed."

requirements-completed: [TEST-05]

# Metrics
duration: ~50min (interactive — including the unexpected detour to fix the GoTrue listUsers + RLS-route-access issues)
completed: 2026-04-30
---

# Phase 5 Plan 01: Kotara Koalas seed (TEST-05 closure) Summary

**Option A (pure-SQL extension of `supabase/seed.sql`) landed. Two latent issues surfaced and were fixed inline (Rule 3 + Rule 1 deviations): GoTrue's listUsers chokes on NULL token columns, and is_super_admin doesn't bypass team RLS so the Kotara-optional spec needed the super-admin pre-seeded as a Kotara team_member. Full e2e gauntlet now reads 52 PASS / 1 SKIP (PROD-04 fixme only) — Kotara-optional FLIPPED from SKIP to PASS as the plan's success criteria required.**

## Performance

- **Duration:** ~50min (interactive)
- **Started:** 2026-04-30
- **Completed:** 2026-04-30
- **Tasks:** 2 substantive (Task 1 seed authoring + Task 2 e2e regression sanity check) — both `type="auto"`, no checkpoints
- **Files modified:** exactly 1 (`supabase/seed.sql`) — matches the plan's `files_modified` declaration; Option B fallback (`scripts/seed-kotara-koalas.mjs` + package.json + scripts/e2e-setup.mjs wiring) was NOT needed because Option A worked at this Supabase CLI version

## Accomplishments

- **TEST-05 acceptance gate closed.** `auditKotaraKoalas()` now returns `{ present: true, gameCount: 5, playerCount: 9, teamId: "5ba1eb72-…" }` against a fresh `npm run db:reset` (verified empirically twice — once after Task 1's first commit, once after Task 1's fix-up commit).
- **netball-quarter-break.spec.ts:380 (Kotara-optional NETBALL-02) FLIPPED from SKIP to PASS.** The Phase 4 hand-off state where this test's `test.skip(!auditPresent, ...)` always evaluated true is GONE — the test now executes in full and asserts the suggester runs against Kotara's real season history, with the reshuffle toggle visible in the rendered DOM.
- **Full e2e gauntlet stable.** Running with `--workers=1 --reporter=line` after the seed change yields 52 PASS / 0 FAIL / 1 SKIP (the lone surviving SKIP is `playhq-import.spec.ts:28`, the PROD-04 intentional `test.fixme` from Phase 3). Compare to Phase 4 baseline: 51 PASS + 2 SKIP. The seed adds exactly +1 PASS (the Kotara-optional test) and removes exactly 1 SKIP (the same test). No spec regressed.
- **Quality bar preserved.**
  - `npx tsc --noEmit` → exit 0
  - `npm run lint` → 3 pre-existing warnings (LiveGame.tsx:810, FeatureSection.tsx:77, NetballLiveGame.tsx:489), 0 errors
  - `npm test --run` (Vitest) → 169/169 PASS
  - Phase 3 invariants intact (pre-merge tags frozen, PROD-04 fixme = 1, D-26/D-27 quarterMs hits = 5+4)
- **No drift.** `supabase/seed.sql` is the only file modified by this plan. No source-tree changes; no migrations; no e2e/specs touched; no e2e/helpers touched; no e2e/fixtures touched; no scripts touched.

## Task Commits

Each commit stands alone per CLAUDE.md commit style:

1. **Task 1 (initial seed authoring) — `1dbaa67` `feat(05-01): seed Kotara Koalas in supabase/seed.sql for TEST-05`**
   Replaces the no-op `select 1;` with the idempotent DO-block: seed-bot auth.users + profile, Kotara team (id=5ba1eb72-…, sport=netball, age_group=go, track_scoring=false), 9 active players (jersey 1..9), 5 finalised games (rounds 1..5 backdated 5..1 weeks), and 50 game_events per the feeder pattern (lineup_set + 4×quarter_start + 4×quarter_end + game_finalised per game). At this commit, `auditKotaraKoalas()` already returned `{ present: true, gameCount: 5, playerCount: 9 }` against a direct service-role probe — but the e2e auth.setup spec started failing on `admin.listUsers()` because the minimal auth.users INSERT didn't populate the GoTrue-required token columns with empty strings (it left them NULL).

2. **Task 1 fix-up — `86630e3` `fix(05-01): widen Kotara seed to unblock GoTrue + super-admin route access`**
   Two latent issues fixed inline:
     - **GoTrue listUsers compatibility:** Widened the seed-bot INSERT from 7 columns to 22 columns. Populated `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`, `email_change_token_current`, `reauthentication_token`, `phone_change`, `phone_change_token` with empty strings (not NULL). Populated `raw_app_meta_data` and `raw_user_meta_data` with non-null jsonb. Set `is_super_admin=false`, `is_sso_user=false`, `is_anonymous=false` and `encrypted_password=''` (seed-bot never logs in).
     - **Super-admin Kotara route access:** Pre-created a second auth.users row for `super-admin@siren.test` (deterministic UUID `00000000-…-bbbb`, real bcrypt hash via `pgcrypto.crypt(v_super_pw, gen_salt('bf', 10))`). Set the matching profiles row with `is_super_admin=true`. Added a `team_memberships(team_id=kotara, user_id=super-admin, role='admin')` row so the live-game page route renders for the super-admin (RLS `is_team_member` requires this — the `is_super_admin` profile flag doesn't bypass team RLS in the current schema).

## Files Created/Modified

### Created
- `.planning/phases/05-test-and-type-green/05-01-SUMMARY.md` (this file)

### Modified
- `supabase/seed.sql` — 16-line stub → 235-line idempotent DO-block. Net change: +220 lines / -16 lines. The block:
  - Pre-seeds 2 auth.users rows (seed-bot, test-super-admin) with all GoTrue-required columns populated (token columns = empty string, jsonb columns = empty/non-null jsonb, encrypted_password = `''` for seed-bot and `crypt('test-pw-12345', gen_salt('bf', 10))` for super-admin)
  - Pre-seeds matching profiles rows (super-admin gets `is_super_admin=true`)
  - Inserts the Kotara team (id `5ba1eb72-…fc11`, sport='netball', age_group='go', track_scoring=false, created_by=seed-bot). `handle_new_team` trigger auto-creates seed-bot's admin team_membership.
  - Inserts a second team_membership row giving the test-super-admin admin access to Kotara
  - Inserts 9 active players (jersey 1..9, single-word names matching `e2e/fixtures/factories.ts` `PLAYER_FIRST_NAMES` convention)
  - Inserts 5 finalised games (deterministic UUIDs `aaaaaaaa-000{1..5}-…`, `status='completed'`, rounds 1..5, backdated 5..1 weeks)
  - For each game, inserts 10 game_events: 1 lineup_set (nested-Record positions: `gs/ga/wa/c/wd/gd/gk = jersey 1..7`, bench = jersey 8..9; `metadata.sport='netball'`), 4 quarter_start, 4 quarter_end (`elapsed_ms=600000`), 1 game_finalised. Skip-if-already-present guard makes the loop re-run safe.
  - Emits `RAISE NOTICE 'Kotara Koalas seed: team=…, 9 players, 5 games'` so `db:reset` output confirms the seed ran.

### Deleted
None.

## Decisions Made

1. **Option A (pure-SQL) succeeded — Option B (standalone script) NOT triggered.** The plan's `<fallback>` block authorised falling through to `scripts/seed-kotara-koalas.mjs` if the auth.users direct INSERT failed on this CLI version. It didn't. Both `auth.users` INSERTs (seed-bot + super-admin) executed cleanly, GoTrue's `admin.listUsers()` reads them, and `signInWithPassword` verifies the bcrypt hash. The seed.sql path is more concise and runs as part of `db:reset` without needing a separate npm script + e2e-setup wiring.

2. **Pre-seed the test-super-admin in seed.sql, NOT a separate file.** The Kotara-optional spec assumes the super-admin can navigate to `/teams/{kotara}/games/{...}/live`. Without team_membership, the page renders 404 because `is_super_admin` doesn't bypass team RLS. The fix could live in:
   - **(a)** A migration adding a super-admin RLS bypass (touches schema; off-limits per plan constraints)
   - **(b)** The spec adding a team_membership before navigating (touches e2e/tests; off-limits)
   - **(c)** The seed pre-creating the super-admin + their Kotara membership (chosen — stays in seed.sql space)
   The chosen approach has the smallest blast radius: seed.sql is a test-only artefact that runs after `db:reset`, it converges with the existing `ensureTestUser` get-or-create flow, and it leaves zero source code changes.

3. **Use `pgcrypto.crypt(pw, gen_salt('bf', 10))` for the bcrypt hash.** The Supabase CLI ships pgcrypto (verified via `pg_extension` query); GoTrue uses bcrypt with a default cost of 10 (verified empirically by inspecting `admin.createUser`-generated rows). Cost 10 takes ~80ms once at seed time — negligible — and produces a hash GoTrue's verifier accepts. If a future CLI bump rotates the hash format (e.g., to argon2id), the auth.setup.ts spec will fail loudly on login, which is the canary signal to switch to the Option B fallback.

4. **Empty strings, not NULLs, for auth.users token columns.** GoTrue's `admin.listUsers()` internally concatenates several token columns when building its response payload, and PostgreSQL's `||` operator on a NULL produces NULL — which GoTrue surfaces as `Database error finding users`. Empirically confirmed by the first commit (which left tokens NULL) breaking auth.setup.ts. This pattern is now documented inline in seed.sql.

5. **Idempotent re-runs via per-row ON CONFLICT + per-game guard SELECT.** Most rows use `ON CONFLICT DO NOTHING`. game_events doesn't have a natural unique key (rows are append-only by design), so we guard the game_events loop with `IF EXISTS (SELECT 1 FROM game_events WHERE game_id = v_game_id LIMIT 1) THEN CONTINUE`. This makes `psql -f seed.sql` re-runs safe outside of `db:reset` (e.g., for local dev iteration).

## Deviations from Plan

**Two Rule 1 / Rule 3 auto-fixes inside Task 1.** Both surfaced during the verify step's gauntlet run; both fixed in seed.sql space.

### 1. [Rule 3 — Blocker] GoTrue admin.listUsers() failed on minimal auth.users seed-bot row

- **Found during:** Task 1 verify, focused-gauntlet run after first seed commit
- **Issue:** `e2e/tests/auth.setup.ts` failed at line 34 (`ensureTestUser` → `admin.auth.admin.listUsers()`) with `Database error finding users`. Page snapshot empty — error surfaced before any UI action. With the auth setup blocked, all 21 downstream tests "did not run".
- **Root cause:** The plan's draft `auth.users` INSERT only populated 7 columns: `id, email, instance_id, aud, role, created_at, updated_at`. The remaining 28 columns defaulted to NULL. GoTrue's `listUsers` does internal string concatenation across `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`, `email_change_token_current`, `reauthentication_token`, `phone_change`, `phone_change_token` and chokes when those are NULL.
- **Fix:** Widened the INSERT from 7 to 22 columns. Populated all token columns with empty strings, both raw_*_meta_data jsonb columns with non-null values, and the three boolean flags (is_super_admin/is_sso_user/is_anonymous) explicitly false.
- **Files modified:** supabase/seed.sql (within the same plan; commit 86630e3)
- **Commit:** 86630e3

### 2. [Rule 3 — Blocker] Kotara-optional spec hit 404 because super-admin lacks team_membership

- **Found during:** Task 1 verify, same focused-gauntlet run after the listUsers fix
- **Issue:** netball-quarter-break.spec.ts:380 (Kotara-optional NETBALL-02) navigated to `/teams/{kotara}/games/{new-game}/live` and rendered Next.js's "Not found" page. `enterQBreakView`'s `expect.poll` timed out waiting for the Q1 quarter_end event. Page snapshot showed the 404 instead of the live shell.
- **Root cause:** The spec was authored assuming Kotara would be created by the test-super-admin (so they'd be auto-admin via `handle_new_team`). The plan's seed creates Kotara as `seed-bot`-owned, so the super-admin is NOT in team_memberships for Kotara. The teams RLS policy (`teams: read` uses `is_team_member(id)`) blocks the route.
- **Fix:** Pre-seed the test-super-admin's auth.users row + profile + add a `team_memberships(team_id=kotara, user_id=super-admin, role='admin')` row. Used pgcrypto to generate a real bcrypt hash so `signInWithPassword` works. Used a deterministic UUID `00000000-…-bbbb` so `ensureTestUser` can find the row by email and converge with the existing get-or-create flow.
- **Files modified:** supabase/seed.sql (within the same plan; commit 86630e3 — both deviations bundled)
- **Commit:** 86630e3

**Both deviations stayed strictly within seed.sql space**, honoring the plan's "DO NOT touch src/, scripts/, e2e/tests/, e2e/helpers/, e2e/fixtures/, supabase/migrations/" constraint. Option B fallback (standalone script + package.json + e2e-setup wiring) was not triggered — Option A widened in place was sufficient.

## Issues Encountered

- **First commit's seed broke auth.setup.ts** (documented as Rule 3 deviation #1 above). Fixed inline; no rollback needed.
- **Pre-existing benign log noise:** Three specs (multi-sport-schema × 2, onboarding × 1, team-invite × 1) emit `[deleteTestUser] non-fatal cleanup error` warnings during their cleanup blocks. This is documented in `e2e/fixtures/supabase.ts:97-99` as expected behavior — those specs leave FK references behind that GoTrue's `admin.deleteUser` can't cascade through, and the helper logs the error and moves on. Not new; not caused by the seed.
- **One transient Supabase 502** during the second full-suite run (during `Restarting containers...` after `db reset`). Re-running succeeded immediately. This is the same Phase 4 side-finding #2 (cold-compile flake) that Plan 05-03 will address with port-3000 detection in `scripts/e2e-setup.mjs`. Out of scope for this plan.

## User Setup Required

None. The seed runs as part of `npm run db:reset` (which `npm run e2e` invokes). No external service configuration; no manual auth setup required.

## Next Phase Readiness

**Hand-off to Plan 05-02 (admin-hydration helper extraction):**
- The seed change is fully isolated — no source-tree drift, no spec drift, no fixture drift. Plan 05-02 can proceed without re-running this plan's verify gates.
- The full e2e suite is at 52 PASS / 1 SKIP, which is the new gauntlet baseline. Plan 05-02's spec edits (settings + roster + game-edit) should keep that count.

**Hand-off to Plan 05-05 (final gauntlet + 05-EVIDENCE.md):**
- TEST-05 acceptance gate closed: `auditKotaraKoalas()` returns `{ present: true, gameCount: 5, playerCount: 9 }`.
- The Kotara-optional NETBALL-02 test FLIPPED from SKIP to PASS — Plan 05-05's evidence run will see 52 PASS / 1 SKIP for the canonical baseline.
- Phase 3 invariants re-verified intact at this plan's close: pre-merge tags unmoved, PROD-04 fixme present, D-26/D-27 quarterMs hits unchanged.

**No blockers carried into Plan 05-02.**

## Self-Check: PASSED

Verification commands run on `merge/multi-sport-trunk` worktree (HEAD = `86630e3`):

| Check | Command | Result |
|-------|---------|--------|
| Task 1 initial commit exists | `git log --oneline \| grep 1dbaa67` | match present |
| Task 1 fix-up commit exists | `git log --oneline \| grep 86630e3` | match present |
| supabase/seed.sql contains Kotara block | `grep -c '5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11' supabase/seed.sql` | 1 (declared once as v_team_id; subsequent uses via the variable) |
| supabase/seed.sql contains super-admin pre-seed | `grep -c '00000000-0000-0000-0000-00000000bbbb' supabase/seed.sql` | 1 (declared once as v_super_id; subsequent uses via the variable) |
| `npm run db:reset` runs cleanly | exit code on last reset | 0 (`Kotara Koalas seed` notice emitted) |
| auditKotaraKoalas() shape verified | one-off node probe of `teams/players/games/game_events` | `{ team: { sport: 'netball', age_group: 'go', track_scoring: false }, playerCount: 9, gameCount: 5, eventCount: 50 }` |
| signInWithPassword for super-admin works | one-off node probe via anon client | session returned, user_id = `00000000-…-bbbb` |
| team_memberships has super-admin Kotara admin | one-off node probe | 2 admin rows: seed-bot + super-admin |
| Full e2e suite passes | `npm run e2e -- --workers=1 --reporter=line` | 52 PASS / 0 FAIL / 1 SKIP (PROD-04 fixme only) |
| Kotara-optional NETBALL-02 FLIPPED to PASS | full-suite log line for `netball-quarter-break.spec.ts:380` | reported PASS, no SKIP marker |
| `npx tsc --noEmit` exits 0 | exit code | 0 (no output) |
| `npm run lint` clean | exit code + warning count | 0 errors, 3 pre-existing warnings |
| `npm test --run` passes 169 | exit code + output | 169 passed (9 files) |
| No `src/` drift | `git status --short src/` | (empty) |
| No `e2e/` drift | `git status --short e2e/` | (empty) |
| No `scripts/` drift | `git status --short scripts/` | (empty) |
| No `supabase/migrations/` drift | `git status --short supabase/migrations/` | (empty) |
| `pre-merge/main` tag frozen | `git rev-parse pre-merge/main` | `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` (unchanged) |
| `pre-merge/multi-sport` tag frozen | `git rev-parse pre-merge/multi-sport` | `e13e787cb8abe405c18aca73e66c7c928eb359d8` (unchanged) |
| PROD-04 fixme intact | `grep -c 'test\.fixme' e2e/tests/playhq-import.spec.ts` | 1 |

All 19 self-check items PASSED.

---
*Phase: 05-test-and-type-green*
*Plan: 01*
*Completed: 2026-04-30*
