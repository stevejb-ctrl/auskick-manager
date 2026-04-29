---
phase: 01-divergence-inventory-merge-plan
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
autonomous: false
requirements:
  - MERGE-02
  - MERGE-03
must_haves:
  truths:
    - "A single markdown inventory exists at .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md and contains all 9 required sections from CONTEXT.md"
    - "The inventory names every file expected to conflict during the Phase 3 merge, categorised into clean-merge-likely / manual-resolution / superseded-by-multi-sport / deleted-on-one-side"
    - "The inventory documents migration-number collisions between main's post-fork migrations and multi-sport's 0024–0026, with a proposed renumbering for Phase 2 (NOT executed)"
    - "Resolution rationale is captured for every non-trivial conflict (manual-resolution and superseded-by-multi-sport entries)"
    - "The inventory's decision log records the locked-in choices Phase 3 must honour: multi-sport becomes new trunk, main's 60 commits absorb in"
    - "An annotated git tag pre-merge/main exists locally pointing at main's HEAD, with a message containing the fork point sha and a pointer to the inventory doc"
    - "An annotated git tag pre-merge/multi-sport exists locally pointing at multi-sport's HEAD, with a message containing the fork point sha and a pointer to the inventory doc"
    - "Both pre-merge/* tags exist on origin (remote) and survive a fresh clone — verifiable via `git ls-remote --tags origin`"
  artifacts:
    - path: ".planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md"
      provides: "Conflict-surface inventory with all 9 required sections"
      contains: "## Branch summary"
      min_lines: 150
    - path: "git tag pre-merge/main"
      provides: "Annotated protection tag on main HEAD pushed to origin"
      contains: "fork point: b3657c5"
    - path: "git tag pre-merge/multi-sport"
      provides: "Annotated protection tag on multi-sport HEAD pushed to origin"
      contains: "fork point: b3657c5"
  key_links:
    - from: "01-MERGE-NOTES.md decision log"
      to: "Phase 3 merge work"
      via: "Locked-in resolution rationale per non-trivial conflict"
      pattern: "## Decision log|## Resolution rationale"
    - from: "Annotated tag messages"
      to: "01-MERGE-NOTES.md"
      via: "Path reference in tag message body"
      pattern: ".planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md"
    - from: "Inventory migration-conflict section"
      to: "Phase 2 schema reconciliation"
      via: "Proposed renumbering scheme captured but not applied"
      pattern: "## Migration-number conflicts"
---

<objective>
Produce a complete written inventory of how `main` and `multi-sport` diverge, AND capture both branches as immutable annotated tags pushed to origin, so that Phase 3's merge work can act on a stable, reviewable map and can be re-run from a known good baseline if validation fails downstream.

**Purpose:** Phases 2 (schema), 3 (merge), and beyond all proceed against the inventory and the protection tags produced here. Without the inventory, Phase 3 re-investigates conflicts during the merge; without the tags, a failed merge cannot be cleanly retried.

**Output:** One markdown file at `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` (9 required sections) plus two annotated tags `pre-merge/main` and `pre-merge/multi-sport` on origin.

**Hard scope discipline (read-only):**
- NO source code edits (`src/`, `e2e/`, `supabase/`, `scripts/`)
- NO migration changes (Phase 2)
- NO conflict resolution (Phase 3)
- NO `git merge`, `git rebase`, `git cherry-pick` against real branches
- ONLY writes: the markdown inventory file + git annotated tags
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/PROJECT.md
@.planning/phases/01-divergence-inventory-merge-plan/01-CONTEXT.md
@.planning/codebase/STRUCTURE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/CONCERNS.md
@CLAUDE.md

