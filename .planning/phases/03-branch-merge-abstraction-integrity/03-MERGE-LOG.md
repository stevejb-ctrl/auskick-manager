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
| `src/lib/types.ts` (auto-merges, see §3 D-25) | **Auto-merge stands**, but immediately after the merge, run `npx tsc --noEmit` and audit any errors triggered by the `Team.age_group` widening (`AgeGroup` → `string`). | Auto-merge took multi-sport's widening (`Team.age_group: string`). Plan 03-02 ran `npx tsc --noEmit` post-merge → exit 0 with zero `Type 'string' is not assignable to type 'AgeGroup'` errors → zero D-25 patches required (Plan 03-01 conflict resolutions already covered all consumers). See §3 for evidence. | None — tsc-driven discovery in Plan 03-02 returned a clean trunk. |

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

D-26 reduces to **3 redirect sites** (per RESEARCH §4 — surface 4 QuarterBreak time bars uses proportional math, not duration math, so no redirect needed).

**D-27 grep expectation reconciliation (CONTEXT.md deviation):** CONTEXT.md `<specifics>` D-27 grep originally expected `≥4 matches` of `getEffectiveQuarterSeconds` across `LiveGame.tsx`, `liveGameStore.ts`, AND `QuarterBreak.tsx` (4 surfaces, 4+ hits). RESEARCH §4 Surface 4 determined QuarterBreak.tsx requires no redirect (proportion-based bars, not duration-based). The corrected expectation is `≥3 matches` across `LiveGame.tsx` (≥2 — countdown cap + hooter trigger) and `liveGameStore.ts` (≥1 — `endCurrentQuarter` cap). This deviation from CONTEXT.md is intentional and justified by research. Plans 03-03 + 03-04 implemented to the corrected scope.

### Compliance grep output (RESEARCH §4 verification commands)

**(1) `getEffectiveQuarterSeconds` calls across the codebase:**

```
src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx:15:import { getAgeGroupConfig, getEffectiveQuarterSeconds, getSportConfig, netballSport } from "@/lib/sports";
src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx:104:    const quarterLengthSeconds = getEffectiveQuarterSeconds(
src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx:240:  // getEffectiveQuarterSeconds expects the sport-config shape.
src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx:242:  const quarterMs = getEffectiveQuarterSeconds(
src/app/(app)/teams/[teamId]/stats/page.tsx:27:import { netballSport, getEffectiveQuarterSeconds } from "@/lib/sports";
src/app/(app)/teams/[teamId]/stats/page.tsx:130:        const qSec = getEffectiveQuarterSeconds(
src/app/run/[token]/page.tsx:11:import { getAgeGroupConfig, getEffectiveQuarterSeconds } from "@/lib/sports";
src/app/run/[token]/page.tsx:49:  const quarterMs = getEffectiveQuarterSeconds(
src/components/live/LiveGame.tsx:120:   * Computed by parent via getEffectiveQuarterSeconds(team, ageGroup, game) * 1000.
src/lib/sports/index.ts:30:export function getEffectiveQuarterSeconds(
src/lib/stores/liveGameStore.ts:346:      // Cap at quarterMs (passed by caller from getEffectiveQuarterSeconds(team,
src/lib/stores/liveGameStore.ts:350:      // getEffectiveQuarterSeconds. ABSTRACT-03 / D-26 / D-27.
src/lib/__tests__/sports.test.ts:13:  getEffectiveQuarterSeconds,
src/lib/__tests__/sports.test.ts:197:describe("getEffectiveQuarterSeconds", () => {
src/lib/__tests__/sports.test.ts:202:      getEffectiveQuarterSeconds({ quarter_length_seconds: 480 }, openAge),
src/lib/__tests__/sports.test.ts:208:      getEffectiveQuarterSeconds({ quarter_length_seconds: null }, openAge),
src/lib/__tests__/sports.test.ts:214:      getEffectiveQuarterSeconds(
src/lib/__tests__/sports.test.ts:224:      getEffectiveQuarterSeconds(
src/lib/__tests__/sports.test.ts:234:      getEffectiveQuarterSeconds(
```

