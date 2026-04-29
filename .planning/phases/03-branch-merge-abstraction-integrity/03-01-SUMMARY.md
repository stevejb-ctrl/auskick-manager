---
phase: 03-branch-merge-abstraction-integrity
plan: 01
subsystem: infra
tags: [git, merge, multi-sport, abstraction, conflict-resolution]

# Dependency graph
requires:
  - phase: 01-divergence-inventory-merge-plan
    provides: pre-merge tags (`pre-merge/main`, `pre-merge/multi-sport`); MERGE-NOTES.md §8 per-file resolution rationale
  - phase: 02-schema-reconciliation
    provides: migration file-op spec (delete main `0024_super_admin.sql`); package.json scripts superset; e2e fixture sport widening
provides:
  - "Merged trunk on `merge/multi-sport-trunk` containing all 60 main commits + all 74 multi-sport commits via `--no-ff` merge"
  - "Sole sport-dispatch surface (multi-sport's `live/page.tsx`, `games/page.tsx`, `PlayerList.tsx`) carried into trunk; `getSportConfig`/`getEffectiveQuarterSeconds` registry now reachable from app surfaces"
  - "Migration set monotonic: 0024_multi_sport, 0025_super_admin, 0026_team_quarter_seconds, 0027_game_quarter_seconds (no duplicates)"
  - "Audit-trail artifact `03-MERGE-LOG.md` with §1 (mapped resolutions verbatim from Phase 1 §8) + §2 (D-24 package.json surprise pre-recorded BEFORE hunk rewrite) populated"
  - "Source branch `claude/vibrant-banzai-a73b2f` and both `pre-merge/*` tags untouched (D-19/D-21 invariants held)"
affects:
  - 03-02 (D-25 AgeGroup consumer patches)
  - 03-03 (liveGameStore parameterisation)
  - 03-04 (LiveGame.tsx quarterMs wiring)
  - 03-05 (full gauntlet)
  - 03-06 (PROD-01..04 audit + MERGE-LOG §4-§6 close-out)
  - phase 4 (netball verification — registry now wired)

# Tech tracking
tech-stack:
  added: []  # No new libraries — merge only
  patterns:
    - "Sole sport dispatch via `src/lib/sports` registry (`getSportConfig`, `getEffectiveQuarterSeconds`, `getAgeGroupConfig`) — no AFL-baked-in conditionals in shared components"
    - "`showJersey` prop threading from PlayerList → AddPlayerForm → PlayerRow as the single switch for jersey-UI gating"
    - "Dual font registration kept (`Instrument_Serif` + `Geist`) because Tailwind `font-serif` class still resolves through `--font-instrument-serif` in 7 consumer files"

key-files:
  created:
    - ".planning/phases/03-branch-merge-abstraction-integrity/03-MERGE-LOG.md  # §1 + §2 populated; §3-§6 stubs for downstream plans"
    - ".planning/phases/03-branch-merge-abstraction-integrity/03-01-SUMMARY.md  # this file"
  modified:
    - "src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx  # multi-sport's sport-branching dispatch verbatim; AFL branch retains ageGroupOf+AGE_GROUPS (research §3 Consumer 3)"
    - "src/app/(app)/teams/[teamId]/games/page.tsx  # union: multi-sport's getAgeGroupConfig+Sport+select(sport) AND main's GamesFilter+Eyebrow+searchParams"
    - "src/app/layout.tsx  # multi-sport's getBrand/getBrandCopy + main's metadataBase/icons folded into one generateMetadata(); Instrument_Serif KEPT (deviation)"
    - "src/app/page.tsx  # multi-sport's dynamic copy.features + main's canonical metadata"
    - "src/components/squad/PlayerList.tsx  # multi-sport's getAgeGroupConfig + sport/showJersey wiring + main's SFCard/Eyebrow wrapper; showJersey threaded into AddPlayerForm"
    - "src/components/squad/PlayerRow.tsx  # main's full Guernsey SVG + edit/save UI; jersey JSX wrapped with {showJersey && (...)} guard"
    - "package.json  # set union of scripts (build, db:reset, db:start, db:status, db:stop, dev, e2e, lint, start, test, typecheck)"
  deleted:
    - "supabase/migrations/0024_super_admin.sql  # main's copy — byte-identical (sha256 1761d40…) to multi-sport's 0025_super_admin.sql per Phase 2 §1 audit (D-10)"