<known_facts>
- Current worktree: `C:/Users/steve/OneDrive/Documents/Auskick manager/.claude/worktrees/vibrant-banzai-a73b2f` on branch `claude/vibrant-banzai-a73b2f`
- Sibling worktree for multi-sport: `C:/Users/steve/OneDrive/Documents/Auskick manager/.claude/worktrees/multi-sport` (checked-out branch: `multi-sport`, HEAD ≈ `1277068`)
- Main HEAD ≈ `80a04eb`; Main is 60 commits ahead of fork point
- Multi-sport HEAD ≈ `1277068`; Multi-sport is 74 commits ahead of fork point
- Fork point: `b3657c5` ("Merge fix/migration-0017-collision: rename duplicate 0017 migrations to 0017a/0017b")
- Multi-sport added migrations `0024-*`, `0025-*`, `0026-*` (sport column, track_scoring, per-team quarter override)
- Multi-sport restructured source tree: sports abstraction under `src/lib/sports/`, netball components under `src/components/netball/`
- Locked decision (D-01 from PROJECT.md Key Decisions): Multi-sport becomes the new trunk; main's 60 commits absorb into it via merge/rebase in Phase 3 (NOT cherry-pick)
- Test team Kotara Koalas (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`) lives in multi-sport's local Supabase seed — Phase 1 doesn't touch it; Phase 5+ uses it
</known_facts>

<storage_decision>
**Inventory file location: `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` (phase-scoped, NOT project-wide).**

**Justification (one line):** The inventory's primary consumers are Phase 2 and Phase 3 GSD work, which are themselves phase-scoped; storing the inventory at phase scope keeps `.planning/` root tidy and follows GSD convention. Tag annotation messages and the SUMMARY.md will reference this exact path.
</storage_decision>

<git_idiom>
- All `git` commands run from the current worktree (`vibrant-banzai-a73b2f`). Both branches are reachable as refs from any worktree (`main`, `multi-sport`, `origin/main`, `origin/multi-sport`).
- For reading multi-sport branch contents, prefer `git show multi-sport:path/to/file` over `cd`-ing into the sibling worktree. Reading the sibling worktree's filesystem directly is also acceptable for bulk listings (`ls .claude/worktrees/multi-sport/supabase/migrations/`).
- For dry-run conflict enumeration, use `git merge-tree --write-tree --merge-base=$(git merge-base main multi-sport) main multi-sport` and inspect the resulting tree, OR the simpler `git merge-tree -z $(git merge-base main multi-sport) main multi-sport` and grep for conflict markers.
- For tag operations, run from the current worktree but reference the right ref: `git tag -a pre-merge/main main -m "..."`, `git tag -a pre-merge/multi-sport multi-sport -m "..."`.
- DO NOT run `git checkout main` or `git checkout multi-sport` in this worktree — both branches are checked out elsewhere and switching here would conflict.
</git_idiom>

<inventory_required_sections>
The MERGE-NOTES.md file MUST contain these 9 sections (per CONTEXT.md decisions block). Section names below are canonical — Task 1/2/3 fill them in across the three tasks.

1. **Branch summary** — divergence stats, fork point sha, top-line commit counts, generation date
2. **Migration-number conflicts** — collision table + proposed renumbering (NOT executed)
3. **File-level conflict matrix** — categorised: clean-merge-likely / manual-resolution / superseded-by-multi-sport / deleted-on-one-side
4. **Sports-abstraction restructure surface** — files moved/renamed by multi-sport
5. **Shared types/schemas** — `Sport` type, `getEffectiveQuarterSeconds`, `game_events` types, `Team` type
6. **Server actions touched on both sides** — particularly under `src/app/(app)/teams/[teamId]/games/[gameId]/live/`
7. **Test-suite collision surface** — Playwright specs under `e2e/tests/` modified on both sides
8. **Resolution rationale** — one-line decision per non-trivial conflict
9. **Decision log** — locked-in choices Phase 3 must honour
</inventory_required_sections>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Branch reconnaissance + migration collision analysis (Sections 1, 2)</name>
  <files>
    .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
  </files>
  <action>
Create the MERGE-NOTES.md skeleton with all 9 section headings, then fill in **Section 1 (Branch summary)** and **Section 2 (Migration-number conflicts)**.

**For Section 1 (Branch summary), gather and record:**
1. Confirm fork point: `git merge-base main multi-sport` — must equal `b3657c5...` (full sha required in doc).
2. Confirm divergence stats: `git rev-list --left-right --count main...multi-sport` — record both counts.
3. Confirm branch HEADs: `git rev-parse main` and `git rev-parse multi-sport` — record full shas.
4. Per-branch commit summary: run `git log --oneline $forkpoint..main | wc -l` and `git log --oneline $forkpoint..multi-sport | wc -l` to corroborate the rev-list counts.
5. Record fork-point commit subject: `git log -1 --format=%s b3657c5`.
6. Record generation date: 2026-04-29.

**For Section 2 (Migration-number conflicts), gather and record:**
1. List main's post-fork migrations: `git log --name-only --diff-filter=A $forkpoint..main -- supabase/migrations/ | grep '\.sql$' | sort -u`.
2. List multi-sport's post-fork migrations: `git log --name-only --diff-filter=A $forkpoint..multi-sport -- supabase/migrations/ | grep '\.sql$' | sort -u`.
3. Build a collision table with columns: `Number | main filename | multi-sport filename | Status (collision / unique-to-main / unique-to-multi-sport)`.
4. For each collision, record: which branch's filename appears more semantically primary, what the migration does (one-line description from the SQL file's leading comment — read the SQL via `git show main:supabase/migrations/00XX_name.sql | head -20`), and a **proposed renumbering** for Phase 2 to execute (do NOT execute it here).
5. CONTEXT.md notes "Multi-sport added 0024, 0025, 0026" and "main may have added migrations after fork — Phase 1 documents the collision, doesn't fix it." If main has zero post-fork migrations, document that explicitly with `git log --diff-filter=A $forkpoint..main -- supabase/migrations/` showing no output.
6. Note the renumbering rule: multi-sport's 0024–0026 keep their semantic purpose; any colliding main migrations renumber upward (e.g., main's 0024 becomes 0027). Phase 2 will pick the actual numbers — Phase 1 just proposes.

**Skeleton to create (with all 9 headings even though only sections 1, 2 are filled):**
```markdown
# Phase 1 — Merge inventory: main ↔ multi-sport

**Generated:** 2026-04-29
**Phase:** 01-divergence-inventory-merge-plan
**Requirement:** MERGE-03 (conflict-resolution rationale captured)
**Tag pair:** `pre-merge/main`, `pre-merge/multi-sport` (created by Plan 01 Task 4–5)

## Section 1 — Branch summary
[fill]

## Section 2 — Migration-number conflicts
[fill]

## Section 3 — File-level conflict matrix
_To be filled by Task 2._

## Section 4 — Sports-abstraction restructure surface
_To be filled by Task 2._

## Section 5 — Shared types and schemas
_To be filled by Task 2._

## Section 6 — Server actions touched on both sides
_To be filled by Task 3._

## Section 7 — Test-suite collision surface
_To be filled by Task 3._

## Section 8 — Resolution rationale per non-trivial conflict
_To be filled by Task 3._

## Section 9 — Decision log
_To be filled by Task 3._
```

**Read-only enforcement:** Run all `git log`, `git show`, `git diff`, `git rev-list`, `git rev-parse`, `git merge-base`, `ls`. NEVER `git checkout`, `git merge`, `git rebase`, `git cherry-pick`, `git reset`, or any write to `src/` `e2e/` `supabase/` `scripts/`.
  </action>
  <verify>
    <automated>
      test -f .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q '^## Section 1 — Branch summary' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q '^## Section 2 — Migration-number conflicts' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q '^## Section 9 — Decision log' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q 'b3657c5' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
    </automated>
  </verify>
  <done>
    - MERGE-NOTES.md exists with all 9 section headings present
    - Section 1 contains: fork-point sha (b3657c5...), main HEAD sha, multi-sport HEAD sha, divergence counts (60 and 74 corroborated), fork-point commit subject, generation date
    - Section 2 contains: complete collision table with one row per post-fork migration on either branch, status column for each, proposed renumbering rule for Phase 2
    - No source code, test, migration, or script files have been modified (verify with `git status -- src/ e2e/ supabase/ scripts/` showing clean)
    - Sections 3–9 are placeholder stubs (`_To be filled by Task N._`)
  </done>
</task>

<task type="auto">
  <name>Task 2: File-level conflict matrix + restructure + shared types (Sections 3, 4, 5)</name>
  <files>
    .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
  </files>
  <action>
Replace the placeholder stubs for Sections 3, 4, 5 with the actual analysis. Do NOT touch Sections 1, 2, 6, 7, 8, 9.

**For Section 3 (File-level conflict matrix):**
1. Enumerate per-branch changed files since fork point:
   - `git diff --name-status $forkpoint..main > /tmp/main-changes.txt`
   - `git diff --name-status $forkpoint..multi-sport > /tmp/ms-changes.txt`
2. Compute the intersection (files changed on both sides) — these are the conflict candidates. Use `comm` or `awk` to compute the set intersection on file paths.
3. Run `git merge-tree --write-tree --merge-base=$(git merge-base main multi-sport) main multi-sport` and capture the conflict listing. Files that appear in the merge-tree conflict output are the **actual** textual conflicts; files that changed on both sides but don't show in merge-tree output will likely auto-merge cleanly.
4. For each file in the intersection, attribute changes to commits:
   - `git log --oneline $forkpoint..main -- <file>`
   - `git log --oneline $forkpoint..multi-sport -- <file>`
5. Categorise into a markdown table with columns: `File path | Main commits touching | Multi-sport commits touching | Category | Notes`. Categories:
   - `clean-merge-likely`: file in intersection but not flagged by `git merge-tree` (different sections / non-overlapping changes)
   - `manual-resolution`: file flagged by `git merge-tree` with conflict markers (overlapping edits)
   - `superseded-by-multi-sport`: file deleted/moved/renamed by multi-sport relative to fork point AND main edited the original path — main's changes will need re-applying at the new location
   - `deleted-on-one-side`: file deleted on exactly one branch
6. Bias toward over-listing: if uncertain, list the file under `manual-resolution` with a note.
7. Pay specific attention to files flagged in CONCERNS.md as fragile — call them out with a flag emoji or `**FRAGILE**` marker:
   - `src/components/live/LiveGame.tsx`
   - `src/lib/stores/liveGameStore.ts`
   - `src/lib/fairness.ts`
   - `src/components/live/Field.tsx`, `PlayerTile.tsx`, `Bench.tsx`
   - `src/components/live/InjuryReplacementModal.tsx`, `SwapCard.tsx`, `SwapConfirmDialog.tsx`
   - `src/components/admin/TagManager.tsx`

**For Section 4 (Sports-abstraction restructure surface):**
1. Enumerate files moved/renamed/added by multi-sport that constitute the sports abstraction:
   - `git diff --name-status -M -C $forkpoint..multi-sport -- 'src/lib/sports/' 'src/components/netball/' 'src/lib/dashboard/netballAggregators.ts' 'src/components/dashboard/NetballDashboardShell.tsx'`
2. List files that multi-sport renamed FROM (i.e. AFL-baked-in code that got pulled into `src/lib/sports/afl/` or `src/components/afl/` — use `git diff --find-renames=50%` style detection) and the destinations.
3. For each rename, check whether main edited the original path: `git log --oneline $forkpoint..main -- <original path>`. If yes, those edits will need redirecting to the new path during Phase 3 — note this explicitly. Cross-reference against Section 3's `superseded-by-multi-sport` entries.
4. Produce a markdown table: `Original path (in main) | New path (in multi-sport) | Main edits since fork? (Y/N + commit shas)`.

**For Section 5 (Shared types and schemas):**
1. Read multi-sport's added/changed type files via `git show multi-sport:<path>`:
   - `src/lib/sports/index.ts` (the `Sport` type, sport-dispatch interface)
   - `src/lib/sports/types.ts` (or wherever multi-sport puts the type definitions)
   - `src/lib/types.ts` (existing — multi-sport likely added `sport`, `track_scoring`, `quarter_length_seconds` to `Team`; new event types for netball goals)
2. Diff them against the fork point: `git diff $forkpoint..multi-sport -- src/lib/types.ts`.
3. Check whether main edited any of these files: `git log --oneline $forkpoint..main -- src/lib/types.ts src/lib/sports/`. (Main likely doesn't have `src/lib/sports/` at all — confirm absence with `git ls-tree -r main --name-only | grep -c '^src/lib/sports/'` returning 0.)
4. Document:
   - The `Sport` type signature (literal union? string?)
   - The `getEffectiveQuarterSeconds(team, ageGroup, game)` signature and the priority order it implements (per ABSTRACT-03 / ROADMAP)
   - Additions to `Team` interface: `sport`, `track_scoring`, `quarter_length_seconds` — including their TS types and whether they're nullable
   - New `game_events` event types added by multi-sport (netball goal events, etc.)
5. Note any type collisions where main also touched the same type (likely none, but verify).

**Read-only enforcement:** As Task 1.
  </action>
  <verify>
    <automated>
      grep -q '^## Section 3 — File-level conflict matrix' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q '^## Section 4 — Sports-abstraction restructure surface' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q '^## Section 5 — Shared types and schemas' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; ! grep -q 'Section 3.*To be filled' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; ! grep -q 'Section 4.*To be filled' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; ! grep -q 'Section 5.*To be filled' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q 'clean-merge-likely\|manual-resolution\|superseded-by-multi-sport' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q 'src/lib/sports' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
    </automated>
  </verify>
  <done>
    - Section 3 contains a populated table covering every file in the main..multi-sport intersection, with the four-way categorisation; FRAGILE flag on every file listed in CONCERNS.md fragile-areas section
    - Section 4 contains the rename/restructure table mapping original paths in main to new paths in multi-sport, with main-edits-since-fork attribution
    - Section 5 documents the `Sport` type, `getEffectiveQuarterSeconds` signature, `Team` additions, new `game_events` types, with collision notes
    - Sections 1, 2, 6, 7, 8, 9 unchanged from Task 1's state
    - `git status -- src/ e2e/ supabase/ scripts/` clean
  </done>
</task>

<task type="auto">
  <name>Task 3: Server actions, test surface, resolution rationale, decision log (Sections 6, 7, 8, 9)</name>
  <files>
    .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
  </files>
  <action>
Replace the placeholder stubs for Sections 6, 7, 8, 9 with the actual analysis. Do NOT touch Sections 1–5.

**For Section 6 (Server actions touched on both sides):**
1. Enumerate server-action files (`actions.ts` and `*-actions.ts`) changed on each branch since fork:
   - `git diff --name-only $forkpoint..main -- 'src/app/**/actions.ts' 'src/app/**/*-actions.ts'`
   - `git diff --name-only $forkpoint..multi-sport -- 'src/app/**/actions.ts' 'src/app/**/*-actions.ts'`
2. Special focus: `src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts` (main likely heavily edited it for live-scoring/live-swaps/injury-replacement fixes; multi-sport likely split it or refactored into sport-dispatch).
3. Confirm whether multi-sport added `src/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions.ts`: `git ls-tree multi-sport src/app/\(app\)/teams/\[teamId\]/games/\[gameId\]/live/` (or equivalent path-quoting that survives shell expansion).
4. Produce a table: `Action file | Changed on main? (commits) | Changed on multi-sport? (commits) | Conflict type (clean / overlapping / restructured) | Resolution hint`.
5. Cross-reference with the recent main commits 80a04eb, 1005fb5, 1e40777, 2ccc397, e9bbc47 (the 5 fix commits visible in `git log` — these are the post-fork e2e fixes mentioned in PROD-01).

**For Section 7 (Test-suite collision surface):**
1. Enumerate spec files changed on each branch:
   - `git diff --name-only $forkpoint..main -- 'e2e/tests/' 'e2e/fixtures/'`
   - `git diff --name-only $forkpoint..multi-sport -- 'e2e/tests/' 'e2e/fixtures/'`
2. Specifically check the recent main fix-commit specs (long-press, lineup availability, TagManager temp-id, injury-replacement, live-swaps, live-scoring) — these MUST survive the merge per PROD-01 / ABSTRACT-02.
3. Check what multi-sport added under `e2e/tests/` (likely netball-* specs) and `src/lib/__tests__/` (`netballWalkthroughSteps.test.ts`, `netballFairness.test.ts` per PROJECT.md).
4. Note any spec files in the intersection — these are the highest-risk test conflicts.
5. Confirm `e2e/tests/playhq-import.spec.ts` is fixme on both sides (PROD-04: stays fixme'd per commit `e9bbc47`) — DO NOT plan to "fix" it.
6. Produce a table: `Spec/test file | Main commits | Multi-sport commits | Conflict type | Resolution hint`.

**For Section 8 (Resolution rationale per non-trivial conflict):**
For each entry in Sections 3, 4, 5, 6, 7 categorised as `manual-resolution`, `superseded-by-multi-sport`, or any FRAGILE-flagged file, write a one-line resolution decision. Format as a markdown list. Examples of the kind of decisions to capture:
- "`src/components/live/LiveGame.tsx` — take multi-sport's structure (sport-dispatch); re-apply main's commits {sha1, sha2} for long-press fix and lineup-availability fix at the new dispatch site. **FRAGILE per CONCERNS.md** — Phase 3 must add regression test before resolving."
- "`src/lib/fairness.ts` — multi-sport bumped tier-4 magnitude −200 → −5,000 and fixed `thisGameTotalMs` sort-key bug; main has no edits, take multi-sport verbatim."
- "`supabase/migrations/00XX_*.sql` collision — Phase 2 renumbers main's NNNN to NNNN+3; document in migration filename comment."
- "`src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts` — superseded-by-multi-sport (multi-sport split into actions.ts + netball-actions.ts via sport dispatch); re-apply main's commit {sha} for live-scoring fix at the AFL dispatch branch in actions.ts."

If a conflict has no rationale beyond "auto-merge will work, no decision needed", skip it (only `manual-resolution` and `superseded` need rationale).

**For Section 9 (Decision log):**
Record the locked-in decisions Phase 3 must honour:
1. **Merge direction (D-01 from PROJECT.md):** Multi-sport branch becomes the new trunk; main's 60 commits absorb into it via merge or rebase (NOT cherry-pick). Cherry-picking 74 commits onto main would tear apart the sports abstraction.
2. **Tagging strategy:** `pre-merge/main` and `pre-merge/multi-sport` are annotated tags pushed to origin and serve as the baseline for re-running the merge.
3. **Migration renumbering rule (proposed for Phase 2):** Multi-sport's 0024–0026 keep their semantic purpose; any colliding main migrations renumber upward (e.g., main's 0024 → 0027).
4. **PROD-04 hands-off:** PlayHQ live-import `e2e/tests/playhq-import.spec.ts` stays `fixme`'d per commit `e9bbc47` — Phase 3 does NOT attempt to "fix" it during conflict resolution.
5. **Test discipline:** Per CLAUDE.md, schema migrations need an e2e spec exercising new columns through the UI (this is Phase 2 work, SCHEMA-03), and any bug fix during the merge needs a regression test.
6. **Deferred decisions surfaced (not resolved here):**
   - Squash any multi-sport commits before the merge? — Phase 3 to decide.
   - Rebase main's 60 commits (linear history) vs merge-commit (preserves merge node)? — Phase 3 to decide.
   - Rebuild post-fork e2e specs from main directly atop multi-sport's restructured tree, vs textual merge? — Phase 3 to decide per spec.

**Self-check before completing:**
- Sections 3 manual-resolution / superseded entries each have a corresponding Section 8 rationale line.
- Section 4 rename entries with main-edits-since-fork=Y each have a Section 8 rationale line.
- Decision log explicitly references D-01 from PROJECT.md.
- No section is left as "_To be filled by Task N._".

**Read-only enforcement:** As Task 1.
  </action>
  <verify>
    <automated>
      ! grep -q 'To be filled by Task' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q '^## Section 6' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q '^## Section 7' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q '^## Section 8' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q '^## Section 9' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q 'Multi-sport.*new trunk\|multi-sport becomes the new trunk' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; grep -q 'playhq-import\|PlayHQ.*fixme\|e9bbc47' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md \
        &amp;&amp; [ "$(wc -l &lt; .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md)" -ge 150 ]
    </automated>
  </verify>
  <done>
    - Section 6 lists every server-action file changed on either branch with conflict type and resolution hint
    - Section 7 lists every spec/test file changed on either branch, with PlayHQ-import explicitly marked as stays-fixme'd
    - Section 8 has a one-line resolution rationale for every `manual-resolution`, `superseded-by-multi-sport`, and FRAGILE-flagged entry from Sections 3–7
    - Section 9 records all 5 numbered decisions plus the deferred-decisions sub-list
    - File length ≥ 150 lines (substantive coverage, not stub)
    - All 9 sections fully populated; zero `_To be filled_` strings remain
    - `git status -- src/ e2e/ supabase/ scripts/` clean
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human verification of inventory document before tag work</name>
  <what-built>
    A single markdown inventory at `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` covering all 9 required sections from CONTEXT.md: branch summary, migration collisions, file-level conflict matrix, sports-abstraction restructure, shared types/schemas, server actions touched on both sides, test-suite collision surface, resolution rationale per non-trivial conflict, and decision log.
  </what-built>
  <how-to-verify>
    1. Open `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` in your editor.
    2. Confirm all 9 sections are present and substantive (no `_To be filled_` placeholders).
    3. Section 1 — verify fork point sha is `b3657c5...` and divergence counts match what you expect (60 main / 74 multi-sport).
    4. Section 2 — sanity-check the migration collision table against `ls supabase/migrations/` on each branch (you can spot-check via `ls .claude/worktrees/multi-sport/supabase/migrations/ | grep '^002[4-6]'`).
    5. Section 3 — scan the conflict matrix for files you know have been heavily edited recently (LiveGame.tsx, fairness.ts, the recent fix-commit files). Confirm they appear and are FRAGILE-flagged where appropriate.
    6. Section 8 — for any `manual-resolution` entry that catches your eye, verify the rationale is sensible and references real commits.
    7. Section 9 — confirm the decision log captures: (a) multi-sport-becomes-trunk, (b) annotated-tag strategy, (c) migration renumbering rule for Phase 2, (d) PlayHQ stays fixme, (e) test discipline.
    8. If anything is wrong or missing, type the specific issue (e.g., "Section 4 missing `src/lib/types.ts` rename"). The plan will revise then return to this checkpoint.
    9. If everything looks correct, type **approved** to proceed to tag creation.

    **Why this checkpoint exists:** The inventory drives Phase 2 and Phase 3 work for the rest of the milestone. The annotated tag messages will reference the inventory's path. Errors here propagate. Human review before tags get created locally.
  </how-to-verify>
  <resume-signal>Type "approved" to proceed to Task 5 (tag creation), or describe issues for revision.</resume-signal>
</task>

<task type="auto">
  <name>Task 5: Create annotated pre-merge tags and push to origin (with confirmation gate)</name>
  <files>
    (no source files modified; git tag operations only)
  </files>
  <action>
**Step A — Create local annotated tags (no remote push yet):**

1. Capture variables for tag messages:
   - Fork point: `b3657c5` (full sha via `git rev-parse b3657c5`)
   - Main HEAD: `git rev-parse main`
   - Multi-sport HEAD: `git rev-parse multi-sport`
   - Inventory path: `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md`

2. Create the annotated tag on `main`:
   ```bash
   git tag -a pre-merge/main main -m "Phase 1 protection tag — main HEAD before multi-sport merge

   Captures the production-side AFL trunk before the multi-sport merge work begins.
   60 commits ahead of fork point b3657c5...
   Main HEAD: $(git rev-parse main)

   Created: 2026-04-29
   Phase: 01-divergence-inventory-merge-plan
   Requirement: MERGE-02 (immutable pre-merge baseline)
   Inventory: .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
   Decision: multi-sport branch becomes new trunk; main's 60 commits absorb in (PROJECT.md D-01)

   Restore from this tag if Phase 3 merge needs to re-run from a known good baseline."
   ```
   Use a heredoc-fed `-F -` form if multi-line args are awkward; the message body MUST contain `b3657c5` and the inventory file path.

3. Create the annotated tag on `multi-sport`:
   ```bash
   git tag -a pre-merge/multi-sport multi-sport -m "Phase 1 protection tag — multi-sport HEAD before merge into trunk

   Captures the netball-MVP trunk before main's 60 commits absorb in.
   74 commits ahead of fork point b3657c5...
   Multi-sport HEAD: $(git rev-parse multi-sport)

   Created: 2026-04-29
   Phase: 01-divergence-inventory-merge-plan
   Requirement: MERGE-02 (immutable pre-merge baseline)
   Inventory: .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
   Decision: this branch becomes the new trunk (PROJECT.md D-01)

   Restore from this tag if Phase 3 merge needs to re-run from a known good baseline."
   ```

4. Verify tags were created locally:
   ```bash
   git tag -l 'pre-merge/*'
   git show pre-merge/main --no-patch --format=%B
   git show pre-merge/multi-sport --no-patch --format=%B
   ```
   Confirm both messages contain `b3657c5` and the inventory path.

5. Verify tag points at the correct commit:
   ```bash
   git rev-parse pre-merge/main^{commit} == git rev-parse main
   git rev-parse pre-merge/multi-sport^{commit} == git rev-parse multi-sport
   ```

**Step B — Confirmation gate before remote push:**

Before running `git push`, the executor MUST display this exact prompt to the user and wait for explicit `push` confirmation:

```
========================================================================
LOCAL TAGS CREATED — confirmation required before pushing to origin
========================================================================

Local annotated tags:
  pre-merge/main          → $(git rev-parse main)
  pre-merge/multi-sport   → $(git rev-parse multi-sport)

About to run:
  git push origin pre-merge/main pre-merge/multi-sport

This is a one-way operation: pushing tags to origin makes them visible
to anyone cloning the repo. Removing them later requires
`git push --delete origin <tagname>` and may surprise other workers.

Type 'push' to push both tags to origin.
Type 'skip' to leave tags local only (Phase 1 still passes — push can
be done manually later via `git push origin pre-merge/main pre-merge/multi-sport`).
Type 'abort' to delete the local tags and stop the task.
```

The executor pauses here for user input.

**Step C — Act on user response:**

- If user types `push`: run `git push origin pre-merge/main pre-merge/multi-sport`. Then verify with `git ls-remote --tags origin | grep pre-merge`. Both tag refs must appear.
- If user types `skip`: do nothing further; the local tags remain. Note in the task output that remote push is deferred. Phase 1 success-criteria for MERGE-02 is then **partially** met (local tags exist; remote push is the user's manual follow-up). Continue to step D.
- If user types `abort`: run `git tag -d pre-merge/main pre-merge/multi-sport` to delete local tags. Surface this as a soft failure — the executor reports back so the orchestrator can decide whether to retry or escalate.

**Step D — Final verification + record outcome:**

1. Append a short outcome paragraph to `01-MERGE-NOTES.md` under Section 9 (Decision log) titled **"Tag creation outcome"** — record: local tag shas, whether they were pushed (with timestamp), any deferred push.
2. Run final verification:
   ```bash
   git tag -l 'pre-merge/*'
   git ls-remote --tags origin | grep pre-merge || echo "(remote push skipped or aborted)"
   ```
3. The verify automated command below covers the local-tag case. If user pushed, the SUMMARY records the remote-push timestamp.

**Constraint reminders:**
- DO NOT use `git push --force` or `--force-with-lease` for tags. A normal `git push origin <tagname>` is sufficient because these are new tags. If push fails because the tag already exists on origin (it shouldn't), STOP and surface to user — do not force.
- DO NOT use lightweight tags. `git tag -a` (annotated) is mandatory per MERGE-02.
- DO NOT switch branches in this worktree. Tag creation references the branch refs, not a checkout.
  </action>
  <verify>
    <automated>
      git tag -l 'pre-merge/main' | grep -q '^pre-merge/main$' \
        &amp;&amp; git tag -l 'pre-merge/multi-sport' | grep -q '^pre-merge/multi-sport$' \
        &amp;&amp; git for-each-ref refs/tags/pre-merge/main --format='%(objecttype)' | grep -q '^tag$' \
        &amp;&amp; git for-each-ref refs/tags/pre-merge/multi-sport --format='%(objecttype)' | grep -q '^tag$' \
        &amp;&amp; git tag -l --format='%(contents)' pre-merge/main | grep -q 'b3657c5' \
        &amp;&amp; git tag -l --format='%(contents)' pre-merge/multi-sport | grep -q 'b3657c5' \
        &amp;&amp; git tag -l --format='%(contents)' pre-merge/main | grep -q '01-MERGE-NOTES.md'
    </automated>
    <manual>
      If user typed `push`: run `git ls-remote --tags origin | grep -E 'refs/tags/pre-merge/(main|multi-sport)$'` — both tag refs must appear in remote listing. If user typed `skip`: this manual check is N/A and the SUMMARY notes deferred push.
    </manual>
  </verify>
  <done>
    - `pre-merge/main` annotated tag exists locally pointing at main HEAD; tag message contains fork-point sha b3657c5 and the inventory path
    - `pre-merge/multi-sport` annotated tag exists locally pointing at multi-sport HEAD; tag message contains fork-point sha b3657c5 and the inventory path
    - Both tags are annotated (`%(objecttype)` returns `tag`, not `commit`)
    - User confirmation prompt was displayed before any `git push` ran
    - On `push` confirmation: both tags exist on origin (`git ls-remote --tags origin` shows them); MERGE-02 fully satisfied
    - On `skip` confirmation: local tags exist; SUMMARY records remote push as deferred to user; MERGE-02 partially satisfied (acceptable per CONTEXT.md — push needs explicit user confirmation)
    - On `abort` confirmation: local tags deleted, task surfaces a controlled failure
    - Section 9 of MERGE-NOTES.md has a "Tag creation outcome" subsection recording the action taken
    - Working tree is clean: `git status -- src/ e2e/ supabase/ scripts/` shows no changes
  </done>
</task>

</tasks>

<verification>
**Phase-level verification — run these after Task 5 completes:**

1. **Inventory completeness:**
   ```bash
   wc -l .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md  # ≥150 lines
   for n in 1 2 3 4 5 6 7 8 9; do
     grep -q "^## Section $n" .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md || echo "MISSING Section $n"
   done
   ! grep -q 'To be filled' .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
   ```
   Every numbered section must be present with substantive content.

2. **Tag existence (local):**
   ```bash
   git tag -l 'pre-merge/*'
   ```
   Must list both `pre-merge/main` and `pre-merge/multi-sport`.

3. **Tag annotation (not lightweight):**
   ```bash
   for t in pre-merge/main pre-merge/multi-sport; do
     git for-each-ref "refs/tags/$t" --format='%(objecttype)'
   done
   ```
   Both must print `tag` (annotated), NOT `commit` (lightweight).

4. **Tag points at correct branch HEAD:**
   ```bash
   [ "$(git rev-parse pre-merge/main^{commit})" = "$(git rev-parse main)" ]
   [ "$(git rev-parse pre-merge/multi-sport^{commit})" = "$(git rev-parse multi-sport)" ]
   ```

5. **Tag message content:**
   ```bash
   git tag -l --format='%(contents)' pre-merge/main | grep -q 'b3657c5'
   git tag -l --format='%(contents)' pre-merge/main | grep -q '01-MERGE-NOTES.md'
   git tag -l --format='%(contents)' pre-merge/multi-sport | grep -q 'b3657c5'
   git tag -l --format='%(contents)' pre-merge/multi-sport | grep -q '01-MERGE-NOTES.md'
   ```

6. **Tag exists on remote (only if user typed `push` in Task 5):**
   ```bash
   git ls-remote --tags origin | grep -E 'refs/tags/pre-merge/(main|multi-sport)$'
   ```
   Both refs must appear. If user typed `skip`, this check is intentionally not run; SUMMARY notes deferred push.

7. **Read-only invariant:**
   ```bash
   git status -- src/ e2e/ supabase/ scripts/
   ```
   Must show no changes — Phase 1 is read-only outside of `.planning/` and tags.
</verification>

<success_criteria>
**Both success criteria from ROADMAP.md Phase 1 are met:**

1. **MERGE-02:** Annotated tags `pre-merge/main` and `pre-merge/multi-sport` exist on both local and remote (or local-only with deferred remote push, per user choice in Task 5). Tags are annotated (verifiable via `git for-each-ref --format='%(objecttype)'` returning `tag`).

2. **MERGE-03:** A written conflict-surface inventory at `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` exists with all 9 required sections populated, naming every file category expected to conflict during the Phase 3 merge: migrations, shared components, server actions, types/schemas, test specs.

3. **Resolution rationale captured:** Section 8 has a one-line decision per `manual-resolution` and `superseded-by-multi-sport` entry, reviewable post-hoc. Section 9 records the locked-in decisions (D-01 multi-sport-as-trunk, tagging strategy, migration renumbering rule, PlayHQ-stays-fixme, test discipline) Phase 3 must honour.

4. **Read-only invariant held:** No source code, test, migration, or script files were modified. Only writes are the inventory markdown and the two git tags.
</success_criteria>

<output>
After all 5 tasks complete, create `.planning/phases/01-divergence-inventory-merge-plan/01-01-SUMMARY.md` recording:
- Tag shas (local) and remote-push status (pushed / skipped / aborted)
- Inventory file path and total line count
- Counts: main-only changed files, multi-sport-only changed files, intersection (conflict-candidate) files, FRAGILE-flagged files, manual-resolution entries
- Section 8 rationale-line count (must equal manual-resolution + superseded counts)
- Decision log summary (the 5 locked decisions and the deferred-decisions list)
- Phase 2 hand-off notes: proposed migration renumbering scheme + the inventory's reference path
- Phase 3 hand-off notes: which fragile files need regression tests written before resolution begins
- Confirmation that `git status -- src/ e2e/ supabase/ scripts/` was clean throughout
</output>
