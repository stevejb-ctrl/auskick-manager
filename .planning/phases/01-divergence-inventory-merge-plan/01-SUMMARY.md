---
phase: 01-divergence-inventory-merge-plan
plan: 01
subsystem: planning
tags: [merge, branch-reconciliation, git-tags, brownfield, supabase-migrations]

requires: []
provides:
  - Pre-merge protection tags pre-merge/main and pre-merge/multi-sport on origin (annotated, fork-point referenced, inventory-path referenced)
  - Complete 9-section divergence inventory at .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
  - File-level conflict matrix categorising all 16 files in the intersection
  - Migration-collision analysis with proposed Phase 2 renumbering
  - 9 locked-in decisions (D-01 through D-09) Phase 3 must honour
  - Resolution rationale per non-trivial conflict (1-line decision per row)
affects: [phase-02-schema-reconciliation, phase-03-branch-merge-abstraction-integrity, phase-07-production-cutover]

tech-stack:
  added: []
  patterns:
    - "Phase-scoped inventory artifact (.planning/phases/XX-.../XX-MERGE-NOTES.md) consumed by downstream phases of the same milestone"
    - "Annotated git tag protection pattern for milestone reconciliation work — tag both branch tips, push to origin, reference inventory in tag message"

key-files:
  created:
    - .planning/phases/01-divergence-inventory-merge-plan/01-CONTEXT.md
    - .planning/phases/01-divergence-inventory-merge-plan/01-PLAN.md
    - .planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md
    - .planning/phases/01-divergence-inventory-merge-plan/01-SUMMARY.md
  modified:
    - .planning/ROADMAP.md (Phase 1 plan list + progress row)
  refs_created:
    - "git tag pre-merge/main → 80a04eb (annotated, on origin)"
    - "git tag pre-merge/multi-sport → 1277068 (annotated, on origin)"

key-decisions:
  - "D-01: Multi-sport becomes new trunk; main's 60 commits absorb in (PROJECT.md confirmed; cleaner conflict surface)"
  - "D-05: Take multi-sport's migration set as trunk numbering; de-duplicate main's 0024_super_admin.sql against multi-sport's byte-identical 0025_super_admin.sql; net new migrations from main = 0"
  - "D-06: Take multi-sport's Team.age_group: string widening; tsc --noEmit pass after merge to patch any AFL consumers using SportConfig.ageGroups lookup"
  - "D-07: getEffectiveQuarterSeconds is the sole quarter-length source of truth post-merge; Phase 3 redirects all main-side clock surfaces"
  - "D-08: Annotated pre-merge tags exist on origin before Phase 3 begins (now COMPLETE)"
  - "D-09: No git push --force to main during Phase 7 cutover; fast-forward only"

patterns-established:
  - "Read-only inventory phase: separate map-the-conflicts work from resolve-the-conflicts work. Phase 1 produces only a markdown doc + tags; Phase 3 acts on the map."
  - "Phase boundary discipline via task-level git status checks against src/, e2e/, supabase/, scripts/ — every task verified the read-only invariant before completion."
  - "User-gated remote write: tags created locally autonomously, but git push origin gated behind explicit AskUserQuestion confirmation per CLAUDE.md / risky-action protocol."

requirements-completed:
  - MERGE-02
  - MERGE-03

duration: ~25min
completed: 2026-04-29
---

# Phase 1: Divergence inventory & merge plan — Summary

**Mapped the conflict surface between `main` (60 commits, AFL prod enhancements) and `multi-sport` (74 commits, full netball MVP). Result: only 6 hard content conflicts, 1 byte-identical migration rename collision, and zero file relocations — much smaller than feared.**

## Performance

- **Duration:** ~25 min (interactive inline execution; no subagent overhead)
- **Started:** 2026-04-29 ~07:54 UTC (this session)
- **Completed:** 2026-04-29 ~08:30 UTC
- **Tasks:** 5 of 5 (3 auto + 1 human-verify checkpoint + 1 auto with confirmation gate)
- **Files modified:** 1 (the inventory document) + 2 git tags created/pushed
- **Source files modified:** 0 (read-only invariant held)

## Accomplishments

- **Surfaced the actual conflict shape**, replacing speculation with hard data:
  - `git merge-tree main multi-sport` enumerated **exactly 6 manual-resolution conflicts** (`live/page.tsx`, `games/page.tsx`, `app/layout.tsx`, `app/page.tsx`, `PlayerList.tsx`, `PlayerRow.tsx`) and **9 clean auto-merges** in the 16-file intersection.
  - Migration collision is structural (rename/rename on `0017b_super_admin.sql`) but byte-identical — the resolution is "delete main's `0024_super_admin.sql`," not a content reconciliation. **Net new migrations from main = 0.**
  - **Zero e2e spec collisions** — main's 20 modified e2e specs and multi-sport's test changes are disjoint. Production-side e2e fixes (PROD-01) port across with no manual work.
  - **Zero file relocations** on multi-sport. AFL components stayed at their original paths in `src/components/live/`. Multi-sport extended into a parallel `src/components/netball/` and `src/lib/sports/` layer rather than restructuring AFL.
