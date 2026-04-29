# Phase 3 Merge Log

**Phase:** 03-branch-merge-abstraction-integrity
**Started:** 2026-04-29
**Merge target branch:** merge/multi-sport-trunk (worktree: .claude/worktrees/merge-trunk)
**Merge source branch:** claude/vibrant-banzai-a73b2f (= main + Phase 1+2 planning)
**Sequencing:** This file was written AFTER `git merge --no-ff --no-commit` surfaced the conflict markers, but BEFORE any hunk rewrite touched the conflict files. D-24 audit-trail requirement satisfied.

## §1 Mapped-conflict resolutions (Phase 1 §8 verbatim per file)

| File | Phase 1 §8 rationale (verbatim) | Resolution taken | Deviation? |
|------|----------------------------------|------------------|------------|
| `supabase/migrations/0017b_super_admin.sql` (rename/rename) | **Take multi-sport's `0025_super_admin.sql` filename. Delete main's `0024_super_admin.sql`.** Content is byte-identical (sha256), so this is renaming-by-deletion, not a content conflict. Verify byte equality (sha256) at merge time before deleting. | Executed: deleted main's `0024_super_admin.sql`; multi-sport's `0025_super_admin.sql` is canonical. Re-verified sha256 = `1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051` for both files immediately before `git rm` (matches Phase 2 §1 audit). Resulting migration set: `0024_multi_sport.sql`, `0025_super_admin.sql`, `0026_team_quarter_seconds.sql`, `0027_game_quarter_seconds.sql`. | None — D-10 executed exactly per Phase 2 §2 file op #1 |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | **Take multi-sport's structure (sport-branching dispatch). Re-apply main's single commit on top** at the AFL branch of the dispatch. | Replaced file with `multi-sport:src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` verbatim (research §5: main's "single edit" is in `actions.ts` which auto-merges, not in `page.tsx`). Verified: `getEffectiveQuarterSeconds`/`getSportConfig`/`netballSport` imports present; `NetballLiveGame` import present; select string includes `sport, track_scoring, quarter_length_seconds`; `if (sport === "netball")` dispatch present; AFL branch retains `ageGroupOf` + `AGE_GROUPS[ageGroup]` (safe per research §3 Consumer 3). | None — research §5 clarification followed |
| `src/app/(app)/teams/[teamId]/games/page.tsx` | **Take multi-sport's edit, audit main's hunk** to confirm it's still relevant after the merge. If both edits are independent enhancements, both stay. | Combined imports (union): kept multi-sport's `getAgeGroupConfig`/`Sport` AND main's `Eyebrow`. Body content already contained both: multi-sport's `select("age_group, sport, playhq_url")` + `getAgeGroupConfig(sport, ...)` AND main's `GamesFilter`/`searchParams`/`Eyebrow` JSX. No `as AgeGroup` cast remains. | None — both sides combine cleanly |
| `src/app/layout.tsx` | **Take multi-sport's brand-module imports** (`getBrand()`, `getBrandCopy()`) and **drop `Instrument_Serif` per main's removal** and **switch metadata to `SITE_URL` per main**. | KEPT `Instrument_Serif` import + `instrumentSerif` const + `${instrumentSerif.variable}` + `${GeistSans.variable}` in `<html className>`. Combined imports: `getBrand`/`getBrandCopy` (multi-sport) AND `SITE_URL` (main). Replaced both static `metadata` (main) and old dynamic `generateMetadata` (multi-sport) with a merged `generateMetadata()` that returns `metadataBase: new URL(SITE_URL)` + `title`/`description` from `getBrandCopy()` + main's full `icons` block. | **DEVIATION (research §8 L-5 + PATTERNS Pattern 1):** KEPT `Instrument_Serif` import. tailwind.config.ts:74 + 7 consumer files reference `--font-instrument-serif` via `font-serif` Tailwind class. Main's removal was incomplete; deleting the import would break 7 components. Also folded main's `metadataBase`/`icons` into multi-sport's dynamic `generateMetadata()` rather than discarding them — preserves canonical URL resolution + favicon set. |
| `src/app/page.tsx` | **Take main's most recent landing-page state, then audit multi-sport's edit** to confirm it's compatible with main's changes (likely a brand-copy import that needs to land on top). | Combined imports (union): kept multi-sport's `getBrand`/`getBrandCopy` AND main's `Metadata` type. Removed main's static `FEATURES` array (multi-sport replaced with `copy.features` from `getBrandCopy(brand.id)`). Kept main's `export const metadata: Metadata = { alternates: { canonical: "/" } }` (additive — works with `metadataBase` in layout.tsx). | None — Pattern 5 followed |
| `src/components/squad/PlayerList.tsx` | **Take main's most recent state** (1 commit each, both narrow). Spot-check multi-sport's hunk to confirm it doesn't break with main's recent change. | Combined imports: kept multi-sport's `getAgeGroupConfig`/`Sport` AND main's `Eyebrow`/`SFCard`; removed legacy `AGE_GROUPS`/`ageGroupOf` (replaced by `getAgeGroupConfig`). Kept multi-sport's `select("age_group, sport")` and the full sport-resolution block (`sport`, `ageGroupCfg`, `maxPlayers`, `showJersey`). For the "Add player" block: took main's `<SFCard><Eyebrow>` UX wrapper AND added `showJersey={showJersey}` prop pass-through to AddPlayerForm (multi-sport's data wiring). `<PlayerRow>` calls already had `showJersey={showJersey}`. | None — Pattern 6 deviation applied (combined wrapper + data wiring) |
| `src/components/squad/PlayerRow.tsx` | **Take main's 3-commit state, then audit multi-sport's single edit** for compatibility. Main has 3× more recent activity here; multi-sport's hunk likely just needs to be re-applied at the new line. | Kept main's full `Guernsey` SVG component, edit/save/cancel UI, `Toggle`, `data-testid`, all field validations. Wrapped main's `Guernsey`-vs-em-dash ternary jersey-badge JSX with `{showJersey && (...)}` (multi-sport's prop guard). Interface and destructuring already contained `showJersey?: boolean` defaulting to `true` (HEAD/multi-sport additions preserved). The `{showJersey && <Input ... />}` wrap on the jersey number input was already in place. Final showJersey occurrences: 4 (interface, destructuring, badge guard, edit-input guard). | None — Pattern 7 followed |
| `src/lib/types.ts` (auto-merges, see §5 D-06) | **Auto-merge stands**, but immediately after the merge, run `npx tsc --noEmit` and audit any errors triggered by the `Team.age_group` widening (`AgeGroup` → `string`). | TBD (Plan 03-02) | None — tsc-driven discovery in Plan 03-02. |