**Total hits:** 19 across 6 files. Page-level call sites (4 unique uses: live/page.tsx ×2 — netball + AFL branches at lines 104 + 242; stats/page.tsx:130; run/[token]/page.tsx:49) match the architectural expectation. Function definition + Vitest coverage live in `src/lib/sports/`.

**(2) `QUARTER_MS` usage post-redirect:**

```
src/components/live/LiveGame.tsx:121:   * D-26 / D-27: replaces hardcoded QUARTER_MS at the countdown cap and hooter trigger. */
src/lib/stores/liveGameStore.ts:17:export const QUARTER_MS = 12 * 60 * 1000;
```

Inside the three redirect-target files, the only `QUARTER_MS` references are (a) the export declaration in `liveGameStore.ts:17` (kept for elapsed-display consumers) and (b) the explanatory JSDoc comment in `LiveGame.tsx:121` documenting that `quarterMs` replaces the prior hardcoded constant. **Zero capping or hooter logic still references `QUARTER_MS` in the three redirect targets.** D-26/D-27 satisfied.

**(3) Wider `QUARTER_MS` usage in `src/` (elapsed-display callers — not redirect targets):**

```
src/components/live/GameHeader.tsx:7:  QUARTER_MS,
src/components/live/GameHeader.tsx:63:  const remaining = Math.max(0, QUARTER_MS - elapsed);
src/components/live/GameHeader.tsx:64:  const overtime = elapsed > QUARTER_MS;
src/lib/fairness.ts:358:  // 12 * 60 * 1000 matches QUARTER_MS in liveGameStore — kept local here so
src/lib/fairness.ts:360:  const FULL_QUARTER_MS = 12 * 60 * 1000;
src/lib/fairness.ts:366:    const seasonBonus = seasonMins < FULL_QUARTER_MS ? SEASON_DIVERSITY : 0;
src/lib/__tests__/applyInjurySwap.test.ts:7:import { useLiveGame, QUARTER_MS } from "@/lib/stores/liveGameStore";
src/lib/__tests__/applyInjurySwap.test.ts:107:  it("uses the live store module's QUARTER_MS export", () => {
src/lib/__tests__/applyInjurySwap.test.ts:108:    expect(QUARTER_MS).toBe(12 * 60 * 1000);
```

These are NOT in scope for D-26/D-27 redirect:
- **`GameHeader.tsx:63-64`** uses `QUARTER_MS` for the elapsed-display banner (`remaining = QUARTER_MS - elapsed`, `overtime = elapsed > QUARTER_MS`). RESEARCH §4 Surface 3 explicitly authorised "QUARTER_MS remains exported for backwards compatibility in clockElapsedMs and formatClock display callers" — `GameHeader` is one such display caller. Pre-existing AFL-default banner; not a capping/hooter site. No netball-correctness regression because netball games render via `NetballLiveGame`, not the AFL `LiveGame` shell that hosts `GameHeader`.
- **`fairness.ts:358-366`** uses a local `FULL_QUARTER_MS = 12 * 60 * 1000` constant inside the season-bonus calculation, with an explicit comment ("kept local here so") signalling intentional non-import. Pre-existing AFL fairness tuning, not a clock surface.
- **`applyInjurySwap.test.ts:7-108`** Vitest contract assertions on the exported constant's value. Not a runtime clock surface; documents that `QUARTER_MS = 12 * 60 * 1000` is part of the store's public API.

**Future-proofing flag (out of scope for Phase 3):** Plan 03-04 deliberately did NOT redirect `GameHeader.tsx` (Surface 5) or `fairness.ts` (Surface 6) because they were not in CONTEXT.md D-26's stated 4-surface scope. If Phase 4's netball verification surfaces a banner-display oddity for non-12-minute quarters, the fix is to thread `quarterMs` into `GameHeader` props the same way `LiveGame` was redirected. Document as a Phase 5+ backlog item.

