# Roadmap: Siren — Multi-sport merge to production

## Overview

Two long-lived branches — `main` (60 production commits since fork) and `multi-sport` (74 commits, full netball MVP) — must be reconciled into a single trunk without data loss, without regressions on AFL, and with netball fully verified before production is touched. The phase order mirrors the blast-radius: plan before acting, fix the schema before merging code, merge code before verifying features, verify features before deploying, deploy to preview before touching prod.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Divergence inventory & merge plan** - Produce a written inventory of both branches, capture pre-merge tags, and document the conflict surface before any code changes
- [ ] **Phase 2: Schema reconciliation** - Renumber/interleave migrations, add backfill, write the e2e spec exercising new columns through the UI
- [ ] **Phase 3: Branch merge + abstraction integrity** - Execute the merge, resolve conflicts coherently, verify sports abstraction is the single dispatch point and all prod-side enhancements are preserved
- [ ] **Phase 4: Netball verification on merged trunk** - Run every netball flow end-to-end on the merged codebase and confirm all 8 capabilities work correctly
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
**Plans**: TBD
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
**Plans**: TBD

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
**Plans**: TBD
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
**Goal**: `main` is fast-forwarded to the merged trunk, production Supabase has taken the new migrations, and the production environment is confirmed healthy for both existing AFL teams and new netball capability
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
| 2. Schema reconciliation | 0/TBD | Not started | - |
| 3. Branch merge + abstraction integrity | 0/TBD | Not started | - |
| 4. Netball verification on merged trunk | 0/TBD | Not started | - |
| 5. Test + type green | 0/TBD | Not started | - |
| 6. Preview deploy + manual validation | 0/TBD | Not started | - |
| 7. Production cutover + smoke test | 0/TBD | Not started | - |