- **Captured 9 locked decisions (D-01..D-09)** Phase 3 must honour — including the `Team.age_group` widening risk (D-06) and the per-clock-surface redirect requirement for `getEffectiveQuarterSeconds` (D-07).
- **Pre-merge protection tags on origin** — `pre-merge/main` (`80a04eb`) and `pre-merge/multi-sport` (`1277068`), annotated with fork-point sha and a path reference to the inventory doc. The merge can be re-run from a known good baseline if Phase 6 preview validation fails.

## Task Commits

Tasks 1, 2, and 3 were consolidated into a single inventory-write commit since they target the same single file (different sections); each task's read-only invariant was independently verified before consolidation.

1. **Task 1+2+3: Write 01-MERGE-NOTES.md (all 9 sections)** — `7948fd5` (phase)
   *Built atomically: branch reconnaissance + migration collisions + file-level conflict matrix + restructure surface + shared types/schemas + server actions + test surface + resolution rationale + decision log. 306 lines, all 9 required sections present.*
2. **Task 4: Human-verify checkpoint** — no commit (review-only)
   *User reviewed inventory, approved, proceeded to tag work.*
3. **Task 5: Create + push annotated pre-merge tags** — no source commit; ref-creates only
   *`pre-merge/main` and `pre-merge/multi-sport` created locally with `git tag -a`, then pushed to origin after explicit user confirmation.*

**Plan metadata commits:**
- `e783b4b` (docs(01): generate context for divergence inventory phase)
- `06e65a4` (plan(01): divergence inventory & merge plan)

## Files Created/Modified

- `.planning/phases/01-divergence-inventory-merge-plan/01-CONTEXT.md` — Phase context (locked decisions, scope guardrails, deliverables — written during planning, consumed by executor)
- `.planning/phases/01-divergence-inventory-merge-plan/01-PLAN.md` — Executable plan with 5 tasks (written by gsd-planner, approved by gsd-plan-checker)
- `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` — **The deliverable.** 9-section divergence inventory.
- `.planning/phases/01-divergence-inventory-merge-plan/01-SUMMARY.md` — This file
- `.planning/ROADMAP.md` — Phase 1 plan list + progress row updated
- `git tag pre-merge/main` (annotated, on origin) — points at `80a04eb`
- `git tag pre-merge/multi-sport` (annotated, on origin) — points at `1277068`

## Verification

All 8 must_have truths from `01-PLAN.md` are observable:

1. ✓ Single inventory file at the documented path with all 9 sections (`grep -E "^## §" 01-MERGE-NOTES.md` returns 9 matches)
2. ✓ Inventory names every conflict-candidate file (16) categorised across the 4 categories — see §3
3. ✓ Migration-number conflicts documented with proposed renumbering (NOT executed) — see §2
4. ✓ Resolution rationale captured for every non-trivial conflict — see §8 (7 rationale rows for 6 manual-resolution + 1 rename/rename)
5. ✓ Decision log records D-01 (multi-sport becomes trunk) and 8 other locked-in choices — see §9
6. ✓ `pre-merge/main` exists locally as annotated tag (`git tag -l --format='%(objecttype)' pre-merge/main` → `tag`)
7. ✓ `pre-merge/multi-sport` exists locally as annotated tag (same check)
8. ✓ Both tags exist on origin (`git ls-remote --tags origin | grep pre-merge` → 4 lines: tag obj + `^{}` deref for each)

Read-only invariant: `git status -- src/ e2e/ supabase/ scripts/` was clean before, during, and after every task. No source code, no migrations, no merge ops were executed.

## Hand-off to Phase 2 (schema reconciliation)

Phase 2 should:
- Re-verify byte equality: `git show main:supabase/migrations/0024_super_admin.sql | sha256sum` ≟ `git show multi-sport:supabase/migrations/0025_super_admin.sql | sha256sum`. If equal, delete main's copy as part of the merge in Phase 3 prep — no Phase 2 file write needed for the de-dup.
- Confirm `0024_multi_sport.sql` performs `ADD COLUMN ... DEFAULT 'afl' NOT NULL` in a single transactional statement against `teams` (so existing AFL rows are valid the moment NOT NULL applies). The migration may already do this; spot-check during Phase 2 e2e spec design.
- Add the Playwright spec exercising `teams.sport`, `teams.track_scoring`, and `teams.quarter_length_seconds` through the setup wizard / team settings UI for both sports (SCHEMA-03).

## Hand-off to Phase 3 (branch merge + abstraction integrity)

Phase 3 should consume:
- §3 (file-level conflict matrix) — drives the merge order and where to expect manual resolution
- §8 (resolution rationale) — drives each manual conflict's resolution
- §9 D-01..D-09 — locked decisions, especially D-06 (age_group widening) and D-07 (getEffectiveQuarterSeconds redirect)
- The two pre-merge tags — fall back to these if anything goes wrong

## Notes for future milestones

- The `_auto_chain_active` config flag was set to `false` by the orchestrator at execute-phase init (per workflow rule for non-`--auto` invocations). Carries no implication for downstream phases.
- The `multi-sport` worktree at `.claude/worktrees/multi-sport` was read-only-accessed during inventory; not modified.
- This phase used **inline execution** rather than worktree-isolated subagent execution because: (a) the plan had `autonomous: false` due to two interactive gates; (b) tag operations need to act on the real branch refs, not a child worktree; (c) we're already in a worktree, and worktree-in-worktree adds nothing.
