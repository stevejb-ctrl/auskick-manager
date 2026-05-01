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
- [ ] **Phase 5: Test + type green** - Achieve full CI green: Vitest, Playwright e2e, TypeScript, lint, and seed team intact
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
**Plans**: TBD

### Phase 6: Preview deploy + manual validation
**Goal**: The merged trunk is deployed to a Vercel preview environment backed by a Supabase prod clone, and a human has manually verified that both sports work end-to-end against real-shape data
**Depends on**: Phase 5
**Requirements**: DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. A Vercel preview deployment exists, built from the merged trunk, pointing at a Supabase environment populated with a recent prod snapshot (or a prod clone) — not the local seed
  2. A human has run an actual AFL game flow end-to-end on the preview (lineup, scoring, quarter-break, summary card, share link) and confirmed no errors
  3. A human has run an actual netball game flow end-to-end on the preview (lineup, scoring, quarter-break, stats dashboard, summary card) and confirmed no errors
  4. Existing AFL share links (`/run/[token]` pattern) resolve correctly on the preview — no RLS errors, no 404s
**Plans**: TBD

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
| 5. Test + type green | 0/TBD | Not started | - |
| 6. Preview deploy + manual validation | 0/TBD | Not started | - |
| 7. Production cutover + smoke test | 0/TBD | Not started | - |
