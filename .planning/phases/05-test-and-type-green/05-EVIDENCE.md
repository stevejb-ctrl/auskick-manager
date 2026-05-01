# Phase 5 Evidence: Test + type green

**Phase:** 05-test-and-type-green
**Closed:** 2026-04-30
**Branch:** merge/multi-sport-trunk @ `90364ee` (Phase 5 close — pre-05-EVIDENCE.md commit baseline; this evidence file lands as the next commit)
**Phase 4 hand-off branch HEAD (start of Phase 5):** `4394b98`
**Plans landed (5 of 5 — 05-05 is this plan):**
05-01 (`582bdf2`) → 05-02 (`137d4ff`) → 05-03 (`d7c6b28`) → 05-04 (`90364ee`)

This file is the Phase 5 close-out artefact: full automated-quality-gate output, per-TEST-N
traceability, Phase 3 + Phase 4 invariant re-verification, source-tree drift bound, and the
explicit hand-off block for Phase 6 (preview deploy + manual validation).

Mirrors `04-EVIDENCE.md`'s six-section structure verbatim — same tone, same probe primitives,
same evidence shape. The only deltas: TEST-N replaces NETBALL-N (Phase 5 owns automated-quality
acceptance gates, not netball-functional gates), and §3's invariant table extends 04-EVIDENCE's
6-row carry-forward with 2 Phase 4 + 6 Phase 5 net-new invariants.

---

## §1 Full gauntlet output

Gauntlet executed in order: `db:reset → tsc → lint → vitest → e2e (full) → e2e (PROD-01 per-spec)`.
All five logs captured to `/tmp/05-{tsc,lint,vitest,e2e,prod01}.log`. Total wall-clock ~5.0 min
(2.2m e2e full + 32.9s PROD-01 + 1.15s vitest + tsc/lint near-instant + db:reset 33s).

### `npm run db:reset`

- **Exit code:** 0
- **Output (final lines):** `NOTICE (00000): Kotara Koalas seed: team=5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11, 9 players, 5 games`
  followed by `Restarting containers...` and `Finished supabase db reset on branch main.`
  Confirms Plan 05-01's seed landed at fresh-DB time. Captured at `/tmp/05-dbreset.log`.
- **27 migrations applied + supabase/seed.sql succeeds** — no errors, no warnings beyond the
  benign `extension "pgcrypto" already exists, skipping` notice and the Supabase CLI version-
  upgrade hint (v2.90.0 → v2.95.4 available; not relevant to test green).

### `npx tsc --noEmit`

- **Exit code:** 0
- **Output:** `[empty]` — log file is 0 bytes; no type errors emitted across the full merged
  codebase including Phase 5's source-tree changes (`/tmp/05-tsc.log`, 0 lines).
- **Coverage:** every `.ts`/`.tsx` under `src/` + `e2e/` is type-checked by the project's
  `tsconfig.json` include set. Phase 5's source-tree changes (Plan 05-04's revalidatePath +
  router.refresh + Plan 05-02's helper) all type-clean.

### `npm run lint`

- **Exit code:** 0
- **Output:** 3 pre-existing warnings, zero errors (`/tmp/05-lint.log`):
  - `src/components/live/LiveGame.tsx:810` — `react-hooks/exhaustive-deps` (pre-existing AFL
    surface, untouched by Phase 5)
  - `src/components/marketing/FeatureSection.tsx:77` — `@next/next/no-img-element`
    (pre-existing marketing page, untouched)
  - `src/components/netball/NetballLiveGame.tsx:509` — `react-hooks/exhaustive-deps` on
    `ageGroup.positions` in `useMemo` (pre-existing dep array; the line moved from `:489` at
    Phase 4 close to `:509` because Plan 05-04 added a `useRouter` import + 4 `router.refresh`
    callsites above this line, shifting line numbers. Same warning, same dep-array contents,
    same root cause — not a new warning, not a regression).
- **Net new warnings introduced by Phase 5:** 0.

### `npm test --run` (Vitest)

- **Exit code:** 0
- **Tests:** 169 passed / 0 failed / 0 skipped, across 9 test files, 1.15s total.
- **TEST-01 acceptance:** ≥153 tests required → 169 actual (16 above bar; identical to Phase 4
  close).
- **Output tail:**

  ```
  Test Files  9 passed (9)
       Tests  169 passed (169)
    Start at  12:46:49
    Duration  1.15s (transform 1.16s, setup 0ms, import 1.63s, tests 125ms, environment 2ms)
  ```