## §2 Unmapped conflict surprises (D-24)

> **D-24 sequencing:** This row was written AFTER `git merge` surfaced the conflict marker in Task 2 of Plan 03-01, and BEFORE Task 4's hunk rewrite. The audit trail is non-negotiable per MERGE-03 / D-09.

| File | Why surprising | Resolution | Rationale |
|------|---------------|------------|-----------|
| `package.json` | Phase 1 §3 classified as "clean-merge-likely (different deps added on each side)" but Phase 2 (Plan 02-02) added `e2e` and `db:*` scripts to `package.json` on `claude/vibrant-banzai-a73b2f`, creating an overlapping-hunk conflict with multi-sport's identical `db:*` additions. Verified by `git merge-tree` re-run (research §2). | Set union of both sides' scripts. The worktree HEAD already contains every script from both sides plus `e2e` and `typecheck`; take worktree HEAD's `scripts` block as the resolved state. Verify with `node -e "console.log(Object.keys(require('./package.json').scripts))"` after resolution. | Mechanical additive conflict — both sides added the same `db:*` commands plus this branch added `e2e`/`typecheck`. No semantic conflict; no decision needed beyond "take all." |

## §3 D-25 AgeGroup consumer patches

**Outcome:** Zero patches required. RESEARCH §3 prediction confirmed — Plan 03-01's conflict resolutions already covered all three pre-verified D-25 consumers, and the post-merge `tsc --noEmit` scan surfaced no remaining `Type 'string' is not assignable to type 'AgeGroup'` errors.

### Discovery evidence (Plan 03-02 Task 1)