key-decisions:
  - "DEVIATION from Phase 1 §8 + Research §8 L-5: KEPT `Instrument_Serif` import in `app/layout.tsx`. tailwind.config.ts:74 + 7 consumer files reference `--font-instrument-serif` via the `font-serif` Tailwind class — main's removal was incomplete, deletion would break 7 components."
  - "live/page.tsx resolved by taking multi-sport's version verbatim. Phase 1 §8 said 'take multi-sport's structure, re-apply main's single commit on top', but Research §5 verified main's 'single commit' lives in `actions.ts` (auto-merges) NOT in `page.tsx`."
  - "showJersey prop threaded through PlayerList → AddPlayerForm → PlayerRow with `{showJersey && (...)}` guards on jersey JSX in PlayerRow (interface, destructuring, badge guard, edit-input guard — 4 occurrences)."
  - "package.json D-24 surprise resolved by set union — both branches added the same `db:*` commands plus this branch's `e2e` + `typecheck`. §2 of MERGE-LOG written BEFORE the hunk rewrite, satisfying the audit-trail requirement."
  - "Per-file `npx tsc --noEmit` between every conflict resolution (D-23/INFO 1 — early failure isolation) — all 7 files cleared individually before the atomic merge commit."

patterns-established:
  - "Pattern: 'creative merge' for layout-style files (PATTERNS Pattern 1) — when both sides add additive structural concerns, fold them into one new shape rather than choosing one side."
  - "Pattern: per-file tsc gate inside an in-progress merge — `( cd $MERGE_WT && npx tsc --noEmit )` after EACH `git add`, never batched."
  - "Pattern: D-24 audit-trail sequencing — write the surprise-conflict log row BEFORE rewriting any hunk in that file."

requirements-completed: [MERGE-01, ABSTRACT-01]

# Metrics
duration: ~3h (interactive — including pre-merge sha256 verification, 7 conflict resolutions with per-file tsc gates, MERGE-LOG authoring, post-commit gauntlet, and human-verify checkpoint review)
completed: 2026-04-29
---

# Phase 3 Plan 01: Branch merge + conflict resolution Summary

**One `--no-ff` merge commit absorbing 60 main commits into the multi-sport trunk on a fresh `merge/multi-sport-trunk` worktree, with 7 conflicts resolved coherently (6 mapped per Phase 1 §8 + 1 surprise per D-24), main's duplicate `0024_super_admin.sql` deleted, and post-commit `tsc + lint` green.**

## Performance

- **Duration:** ~3h (interactive — includes pre-merge tag verification, 7 conflict resolutions with per-file tsc gates, MERGE-LOG authoring, post-commit gauntlet, and human-verify checkpoint review)
- **Started:** 2026-04-29 (Plan 03-01 execution)
- **Completed:** 2026-04-29
- **Tasks:** 5 substantive (Tasks 1–5) + 1 checkpoint (Task 6, human-verify, approved)
- **Files modified:** 7 source files + 1 deletion + 1 audit-log file (`03-MERGE-LOG.md`)

## Accomplishments

