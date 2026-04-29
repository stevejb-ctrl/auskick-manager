# Phase 3: Branch merge + abstraction integrity - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 executes the actual reconciliation of `main` and `multi-sport` into a single trunk. By the end of Phase 3 the team has:

1. **A single merged trunk branch** containing every commit from main (60 since fork point `b3657c5`) and every commit from multi-sport (74 since fork point), with all 6 manual-resolution conflicts (per Phase 1 §3) coherently resolved and the rename/rename migration handled per Phase 2 §2 (delete main's `0024_super_admin.sql`).
2. **A working trunk:** `npx tsc --noEmit`, `npm test` (Vitest), and `npm run e2e` (Playwright) all green — including Phase 2's `e2e/tests/multi-sport-schema.spec.ts` which was authored expected-red and flips green here per D-12.
3. **`getEffectiveQuarterSeconds` as the sole quarter-length source of truth** on the merged trunk (D-07). Every main-side clock surface (countdown banner, hooter end-of-quarter, time-credit accounting in `liveGameStore`, Q-break time bars) now calls it directly.
4. **`Team.age_group: string` widening reconciled with main-side narrowed-enum consumers** (D-06). All previously-narrowed `AgeGroup` consumers patched to use `getSportConfig(team.sport).ageGroups` lookups uniformly.
5. **All PROD-01..04 enhancements preserved** through the merge: production-side e2e fixes (long-press, lineup availability, TagManager temp-id, injury-replacement, live-swaps, live-scoring), perf wave 3 (static marketing/auth, DB indexes, spinners), UX changes (back-arrow removal), PlayHQ live-import remains intentionally `fixme'd` per `e9bbc47`.
6. **A `03-MERGE-LOG.md` deliverable** that captures the resolution rationale for any unmapped conflicts surfaced during the actual merge, plus the per-file decision audit for the 6 mapped conflicts. Mirrors Phase 1's MERGE-NOTES.md §8 pattern. Reviewable post-hoc per MERGE-03.

**Hard scope discipline — what this phase MUST NOT do:**
- No `git push --force` to `main` (D-09). Phase 7 fast-forwards `main` to the merged trunk; not Phase 3.
- No deployment work (Vercel preview, prod cutover) — Phases 6 + 7.
- No new netball features beyond what multi-sport already shipped — Phase 4 verifies them, doesn't extend them.
- No new database migrations beyond the four lined up by Phase 2 — Phase 2 sealed the migration set.
- No PR merge to `main` — Phase 6/7 owns the path to production main.

**What this phase DOES write:**
- Merge work happens on a NEW branch (D-19 below) — fresh off `multi-sport` HEAD.
- Resolution edits to the 6 conflict files in `src/`.
- D-06 patches to `Team.age_group` consumers (TBD list — derived from `tsc --noEmit` output post-merge).
- D-07 redirects in 4 main-side clock surfaces (D-26 below).
- Possibly extends e2e fixtures or specs if conflict resolution demands it (e.g. updated factory call sites that conflict with Phase 2's extension).
- `.planning/phases/03-branch-merge-abstraction-integrity/03-MERGE-LOG.md` (audit trail).
- `03-PLAN.md` (executable plan), `03-CONTEXT.md` (this), `03-DISCUSSION-LOG.md`, `03-SUMMARY.md` (post-execute), `03-VERIFICATION.md` (post-verify).

</domain>

<decisions>
## Implementation Decisions

### Merge mechanic (where + how)

- **D-19 — Merge target branch:** A NEW branch (suggested name: `merge/multi-sport-trunk` — final name is Claude's discretion) created off `multi-sport` HEAD. The main + planning artifacts are absorbed via `git merge claude/vibrant-banzai-a73b2f` (which IS main + Phase 1+2 planning commits, so the merge captures both source code and the planning history). This preserves D-01 ("multi-sport becomes the new trunk") cleanly — main is the side being absorbed, not the target. The `claude/vibrant-banzai-a73b2f` branch (this worktree) is preserved as the planning-artifact reference until Phase 7 cleanup.

- **D-20 — Merge style:** `git merge --no-ff` (merge-commit). DO NOT squash. Preserves multi-sport's 74-commit history so future `git blame` on netball / abstraction code points to the actual authoring commit. The trunk log gets bushy for one merge — that's the cost we pay for accurate history.

- **D-21 — Tag preservation:** `pre-merge/main` annotated tag stays at its current target `80a04eb`. DO NOT re-tag. The tag's value is as the rollback baseline pointing at the LAST commit of true production main code before any merge or planning work began. Phase 2's planning commits are recoverable from the `claude/vibrant-banzai-a73b2f` branch refs anyway. `pre-merge/multi-sport` similarly stays at `1277068`.

### Conflict-resolution order + cadence

- **D-22 — Conflict-resolution order:** One-pass merge. Run `git merge claude/vibrant-banzai-a73b2f` once on the merge target branch; resolve all 6 mapped conflicts (live/page.tsx, games/page.tsx, app/layout.tsx, app/page.tsx, PlayerList.tsx, PlayerRow.tsx) plus the rename/rename on supabase/migrations/0024 (handled per Phase 2 §2 file ops) in a single resolution session, then commit the merge atomically. Matches D-20 — single merge-commit on the trunk.

- **D-23 — Test cadence during resolution:**
  - **After each individual conflict resolved:** `npx tsc --noEmit` only (fast, ~10s, catches resolution errors immediately at the type level).
  - **After ALL conflicts resolved AND `git commit` of the merge:** Run the §2 file ops from Phase 2's `02-SCHEMA-PLAN.md` (delete main's `0024_super_admin.sql`), then `npm run db:reset` to apply the new migration set, then the full gauntlet: `npx tsc --noEmit && npm test && npm run lint && npm run e2e`. The Phase 2 spec `e2e/tests/multi-sport-schema.spec.ts` flips green here per D-12.
  - **After D-06 + D-07 patches land:** Re-run the same gauntlet to confirm the patches don't regress anything.

- **D-24 — Unmapped conflict handling:** If `git merge` produces conflicts BEYOND the 6 mapped in Phase 1 §3 (e.g. a shared type file with a hidden three-way conflict, or a "clean-merge-likely" file that actually conflicts), STOP. Add a "Surprise conflicts" section to `03-MERGE-LOG.md` and write a one-line resolution rationale for each before resolving — mirrors Phase 1 §8 pattern. Every resolution must be reviewable post-hoc per MERGE-03 / D-09. Acceptable trade-off: slightly slower than resolving organically; significantly safer audit trail.

### D-06 + D-07 patching strategy

- **D-25 — `Team.age_group` patching pattern (D-06 follow-through):** Every main-side consumer that surfaces as a tsc error after the widening lands gets patched to use a `getSportConfig(team.sport).ageGroups.find(g => g.id === team.age_group)` lookup. Uniform pattern, no type casts, no per-call-site runtime guard helpers. The exact list of consumers is unknown until `npx tsc --noEmit` runs post-merge — Phase 3 plan should explicitly include a "discover consumers via tsc, patch uniformly, re-run tsc until clean" task.

- **D-26 — D-07 redirect scope:** ALL FOUR main-side clock surfaces are in scope for Phase 3:
  1. **Countdown banner** in `src/components/live/LiveGame.tsx` (the visible elapsed/remaining timer the coach sees during play).
  2. **Hooter end-of-quarter logic** (the auto-end-at-hooter trigger that fires the quarter-end event when the clock reaches the configured duration) — likely in `LiveGame.tsx` or a related quarter-management hook/component.
  3. **Time-credit accounting in `src/lib/stores/liveGameStore.ts`** (the `accumulatedMs` / per-player time-on-zone calculations that depend on the quarter duration). This is the most invasive — the store has multiple sites that compute elapsed-time-this-quarter.
  4. **Q-break time bars in `src/components/live/QuarterBreak.tsx`** (the fairness display whose bars depend on per-quarter duration to compute proportions).

- **D-27 — Redirect pattern:** Direct call to `getEffectiveQuarterSeconds(team, ageGroup, game)` at each use-site. Each consumer imports the function from `src/lib/sports/index.ts` (multi-sport's location) and replaces inlined age-group-default reads with the call. Matches multi-sport's existing pattern (it already does this throughout). No prop drilling layer, no `useEffectiveQuarterSeconds()` hook abstraction — the function is pure, fast, and easy to grep for compliance: `grep -r 'getEffectiveQuarterSeconds' src/components/live/ src/lib/stores/` should show ≥4 hits post-merge.

### PROD-01..04 verification — Claude's discretion (planner picks)

The 8 prod-side requirements (PROD-01: e2e fix commits; PROD-02: perf wave 3; PROD-03: UX changes; PROD-04: PlayHQ fixme preservation) need to survive the merge. The planner picks the verification approach — combinations are fine. Suggested:
- **Per-feature smoke check** for the e2e fixes (run each affected spec file after merge — the recovered `e2e` script from Phase 2 means `npm run e2e -- e2e/tests/long-press.spec.ts` is a valid invocation).
- **File-level grep audit** for static markers (e.g. `grep -r 'fixme' e2e/tests/playhq-import.spec.ts` to confirm PROD-04, or `grep "back-arrow" src/app/(app)/layout.tsx` returning zero matches per the back-arrow removal).
- **Diff audit against `pre-merge/main`** to confirm the post-merge codebase contains every commit from main since fork: `git log --oneline pre-merge/main..HEAD -- src/` should account for all 60 main commits as either present-in-merged-tree or surfaced in the merge commit.
- **The Phase 2 multi-sport-schema spec flipping green** is the implicit smoke test for the merged netball UI.

### Carrying forward from Phases 1 + 2 (re-affirmed, not re-decided)

- **D-01 → still valid:** Multi-sport becomes trunk; main absorbs in via this Phase 3 merge.
- **D-02 → still valid:** Same Vercel + Supabase project.
- **D-03 → satisfied at SQL level by Phase 2 audit** — `0024_multi_sport.sql` does atomic `NOT NULL DEFAULT 'afl'`. Phase 6 prod-clone runs the migration to confirm runtime behaviour.
- **D-04 → still valid for Phase 6:** Stage on Vercel preview before fast-forwarding main.
- **D-05 → executed in this phase:** Multi-sport's migration set is the trunk numbering. Phase 3's merge resolution executes the file ops from Phase 2 §2 (DELETE main's `0024_super_admin.sql`; KEEP multi-sport's 4 new + 1 renamed migrations).
- **D-08 → done.** Pre-merge tags exist on origin and stay where they are (D-21 above).
- **D-09 → still valid:** No `git push --force` to main. Phase 7 fast-forwards.
- **D-10 → executed in this phase:** Delete main's `0024_super_admin.sql` outright during merge resolution (Phase 2 §1 hash equality verified).
- **D-11 → no longer applies post-Phase-3** — Phase 2's read-only invariant on `supabase/migrations/` was a Phase 2 boundary. Phase 3 IS the moment migrations move.
- **D-12 → satisfied during this phase's verification.** Phase 2's `e2e/tests/multi-sport-schema.spec.ts` (currently expected red) flips green when Phase 3's merge lands the netball UI and migrations.
- **D-13/D-14/D-15 → unchanged.** The Phase 2 spec stays as authored; Phase 3 doesn't extend its surfaces.
- **D-16/D-17 → still valid:** Phase 2's migration-content audit is the SCHEMA-04 contribution; the runtime side is Phase 6.
- **D-18 → unchanged.** Phase 2's `02-SCHEMA-PLAN.md` is sealed; Phase 3 reads it but doesn't extend it.

### Claude's Discretion

- **Final merge branch name.** Suggested `merge/multi-sport-trunk` or `merge/main-into-multi-sport`. Planner picks.
- **PR strategy.** Single PR for the whole merge is the default. Only split if PR-review feedback specifically demands it (e.g. reviewer wants D-06 patches in a follow-up PR). Phase 3 is one logical unit of work; one PR matches.
- **Format of `03-MERGE-LOG.md`.** Markdown with sections for: §1 mapped-conflict resolution recap (cite Phase 1 §8 verbatim per file), §2 unmapped-conflict surprises (if any) + their rationale, §3 D-06 consumer patch list (post-tsc), §4 D-07 redirect compliance grep output (post-redirect), §5 PROD-01..04 verification results, §6 hand-off to Phase 4. Planner finalises.
- **Whether to insert human-checkpoints during the merge** — e.g. an `autonomous: false` task at "merge committed, ready to run gauntlet" so a human eyeballs the merge before tests run. Planner picks based on risk appetite. Recommended: at least one human-checkpoint after the merge commit lands and before D-06/D-07 patching (the highest-risk moment).
- **Whether to delete the `merge/multi-sport-trunk` branch** after Phase 7 cutover. Tag `pre-merge/multi-sport` already preserves the pre-merge state. Defer to Phase 7 cleanup.
- **Whether the Phase 2 e2e spec needs minor edits** post-merge if its locator strings find slightly different DOM structure than RESEARCH §3 anticipated. Planner allows this — it's not scope expansion, it's spec-fixing-itself against the real merged UI.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project guidance
- `CLAUDE.md` — testing-is-part-of-done; bug-fix-needs-regression-test-first (relevant for D-06 patches if any are bug-shaped); commit style (small reviewable commits — multi-sport's 74-commit history preserved per D-20 already gives plenty of granularity, but Phase 3's own resolution work should also be split into 3-5 focused commits if possible).
- `e2e/README.md` — when-to-add-test table, especially the "schema migration" row (covered by Phase 2's spec; Phase 3 verification ensures it greens).
- `.planning/PROJECT.md` — milestone context, Key Decisions table.
- `.planning/REQUIREMENTS.md` — the 8 Phase 3 requirement IDs (MERGE-01, ABSTRACT-01..03, PROD-01..04).
- `.planning/ROADMAP.md` — Phase 3 success criteria + cross-cutting constraints (lines 62-72).

### Phase 1 outputs (consumed directly — Phase 3 acts on these)
- `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` — especially:
  - **§3 file-level conflict matrix** — drives the merge resolution order; lists exactly which files conflict.
  - **§4 sports-abstraction restructure surface** — confirms zero file relocations on multi-sport (AFL components stayed where they were).
  - **§5 shared types and schemas** — flags the `Team.age_group` widening (D-06) and lists the `getEffectiveQuarterSeconds` redirect requirement (D-07).
  - **§6 server actions touched on both sides** — confirms zero hard conflicts on the action layer.
  - **§7 test-suite collision surface** — confirms zero e2e spec collisions; multi-sport's 3 unit-test additions land cleanly.
  - **§8 resolution rationale per non-trivial conflict** — the per-file decision Phase 3 must follow when resolving the 6 conflicts. THIS IS THE PRIMARY SOURCE — the planner cites it verbatim per file.
  - **§9 D-01..D-09 locked decisions** — re-affirmed in this CONTEXT.md.

### Phase 2 outputs (consumed directly)
- `.planning/phases/02-schema-reconciliation/02-CONTEXT.md` — D-10..D-18 locked decisions, especially D-10 (delete main's 0024) which Phase 3 EXECUTES.
- `.planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md` — especially:
  - **§2 file ops table** — the EXACT migration-tree operations Phase 3 must perform during merge resolution. 1 DELETE, 4 KEEP. Cite verbatim.
  - **§5 e2e spec design** — the spec exists at `e2e/tests/multi-sport-schema.spec.ts`; D-12 expects it to flip green during Phase 3 verification.
  - **§6 Phase 6 handoff** — Phase 6's prod-clone acceptance criteria for SCHEMA-04 (Phase 3 doesn't act on these but should not contradict them).
- `.planning/phases/02-schema-reconciliation/02-RESEARCH.md` — especially the verified facts about migration semantics (transactional DDL); component names on multi-sport (`TeamBasicsForm`, `ScoringStep`, `QuarterLengthInput`, sport-aware setup wizard at `setup/page.tsx`); analog spec patterns.

### Codebase intel
- `.planning/codebase/ARCHITECTURE.md` — system layers, Live game UI / fairness engine / store relationships (relevant for D-26 redirect work in `liveGameStore.ts`).
- `.planning/codebase/CONCERNS.md` — especially **§"Live game state machine"** (LiveGame.tsx + liveGameStore.ts + fairness.ts flagged as fragile, 3-layer architecture). The D-07 redirects in `liveGameStore.ts` are touching this fragile area and need extra rationale + extra test coverage.
- `.planning/codebase/TESTING.md` — fixture/factory patterns (Phase 2 already extended `makeTeam` with `sport` parameter); `expect.poll` idiom; "no DB mocks" cardinal rule.
- `.planning/codebase/STACK.md` — npm scripts (Phase 2 added `e2e` + `db:*`); env vars; tooling versions.

### Multi-sport source (cross-worktree reads — required during merge resolution)
- `../multi-sport/src/lib/sports/index.ts` — `getEffectiveQuarterSeconds` definition + resolution priority. D-27 redirect call sites import from here (post-merge: `src/lib/sports/index.ts`).
- `../multi-sport/src/lib/sports/registry.ts`, `../multi-sport/src/lib/sports/afl/index.ts`, `../multi-sport/src/lib/sports/netball/index.ts` — `SportConfig.ageGroups` arrays for D-25 lookups.
- `../multi-sport/src/components/live/` — multi-sport's versions of `LiveGame.tsx`, `QuarterBreak.tsx`, `Bench.tsx`, `Field.tsx`, etc. The merge resolution for `live/page.tsx` (per Phase 1 §8) takes multi-sport's structure and re-applies main's single edit at the AFL branch of the dispatch.
- `../multi-sport/src/lib/stores/liveGameStore.ts` — the multi-sport version of the store; informs D-26 time-credit accounting redirect.

### Branch references
- `main` HEAD `80a04eb` — production trunk (still pinned via `pre-merge/main`).
- `multi-sport` HEAD `1277068` — netball MVP trunk (still pinned via `pre-merge/multi-sport`).
- `claude/vibrant-banzai-a73b2f` HEAD (current working branch) — main + Phase 1+2 planning + Phase 3 CONTEXT (this commit). Source for the "main side" of the merge per D-19.
- The merge target branch (D-19) — to be created off `multi-sport` by Phase 3's first task.

### Auto-memory
- `feedback_supabase_insert_returning.md` — never chain `.select()` to `.insert()` (still applies during any factory or e2e edits).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (multi-sport, already in place — Phase 3 inherits)
- **`getEffectiveQuarterSeconds(team, ageGroup, game)`** at `src/lib/sports/index.ts` post-merge. Resolution priority `game.quarter_length_seconds ?? team.quarter_length_seconds ?? ageGroup.periodSeconds`. D-27 use-site target.
- **`getSportConfig(sport).ageGroups`** at `src/lib/sports/registry.ts` post-merge. D-25 lookup target. Array of `{ id, label, periodSeconds, onFieldSize, ... }` per sport.
- **Phase 2's extended `makeTeam` factory** at `e2e/fixtures/factories.ts` (already on this branch). Accepts `sport?: "afl" | "netball"` and `ageGroup: string`. Spec authoring during Phase 3 (if needed for unmapped-conflict regression tests) uses this directly.
- **Phase 2's `npm run e2e` and `db:*` scripts** in `package.json` (already on this branch). The merge inherits these — verify they survive the post-merge `package.json` (auto-merge from Phase 1 §3 was clean-merge-likely).

### Established Patterns (multi-sport — to extend across the merged trunk)
- **Sport dispatch via `src/lib/sports/`** — multi-sport's structural pattern. Post-merge, every sport-specific code path goes through this layer. ABSTRACT-01 enforces no AFL-baked-in conditionals survive.
- **Wall-clock-anchored countdown** (`Date.now() − Date.parse(quarterStartedAt)`) — multi-sport's hardening of the prior `+= 500ms` ticker. D-26 redirect work in `liveGameStore.ts` MUST preserve this.
- **Hooter single-fire via ref** — multi-sport's fix to prevent double-`endQuarter` writes. D-26 hooter redirect MUST preserve this.
- **Tier-4 friend-pair split magnitude `−5,000`** (not the original `−200`) — multi-sport's fairness tuning. Untouched by Phase 3 unless a fairness conflict surfaces.
- **`thisGameTotalMs` (numeric ms) sort key** — multi-sport's bug fix for the fairness suggester. Untouched by Phase 3.

### Integration Points
- **Migration application chain.** `npm run db:reset` (Phase 2-added) drives `supabase db reset`, which applies all 27 migrations from clean. Phase 3 runs this immediately after the merge commit + the §2 file ops, BEFORE `npm test` / `npm run e2e`.
- **`auth.setup.ts` storageState** — unchanged by Phase 3. The Phase 2 spec inherits it; the merge resolution doesn't touch e2e auth setup.
- **Vitest `aggregators.test.ts`** — multi-sport modified this; main did not. Per Phase 1 §7 it carries over cleanly. Phase 3 verifies `npm test` passes with the merged state including this file.

### Fragile areas to handle with extra care (CONCERNS.md)
- **Live game state machine** — LiveGame.tsx + liveGameStore.ts + fairness.ts. The D-26 redirect in `liveGameStore.ts` is the highest-risk single edit in Phase 3. Plan should include explicit before/after `npm test` runs around this edit specifically.
- **Long-press + lineup availability + TagManager temp-id** — touched by recent main commits (PROD-01). The merge of `PlayerList.tsx`/`PlayerRow.tsx` (Phase 1 §3 manual conflicts) takes main's most recent state per Phase 1 §8 — verify by running the relevant e2e specs (`long-press.spec.ts`, `availability.spec.ts`, etc.) after merge.

</code_context>

<specifics>
## Specific Ideas

- **Concrete merge command sequence** (planner encodes in tasks; final form is Claude's discretion):

  ```bash
  # Phase 3 Task 1 — set up the merge target branch
  git fetch --tags origin
  git fetch origin main multi-sport  # ensure refs are current
  git checkout -b merge/multi-sport-trunk multi-sport     # branch off multi-sport
  git status                                               # confirm clean

  # Phase 3 Task 2 — perform the merge (one-pass per D-22)
  git merge claude/vibrant-banzai-a73b2f --no-ff           # absorbs main + Phase 1+2 planning
  # Conflict markers appear in the 6 mapped files; resolve per Phase 1 §8 + Phase 2 §2

  # Phase 3 Task 3 — execute Phase 2 §2 file ops (D-10)
  git rm supabase/migrations/0024_super_admin.sql           # main's copy; multi-sport's 0025_super_admin.sql is canonical
  # Verify: 5 files in supabase/migrations/0024_* and 0025_* and 0026_* and 0027_* are exactly the multi-sport set
  git add -u && git commit -m "merge: ...rationale..."

  # Phase 3 Task 4 — D-26 redirects (4 surfaces)
  # Phase 3 Task 5 — D-25 patching (post-tsc consumer list)
  # Phase 3 Task 6 — full gauntlet
  npm run db:reset
  npx tsc --noEmit && npm test && npm run lint && npm run e2e
  ```

- **D-26 redirect target files (verify existence on this branch before writing tasks):**
  - `src/components/live/LiveGame.tsx` — countdown banner + hooter end-of-quarter logic. Single file, two edit sites.
  - `src/lib/stores/liveGameStore.ts` — time-credit accounting (multiple sites within the file — `accumulatedMs`, per-zone time math). The most invasive redirect.
  - `src/components/live/QuarterBreak.tsx` — Q-break time bars (per-quarter duration → bar proportions).

- **Compliance grep for D-26 (post-redirect):**
  ```bash
  grep -nE "getEffectiveQuarterSeconds" src/components/live/LiveGame.tsx src/lib/stores/liveGameStore.ts src/components/live/QuarterBreak.tsx
  # Expected: ≥4 matches across the 3 files (countdown + hooter in LiveGame.tsx, ≥1 in liveGameStore, ≥1 in QuarterBreak)
  ```

- **D-25 consumer discovery (post-merge tsc):**
  ```bash
  npx tsc --noEmit 2>&1 | grep -E "Type 'string' is not assignable to type 'AgeGroup'" | sort -u
  # Each unique error line points at a consumer needing the SportConfig.ageGroups lookup
  ```

- **Phase 2 spec flip-green check (Phase 3 verification step):**
  ```bash
  npm run e2e -- e2e/tests/multi-sport-schema.spec.ts
  # All 3 test cases must pass after the merge brings TeamBasicsForm + ScoringStep + QuarterLengthInput + the 4 new migrations
  ```

- **`03-MERGE-LOG.md` template** (suggested structure for the planner):
  ```
  # Phase 3 Merge Log

  ## §1 Mapped-conflict resolutions (verbatim from Phase 1 §8)
  | File | Resolution | Phase 1 §8 rationale |
  |------|-----------|---------------------|
  | live/page.tsx | took multi-sport's dispatch + re-applied main's single edit | (cite §8 row) |
  | ...

  ## §2 Unmapped conflict surprises (D-24)
  [If any. Each with file, why surprising, decision, rationale.]

  ## §3 D-25 AgeGroup consumer patches
  [List of patched files + line counts]

  ## §4 D-26 / D-27 redirect compliance
  [grep output post-redirect]

  ## §5 PROD-01..04 preservation evidence
  [Per-feature smoke check or grep audit results]

  ## §6 Hand-off to Phase 4 (netball verification)
  [What Phase 4 needs to know about the merge state]
  ```

- **Risk markers to surface in PLAN.md `must_haves`:**
  - The `liveGameStore.ts` redirect is the highest-risk single edit. CONCERNS.md flags this file as fragile. Plan should require: (a) explicit `git diff` snapshot before/after, (b) `npm test` run immediately after, (c) targeted e2e (`live-quarters.spec.ts`, `live-scoring.spec.ts`) immediately after.
  - PlayHQ fixme preservation (PROD-04) is easy to accidentally "fix" during the merge — explicit `grep test.fixme e2e/tests/playhq-import.spec.ts` returning a match is a non-negotiable acceptance criterion.

</specifics>

<deferred>
## Deferred Ideas

- **PR strategy details** (single vs split). Default is single PR. Phase 3 plan can default to single; only split if external review specifically demands it.
- **Performance verification of perf wave 3 changes (PROD-02)** — Phase 3 confirms presence/absence of files (DB indexes, spinners) but does not benchmark performance. Production smoke testing is Phase 6 + 7 territory.
- **`merge/multi-sport-trunk` branch deletion** — defer to Phase 7 cleanup (after main fast-forwards).
- **CI enforcement of "no AFL-baked-in conditionals in shared components"** (ABSTRACT-01 ongoing protection) — a lint rule or CI check that flags `team.sport === 'afl'` outside `src/lib/sports/`. Out of scope for this milestone; backlog item.
- **Exposure of `games.quarter_length_seconds` (per-game override) in the game-edit form** — UI/UX scope. The column exists, the resolver `getEffectiveQuarterSeconds` honours it, but no UI exposes it yet. Possibly v2 milestone.
- **NetballGameSummaryCard polish** — Phase 4 verifies it works; any visual polish lives in a future milestone.
- **`pause` event persistence** (CONCERNS.md "Pause time not event-persisted") — cross-cutting bug that exists on both branches. Out of scope for the merge; backlog.
- **Audit log for game event mutations** (CONCERNS.md "No audit log for game event mutations") — cross-cutting feature. Out of scope; backlog.

</deferred>

---

*Phase: 03-branch-merge-abstraction-integrity*
*Context gathered: 2026-04-29 via /gsd-discuss-phase*
