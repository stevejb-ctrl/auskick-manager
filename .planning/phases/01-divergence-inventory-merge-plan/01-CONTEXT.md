# Phase 1: Divergence inventory & merge plan — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning
**Source:** Phase brief supplied by user with /gsd-plan-phase invocation

<domain>
## Phase Boundary

This phase produces the **map**, not the merge. Two long-lived branches need to be reconciled:

- `main` — production AFL-only, **60 commits ahead** of fork point `b3657c5`. Contains post-fork e2e fixes, perf wave 3, UX changes, bug fixes. This is the branch that's currently deployed and serving real coaches.
- `multi-sport` — local branch in worktree at `C:\Users\steve\OneDrive\Documents\Auskick manager\.claude\worktrees\multi-sport`. **74 commits ahead** of the same fork point. Contains the full netball MVP, sports abstraction under `src/lib/sports/`, the netball component family under `src/components/netball/`, the netball stats dashboard, and migrations 0024–0026.

The fork point `b3657c5` ("Merge fix/migration-0017-collision: rename duplicate 0017 migrations to 0017a/0017b") is a known good ancestor commit. Both branches diverged forward from there.

By the end of Phase 1 the team has:
1. **Pre-merge protection tags** on both branches, pushed to the remote, so the merge can be re-run from a known good baseline if validation fails downstream.
2. **A written conflict-surface inventory** (a single markdown file under `.planning/`) that names every category of conflict the team will hit during Phase 3's actual merge: file-level conflicts, migration-number collisions, shared-component restructure conflicts, shared types/schemas, server actions touched on both sides.
3. **Resolution rationale** captured per non-trivial conflict so Phase 3's merge work can act on it without re-investigating.
4. **A short decision log** confirming the merge direction (multi-sport becomes the new trunk; main's 60 commits absorb into it) and any other locked decisions surfaced by the inventory work.

**Hard scope discipline — what this phase MUST NOT do:**
- No source code edits anywhere. Phase 1 is read-only.
- No actual conflict resolution. That's Phase 3.
- No schema migration changes. That's Phase 2.
- No netball verification. That's Phase 4.
- No git merge / rebase / cherry-pick on real branches. Tagging is the only git write operation.

</domain>

<decisions>
## Implementation Decisions

### Locked direction (from PROJECT.md Key Decisions)

- **Multi-sport branch becomes the new trunk.** Main's 60 commits will be absorbed into multi-sport via merge/rebase in Phase 3. Cherry-picking 74 commits onto main would tear apart the sports abstraction (a structural change). Conflict surface is much smaller absorbing 60 commits into a restructured tree than the reverse.
- **Same Vercel + Supabase project.** No fresh deploy. Migrations apply forward against existing AFL data.
- **Backfill `teams.sport = 'afl'`** for all existing rows in Phase 2. Prod has only ever been AFL; assumption is safe.
- **Stage on a Vercel preview deploy** against a clone of prod Supabase before fast-forwarding `main` (Phase 6 → 7).

### Required deliverables for Phase 1

- **MERGE-02** — Pre-merge tags on both branches, pushed to remote: `pre-merge/main` (pointing at the current `main` HEAD), `pre-merge/multi-sport` (pointing at the current `multi-sport` HEAD). Tags must be annotated, not lightweight, so the rationale is preserved (`git tag -a`).
- **MERGE-03** — A conflict-surface inventory document at `.planning/MERGE-NOTES.md` (or under the phase dir at `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` if that's more idiomatic for GSD). Captures resolution rationale per non-trivial conflict.

### Inventory document — required sections

The inventory must answer (with concrete file paths and commit refs):

1. **Branch summary** — divergence stats, fork point sha, top-line commit counts each side.
2. **Migration-number conflicts** — does main have any post-fork migrations under `supabase/migrations/`? Multi-sport added `0024-*`, `0025-*`, `0026-*`. If main also has `0024+`, list collisions and propose a renumbering scheme. If main has 0024+ that don't collide structurally, document the merge ordering.
3. **File-level conflict matrix** — `git diff --name-only main...multi-sport` against `git diff --name-only $forkpoint..main` and `git diff --name-only $forkpoint..multi-sport`. Files in the intersection are the conflict candidates. Categorise each into:
   - `clean-merge-likely` (different sections / non-overlapping changes)
   - `manual-resolution` (overlapping edits, structural conflicts)
   - `superseded-by-multi-sport` (multi-sport restructured the file; main's edits need to be re-applied at the new location)
   - `deleted-on-one-side` (rare but possible)
4. **Sports-abstraction restructure surface** — files that multi-sport moved or renamed (e.g. AFL-specific code that got pulled into `src/lib/sports/afl/` or `src/components/afl/`). Main's edits to those files will need redirecting.
5. **Shared types / schemas** — anything under `src/lib/sports/index.ts`, the `Sport` type, `getEffectiveQuarterSeconds`, types around `game_events` (multi-sport added netball event types), team type (multi-sport added `sport`, `track_scoring`, `quarter_length_seconds` columns).
6. **Server actions touched on both sides** — particularly under `src/app/(app)/teams/[teamId]/games/[gameId]/live/`. Multi-sport added `netball-actions.ts` and likely modified `actions.ts` (or split the AFL ones).
7. **Test-suite collision surface** — Playwright specs under `e2e/tests/` modified on both sides. Production-side un-fixme work (commits #52–#55) and any specs multi-sport added.
8. **Resolution rationale** per non-trivial conflict — for each `manual-resolution` or `superseded-by-multi-sport` entry, a one-line decision: "use multi-sport's structure, re-apply main's $sha changes to file X" or "take main's version, re-export through abstraction" etc.
9. **Decision log** — locked-in choices Phase 3 must honour (merge direction, tagging strategy, conflict-resolution conventions, commit-message conventions during the merge).

### Out of scope (explicitly excluded from Phase 1)

- Performing the merge — Phase 3.
- Renumbering migrations on disk — Phase 2 (Phase 1 only documents the collision).
- Writing or modifying any source code, tests, or migrations — Phase 1 is read-only.
- Deploy-time validation — Phases 6–7.
- Network/data-shape risk analysis — implicitly informs the inventory but is not a deliverable.

### Claude's Discretion

- **Where to store the inventory file.** Either `.planning/MERGE-NOTES.md` (project-wide doc that survives the milestone) or `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` (phase-scoped). Either is acceptable — phase-scoped is more idiomatic for GSD; project-wide is more visible. Pick one and justify briefly.
- **Tooling for the conflict matrix.** A `git merge-tree --write-tree main multi-sport` or a `git diff` script that produces categorisation hints; either works. The output is a markdown table, not a script artifact.
- **How aggressively to read the multi-sport branch source.** The multi-sport branch is in a separate worktree at `.claude/worktrees/multi-sport` — reading its files cross-worktree is fine. Going commit-by-commit is overkill; characterising at the file level is sufficient for the inventory.
- **Tag message content.** Annotated tag messages should include the divergence stats, the fork point sha, and a one-line rationale ("Phase 1 protection tag — captures multi-sport branch HEAD before merge, see .planning/phases/01-.../01-MERGE-NOTES.md for context").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project guidance
- `CLAUDE.md` — project rules, especially testing-is-part-of-done and commit style
- `.planning/PROJECT.md` — milestone context, locked decisions
- `.planning/REQUIREMENTS.md` — full v1 requirement set, especially MERGE-02 and MERGE-03 wording
- `.planning/ROADMAP.md` — Phase 1 success criteria

### Codebase intel
- `.planning/codebase/STRUCTURE.md` — directory layout (helps categorise file conflicts)
- `.planning/codebase/ARCHITECTURE.md` — abstractions and patterns (helps identify structural conflicts)
- `.planning/codebase/CONCERNS.md` — fragile areas; conflicts in these areas need extra rationale

### Branch references
- `main` (current HEAD `80a04eb` at time of writing) — production trunk
- `multi-sport` (current HEAD `1277068` at time of writing) — netball MVP trunk
- Fork point `b3657c5` — common ancestor

### Project skills
- Check `.claude/skills/` for any project-local skills relevant to merging or branch ops

</canonical_refs>

<specifics>
## Specific Ideas

- **Use `git merge-tree`** to dry-run the merge without writing a working tree. `git merge-tree -z $(git merge-base main multi-sport) main multi-sport` lists conflicts. This is the fastest way to enumerate them.
- **Use `git diff --name-status $forkpoint..branch`** on each branch to enumerate per-branch file changes; intersect the two lists to find the conflict candidates.
- **For each conflict candidate**, run `git diff --name-only main multi-sport -- <file>` and inspect with `git log --oneline $forkpoint..main -- <file>` and `git log --oneline $forkpoint..multi-sport -- <file>` to attribute changes to commits.
- **Migration check** is the quickest win: `ls supabase/migrations/` on each branch — anything `0024+` on both sides is a collision.
- **Deferred decisions** the inventory should surface (not resolve):
  - Whether to squash any multi-sport commits before the merge.
  - Whether main's 60 commits get rebased (linear history) or merged (preserves the merge node).
  - Whether to rebuild any post-fork e2e specs from main directly on top of multi-sport's restructured component tree, vs. attempting a textual merge.

## Test team data
- **Kotara Koalas** (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`) lives in the multi-sport branch's local Supabase seed. Phase 1 doesn't need to touch it; just be aware it exists for Phase 5+.

## Pre-existing concerns (from CONCERNS.md)
- Live game state machine is flagged as fragile (3-layer architecture). Conflicts here are likely and need extra rationale.
- Long-press, lineup availability, TagManager temp-id were repeatedly touched by recent main commits — fingerprint these files specifically.
- PlayHQ live-import stays fixme'd — not relevant to merge mechanics, just don't accidentally try to "fix" it.

</specifics>

<deferred>
## Deferred Ideas

- **Conflict resolution itself** — Phase 3.
- **Migration renumbering** — Phase 2 (Phase 1 only documents).
- **Squash-merge vs merge-commit decision** — surfaced as a deferred decision in the inventory; Phase 3 picks one.
- **Whether to delete the multi-sport branch after merge** — Phase 7 cleanup.
- **CI integration** of the merge process — not in scope; manual is fine for a one-shot merge.

</deferred>

---

*Phase: 01-divergence-inventory-merge-plan*
*Context gathered: 2026-04-29 from user-provided phase brief (no /gsd-discuss-phase)*