- **MERGE-01 satisfied.** A true `--no-ff` merge commit with two parents (`1277068` multi-sport tip + `5504378` claude/vibrant-banzai-a73b2f tip) lives on the new `merge/multi-sport-trunk` branch. `git log --oneline` shows commits from both branches.
- **ABSTRACT-01 satisfied.** Multi-sport's sport-dispatch is the sole entry point in shared components: `live/page.tsx` dispatches via `if (sport === "netball")`; `games/page.tsx` resolves via `getAgeGroupConfig(sport, ...)`; `PlayerList.tsx` resolves via `getSportConfig(team.sport)`. No AFL-baked-in conditional remains in those files.
- **Migration set monotonic and unique.** Phase 2 §2 file op #1 executed: main's `0024_super_admin.sql` deleted (byte-identical sha256 `1761d40…` to multi-sport's `0025_super_admin.sql` re-verified at merge time per D-10). Final set: `0024_multi_sport`, `0025_super_admin`, `0026_team_quarter_seconds`, `0027_game_quarter_seconds`.
- **D-24 audit trail intact.** `03-MERGE-LOG.md` §2 row for `package.json` was written AFTER `git merge` surfaced the conflict marker but BEFORE any hunk in `package.json` was rewritten. The surprise classification (Phase 1 §3 said "clean-merge-likely"; Plan 02-02's overlapping `db:*` additions promoted it to a content conflict) is documented for post-hoc review.
- **D-19 / D-21 invariants held.**
  - `pre-merge/main` = `e9073dd…` (untouched)
  - `pre-merge/multi-sport` = `e13e787…` (untouched)
  - Source branch `claude/vibrant-banzai-a73b2f` HEAD = `5504378…` (received zero commits from this plan's work — merge happened in a separate worktree)
- **Post-commit gauntlet green.** `( cd $MERGE_WT && npx tsc --noEmit )` exited 0 and `npm run lint` exited 0 (with 3 pre-existing warnings unchanged — out of scope per executor SCOPE BOUNDARY).

## Task Commits

Each task was committed atomically inside the merge-trunk worktree (branch `merge/multi-sport-trunk`):

1. **Task 1: Worktree setup + tag verification** — no commit (setup only; D-21 verified pre-merge/* SHAs)
2. **Task 2: `git merge --no-ff --no-commit`** — no commit yet (raised 7 conflicts)
3. **Task 3: Wrote MERGE-LOG.md §1 + §2** — staged into Task 5's atomic merge commit (D-22 — one merge commit only)
4. **Task 4: Resolved all 7 conflicts** — staged into Task 5's atomic merge commit (per-file tsc green between each)
5. **Task 5: Atomic merge commit + post-commit gauntlet** — `d6b2473` (merge commit, 2 parents, includes the migration delete + MERGE-LOG + 7 file resolutions)
6. **Post-merge MERGE-LOG §1 row update** (Task 5 outcome documentation) — `aa8c66b`
7. **Task 6 (checkpoint:human-verify)** — APPROVED by user; no further code changes in this plan

## Files Created/Modified

### Created
- `.planning/phases/03-branch-merge-abstraction-integrity/03-MERGE-LOG.md` — Audit log: §1 verbatim Phase 1 §8 per file with resolution outcome and deviation flags; §2 D-24 package.json surprise; §3-§6 stubs for plans 03-02 / 03-03 / 03-04 / 03-06.

### Modified (7 source files)
- `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` — multi-sport's sport-branching dispatch verbatim. Imports `getEffectiveQuarterSeconds`, `getSportConfig`, `netballSport`, `NetballLiveGame`. Select string includes `sport, track_scoring, quarter_length_seconds`. AFL branch retains `ageGroupOf(team.age_group)` + `AGE_GROUPS[ageGroup]` (safe per RESEARCH §3 Consumer 3 — D-25 not triggered inside the AFL-only branch).
- `src/app/(app)/teams/[teamId]/games/page.tsx` — Union: multi-sport's `getAgeGroupConfig` + `Sport` + `select("age_group, sport, playhq_url")` AND main's `GamesFilter` + `Eyebrow` + `searchParams` filter UX. The `as AgeGroup` cast removed.
- `src/app/layout.tsx` — Multi-sport's `getBrand`/`getBrandCopy` brand wiring + main's `SITE_URL`/`metadataBase`/full `icons` block, folded into a single `generateMetadata()`. **Instrument_Serif KEPT** (deviation).
- `src/app/page.tsx` — Multi-sport's dynamic `copy.features` from `getBrandCopy(brand.id)` + main's `export const metadata: Metadata = { alternates: { canonical: "/" } }`.
- `src/components/squad/PlayerList.tsx` — Multi-sport's `getAgeGroupConfig` + sport-resolution + `showJersey` data wiring + main's `SFCard`/`Eyebrow` "Add player" wrapper. `showJersey={showJersey}` threaded into `AddPlayerForm` and `PlayerRow`.
- `src/components/squad/PlayerRow.tsx` — Main's full `Guernsey` SVG component + edit/save/cancel UI + `Toggle` + `data-testid` + field validations. Jersey JSX wrapped with `{showJersey && (...)}` (multi-sport's prop guard). 4 `showJersey` occurrences (interface, destructuring, badge guard, edit-input guard).
- `package.json` — Set union of scripts: `build, db:reset, db:start, db:status, db:stop, dev, e2e, lint, start, test, typecheck`.

### Deleted (1 file)
- `supabase/migrations/0024_super_admin.sql` — main's copy. Byte-identical (sha256 `1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051`) to multi-sport's `0025_super_admin.sql`. Re-verified at merge time per D-10. Phase 2 §2 file op #1 executed.

## Decisions Made

1. **Instrument_Serif KEPT in `app/layout.tsx`** (deviation from Phase 1 §8 + Research §8 L-5)
   - Rationale: `tailwind.config.ts:74` declares `serif: ["var(--font-instrument-serif)"]` and 7 consumer files use the `font-serif` Tailwind class. Main's removal of the import was incomplete; deleting it would break 7 components.
   - Recorded in MERGE-LOG.md §1 row for `app/layout.tsx` with full deviation block.

2. **`live/page.tsx` taken from multi-sport verbatim** (correction to Phase 1 §8 wording)
   - Rationale: Research §5 verified that main's "single commit on top of `live/page.tsx`" actually lives in the sibling `actions.ts` file (which auto-merges cleanly), not in `page.tsx` itself. The "re-apply main's single commit" instruction was therefore a no-op for this file.

3. **`showJersey` threaded as the single switch for jersey UI** (PATTERNS Pattern 7)
   - Rationale: Multi-sport added `showJersey?: boolean` to PlayerRow; main expanded the jersey-badge UX (Guernsey SVG + edit input). Wrapping main's expanded UX with multi-sport's prop guard keeps both improvements live for AFL while letting netball turn jerseys off cleanly.

4. **Per-file `tsc --noEmit` gate between conflict resolutions** (D-23 + INFO 1)
   - Rationale: Early failure isolation. If a conflict resolution introduces a type error, the gate fires before the next file's edits make blame-finding ambiguous. All 7 files cleared individually before the merge commit.

5. **D-24 audit trail: `package.json` §2 row written BEFORE hunk rewrite**
   - Rationale: MERGE-03 / D-09 require that surprise conflicts be logged before resolution, so reviewers can reconstruct the decision context. `git merge` surfaced the conflict marker (Task 2); MERGE-LOG.md §2 was written (Task 3); only THEN was the `package.json` hunk rewritten (Task 4).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Plan-spec correction] `app/layout.tsx`: KEEP `Instrument_Serif` rather than dropping per Phase 1 §8**
- **Found during:** Task 4 (file 4d resolution)
- **Issue:** Phase 1 §8 specified "drop `Instrument_Serif` per main's removal" but `tailwind.config.ts:74` and 7 consumer files still reference `--font-instrument-serif` via the `font-serif` Tailwind class. Following Phase 1 §8 verbatim would break 7 components at runtime.
- **Fix:** Kept `Instrument_Serif` import + `instrumentSerif` const + `${instrumentSerif.variable}` in `<html className>`. Folded main's `metadataBase`/`icons` into multi-sport's dynamic `generateMetadata()` rather than discarding either.
- **Files modified:** `src/app/layout.tsx`
- **Verification:** `npx tsc --noEmit` exits 0; lint exits 0; deviation explicitly recorded in MERGE-LOG.md §1 row + Research §8 L-5 + PATTERNS Pattern 1 documented in advance.
- **Committed in:** `d6b2473` (atomic merge commit)

**2. [Rule 1 — Plan-spec correction] `live/page.tsx`: take multi-sport verbatim (no need to "re-apply main's single commit")**
- **Found during:** Task 4 (file 4b resolution)
- **Issue:** Phase 1 §8 directed "re-apply main's single commit on top" of multi-sport's structure, but Research §5 verified the only main-side edit on this surface lives in the sibling `actions.ts` (which auto-merges) — there is nothing to re-apply in `page.tsx`.
- **Fix:** Replaced the conflicted file with multi-sport's version verbatim (via `git show multi-sport:<path>`).
- **Files modified:** `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx`
- **Verification:** Imports check (`getEffectiveQuarterSeconds`, `getSportConfig`, `netballSport`, `NetballLiveGame`) passed; sport-dispatch present; AFL branch preserves `AGE_GROUPS[ageGroup]` lookup.
- **Committed in:** `d6b2473` (atomic merge commit)

---

**Total deviations:** 2 documented (both Plan-spec corrections backed by Research §5 and §8 L-5; both pre-flagged in PATTERNS.md before execution).
**Impact on plan:** Both deviations are correctness preservations — Phase 1 §8's verbatim instructions would have introduced regressions (broken Tailwind font lookup; phantom no-op edit). Plan still satisfied MERGE-01 + ABSTRACT-01 with no scope creep. Both deviations were anticipated by RESEARCH.md and PATTERNS.md, not invented during execution.

## Issues Encountered

- **Conflict surface re-verified at merge time** matched Research §2 prediction exactly: 7 content conflicts (the 6 mapped from Phase 1 §8 plus `package.json`) plus the `0017b_super_admin.sql` rename/rename. No surprise files outside D-24's pre-recorded `package.json` row.
- **3 pre-existing lint warnings** in `npm run lint` output were NOT introduced by this plan (verified by running lint on `multi-sport` HEAD pre-merge). Out of scope per executor SCOPE BOUNDARY — left untouched, not added to deferred-items because they pre-date the merge.

## User Setup Required

None — no external service configuration required for this plan. (Phase 6 owns the Supabase prod-clone provisioning blocker — separate from this plan.)

## Next Phase Readiness

**Hand-off to Plan 03-02 (D-25 AgeGroup consumer patches):**
- Trunk now contains the merged `Team.age_group: string` (widened by D-06 in `src/lib/types.ts` auto-merge). Any consumer that assumed the narrow `AgeGroup` union now has an opportunity to surface as a tsc error for Plan 03-02 to patch uniformly via `getSportConfig(team.sport).ageGroups.find(...)`.
- The `getEffectiveQuarterSeconds` and `getSportConfig` registry surfaces are merged in and reachable from the app code paths — Plan 03-04's `quarterMs` prop wiring + Plan 03-03's `liveGameStore.endCurrentQuarter` parameterisation can both consume them directly.
- `MERGE-LOG.md` §3 stub awaits Plan 03-02's `tsc` discovery output. §4 stub awaits Plans 03-03/03-04's redirect grep evidence. §5 + §6 stubs await Plan 03-06.

**Hand-off to Plan 03-05 (gauntlet):**
- `npx tsc --noEmit` confirmed green at HEAD = `aa8c66b`.
- `npm run lint` confirmed green (3 pre-existing warnings, unchanged).
- `e2e/tests/multi-sport-schema.spec.ts` (Phase 2 expected-red spec) is now in the trunk and ready for Plan 03-05 to flip green via `npm run db:reset && npm run e2e`.

**No blockers carried into Plan 03-02.**

## Self-Check: PASSED

Verification commands run on merge-trunk worktree (HEAD = `aa8c66b`):

| Check | Command | Result |
|-------|---------|--------|
| Merge commit has 2 parents (D-20) | `git cat-file -p d6b2473 \| grep "^parent" \| wc -l` | 2 (parents: `1277068` multi-sport, `5504378` claude/vibrant-banzai-a73b2f) |
| Merged trunk on correct branch (D-19) | `git rev-parse --abbrev-ref HEAD` | `merge/multi-sport-trunk` |
| Source branch unchanged (D-19) | `git -C $PLANNING_WT rev-parse claude/vibrant-banzai-a73b2f` | `5504378` (== pre-plan SHA) |
| `pre-merge/main` tag untouched (D-21) | `git -C $PLANNING_WT rev-parse pre-merge/main` | `e9073dd…` |
| `pre-merge/multi-sport` tag untouched (D-21) | `git -C $PLANNING_WT rev-parse pre-merge/multi-sport` | `e13e787…` |
| Migration `0024_super_admin.sql` deleted | `ls supabase/migrations/0024*` | only `0024_multi_sport.sql` present |
| Migration set monotonic (no duplicates) | `ls supabase/migrations/ \| sort -u \| wc -l` vs `ls supabase/migrations/ \| wc -l` | equal (27 unique entries) |
| Sport dispatch present in `live/page.tsx` | `grep "sport === \"netball\"" src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | match present |
| `Instrument_Serif` import retained in `app/layout.tsx` (deviation) | `grep "Instrument_Serif" src/app/layout.tsx` | match present |
| `showJersey` threaded in `PlayerRow.tsx` | `grep -c "showJersey" src/components/squad/PlayerRow.tsx` | 4 occurrences |
| `package.json` scripts superset (D-24) | `node -e "['e2e','db:reset','db:start','db:stop','db:status','typecheck','test','lint','dev','build','start'].forEach(s => { if (!require('./package.json').scripts[s]) throw new Error(s); })"` | all 11 scripts present |
| `npx tsc --noEmit` (post-commit gauntlet) | `( cd $MERGE_WT && npx tsc --noEmit )` | exit 0 |
| `npm run lint` (post-commit gauntlet) | `( cd $MERGE_WT && npm run lint )` | exit 0 (3 pre-existing warnings, unchanged) |
| MERGE-LOG.md §1+§2 populated and committed | `grep -c "^## §" 03-MERGE-LOG.md` | 6 sections present |
| Merge commit `d6b2473` exists | `git log --oneline \| grep d6b2473` | match present |
| MERGE-LOG follow-up commit `aa8c66b` exists | `git log --oneline \| grep aa8c66b` | match present |

All 15 self-check items PASSED.

---
*Phase: 03-branch-merge-abstraction-integrity*
*Plan: 01*
*Completed: 2026-04-29*
