# Roadmap: Siren — Multi-sport merge to production

## Overview

Two long-lived branches — `main` (60 production commits since fork) and `multi-sport` (74 commits, full netball MVP) — must be reconciled into a single trunk without data loss, without regressions on AFL, and with netball fully verified before production is touched. The phase order mirrors the blast-radius: plan before acting, fix the schema before merging code, merge code before verifying features, verify features before deploying, deploy to preview before touching prod.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Divergence inventory & merge plan** - Produce a written inventory of both branches, capture pre-merge tags, and document the conflict surface before any code changes
- [x] **Phase 2: Schema reconciliation** - Renumber/interleave migrations, add backfill, write the e2e spec exercising new columns through the UI — COMPLETE 2026-04-29
- [x] **Phase 3: Branch merge + abstraction integrity** - Execute the merge, resolve conflicts coherently, verify sports abstraction is the single dispatch point and all prod-side enhancements are preserved — COMPLETE 2026-04-30
- [x] **Phase 4: Netball verification on merged trunk** - Run every netball flow end-to-end on the merged codebase and confirm all 8 capabilities work correctly — COMPLETE 2026-05-01
- [x] **Phase 5: Test + type green** - Achieve full CI green: Vitest, Playwright e2e, TypeScript, lint, and seed team intact — COMPLETE 2026-05-01
- [ ] **Phase 6: Preview deploy + manual validation** - Deploy merged trunk to Vercel preview against a Supabase prod clone; manually validate both sports end-to-end
- [ ] **Phase 7: Production cutover + smoke test** - Fast-forward main, apply migrations to prod Supabase, verify production is healthy for existing AFL teams and new netball capability

## Phase Details