```bash
$ ( cd $MERGE_WT && npx tsc --noEmit 2>&1 | tee /tmp/03-02-tsc.log )
[exit 0 — log empty]

$ grep -n "Type 'string' is not assignable to type 'AgeGroup'" /tmp/03-02-tsc.log
[no matches]

$ grep -n "'AgeGroup'" /tmp/03-02-tsc.log
[no matches]

$ grep -rnE 'as AgeGroup\b|: AgeGroup\b' src/ --include='*.ts' --include='*.tsx' \
    | grep -v -E 'src/lib/types\.ts|src/lib/ageGroups\.ts|src/lib/sports/'
[no matches]
```

### Patched files

| File | Line | Before | After |
|------|------|--------|-------|
| (none) | — | — | — |

### Safe-within-dispatch (kept unchanged — RESEARCH §3 Consumer 3)

- `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` lines 222 / 227 / 232 — `ageGroupOf(teamRow?.age_group)` + `AGE_GROUPS[ageGroup].positionModel` + `AGE_GROUPS[ageGroup]` live INSIDE the AFL branch (the `// ─── AFL branch (existing behaviour) ───` block at line 220, after the `if (sport === "netball") { … return … }` early-return dispatch). The narrow `ageGroupOf()` cast is correct here because the surrounding branch is AFL-only and `ageGroupOf` falls back to `"U10"` on miss. Per RESEARCH §3 Consumer 3 + §4 ("AFL fallback is intentional within sport-dispatch"), this remains untouched.

### Resolution map (RESEARCH §3 Consumers vs trunk state)

| Consumer | RESEARCH §3 prediction | Trunk state at HEAD `2906080` | D-25 patch needed? |
|----------|------------------------|--------------------------------|---------------------|
| `src/components/squad/PlayerList.tsx` line 29-30 | Resolved by Plan 03-01 conflict resolution (multi-sport's `getAgeGroupConfig()` taken) | `getAgeGroupConfig(sport, team.age_group)` present; no `AGE_GROUPS[ageGroup]` cast | NO — already D-25-uniform |
| `src/app/(app)/teams/[teamId]/games/page.tsx` line 48 | Resolved by Plan 03-01 conflict resolution (multi-sport's `getAgeGroupConfig()` replaced main's `as AgeGroup` cast) | No `as AgeGroup` cast remains; `getAgeGroupConfig(sport, …)` present | NO — already D-25-uniform |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` line 86 | Safe within AFL sport-dispatch branch | `ageGroupOf` + `AGE_GROUPS[ageGroup]` lives inside the AFL branch (lines 220-232, after `if (sport === "netball") return …`); narrow lookup is correct because branch is AFL-only | NO — safe-within-dispatch |

### D-25 compliance grep (final, post-Plan-03-02)

```bash
$ ( cd $MERGE_WT && npx tsc --noEmit )
[exit 0]

$ grep -rnE 'as AgeGroup\b|: AgeGroup\b' src/ --include='*.ts' --include='*.tsx' \
    | grep -v -E 'src/lib/types\.ts|src/lib/ageGroups\.ts|src/lib/sports/'
[no matches outside type-defining files and the sports/ registry]
```

D-25 satisfied as-of-merge. ABSTRACT-01 acceptance criterion (no AFL-baked-in conditionals in shared components) holds — all `AGE_GROUPS[…]` and `ageGroupOf()` lookups outside `src/lib/ageGroups.ts` itself are inside sport-dispatched AFL branches.

## §4 D-26 / D-27 redirect compliance

TBD — populated by Plans 03-03 + 03-04 (store edit + LiveGame.tsx edits + grep output).

**Note for §4 author (Plan 03-06):** CONTEXT.md `<specifics>` D-27 grep originally expected `≥4 matches` of `getEffectiveQuarterSeconds` across `LiveGame.tsx`, `liveGameStore.ts`, AND `QuarterBreak.tsx` (4 surfaces, 4+ hits). RESEARCH §4 Surface 4 determined QuarterBreak.tsx requires no redirect (proportion-based bars, not duration-based). The corrected expectation is `≥3 matches` across `LiveGame.tsx` (≥2 — countdown cap + hooter trigger) and `liveGameStore.ts` (≥1 — `endCurrentQuarter` cap). This deviation from CONTEXT.md is intentional and justified by research; record explicitly in §4 when populated.

## §5 PROD-01..04 preservation evidence

TBD — populated by Plan 03-06 (per-feature smoke checks + grep audits + diff against pre-merge/main).

## §6 Hand-off to Phase 4 (netball verification)

TBD — populated by Plan 03-06 (final merge state, open questions for Phase 4).