- **New Vitest tests added in Phase 5:** 0 — Phase 5 added zero pure-function logic; all new
  source-fix work in Plan 05-04 is React-side (router.refresh callsites) + server-action
  revalidatePath, both of which are e2e-asserted rather than vitest-asserted.

### `npm run e2e` (Playwright — full suite, `--workers=1 --reporter=line`)

- **Exit code:** 0
- **Wall-clock:** 2.2 min (down from 2.4 min at Phase 4 close — same workload, slightly faster
  cold-compile, attribution: noise)
- **Specs total:** 23 (every `e2e/tests/*.spec.ts`)
- **Tests total:** 53 (1 setup + 52 worker tests)
- **Tests passed / failed / skipped:** **52 / 0 / 1**
- **The lone skip:**
  - `e2e/tests/playhq-import.spec.ts:28` — PROD-04 intentional `test.fixme` (per Phase 3
    hand-off, MERGE-LOG §6; carried forward unchanged through Phase 4 + Phase 5).
- **Net delta vs Phase 4 close:** +1 PASS / -1 SKIP. The `netball-quarter-break.spec.ts:382`
  Kotara-optional NETBALL-02 test FLIPPED from SKIP (Phase 4: Kotara seed absent) to PASS
  (Phase 5: Plan 05-01's seed lands `present: true`). All other 51 PASSes carry forward
  exactly as Phase 4. **No flakes** — single clean run, zero retries used. The late-arrival
  flake observed at Plan 05-04 close (`netball-live-flow.spec.ts:526` correlated with
  team-invite.spec.ts deleteTestUser cleanup race) did NOT recur on this run.

#### Per-spec breakdown — full e2e suite

23 spec files. Tests counted by `^test(` declaration in source (parameterised tests
expanded by Playwright at runtime — e.g. game-create has 1 declaration that runs 3×).

| Spec | Tests | Result | Phase 4 baseline |
|------|-------|--------|------------------|
| `auth.setup.ts` | 1 | 1/1 PASS (setup) | unchanged |
| `availability.spec.ts` | 2 | 2/2 PASS | unchanged |
| `game-create.spec.ts` | 3 (parameterised: U8 / U10 / U13) | 3/3 PASS | unchanged |
| `game-edit.spec.ts` | 1 | 1/1 PASS | unchanged (helper cross-ref comment only — Plan 05-02) |
| `injury-replacement.spec.ts` | 2 | 2/2 PASS | unchanged |
| `lineup.spec.ts` | 1 | 1/1 PASS | unchanged |
| `live-full-time.spec.ts` | 1 | 1/1 PASS | unchanged |
| `live-quarters.spec.ts` | 1 | 1/1 PASS | unchanged |
| `live-scoring.spec.ts` | 2 | 2/2 PASS | unchanged |
| `live-swaps.spec.ts` | 1 | 1/1 PASS | unchanged |
| `multi-sport-schema.spec.ts` | 3 | 3/3 PASS | unchanged |
| `netball-live-flow.spec.ts` (Plan 05-04: 2 page.reload removed) | 11 | 11/11 PASS | unchanged |
| `netball-quarter-break.spec.ts` (Plan 05-04: 1 page.reload removed) | 4 | **4/4 PASS** | **+1 PASS** (Kotara-optional flipped from SKIP) |
| `netball-stats.spec.ts` | 2 | 2/2 PASS | unchanged |
| `netball-summary.spec.ts` | 2 | 2/2 PASS | unchanged |
| `netball-walkthrough.spec.ts` | 4 | 4/4 PASS | unchanged |
| `onboarding.spec.ts` | 1 | 1/1 PASS | unchanged |
| `playhq-import.spec.ts` | 1 (test.fixme) | 0/1 SKIP — PROD-04 intentional | unchanged |
| `roster.spec.ts` (Plan 05-02: helper used ×2) | 1 | 1/1 PASS | unchanged |
| `runner-token.spec.ts` | 3 | 3/3 PASS | unchanged |
| `settings.spec.ts` (Plan 05-02: helper used ×1) | 2 | 2/2 PASS | unchanged |
| `smoke.spec.ts` | 1 | 1/1 PASS | unchanged |
| `super-admin.spec.ts` | 2 | 2/2 PASS | unchanged |
| `team-invite.spec.ts` | 1 | 1/1 PASS | unchanged |
| **TOTAL** | **53** | **52 PASS + 1 SKIP** | (Phase 4: 51 PASS + 2 SKIP) |

**Phase 5 net delta:** zero new specs (Phase 5 is hardening, not feature-adding); 4 specs had
non-functional refactors (settings, roster, game-edit comment, plus the 3 page.reload-retiring
edits in netball-live-flow + netball-quarter-break). All previously-passing tests still PASS;
the formerly-SKIP Kotara-optional test now PASSes.

### PROD-01 per-spec re-run (`--workers=1`)

The five AFL post-fork fix specs were re-run as a focused gauntlet to confirm Phase 5's
source-tree changes (Plan 05-04 — netball-only revalidatePath + router.refresh) did not regress
AFL flows.

- **Exit code:** 0
- **Wall-clock:** 32.9s (down from 35.4s at Phase 4 close)
- **Result:** **9/9 PASS** (1 setup + 8 worker tests):

  ```
  ok 1 [setup] auth.setup.ts:22 — authenticate as super-admin
  ok 2 [chromium] availability.spec.ts:13 — toggle a player's availability
  ok 3 [chromium] availability.spec.ts:70 — add a fill-in player
  ok 4 [chromium] injury-replacement.spec.ts:19 — injure on-field, prompt bench replacement
  ok 5 [chromium] injury-replacement.spec.ts:145 — injure on-field, empty bench falls through
  ok 6 [chromium] live-quarters.spec.ts:16 — end Q1 → Q-break + rotation suggestion
  ok 7 [chromium] live-scoring.spec.ts:74 — record a goal via live UI
  ok 8 [chromium] live-scoring.spec.ts:133 — undo last score
  ok 9 [chromium] live-swaps.spec.ts:17 — swap bench player onto field
  ```

PROD-01 carry-forward integrity confirmed — no AFL regressions from any Phase 5 commit. Plan
05-04's source changes are netball-actions / NetballLiveGame / NetballQuarterBreak only; AFL
LiveGame.tsx + liveGameStore.ts are untouched (D-26 + D-27 invariants verified §3 below).

---

## §2 TEST-01..05 traceability

Every TEST-N acceptance gate from REQUIREMENTS.md mapped to its automated coverage and current
PASS status from §1 above.

| Requirement | Acceptance gate (REQUIREMENTS.md verbatim) | Spec/command | Status |
|-------------|---------------------------------------------|--------------|--------|
| **TEST-01** | `npm test` (Vitest) exits 0 with all tests passing; ≥153 tests required | `npm test --run` (`/tmp/05-vitest.log`) | **PASS** (169/169 in 1.15s; 16 above the ≥153 bar; identical to Phase 4 close) |
| **TEST-02** | `npm run e2e` (Playwright) exits 0 with all specs green; ONLY skip is PROD-04 intentional `test.fixme` | `npm run e2e -- --workers=1 --reporter=line` (`/tmp/05-e2e.log`) | **PASS** (52 PASS + 1 SKIP; lone skip is `playhq-import.spec.ts:28` PROD-04 fixme; +1 PASS / -1 SKIP delta vs Phase 4 from Kotara-optional flip) |
| **TEST-03** | `npx tsc --noEmit` exits 0 with no type errors | `npx tsc --noEmit` (`/tmp/05-tsc.log`) | **PASS** (exit 0; empty log; covers full merged codebase incl. Plan 05-04's netball-actions + router.refresh source changes) |
| **TEST-04** | `npm run lint` exits 0 with no ESLint errors | `npm run lint` (`/tmp/05-lint.log`) | **PASS** (exit 0; 3 pre-existing warnings unchanged from Phase 4 — same files, same rules; one warning's line number shifted `:489 → :509` due to Plan 05-04's import additions, but it's the same warning on the same dep array) |
| **TEST-05** | Test team Kotara Koalas (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`, netball, "Go", 9 active players, 5 simulated games) survives the merge as a usable seed; `auditKotaraKoalas` returns `present: true, gameCount: 5, playerCount: 9` on a fresh local DB | `supabase/seed.sql` extension landed in Plan 05-01 (`1dbaa67` + `86630e3`); audit primitive at `e2e/helpers/seed-audit.ts` (Plan 04-01); empirical proof: Kotara-optional NETBALL-02 test at `netball-quarter-break.spec.ts:382` FLIPPED from SKIP → PASS (gauntlet log line `[33/53] ... NETBALL-02 (Kotara optional): suggester runs against Kotara season history when seed is present` reports PASS, no SKIP marker). Direct Node probe via service-role client confirms team row `{ id: '5ba1eb72-…', sport: 'netball', age_group: 'go', name: 'Kotara Koalas' }` plus 9 active players (RLS gates the games-table count for non-team-member service-role contexts; the spec uses the seeded super-admin's team_membership to verify games — and PASSes, completing the round-trip evidence). | **PASS** |

**Coverage summary:** All 5 TEST-N gates have automated PASSing assertions. Phase 5 closed
the lone gap (TEST-05) that Phase 4 noted as the Phase 5 owner. TEST-01..04 are Phase-4-baseline
green-bar carried forward intact through Phase 5 with no regression — verified by re-running
the same gauntlet primitives at Phase 5 close.

---

## §3 Phase 3 + Phase 4 invariants — re-verified at end of Phase 5

Every invariant the Phase 4 close-out (04-EVIDENCE.md §3) committed to preserving has been
re-verified at the Phase 5 close (HEAD `90364ee`), plus 2 Phase 4 net-new and 6 Phase 5
net-new invariants are added to the carry-forward set for Phase 6+.

### Phase 3 invariants (carried from 04-EVIDENCE.md §3)

| # | Invariant | Expected (Phase 3 close) | Actual at Phase 5 close | Status |
|---|-----------|--------------------------|--------------------------|--------|
| 1 | `pre-merge/main` SHA | `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` | `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` | **UNCHANGED** |
| 2 | `pre-merge/multi-sport` SHA | `e13e787cb8abe405c18aca73e66c7c928eb359d8` | `e13e787cb8abe405c18aca73e66c7c928eb359d8` | **UNCHANGED** |
| 3 | PROD-04: `test.fixme` count in `e2e/tests/playhq-import.spec.ts` | 1 | 1 | **UNCHANGED** |
| 4 | D-26: `quarterMs` references in `src/components/live/LiveGame.tsx` (non-comment) | ≥5 | 5 | **UNCHANGED** |
| 5 | D-27: `quarterMs` references in `src/lib/stores/liveGameStore.ts` (non-comment) | 3 | 3 | **UNCHANGED** (Note: 04-EVIDENCE.md §3 reported "4" but Plan 05-04 SUMMARY corrected this to 3 — the canonical baseline is 3, unchanged across Phase 4 + Phase 5; Phase 4's "4" was an inadvertent over-count not reflecting an actual code change) |
| 6 | ABSTRACT-01: AFL conditionals (`sport === 'afl'` style, with comment-strip filter) outside `src/lib/sports/` | 4 (UI-presentation only — pre-classified acceptable per Phase 3 plan 03-06) | 3 | **UNCHANGED** (Same correction shape as #5 — 04-EVIDENCE.md §3 reported "4" but the canonical Phase 3 probe `grep -rE "sport[^a-zA-Z_]*===?\s*['\"]afl['\"]"` with the `\| grep -v '^[[:space:]]*//'` inline-comment filter consistently returns 3: `TeamBasicsForm.tsx:75` `active={sport === "afl"}`, `TeamBasicsForm.tsx:99` `placeholder={sport === "afl" ? ...}`, `PlayerList.tsx:39` `const showJersey = sport === "afl"`. None of these files were touched by any Phase 5 plan.) |

### Phase 4 invariants (newly added in 04-EVIDENCE.md, now re-verified)

| # | Invariant | Expected (Phase 4 close) | Actual at Phase 5 close | Status |
|---|-----------|--------------------------|--------------------------|--------|
| 7 | `trackScoring` references in `src/components/netball/NetballLiveGame.tsx` (Plan 04-04's prop chain) | 16 | 16 | **UNCHANGED** (Plan 05-04 added `useRouter` + `router.refresh` callsites but did NOT alter the trackScoring prop chain; verified empirically) |
| 8 | 5 Phase 4 netball specs intact + zero `test.fixme` added | files exist, fixme count = 0 | files exist, fixme count = 0 | **UNCHANGED** (`netball-walkthrough.spec.ts`, `netball-stats.spec.ts`, `netball-summary.spec.ts`, `netball-live-flow.spec.ts`, `netball-quarter-break.spec.ts` all present; combined `test.fixme` count = 0) |

### Phase 5 NEW invariants (introduced this milestone — bake in for Phase 6+)

| # | Invariant | Expected (Phase 5 close) | Actual | Status |
|---|-----------|--------------------------|--------|--------|
| 9 | Kotara Koalas seed presence (TEST-05) — `teams` row at `5ba1eb72-…fc11` with sport='netball', age_group='go' | row present | row present (`{ id: '5ba1eb72-…', sport: 'netball', age_group: 'go', name: 'Kotara Koalas' }`) | **PASS** |
| 10 | `revalidatePath` count in `src/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions.ts` (Plan 05-04 Task 1) | ≥5 (was N pre-fix; Plan 05-04 added at least 2 new calls) | 10 | **PASS** |
| 11 | `router.refresh` count in `src/components/netball/NetballLiveGame.tsx` (Plan 05-04 Task 2a) | ≥3 (auto-hooter + manual end Q4 + start Q1) | 4 | **PASS** |
| 12 | `router.refresh` count in `src/components/netball/NetballQuarterBreak.tsx` (Plan 05-04 Task 2b) | ≥1 (Start Qn handler) | 2 | **PASS** |
| 13 | `await page.reload()` workarounds removed from netball Q-break specs (Plan 05-04 Task 4) | 0 in netball-live-flow.spec.ts + netball-quarter-break.spec.ts; **1 preserved** in netball-walkthrough.spec.ts:154 (legitimate localStorage-persistence assertion) | 0 + 0 + 1 | **PASS** |
| 14 | `e2e/helpers/admin-hydration.ts` exists; `waitForAdminHydration` used in 3 places (Plan 05-02) | helper file exists; settings.spec.ts + roster.spec.ts both reference it; game-edit.spec.ts cross-references via comment | helper file exists; settings.spec.ts ref count = 2 (1 import + 1 call); roster.spec.ts ref count = 3 (1 import + 2 calls); game-edit.spec.ts admin-hydration ref count = 1 (cross-ref comment) | **PASS** |
| 15 | `scripts/e2e-setup.mjs` has the port-3000 probe (Plan 05-03) | `probePort3000` + `classifyPort3000Occupant` helpers present; called from execution block | both functions present (each defined once + called once = 2 hits each) | **PASS** |

**All 15 invariants intact at Phase 5 close.** The pre-merge tags have not been moved. The
PROD-04 fixme survived all Phase 5 commits. The quarterMs wiring at LiveGame.tsx +
liveGameStore.ts that Phase 3 plans 03-03 + 03-04 established is intact through Phase 5's
netball-only source changes. The trackScoring prop chain wired in Plan 04-04 is unchanged.
Phase 5's net-new invariants (Kotara seed, revalidatePath, router.refresh, page.reload
removal, admin-hydration helper, port-3000 probe) all carry forward as the new Phase-6 entry
state.

---

## §4 Source-tree changes in Phase 5 (`src/` + `scripts/` + `supabase/` + `e2e/` diff vs Phase 4 close `4394b98`)

`git diff --stat 4394b98..HEAD -- src/ scripts/ supabase/ e2e/`:

```
 e2e/helpers/admin-hydration.ts                                                           |  67 +++++  (Plan 05-02 — NEW)
 e2e/tests/game-edit.spec.ts                                                              |   6 +-    (Plan 05-02 comment-only)
 e2e/tests/netball-live-flow.spec.ts                                                      |  18 +-    (Plan 05-04 — 2 page.reload removed)
 e2e/tests/netball-quarter-break.spec.ts                                                  |   4 +-    (Plan 05-04 — 1 page.reload removed)
 e2e/tests/roster.spec.ts                                                                 |  19 +-    (Plan 05-02)
 e2e/tests/settings.spec.ts                                                               |  12 +-    (Plan 05-02)
 scripts/e2e-setup.mjs                                                                    | 128 +++++++++  (Plan 05-03)
 src/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions.ts                      |  30 ++-   (Plan 05-04)
 src/components/netball/NetballLiveGame.tsx                                               |  43 ++-   (Plan 05-04)
 src/components/netball/NetballQuarterBreak.tsx                                           |  10 +     (Plan 05-04)
 supabase/seed.sql                                                                        | 297 ++++++++++++++++++++-  (Plan 05-01)
 11 files changed, 586 insertions(+), 48 deletions(-)
```

**Per-plan attribution:**

- **Plan 05-01** (TEST-05 closure — Kotara seed): exactly 1 file, `supabase/seed.sql` (16-line
  stub → 235-line idempotent DO-block; Option A pure-SQL extension; Option B fallback NOT
  triggered — the auth.users direct-INSERT path worked at Supabase CLI v2.90.0). Two latent
  issues fixed inline (Rule 3 — GoTrue listUsers NULL-token-column compatibility; super-admin
  Kotara team_membership for RLS route access).
- **Plan 05-02** (Side-finding #3 — admin-hydration helper): exactly 4 files. NEW
  `e2e/helpers/admin-hydration.ts` (67 lines; thin wrapper around `expect(...).toBeEnabled`
  with the canonical race-rationale block); MODIFIED settings.spec.ts (+1 import, 1 call, 6→2
  line comment shrink), roster.spec.ts (+1 import, 2 calls, two comment shrinks), and
  game-edit.spec.ts (comment-only update — its DB-poll variant is a structurally different
  race not covered by the helper).
- **Plan 05-03** (Side-finding #2 — port-3000 probe): exactly 1 file, `scripts/e2e-setup.mjs`
  (+99 lines net: 2 imports `node:net` + `node:http`, 2 helper functions
  `probePort3000`/`classifyPort3000Occupant`, 38-line probe-and-branch block between
  `loadEnvFile` and the supabase status check). Three states verified by direct probe testing
  (port-free, Next.js dev-server occupant, hostile occupant).
- **Plan 05-04** (Phase 4 deferred items #1+#2 — revalidatePath + router.refresh): exactly 5
  files. SOURCE: `src/app/(app)/.../live/netball-actions.ts` (+29/-1 — revalidatePath added to
  endNetballQuarter non-final branch + startNetballQuarter post-insertEvent),
  `src/components/netball/NetballLiveGame.tsx` (+40/-3 — useRouter + 3 router.refresh
  callsites), `src/components/netball/NetballQuarterBreak.tsx` (+10/-0 — useRouter + 1
  router.refresh callsite). SPEC CLEANUP: 3 page.reload() workarounds retired
  (`netball-live-flow.spec.ts` ×2 + `netball-quarter-break.spec.ts` ×1); the 4th reload at
  `netball-walkthrough.spec.ts:154` was correctly preserved (legitimate localStorage-
  persistence-across-reload assertion, not a workaround).
- **Plan 05-05** (this plan): zero source/spec/script/seed drift. Documentation-only — adds
  this `05-EVIDENCE.md` + `05-05-SUMMARY.md` + STATE/ROADMAP updates after the human-verify
  checkpoint signs off.

**Total Phase 5 footprint:** 11 files (2 helpers/scripts new or extended, 5 e2e specs, 3 src
files, 1 seed). 586 lines added / 48 deleted = +538 net. Source-tree drift is fully bounded
to the per-plan `files_modified` declarations in 05-01..05-04 frontmatter — no plan exceeded
its declared scope.

---

## §5 Phase 6 hand-off

### Final state at Phase 5 close

| Item | Value |
|------|-------|
| Branch | `merge/multi-sport-trunk` |
| HEAD SHA (pre-05-EVIDENCE commit) | `90364ee` |
| `pre-merge/main` | UNCHANGED (`e9073dd…`) |
| `pre-merge/multi-sport` | UNCHANGED (`e13e787c…`) |
| Migration set | 27 (unchanged from Phase 3 + Phase 4) |
| Source-tree state | tsc green (exit 0); lint green (3 pre-existing warnings, 0 errors); Vitest 169/169 green; Playwright 52 PASS + 1 SKIP green |
| New e2e helpers added in Phase 5 | `e2e/helpers/admin-hydration.ts` (Plan 05-02 — Side-finding #3) |
| New script extensions in Phase 5 | port-3000 probe in `scripts/e2e-setup.mjs` (Plan 05-03 — Side-finding #2) |
| New seed surface in Phase 5 | `supabase/seed.sql` Kotara Koalas + super-admin pre-seed (Plan 05-01 — TEST-05) |
| Source code modified in Phase 5 | netball-actions.ts + NetballLiveGame.tsx + NetballQuarterBreak.tsx (Plan 05-04 only) — revalidatePath + router.refresh wired |
| Spec workarounds retired in Phase 5 | 3 `page.reload()` calls (Plan 05-04 — netball-live-flow ×2 + netball-quarter-break ×1) |
| Spec workarounds preserved (legitimate) | 1 `page.reload()` at `netball-walkthrough.spec.ts:154` (localStorage-persistence-across-reload assertion) |
| TEST-01..05 status | All 5 acceptance gates have automated PASSing assertions; TEST-05 closed by Plan 05-01 |
| Phase 4 NETBALL-01..08 status | All 8 still PASSING (re-verified by Phase 5 gauntlet); plus Kotara-optional NETBALL-02 flipped SKIP→PASS |
| Phase 4 ABSTRACT-03 status | Both quarter-length-override tests still PASSING (`netball-live-flow.spec.ts:614, :668`) |

### Side-finding triage status (per CONTEXT D-CONTEXT-side-finding-triage)

| Side-finding | Original phase | Closed in | Status |
|--------------|----------------|-----------|--------|
| **#1** Playwright artefact dirs untracked | Phase 3 | **Phase 4 plan 04-01** (`58b822f` — `chore(04-01): gitignore playwright run artefacts`) | **CLOSED** |
| **#2** Stale-dev-server detection in `scripts/e2e-setup.mjs` | Phase 3 → deferred to Phase 5 | **Phase 5 plan 05-03** (`4076a93` — `feat(05-03): probe port 3000 in e2e-setup.mjs`) | **CLOSED** |
| **#3** Admin-membership hydration helper | Phase 3 → deferred to Phase 5 | **Phase 5 plan 05-02** (`d98ef69` + 3 spec refactors) | **CLOSED** |

**All 3 side-findings closed.** None are carried forward into Phase 6.

### Phase-4-deferred items status

| Item | Original surface | Closed in | Status |
|------|------------------|-----------|--------|
| **#1** Non-final-quarter `endNetballQuarter` does NOT call `revalidatePath` | Phase 4 plan 04-05 (workaround: `page.reload()` after polling DB) | **Phase 5 plan 05-04** (`3be666a` — `feat(05-04): revalidatePath on netball server actions for non-final qend + qstart`) | **CLOSED** |
| **#2** `startNetballQuarter` + `periodBreakSwap` neither `revalidatePath` nor `router.refresh` | Phase 4 plan 04-06 (workaround: DB-event polling, no UI reload) | **Phase 5 plan 05-04** (`e613899` + `32bf256` — `router.refresh` in NetballLiveGame + NetballQuarterBreak) | **CLOSED** |
| **#3** TEST-05 Kotara Koalas seeding pathway | Phase 4 plan 04-01 (audit primitive landed; seed itself absent) | **Phase 5 plan 05-01** (`1dbaa67` + `86630e3`) | **CLOSED** |

**All 3 Phase-4-deferred items closed in Phase 5.**

### Items still deferred (carrying into Phase 6 / backlog)

| Item | Reason | Target |
|------|--------|--------|
| ABSTRACT-01 CI guard (grep rule for AFL conditionals outside `src/lib/sports/`) | Backlog per Phase 3 CONTEXT; Phase 5 scope was narrower (TEST-N closure, not CI hardening) | v2 / future |
| PROD-04 CI guard (fixme presence check on playhq-import.spec.ts) | Backlog per Phase 3 CONTEXT | v2 / future |
| Pause-event persistence bug | Cross-cutting; deferred per Phase 3 CONTEXT | Future milestone |
| `games.quarter_length_seconds` UI exposure | UX polish, not blocking acceptance; admin can set via DB or factories — sufficient for v1 coach workflow | v2 |
| PROD-02 quantitative benchmarking | Performance work | Phase 6/7 |
| Audit log for game event mutations | Backlog per CONCERNS.md | Future milestone |
| Refactoring NetballLiveGame state machine | FRAGILE; out of milestone | Future milestone |
| Late-arrival flake (NETBALL-08 in netball-live-flow.spec.ts:526) correlated with team-invite.spec.ts deleteTestUser cleanup race | Plan 05-04 hit it once; Plan 05-05 gauntlet did NOT recur — single retry was sufficient when it surfaced. Pre-existing test-infra flakiness, not a milestone-blocker. | Phase 6/7 candidate cleanup if scope allows; otherwise tolerate via existing one-retry policy |

### Phase 6 scope (DEPLOY-01, DEPLOY-02 per ROADMAP.md)

- **DEPLOY-01:** Vercel preview deploy of merged trunk against a Supabase prod clone.
- **DEPLOY-02:** Manual validation: real AFL game flow (lineup → live quarters → scoring →
  swaps → finalise → summary card → share-link viewing) + real netball game flow (lineup →
  live Q1 → Q-break suggestion → Start Q2 → walkthrough → scoring → injury/late-arrival →
  Q4 finalise → stats dashboard → summary card → share-link viewing).

### Phase 6 prerequisites met by Phase 5

- ✓ Source-tree green-bar locked (TEST-01..04 — tsc + lint + vitest + e2e all green at HEAD)
- ✓ Kotara Koalas seed available for netball validation (TEST-05 — Plan 05-01)
- ✓ All Phase-4-deferred items resolved (revalidatePath + router.refresh + Kotara seed)
- ✓ All Phase-3-deferred side-findings resolved (#1 closed in Phase 4; #2+#3 closed in Phase 5)
- ✓ Phase 3 invariants intact (pre-merge tags, PROD-04 fixme, D-26/D-27 quarterMs, ABSTRACT-01)
- ✓ Phase 4 invariants intact (trackScoring prop chain; 5 netball specs)
- ✓ Stale-dev-server detection landed (`scripts/e2e-setup.mjs` port probe — preview-deploy
  iteration on a parallel `npm run dev` will be smoother)

### Phase 6 prerequisites NOT met by Phase 5 (Phase-6 entry blockers per STATE.md)

- ⏳ Vercel preview deploy credentials (Vercel project + token configured in Vercel UI)
- ⏳ Supabase prod clone connection (separate Supabase project mirroring schema +
  representative data; needed to validate against real production-shaped state, not local
  Supabase CLI test fixtures)

These two are operational/credential setup, not source-tree work. They are documented in
STATE.md as Phase 6 entry prerequisites (not blockers carried forward from earlier phases —
they are net-new for the deployment milestone). Phase 6 planning should sequence them as the
first wave (e.g. plan 06-00 or 06-01: "Provision Vercel preview project + Supabase prod
clone").

### Open questions / known gaps for Phase 6

- **Late-arrival flake follow-up:** Phase 6/7 candidate to harden `team-invite.spec.ts`'s
  `deleteTestUser` cleanup race so spec-ordering doesn't surface the auth.users cascade
  failure. Out of Phase 5 scope (purely test-infra ergonomics, not a v1-cutover blocker).
- **Performance benchmarking on the preview deploy:** Phase 6 owns first quantitative
  measurements (cold start, P99 server-action latency, live-game wall-clock under realistic
  load). No Phase 5 baseline exists since Phase 5 was a hardening milestone, not a performance
  one.
- **Supabase prod clone shape:** does the clone need anonymised Kotara-shaped data, or is the
  local seed sufficient? Recommendation: clone production schema + a representative team
  workload (1-3 teams' worth of game/event history) for realistic validation, but not full
  PII; Kotara local seed suffices for isolated netball spec runs in CI.

---

## §6 Plan-by-plan summary index

For traceability — each Phase 5 plan's SUMMARY.md is the durable per-plan artefact:

| Plan | Subsystem | SUMMARY commit | Key deliverable |
|------|-----------|----------------|-----------------|
| 05-01 | seed-data | `582bdf2` | `supabase/seed.sql` Kotara Koalas + super-admin pre-seed (TEST-05 closed; +220 lines net) |
| 05-02 | e2e-helpers | `137d4ff` | `e2e/helpers/admin-hydration.ts` + 3 specs refactored (Side-finding #3 closed; 67-line helper, ~30-line net spec shrink) |
| 05-03 | e2e-bootstrap-script | `d7c6b28` | `scripts/e2e-setup.mjs` port-3000 probe (Side-finding #2 closed; +99 lines net; 3 states verified) |
| 05-04 | netball-server-actions | `90364ee` | revalidatePath + router.refresh in netball-actions / NetballLiveGame / NetballQuarterBreak; 3 page.reload workarounds retired (Phase-4-deferred #1+#2 closed; 5 commits) |
| 05-05 | phase-close-out | (this commit) | Full gauntlet + 05-EVIDENCE.md + Phase 6 hand-off |

### Cumulative Phase 5 tally

- **Plans landed:** 5 / 5 (100% — all sequential, no parallel waves; Phase 5 is hardening)
- **Commits across plans:** 17 (Phase 5 setup ×2: 29d63f6 plan-set + c5c295e CONTEXT;
  05-01: 3 — initial + fix-up + SUMMARY; 05-02: 5 — helper + 3 spec edits + SUMMARY;
  05-03: 2 — script + SUMMARY; 05-04: 5 — 3 source + 1 spec cleanup + 1 SUMMARY)
- **Files touched:** 11 (1 seed + 1 helper-new + 1 script + 3 source + 5 specs)
- **LoC delta:** +586 / -48 = +538 net (296 of which is the seed.sql expansion; 99 the script
  probe; ~80 the source revalidatePath/router.refresh; ~70 the helper; remainder is spec
  refactor + comment shrinks)
- **Time:** ~98 min cumulative across executor sessions (Plan 05-01 ~50min interactive;
  05-02 ~14min; 05-03 ~12min; 05-04 ~22min; 05-05 ~5min gauntlet + author time)
- **Deviations:** 2 Rule-3 auto-fixes in Plan 05-01 (GoTrue NULL-token compatibility +
  super-admin team_membership for RLS route access — both fixed inline in seed.sql, no scope
  expansion). 0 deviations in 05-02, 05-03, 05-04. 0 expected in 05-05.

---

*Phase 5 closed 2026-04-30. Ready to dispatch `/gsd-execute-phase 6` on `merge/multi-sport-trunk` once Phase 6 entry prerequisites (Vercel preview project + Supabase prod clone) are provisioned.*
*All 5 TEST-N + 8 NETBALL-N + ABSTRACT-03 acceptance gates have automated assertions. Phase 3 + Phase 4 invariants intact. Source-tree drift bounded to Plans 05-01..05-04's expected 11 files. The lone skipped test is intentional (PROD-04 fixme — Phase 3 hand-off, never claimed by any milestone).*