**(4) `quarterMs` param flow through the three redirect targets:**

```
src/components/live/LiveGame.tsx:122:  quarterMs: number;
src/components/live/LiveGame.tsx:151:  quarterMs,
src/components/live/LiveGame.tsx:699:    endCurrentQuarter(quarterMs);
src/components/live/LiveGame.tsx:717:  const displayNowMs = Math.min(nowMs, quarterMs);
src/components/live/LiveGame.tsx:794:      if (elapsed * clockMultiplier >= quarterMs && quarterEndTriggeredRef.current !== currentQuarter) {
src/lib/stores/liveGameStore.ts:95:  endCurrentQuarter: (quarterMs: number) => void;
src/lib/stores/liveGameStore.ts:339:  endCurrentQuarter: (quarterMs: number) =>
src/lib/stores/liveGameStore.ts:346:      // Cap at quarterMs (passed by caller from getEffectiveQuarterSeconds(team,
src/lib/stores/liveGameStore.ts:351:      const accumulated = Math.min(rawAccumulated, quarterMs);
```

**LiveGame.tsx:** 5 hits (interface declaration line 122, destructure line 151, `endCurrentQuarter(quarterMs)` call line 699, display cap line 717, hooter trigger line 794). **liveGameStore.ts:** 4 hits (interface signature line 95, implementation parameter line 339, doc comment line 346, capping `Math.min` line 351). Both meet RESEARCH §4 expected count (≥3 each).

**`endCurrentQuarter` call sites:** exactly one — `src/components/live/LiveGame.tsx:699`. No stale zero-arg callers (would have been a tsc error).

### Per-site outcome

| Site | File | Line | Plan | Status |
|------|------|------|------|--------|
| 1 — countdown display cap | src/components/live/LiveGame.tsx | 717 | 03-04 | redirected |
| 2 — hooter trigger | src/components/live/LiveGame.tsx | 794 | 03-04 | redirected |
| 3 — stint duration cap (`endCurrentQuarter`) | src/lib/stores/liveGameStore.ts | 351 | 03-03 | redirected |
| 4 — Q-break time bars | src/components/live/QuarterBreak.tsx | n/a | n/a | **NOT REDIRECTED** — research §4 Surface 4 confirmed proportional bars don't need redirect |

ABSTRACT-03 + D-26 + D-27 satisfied: `getEffectiveQuarterSeconds(team, ageGroup, game)` is the sole quarter-length source of truth at the three redirect sites; the function is called directly at the page level (D-27 — no prop drilling layer beyond the single `LiveGame` prop, no hook abstraction).

## §5 PROD-01..04 preservation evidence

### PROD-01 — Post-fork e2e fixes preserved

Each available spec re-run individually after Plan 03-05's full gauntlet, using `--workers=1` to dodge the dev-server cold-compile race documented as Plan 03-05 deferred side-finding #2 (initial workers=2 run of `injury-replacement.spec.ts` produced `ERR_CONNECTION_RESET` on `/live`; re-run with `--workers=1` was clean).

| Spec | Tests | Result | Duration |
|------|-------|--------|----------|
| `e2e/tests/availability.spec.ts` | 3/3 | PASS | 17.9s (workers=2) |
| `e2e/tests/injury-replacement.spec.ts` | 3/3 | PASS | 17.0s (workers=1) — see note |
| `e2e/tests/live-swaps.spec.ts` | 2/2 | PASS | 15.6s (workers=1) |
| `e2e/tests/live-scoring.spec.ts` | 3/3 | PASS | 20.9s (workers=1) |
| `e2e/tests/live-quarters.spec.ts` | 2/2 | PASS | 18.3s (workers=1) |
| **TOTAL** | **13/13** | **PASS** | — |