### Phase 1: Divergence inventory & merge plan
**Goal**: Both branches are fully characterised and protected before any merge work begins — the team knows exactly where conflicts will land
**Depends on**: Nothing (first phase)
**Requirements**: MERGE-02, MERGE-03
**Success Criteria** (what must be TRUE):
  1. Git tags `pre-merge/main` and `pre-merge/multi-sport` exist on the remote and are immutable — the merge can be re-run from a known good baseline if validation fails
  2. A written conflict-surface inventory (MERGE-NOTES.md or equivalent) names every file category expected to conflict: migration numbers, shared components touched by both branches, changed server actions, modified types
  3. The rationale for each non-trivial resolution decision (e.g. which branch's migration ordering wins, how abstraction conflicts are resolved) is captured in a form reviewable post-hoc
**Plans**: 1 plan
- [x] 01-01-PLAN.md — Build divergence inventory (MERGE-NOTES.md, 9 sections) and create + push pre-merge/main and pre-merge/multi-sport annotated tags ✓

### Phase 2: Schema reconciliation
**Goal**: The database migration set is monotonic, unique, and safe to apply against existing AFL production data — the new `teams.sport`, `teams.track_scoring`, `teams.quarter_length_seconds`, and `games.quarter_length_seconds` columns land cleanly
**Depends on**: Phase 1
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04
**Success Criteria** (what must be TRUE):
  1. `supabase migration up` runs from scratch (clean DB) without errors — no two migrations share a number, ordering is monotonic
  2. After migration, every existing AFL team row has `sport = 'afl'` (not null) — the backfill ran before any NOT NULL constraint was applied
  3. A Playwright spec exercises the new `teams.sport`, `teams.track_scoring`, and `teams.quarter_length_seconds` columns through the setup wizard / team settings UI for both AFL and netball, and passes green
  4. Existing AFL data (teams, players, games, events, availability, share tokens) is fully queryable through the merged code with no RLS errors or null-sport code panics
**Plans**: 3 plans

**Wave 1** *(parallel)*:
- [x] 02-01-PLAN.md — Re-verify sha256 equality of main:0024_super_admin.sql vs multi-sport:0025_super_admin.sql; write 02-SCHEMA-PLAN.md §§1-4 (file ops for Phase 3, SCHEMA-02 backfill audit, SCHEMA-04 destructive-ops audit) ✓ 2026-04-29
- [x] 02-02-PLAN.md — Add missing `e2e` + `db:*` scripts to package.json; extend e2e/fixtures/factories.ts makeTeam with optional sport parameter and widen ageGroup to string ✓ 2026-04-29

**Wave 2** *(blocked on Wave 1 completion)*:
- [x] 02-03-PLAN.md — Author e2e/tests/multi-sport-schema.spec.ts (3 test cases: AFL wizard, netball wizard, team-settings round-trip — expected red on this branch, Phase 3 flips green); finalize 02-SCHEMA-PLAN.md §§5-6 (spec design + Phase 6 handoff) ✓ 2026-04-29

**Cross-cutting constraints** *(must hold across all plans)*:
- `supabase/migrations/` on this branch is unchanged at end of every plan (D-11 read-only invariant; rename/delete is documented for Phase 3, not executed here)
- `git status` against `src/`, `supabase/`, `scripts/` remains clean throughout (Phase 2 source-tree boundary; only `e2e/`, `package.json`, and `.planning/phases/02-schema-reconciliation/` are written)
- `npx tsc --noEmit` exits 0 after every plan that touches typed code (Plans 02 + 03)
- `e2e/tests/multi-sport-schema.spec.ts` is committed but expected red on this branch — Phase 3 verification flips it green (D-12 — the spec exercises post-merge UI)

**UI hint**: yes

### Phase 3: Branch merge + abstraction integrity
**Goal**: A single trunk on `main`-equivalent contains all 60 production commits and all 74 multi-sport commits, with conflicts resolved coherently, the sports abstraction as the sole dispatch point for sport-specific logic, and every production-side enhancement preserved
**Depends on**: Phase 2
**Requirements**: MERGE-01, ABSTRACT-01, ABSTRACT-02, ABSTRACT-03, PROD-01, PROD-02, PROD-03, PROD-04
**Success Criteria** (what must be TRUE):
  1. `git log --oneline` on the merged branch shows commits from both branches, with no cherry-pick orphans — the history is a true merge
  2. No AFL-baked-in conditional survives in shared components, server actions, or stats aggregators — all sport-specific dispatch goes through `src/lib/sports/`
  3. `getEffectiveQuarterSeconds(team, ageGroup, game)` resolves quarter length in documented priority order (game override → team override → age-group default) and is the sole source of truth used by countdown, hooter, time-credit accounting, and Q-break time bars
  4. All existing AFL e2e specs pass unchanged on the merged trunk — long-press, lineup availability, TagManager temp-id, injury-replacement, live-swaps, live-scoring specs all green
  5. Performance wave 3 artifacts (static marketing/auth, DB indexes, spinners), UX changes (back-arrow removal), and PlayHQ fixme status are all present and unchanged in the merged codebase
**Plans**: 6 plans

**Wave 1** *(no parallel — gate)*:
- [x] 03-01-PLAN.md — Set up merge target branch, run `git merge --no-ff` of `claude/vibrant-banzai-a73b2f`, resolve all 6 mapped conflicts + `package.json` surprise (D-24), execute Phase 2 §2 file op (delete main `0024_super_admin.sql`), commit merge atomically; create `03-MERGE-LOG.md` §1+§2 ✓

**Wave 2** *(blocked on 03-01)*:
- [x] 03-02-PLAN.md — Run post-merge `npx tsc --noEmit`, patch any residual D-25 AgeGroup consumers; populate `03-MERGE-LOG.md` §3 ✓

**Wave 3** *(blocked on 03-02 — fragile-area isolation per CONCERNS.md)*:
- [x] 03-03-PLAN.md — D-26 Surface 3: parameterise `endCurrentQuarter` in `src/lib/stores/liveGameStore.ts` ✓

**Wave 4** *(blocked on 03-03)*:
- [x] 03-04-PLAN.md — D-26 Surfaces 1+2: wire `quarterMs` prop through `src/components/live/LiveGame.tsx` + AFL-branch caller in `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` ✓

**Wave 5** *(blocked on 03-04)*:
- [x] 03-05-PLAN.md — Full gauntlet (`tsc && npm test && npm run lint && npm run e2e`) all-green; D-12 satisfied (multi-sport-schema.spec.ts flipped green) ✓

**Wave 6** *(blocked on 03-05)*:
- [x] 03-06-PLAN.md — PROD-01..04 + ABSTRACT-01..03 evidence captured, D-21 tag invariant intact; `03-MERGE-LOG.md` §4+§5+§6 finalized (Phase 4 hand-off) ✓

**Cross-cutting constraints** *(must hold across all plans)*:
- `pre-merge/main` (`80a04eb`) and `pre-merge/multi-sport` (`1277068`) annotated tags are NEVER moved (D-21)
- The merge work happens on a NEW branch `merge/multi-sport-trunk` (created off `multi-sport` HEAD per D-19); `claude/vibrant-banzai-a73b2f` does NOT receive the merge commit
- `git merge --no-ff` only — no `--squash`, no `git rebase -i` for squashing (D-20)
- No `git push --force` to `main` at any point (D-09 carried forward; Phase 7 owns the path to production main)
- D-26 redirect targets exactly THREE sites (`LiveGame.tsx:657`, `LiveGame.tsx:791`, `liveGameStore.ts:347`) — research found `QuarterBreak.tsx` uses proportional math and needs no redirect (correction to CONTEXT.md D-26)
- PlayHQ live-import `test.fixme` in `e2e/tests/playhq-import.spec.ts` MUST survive (PROD-04 — easy to accidentally "fix")

### Phase 4: Netball verification on merged trunk
**Goal**: Every netball capability from the multi-sport branch works correctly on the merged trunk — coaches can run a full netball game from lineup to summary card
**Depends on**: Phase 3
**Requirements**: NETBALL-01, NETBALL-02, NETBALL-03, NETBALL-04, NETBALL-05, NETBALL-06, NETBALL-07, NETBALL-08
**Success Criteria** (what must be TRUE):
  1. NetballLiveGame renders and transitions through all six game states (pre-kickoff, pre-Q1, live, Q-break, between-Q4-and-finalise, finalised) with wall-clock-anchored countdown, pause/resume, and auto-end-at-hooter all working
  2. NetballQuarterBreak produces rotation suggestions using all 5 fairness tiers in the correct priority order, with tie-breaks on `thisGameTotalMs` then season availability ratio
  3. Goal scoring flow is fully wired for netball: GS/GA tap → confirm sheet → `recordNetballGoal` → 8-second undo toast → persistent undo chip → per-player goal counts visible on bench strip and summary card
  4. `track_scoring=false` suppresses every scoring affordance on every surface — including the walkthrough scoring step, score bug numbers, and summary card lines — while long-press still opens the actions modal
  5. Netball stats dashboard renders all 5 sections with per-position breakdown; `stats/page.tsx` routes AFL events to AFL aggregators and netball events to netball aggregators with no cross-contamination
  6. First-visit walkthrough fires on netball live shell, persists `nb-walkthrough-seen`, and the scoring step gate is covered by the existing `netballWalkthroughSteps.test.ts`
  7. Long-press actions modal, mid-quarter replacement sheet, and late-arrival menu all function on the netball live shell
**Plans**: 7 plans

**Wave 1** *(no parallel — hygiene + helper foundation)*:
- [ ] 04-01-PLAN.md — Side-finding #1 (gitignore Playwright artefacts) inline + `e2e/helpers/seed-audit.ts` (Kotara Koalas presence audit for TEST-05)

**Wave 2** *(parallel — independent surfaces, blocked on 04-01)*:
- [ ] 04-02-PLAN.md — `e2e/tests/netball-walkthrough.spec.ts` (NETBALL-07 — first-visit fire, persistence, scoring-step gate)
- [ ] 04-03-PLAN.md — `e2e/tests/netball-stats.spec.ts` (NETBALL-05) + `e2e/tests/netball-summary.spec.ts` (NETBALL-06)

**Wave 3** *(blocked on 04-02 + 04-03 — fragile-area source fix)*:
- [ ] 04-04-PLAN.md — Wire `trackScoring` prop through `NetballLiveGame` + `NetballGameSummaryCard` + `page.tsx` call sites (NETBALL-04, NETBALL-07 source fix; flips wave-2 expected-red tests green) — autonomous: false

**Wave 4** *(blocked on 04-04 — heaviest spec on the fragile surface)*:
- [ ] 04-05-PLAN.md — `e2e/tests/netball-live-flow.spec.ts` (NETBALL-01 + NETBALL-03 + NETBALL-04 live-shell + NETBALL-08 + ABSTRACT-03 quarter-length override) — autonomous: false

**Wave 5** *(blocked on 04-01 + 04-05 — depends on Kotara audit + live-flow scaffolding)*:
- [ ] 04-06-PLAN.md — `e2e/tests/netball-quarter-break.spec.ts` (NETBALL-02 — 5 fairness tiers + Kotara-optional season-history path)

**Wave 6** *(gate — full gauntlet + Phase 5 hand-off)*:
- [ ] 04-07-PLAN.md — Full gauntlet (`tsc && npm test && npm run lint && npm run e2e`) + `04-EVIDENCE.md` with NETBALL-N traceability + Phase 3 invariants re-verified — autonomous: false

**Cross-cutting constraints** *(must hold across all plans)*:
- `pre-merge/main` + `pre-merge/multi-sport` tags MUST stay frozen (D-21 carried forward from Phase 3)
- `e2e/tests/playhq-import.spec.ts` `test.fixme` MUST stay (PROD-04)
- D-26/D-27 `quarterMs` wiring at `LiveGame.tsx` + `liveGameStore.ts` MUST NOT be touched
- Existing AFL e2e specs MUST NOT be modified
- Source code in `src/` touched ONLY to fix NETBALL-N blockers (plan 04-04 only)
- Pause-event persistence bug NOT addressed (deferred per CONTEXT)

**UI hint**: yes

### Phase 5: Test + type green
**Goal**: The merged trunk passes every automated quality gate — no Vitest failures, no Playwright failures, no TypeScript errors, no lint errors, and the Kotara Koalas seed team is intact for ongoing netball validation
**Depends on**: Phase 4
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. `npm test` (Vitest) exits 0 with >= 153 tests passing — includes all pre-merge unit tests plus `netballWalkthroughSteps.test.ts`, `netballFairness.test.ts`, and any prod-side unit tests
  2. `npm run e2e` (Playwright) exits 0 with all specs green — no fixmes unintentionally un-fixed, PlayHQ import remains intentionally fixme'd
  3. `npx tsc --noEmit` exits 0 with no type errors across the full merged codebase
  4. `npm run lint` exits 0 with no ESLint errors
  5. Kotara Koalas team (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`) is queryable in local Supabase with 9 active players and 5 simulated games, usable as a netball validation seed
**Plans**: 5 plans

**Wave 1** *(seed-data — TEST-05 closure)*:
- [x] 05-01-PLAN.md — Added Kotara Koalas seed to `supabase/seed.sql` (Option A pure-SQL DO-block worked; Option B fallback not triggered). Closes TEST-05; netball-quarter-break.spec.ts:380 Kotara-optional test FLIPPED from SKIP to PASS. Full e2e suite now 52 PASS / 1 SKIP (PROD-04 fixme only). ✓ 2026-04-30

**Wave 2** *(blocked on 05-01 — pure refactor)*:
- [x] 05-02-PLAN.md — Extracted `waitForAdminHydration(switchLocator, opts?)` to `e2e/helpers/admin-hydration.ts`; refactored settings.spec.ts (×1) + roster.spec.ts (×2) + game-edit.spec.ts comment cross-reference. Closes Phase-3 deferred Side-finding #3. Full e2e gauntlet stable at 52 PASS / 1 SKIP (matches Plan 05-01 baseline). ✓ 2026-04-30

**Wave 3** *(blocked on 05-02 — bootstrap script)*:
- [ ] 05-03-PLAN.md — Add port-3000 probe to `scripts/e2e-setup.mjs` (cross-platform via `node:net` `createServer().listen(3000)`; reuses existing dev server when present, aborts with PID + kill-suggestion when port held by hostile process). Closes Phase-3 deferred Side-finding #2.

**Wave 4** *(blocked on 05-03 — FRAGILE-area-adjacent source fix)*:
- [ ] 05-04-PLAN.md — `revalidatePath` in `endNetballQuarter` (non-final branch) + `startNetballQuarter`; `router.refresh()` in `NetballLiveGame.tsx` auto-hooter + start-Q1 + manual-end-Q4 paths AND in `NetballQuarterBreak.tsx` Start-Qn handler. Remove 3 `page.reload()` workarounds from `netball-live-flow.spec.ts` (×2) + `netball-quarter-break.spec.ts` (×1) and confirm specs stay green. Closes Phase-4 deferred items #1 (revalidatePath gap) + #2 (router.refresh gap) — autonomous: false.

**Wave 5** *(blocked on 05-04 — gauntlet + Phase 6 hand-off)*:
- [ ] 05-05-PLAN.md — Full gauntlet (`tsc && lint && vitest && e2e --workers=1` + PROD-01 per-spec re-run) + author `05-EVIDENCE.md` aggregating TEST-01..05 traceability + Phase 3/4 invariant re-verification + Phase 6 hand-off block. Final human-verify checkpoint signs off Phase 5 — autonomous: false.

**Cross-cutting constraints** *(must hold across all plans)*:
- `pre-merge/main` (`e9073dd…`) and `pre-merge/multi-sport` (`e13e787c…`) tags MUST stay frozen (D-21 carried forward)
- `e2e/tests/playhq-import.spec.ts` `test.fixme` MUST stay (PROD-04 — exactly 1 occurrence)
- D-26 `quarterMs` hits in `src/components/live/LiveGame.tsx` MUST stay at 5 (AFL surface untouched)
- D-27 `quarterMs` hits in `src/lib/stores/liveGameStore.ts` MUST stay at 4 (AFL surface untouched)
- ABSTRACT-01 4 UI-presentation matches outside `src/lib/sports/` MUST stay (pre-classified acceptable per Phase 3 plan 03-06)
- Phase 4 plan 04-04 `trackScoring` prop chain in NetballLiveGame.tsx + NetballGameSummaryCard.tsx + live/page.tsx MUST stay intact (Plan 05-04 adds router.refresh; doesn't rewire trackScoring)
- All netball + AFL e2e specs from Phases 1-4 MUST stay green
- Pause-event persistence bug NOT addressed (deferred per Phase 3 CONTEXT)
- ABSTRACT-01 / PROD-04 CI guards stay backlog (per Phase 3 CONTEXT)
- `src/` touched ONLY in Plan 05-04 (revalidatePath + router.refresh source fix)
- `supabase/migrations/` NOT touched (TEST-05 seed lands in `supabase/seed.sql`, not a migration)

**UI hint**: no

### Phase 6: Preview deploy + manual validation
**Goal**: The merged trunk is deployed to a Vercel preview environment backed by a Supabase prod clone, and a human has manually verified that both sports work end-to-end against real-shape data
**Depends on**: Phase 5
**Requirements**: DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. A Vercel preview deployment exists, built from the merged trunk, pointing at a Supabase environment populated with a recent prod snapshot (or a prod clone) — not the local seed
  2. A human has run an actual AFL game flow end-to-end on the preview (lineup, scoring, quarter-break, summary card, share link) and confirmed no errors
  3. A human has run an actual netball game flow end-to-end on the preview (lineup, scoring, quarter-break, stats dashboard, summary card) and confirmed no errors
  4. Existing AFL share links (`/run/[token]` pattern) resolve correctly on the preview — no RLS errors, no 404s
**Plans**: 5 plans (3 autonomous prep + 2 BLOCKED on user creds per 06-CONTEXT.md)

**Wave 1** *(autonomous — pre-deploy hygiene)*:
- [ ] 06-01-PLAN.md — Author `06-DEPLOY-CHECKLIST.md` — env-var matrix (3 critical + 7 optional), `vercel.json` audit, `next.config.mjs` audit, build-step sanity, 27-migration enumeration

**Wave 2** *(autonomous — runbook authoring; blocked on 06-01)*:
- [ ] 06-02-PLAN.md — Author `06-DEPLOY-RUNBOOK.md` — step-by-step Phase A (Supabase clone) → Phase B (apply 0024..0027) → Phase C (Vercel preview env) → Phase D (deploy trigger; both git-push + CLI paths) → Phase E (smoke check) → Rollback path

**Wave 3** *(autonomous — verify script; blocked on 06-01 + 06-02)*:
- [ ] 06-03-PLAN.md — Author `scripts/verify-prod-clone.mjs` — read-only Node ESM script, runs Phase 2 §6 acceptance queries (Q1 migration count, Q3 no null sports, Q4 distinct sports include 'afl', Q5 share-token sample), exits 0 only if all pass

**Wave 4** *(autonomous: false; BLOCKED on user creds — Supabase prod clone + Vercel preview env)*:
- [ ] 06-04-PLAN.md — Execute the runbook end-to-end with user; record evidence in `06-04-SUMMARY.md` (preview URL + clone project ref + verify-script output). Closes DEPLOY-01.

**Wave 5** *(autonomous: false; BLOCKED on 06-04 completion)*:
- [ ] 06-05-PLAN.md — Manual AFL flow + netball flow + share-link smoke walkthrough on the live preview; record per-surface PASS/FAIL in `06-VALIDATION.md`. Closes DEPLOY-02.

**Cross-cutting constraints** *(must hold across all plans)*:
- `pre-merge/main` (`e9073dd…`) and `pre-merge/multi-sport` (`e13e787c…`) tags MUST stay frozen (D-21 carried forward)
- Phase 5 baseline gauntlet (tsc + vitest 169/169 + lint + e2e 52/1) MUST stay green — Plans 06-01..03 author DOCUMENTATION + ONE script only; `src/`, `supabase/migrations/`, `e2e/tests/`, `e2e/fixtures/`, `e2e/helpers/` MUST NOT be touched
- `supabase/seed.sql` MUST NOT be modified (Kotara local-dev seed; prod clone uses backup-restore)
- `scripts/verify-prod-clone.mjs` MUST be read-only (zero `.insert` / `.update` / `.delete` / `.rpc` calls)
- Plans 06-04 + 06-05 MUST NOT touch the Vercel "Production" environment scope — only "Preview" (D-CONTEXT-no-prod-touch carry-forward)
- Plan 06-04 + 06-05 evidence files MUST NOT log JWTs (defensive grep for `eyJ…` pattern at end of each)
- DEPLOY-04 (post-cutover smoke test) is Phase 7's job — Phase 6 plans MUST NOT include it
- pause-event persistence bug stays deferred (Phase 3 CONTEXT carry-forward)
- `deleteTestUser` cleanup race stays deferred (Phase 5 deferred carry-forward)
- ABSTRACT-01 / PROD-04 CI guards stay backlog (Phase 3 CONTEXT carry-forward)

**UI hint**: yes (manual validation on the live preview at Plan 06-05)

### Phase 7: Production cutover + smoke test
**Goal**: `main` is fast-forwarded to the merged trunk, production Supabase has executed the new migrations, and the production environment is confirmed healthy for both existing AFL teams and new netball capability
**Depends on**: Phase 6
**Requirements**: DEPLOY-03, DEPLOY-04
**Success Criteria** (what must be TRUE):
  1. `main` branch points at the merged trunk; Vercel production deployment is green and serving the merged code
  2. Production Supabase has executed all new migrations in order (including the `teams.sport = 'afl'` backfill); `supabase migration list` shows no pending migrations
  3. At least one existing AFL production team loads without errors, displays correct player data, and its existing game history is intact
  4. At least one existing AFL share link resolves on production without RLS errors or null-sport panics
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Divergence inventory & merge plan | 1/1 | ✓ Complete | 2026-04-29 |
| 2. Schema reconciliation | 3/3 | ✓ Complete | 2026-04-29 |
| 3. Branch merge + abstraction integrity | 6/6 | ✓ Complete | 2026-04-30 |
| 4. Netball verification on merged trunk | 7/7 | ✓ Complete | 2026-05-01 |
| 5. Test + type green | 5/5 | ✓ Complete | 2026-05-01 |
| 6. Preview deploy + manual validation | 0/5 | In progress (planning complete; Plans 06-01..03 ready; Plans 06-04 + 06-05 BLOCKED on user creds) | - |
| 7. Production cutover + smoke test | 0/TBD | Not started | - |

---

## Milestone v1.1: Match Day Changes

**Defined:** 2026-06-01
**Spec + recon:** `.planning/MATCH-DAY-CHANGES-SPEC.md`
**Granularity:** standard (5-8 phases)

### Overview (v1.1)

v1.0 (multi-sport merge) is **paused at Phase 6**, not abandoned — its phases 1-7 above are preserved untouched. v1.1 makes live match-day management trustworthy and flexible across all three sports (AFL, netball, rugby league) by fixing four day-of bugs and adding four in-game planning controls. Phase numbering **continues from v1.0 — v1.1 starts at Phase 8.**

The order mirrors dependency, not blast-radius: a foundation phase removes the last AFL-hardcoded period literals and adds the `subIntervalFloorSeconds` knob (everything downstream is sport-agnostic by rule), then availability, then substitution timing, then the rotation-planning surfaces, then the player-insight summary. The iOS audio fix is independent and can land any time.

**Sport-agnostic rule (applies to every v1.1 phase):** never hardcode "quarter" — period structure (`periodCount` / `periodSeconds` / `periodLabel`) and zones/positions come from `getAgeGroupConfig(sport, ageGroup)`. Where a requirement says "across all sports", success is verifiable for AFL, netball, AND rugby league. Per CLAUDE.md, "done" includes a regression test (written red-first for bugs) and an e2e spec exercising the change through the UI; reuse-before-fork across the shared `live`/`quarter-break`/`sf` components.

### Phases (v1.1)

- [x] **Phase 8: Sport-agnostic period foundation** - Remove the last AFL-hardcoded live-game period literals onto `periodCount`/`periodSeconds` and add per-age-group `subIntervalFloorSeconds` (~240s default) — COMPLETE 2026-06-01
- [ ] **Phase 9: Availability that holds — pre-game & at breaks** - Picker availability edits persist to kickoff (B1); coaches can add/mark-out/mark-injured at any period break (B2)
- [ ] **Phase 10: Substitution timing that's fair** - Sub interval derived from period length (F4) and the suggester respects time-since-last-sub recency (B4)
- [ ] **Phase 11: Plan the rotation ahead of the break** - Override the upcoming sub rotation before it falls due (F1) and build the next period's lineup in the dying minutes (F2)
- [ ] **Phase 12: Long-press player insight** - Long-press shows in-game per-zone time, last-sub, per-period breakdown, plus season per-zone percentages (F3)
- [ ] **Phase 13: Hype song survives iOS backgrounding** - Re-arm the audio element/context after iOS suspension so goals in later periods still trigger the song (B3)

### Phase Details (v1.1)

### Phase 8: Sport-agnostic period foundation
**Goal**: Live-game period logic and the sub-interval floor are driven entirely from age-group config — no AFL-hardcoded period literals remain, and a per-age-group `subIntervalFloorSeconds` exists for downstream sub-timing work
**Depends on**: Nothing (first v1.1 phase; prerequisite for the rest of the milestone)
**Requirements**: CONFIG-01, CONFIG-02
**Success Criteria** (what must be TRUE):
  1. No hardcoded period-count literal survives in the shared live surfaces — `currentQuarter >= 4` / `< 4` in `LiveGame.tsx`/`NetballLiveGame.tsx` and `FULL_QUARTER_MS` in `fairness.ts` all read `periodCount`/`periodSeconds` (`LeagueLiveGame.tsx` remains the reference)
  2. "Is this the last period / is the game over" and full-period time accounting resolve correctly for AFL and netball (4 quarters) AND rugby league (quarters or halves by age group) without a code change per sport
  3. Every age-group config exposes a `subIntervalFloorSeconds` (default 240s, per-age-group overridable) that a sub-interval derivation can read as its floor
  4. A regression test (written red-first) pins that a non-4-period or half-based sport drives last-period/game-over logic correctly, and existing AFL/netball e2e specs stay green
**Plans**: 4 plans

**Wave 1** *(parallel — independent foundation pieces, no file overlap)*:
- [x] 08-01-PLAN.md — Extract the pure `periodPhase()` helper (`src/lib/live/periodPhase.ts`) + unit-test it at periodCount=4 AND periodCount=2 (D-07, D-08) ✓ 2026-06-01
- [x] 08-02-PLAN.md — Add required `subIntervalFloorSeconds: number` to the sports-config `AgeGroupConfig` + set explicit 240 on every AFL/netball/rugby_league entry + sports.test.ts assertion (D-05, D-06, D-09) ✓ 2026-06-01

**Wave 2** *(blocked on 08-01 — consumes the helper)*:
- [x] 08-03-PLAN.md — Thread `ageGroup` into `LiveGame.tsx` + drive LiveGame/NetballLiveGame booleans and both live/page.tsx sticky bars off `periodCount` via `periodPhase()`; no hardcoded 4 survives (D-01, D-07) ✓ 2026-06-01

**Wave 3** *(blocked on 08-03 — shares live/page.tsx)*:
- [x] 08-04-PLAN.md — Replace `FULL_QUARTER_MS` with a trailing optional `fullPeriodMs` param feeding per-game effective ms from the 3 production callers + the 2-period rugby-league boundary e2e (D-02, D-03, D-04, D-10) ✓ 2026-06-01

**Cross-cutting constraints** *(must hold across all plans)*:
- All four DoD gates (`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run e2e`) green before each commit (D-11)
- The ~20 existing fairness unit-test callers stay green UNCHANGED via the `fullPeriodMs` back-compat default (D-04)
- Legacy `src/lib/ageGroups.ts` is NOT modified — the sports-config type is the sole source of truth for `subIntervalFloorSeconds` (D-06a)
- `suggestSwaps` (fairness.ts:839) is NOT touched — that ranking is Phase 10 / B4 (D-04a)
- LiveGame's existing scalar props are KEPT — collapsing the redundancy is deferred (D-01b)

**UI hint**: no (mechanical refactor; verified by unit tests + the existing/extended e2e suites)

### Phase 9: Availability that holds — pre-game & at breaks
**Goal**: A coach's availability decisions are trustworthy across the whole match-day lifecycle — what they set pre-game survives to kickoff, and they can adjust the squad at any period break
**Depends on**: Phase 8
**Requirements**: AVAIL-01, AVAIL-02
**Success Criteria** (what must be TRUE):
  1. A player marked unavailable in the pre-game lineup picker is still unavailable when the game starts — the edit persists to `game_availability` and is honoured at kickoff, verified across all sports
  2. The B1 availability-control discrepancy is reconciled (recon found no availability toggle on `LineupPicker.tsx`) — the surface the coach thinks of as "the picker" actually writes availability, with the resolution documented
  3. At any period break a coach can add a newly-arrived player into the game, mark a present player out, and mark a player injured, on the shared quarter-break surface, across all sports
  4. Regression tests (written red-first) cover picker-availability persistence and each break-time availability action through the UI; reuse-before-fork — `addLateArrival` is wired into the break surface rather than a new writer
**Plans**: TBD
**UI hint**: yes

### Phase 10: Substitution timing that's fair
**Goal**: Substitution cadence is driven by the actual period length and individual sub recency — the suggester stops pulling a kid who just came on and the interval adapts to the sport's period
**Depends on**: Phase 8 (reads `subIntervalFloorSeconds`)
**Requirements**: SUB-01, SUB-02
**Success Criteria** (what must be TRUE):
  1. The sub interval is derived from period length — a pure function returns the smallest even divisor of the period length that is >= the age-group `subIntervalFloorSeconds`, with a near-even fallback when no clean divisor exists — replacing the fixed constant, across all sports
  2. A player subbed on late in one period is not suggested off again early in the next period — the suggester accounts for time-since-last-sub, derived from existing stint/swap events (no schema migration), across all sports
  3. The recency signal is derived at replay time from existing events and shared with the F3 last-sub derivation (no per-player last-sub timestamp added to the DB)
  4. Regression tests (written red-first) cover the interval derivation pure function (clean-divisor and near-even-fallback cases) and the recency guard preventing the early-re-sub case
**Plans**: TBD

### Phase 11: Plan the rotation ahead of the break
**Goal**: A coach can get ahead of the rotation instead of only reacting — review/override the upcoming sub before it falls due, and build the next period's lineup during the dying minutes of the current one
**Depends on**: Phase 8, Phase 10 (the upcoming rotation reflects the derived interval + recency-aware suggestions)
**Requirements**: ROTPLAN-01, ROTPLAN-02
**Success Criteria** (what must be TRUE):
  1. A coach can review the upcoming suggested sub rotation before it falls due, edit it, and the live game honours the override when the sub comes due
  2. During the final minutes of a period a coach can build/preview the next period's lineup, so they arrive at the break with a plan already in place, across all sports
  3. F1 and F2 share one "edit an upcoming rotation" surface (reuse-before-fork) seeded from current game state via the existing sport-agnostic Game Plan projector — no forked per-sport modal
  4. The plan-ahead controls are reachable and tappable one-handed on the live-game surface, and an e2e spec exercises override-then-honour and build-next-period through the UI
**Plans**: TBD
**UI hint**: yes

### Phase 12: Long-press player insight
**Goal**: Long-pressing any player gives the coach a complete, trustworthy read on that kid's time — where they've played this game and across the season — without leaving the live surface
**Depends on**: Phase 8, Phase 10 (reuses the derived last-sub/recency signal)
**Requirements**: PLAYERVIEW-01, PLAYERVIEW-02
**Success Criteria** (what must be TRUE):
  1. Long-pressing a player shows their in-game breakdown — per-zone time, time since last sub, and a per-period minutes-per-zone breakdown (derived from the event replay), across all sports
  2. The same summary shows the player's season per-zone split as percentages only — no raw season minutes — across all sports
  3. Zones in the summary are enumerated from `getAgeGroupConfig(sport, ageGroup).zones`, not a hardcoded list, so AFL/netball/rugby-league zone labels render correctly
  4. The summary opens from the existing long-press → `LockModal` gesture (reuse-before-fork), and an e2e spec verifies the in-game and season sections render through the UI
**Plans**: TBD
**UI hint**: yes

### Phase 13: Hype song survives iOS backgrounding
**Goal**: The team hype song keeps firing on goals through the whole game on iOS — it no longer goes silent after Q1 when the OS suspends the audio context
**Depends on**: Nothing (independent of every other v1.1 phase — can run any time / in parallel)
**Requirements**: AUDIO-01
**Success Criteria** (what must be TRUE):
  1. After iOS suspends the audio element/context (backgrounding / period transitions), it is re-armed — a goal scored in a later period still triggers the hype song, not just Q1
  2. The fix lives in `useHypeSong.ts` and re-arms via a visibility/app-state handler; the song effect survives period breaks rather than only tearing down on gameId change/unmount
  3. The fix re-arms the existing audio mechanism (YouTube-iframe / `new Audio()`) without reworking the audio path, and silent failure swallowing no longer hides a suspended-context error
  4. A regression test (written red-first) reproduces the post-Q1 silence and confirms the song fires after a simulated suspend/re-arm cycle
**Plans**: TBD

### Progress (v1.1)

**Execution Order:**
Phases execute in numeric order: 8 → 9 → 10 → 11 → 12 → 13. Phase 13 (AUDIO-01) is independent and may run any time / in parallel.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Sport-agnostic period foundation | 4/4 | ✓ Complete | 2026-06-01 |
| 9. Availability that holds — pre-game & at breaks | 0/TBD | Not started | - |
| 10. Substitution timing that's fair | 0/TBD | Not started | - |
| 11. Plan the rotation ahead of the break | 0/TBD | Not started | - |
| 12. Long-press player insight | 0/TBD | Not started | - |
| 13. Hype song survives iOS backgrounding | 0/TBD | Not started | - |