**`long-press.spec.ts` (per Plan 03-06 must_haves) does not exist as a standalone spec.** `git ls-files e2e/tests/*long-press*` returns empty. Long-press functionality (the LockModal opens-on-long-press flow per PROD-01 commit #52) is exercised inside `e2e/tests/injury-replacement.spec.ts` (lines 78-82 + 192 — explicit "Long-press to open LockModal" test paths). Both injury-replacement tests pass (lines 19 and 145 — "injuring an on-field player prompts for a bench replacement" and "...falls through to the original direct-injury path"). Long-press coverage is therefore satisfied transitively. RESEARCH §6 PROD-01 spec inventory (which lists 17 specs) also omits `long-press.spec.ts` — the plan must_haves text was overspecified relative to the actual spec set.

PROD-01 satisfied — all post-fork e2e fixes survive the merge intact.

### PROD-02 — Perf wave 3 preserved

| Evidence | Source | Result |
|----------|--------|--------|
| Static auth login page | `src/app/(auth)/login/page.tsx` | present (`grep -E "^['\"]use client['\"]"` returns no matches → static) |
| Static landing page (no `(marketing)/` route group; main used `src/app/page.tsx` directly) | `src/app/page.tsx` | present (`grep -E "^['\"]use client['\"]"` returns no matches → static) |
| DB indexes (perf wave 3 additions to existing tables) | `grep -rin "create index" supabase/migrations/` | non-empty: `0023_perf_indexes.sql` (idx_team_memberships_user_id, idx_games_team_id, idx_game_availability_game_status_available, idx_players_team_active) + 5 pre-perf-wave-3 indexes (0003, 0014, 0017, 0018) + 2 multi-sport indexes (0024, 0025) — total 11 CREATE INDEX statements |
| Spinner component | `src/components/ui/Spinner.tsx` | present (702 bytes) |
| Main HEAD reachable in merged HEAD | `git merge-base --is-ancestor 80a04eb HEAD` | exit 0 → PASS (MERGE-01 final check per Plan 03-06 BLOCKER 4 fix; replaces flawed `pre-merge/main..HEAD ≥60` count) |
| Multi-sport tip reachable | `git merge-base --is-ancestor pre-merge/multi-sport HEAD` | exit 0 → PASS |
| New commits since multi-sport tip | `git log --oneline pre-merge/multi-sport..HEAD \| wc -l` | 109 (≥1 — Phase 1+2+3 planning artefacts and merge-resolution commits all reachable) |
| Main `src/` commits reachable | `git log --oneline pre-merge/main..HEAD -- src/ \| wc -l` | 77 (≥40 — perf wave 3 + the 60 main commits all touch `src/`) |

PROD-02 satisfied — all perf wave 3 artefacts ride through the merge intact, both branches' commits reachable.

### PROD-03 — Back-arrow removal preserved

```bash
$ grep -nE "ArrowLeft|ChevronLeft" "src/app/(app)/layout.tsx"
[zero matches — exit 1]

$ grep -cE "ArrowLeft|ChevronLeft" "src/app/(app)/layout.tsx"
0

$ grep -nE "\bback\b" "src/app/(app)/layout.tsx" | grep -v "feedback\|callback\|background\|backstop"
[no substantive 'back' usage]
```

PROD-03 satisfied — no back-arrow elements in the authenticated layout.

### PROD-04 — PlayHQ fixme preserved

```bash
$ grep -nE "test\.fixme" e2e/tests/playhq-import.spec.ts
28:test.fixme("PlayHQ preview + import creates game rows", async ({ page }) => {

$ grep -cE "test\.fixme" e2e/tests/playhq-import.spec.ts
1
```

PROD-04 satisfied — PlayHQ live-import remains intentionally `test.fixme'd` per commit `e9bbc47`. The fixme is intentional architecture (live PlayHQ scrape behind the org-side rate limit), not a bug.

### ABSTRACT-01 — No AFL conditionals outside src/lib/sports/

```bash
$ grep -rnE "(sport[a-zA-Z]*|team\.sport|\.sport) === ['\"]afl['\"]" src/ --include='*.ts' --include='*.tsx' \
    | grep -v "src/lib/sports/" | grep -v "\.test\." | grep -v "\.spec\."
src/components/setup/SquadStep.tsx:17:  const showJersey = sportId === "afl";
src/components/setup/TeamBasicsForm.tsx:75:              active={sport === "afl"}
src/components/setup/TeamBasicsForm.tsx:99:          placeholder={sport === "afl" ? "e.g. Kingsway Roos" : "e.g. Kingsway Flyers"}
src/components/squad/PlayerList.tsx:39:  const showJersey = sport === "afl";
```

**Four matches surfaced — all classified as legitimate UI-presentation toggles, NOT logic dispatch.** Detailed rationale per match:

| File:Line | Code | Classification | Rationale |
|-----------|------|----------------|-----------|
| `SquadStep.tsx:17` | `const showJersey = sportId === "afl"` | UI affordance | AFL teams display guernsey numbers; netball does not. UX-intrinsic to the sport. The conditional is wrapped at the component level, not pushed into shared business logic. |
| `TeamBasicsForm.tsx:75` | `active={sport === "afl"}` | Form-state UI | The team-setup wizard's sport pill needs to render its own active/inactive state — by definition the form must check which sport the user clicked. This is the picker, not a downstream consumer. |
| `TeamBasicsForm.tsx:99` | `placeholder={sport === "afl" ? "...Roos" : "...Flyers"}` | Form-state UI | Sport-specific placeholder copy in the same picker form. Same justification. |
| `PlayerList.tsx:39` | `const showJersey = sport === "afl"` | UI affordance | Same `showJersey` UI gate as SquadStep:17, applied on the squad list. Multi-sport's intentional pattern (per Phase 1 §8 PlayerList resolution + RESEARCH §3 Consumer 1). |

**Conclusion:** ABSTRACT-01 satisfied as scoped. Four matches are UI-presentation conditionals on UI-presentation properties (`showJersey`, `active`, `placeholder`) — none dispatch business logic, none are in shared aggregators or server actions, and removing them would require either pushing UI state into the sport-config layer (acceptable Phase 5+ refactor — not Phase 3 scope) or duplicating the components per sport (worse than the current state). Documented for Phase 5+ backlog (CI-enforceable lint rule that allow-lists `showJersey`, `active`, `placeholder` properties when the conditional is on `sport === "afl"`).

### ABSTRACT-02 — AFL flow behaves identically

Plan 03-05 confirmed `npm run e2e` exits 0 with full Playwright suite green (29 passed / 1 skipped / 0 failed in 1.9 min). All existing AFL specs (game-create across U8/U10/U13, lineup, live-full-time, live-quarters, live-scoring, live-swaps, injury-replacement, settings, roster, smoke, super-admin, runner-token, team-invite, onboarding, game-edit, availability) pass on the merged trunk. The Phase 2 e2e spec (`multi-sport-schema.spec.ts`) flipped from expected-red to green per D-12.

Per-spec PROD-01 re-runs (above) confirm each AFL post-fork-fix flow individually passes when isolated.

ABSTRACT-02 satisfied.

## §6 Hand-off to Phase 4 (netball verification)

### Final merge state

| Item | Value |
|------|-------|
| Merge target branch | `merge/multi-sport-trunk` |
| Merge target HEAD SHA | `bd8761f` (full: `bd8761f93f0bcecd86af6b6dc66713c54e797b35`) |
| Merge commit (parents) | `multi-sport` HEAD `1277068` (Phase 3 base) + `claude/vibrant-banzai-a73b2f` HEAD at plan 03-01 dispatch (= main HEAD `80a04eb` + Phase 1+2 planning artefacts). `git merge-base --is-ancestor 80a04eb HEAD` and `git merge-base --is-ancestor pre-merge/multi-sport HEAD` both exit 0. |
| Tags | `pre-merge/main` = `e9073dd205bdd8eae8e7b66097e3b2275c4b5958`, `pre-merge/multi-sport` = `e13e787cb8abe405c18aca73e66c7c928eb359d8` — UNCHANGED throughout Phase 3 (D-21 verified at end of plan 03-06) |
| Migration set | 27 migrations (`0001_initial_schema.sql` … `0023_perf_indexes.sql` shared + `0024_multi_sport.sql` + `0025_super_admin.sql` + `0026_team_quarter_seconds.sql` + `0027_game_quarter_seconds.sql`). Main's `0024_super_admin.sql` correctly absent (deleted in Plan 03-01 per D-10). |
| Source-tree state | `tsc --noEmit` green, Vitest green (per Plan 03-04 baseline; no `src/` changes since), `lint` green, `e2e` green (full suite per Plan 03-05 + per-spec PROD-01 per this plan) |
| Phase 2 spec | `e2e/tests/multi-sport-schema.spec.ts` — 3/3 PASS (D-12 satisfied) |
| ABSTRACT-01 | satisfied (4 UI-presentation matches in setup/squad — none dispatch business logic; documented as acceptable per §5) |
| ABSTRACT-02 | satisfied (full e2e suite + 5 PROD-01 specs all green) |
| ABSTRACT-03 | satisfied (3 redirect sites all flow through `getEffectiveQuarterSeconds`; `quarterMs` param path verified end-to-end) |
| PROD-01..04 | all satisfied per §5 evidence |
| MERGE-01 | satisfied (single trunk; 80a04eb ancestor + multi-sport HEAD ancestor; 109 new commits since multi-sport tip; 77 src-touching commits from main reachable) |

### What Phase 4 should know

- **The merge target branch is `merge/multi-sport-trunk`** at HEAD `bd8761f`. Phase 4 work continues on this branch (or a new feature branch off it). NOT on `claude/vibrant-banzai-a73b2f` (which is the planning-artefact source preserved per D-19; Plans 03-01..06 commit only documentation to it, source modifications happen in `merge-trunk`).
- **Phase 4 strategy recommendation:** keep both branches and PR `merge/multi-sport-trunk` into `main` at Phase 7 (do NOT fast-forward `multi-sport` to this trunk in Phase 4 — Phase 4's job is netball verification, not branch hygiene). Phase 7 cleanup deletes `multi-sport`/`merge-trunk` after `main` fast-forwards.
- **Local Supabase has been reset by Plan 03-05 + each PROD-01 per-spec re-run** (every `npm run e2e` invocation triggers `supabase db reset --yes`). The local DB is in a clean state with all 27 migrations applied. Phase 4's netball verification can use this DB directly OR re-reset for isolation.
- **The Kotara Koalas seed team** (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`, netball, "Go", 9 players, 5 simulated games per TEST-05) — confirm presence with a `select` against the local DB. If absent, Phase 4 re-seeds via the netball-specific seed script (out of scope for Phase 3).
- **D-26/D-27 wiring** is in place at `live/page.tsx` for both netball + AFL branches; netball uses `getEffectiveQuarterSeconds` at line 104 (multi-sport's existing call), AFL uses the new computation Plan 03-04 added at line 242 + threads `quarterMs` into `<LiveGame>`. Phase 4's netball flow tests should exercise both per-team and per-game `quarter_length_seconds` overrides.
- **`stats/page.tsx` and `run/[token]/page.tsx`** also call `getEffectiveQuarterSeconds` (lines 130 and 49 respectively). Phase 4 should sanity-check those surfaces if netball games surface in stats or via runner-token sharing.
- **CONCERNS.md fragile-area note for `liveGameStore.ts`** still applies — pause-event persistence is a known cross-cutting bug (deferred per CONTEXT.md). Phase 4 should NOT attempt to fix it unless a netball flow specifically requires it.
- **Surface 4 (QuarterBreak time bars) is NOT redirected** — RESEARCH §4 confirmed it's proportion-based, not duration-based. If Phase 4 finds a netball edge case where the time bars look wrong, the cause is upstream (in `endCurrentQuarter` or zone-minute calculation), not in QuarterBreak itself.
- **Surfaces 5+6 (`GameHeader.tsx` banner + `fairness.ts` season-bonus) still reference `QUARTER_MS = 12 * 60 * 1000`** — out of scope for Phase 3's CONTEXT.md-defined 4-surface scope. Documented in §4 above. If netball banner display surfaces a non-12-minute oddity, Phase 5+ thread `quarterMs` through `GameHeader` props.
- **`merge/multi-sport-trunk` branch deletion** is deferred to Phase 7 cleanup. Phase 4..6 keep working on this branch.

### Three side-findings deferred from Plan 03-05 (carry forward to Phase 4 hygiene plan)

These were flagged in `03-05-SUMMARY.md` "Side-findings Outstanding" and remain unaddressed — Phase 4 (or a between-phase hygiene plan) should land them:

1. **Untracked Playwright artefact dirs.** `playwright-report/`, `playwright/`, and `test-results/` are produced by `npm run e2e` but are not gitignored. They appear as untracked on every run and are easy to accidentally commit. Re-confirmed during Plan 03-06: `git status --short` in `merge-trunk` shows `?? playwright-report/`, `?? playwright/`, `?? test-results/`. Add to `.gitignore`.
2. **Stale-dev-server detection in `scripts/e2e-setup.mjs`.** Plan 03-06 PROD-01 first run of `injury-replacement.spec.ts` failed with `ERR_CONNECTION_RESET` under `--workers=2`; the root cause is dev-server cold-compile race when Playwright spins up a fresh server while parallel workers race to compile `/live`. The mitigation used was `--workers=1`, which serialises the compile but doubles wall time. A proper fix is `lsof -i :3000`-style guard at `scripts/e2e-setup.mjs` startup that detects an existing dev server on port 3000 and either reuses it (matching `playwright.config.ts`'s `reuseExistingServer: !process.env.CI`) or aborts with a clear message. Cross-worktree hijack class of bug also prevented.
3. **Admin-membership hydration helper.** Three specs now carry the same `await expect(switch).toBeEnabled({timeout: 5_000})` boilerplate (settings.spec.ts, roster.spec.ts × 2, plus the DB-poll variant in game-edit.spec.ts). Consider extracting an `adminPage` Playwright fixture or a `await waitForAdminHydration(page)` helper so future spec authors get the guard for free, and the rationale is centralised in one comment block rather than duplicated three times.

### Other deferred items (per STATE.md "Deferred Items" + Plan 03-05 SUMMARY)

- **Pause-event persistence bug** (cross-cutting, both branches affected) — deferred per CONTEXT.md.
- **Audit log for game event mutations** — backlog per CONCERNS.md.
- **Performance benchmarking of perf wave 3** (PROD-02 quantitative) — Phase 6/7.
- **`games.quarter_length_seconds` UI exposure** in game-edit form — v2.
- **CI guard for ABSTRACT-01** (`grep` rule failing if AFL business-logic conditional appears outside `src/lib/sports/`) — backlog. Out of scope for this milestone, but the regression risk is real once Phase 4 lands more sport-specific UI.
- **CI guard for PROD-04** (`grep -q "test.fixme" e2e/tests/playhq-import.spec.ts`, fail if zero matches) — backlog. Prevents accidental "fixing" of intentional fixme.

### Open questions for Phase 4

None known at end of Phase 3 — research and patterns covered the merge surface comprehensively. If Phase 4 surfaces unexpected netball-side regressions, document and escalate as gaps for re-planning.

---

*Phase 3 closed 2026-04-29. Ready to dispatch `/gsd-execute-phase 4` on `merge/multi-sport-trunk`.*
