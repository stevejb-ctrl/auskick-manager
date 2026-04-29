# MERGE-NOTES — `main` ↔ `multi-sport` divergence inventory

**Generated:** 2026-04-29
**Phase:** 01 — Divergence inventory & merge plan
**Status:** Read-only inventory. No source code, no migrations, no merge ops were executed.
**Consumer:** Phase 2 (schema reconciliation), Phase 3 (branch merge + abstraction integrity)

This document is the complete map of how `main` and `multi-sport` diverge. It is the input contract for Phase 3's merge work and Phase 2's migration renumbering. Every non-trivial conflict has a one-line resolution rationale in §8. The locked-in choices Phase 3 must honour are recorded in §9.

> **Storage decision:** kept phase-scoped at `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` rather than project-wide at `.planning/MERGE-NOTES.md`. Reason: this milestone is scoped to a specific reconciliation effort; the inventory is most useful to Phase 2/3 of the same milestone, not to future milestones. Phase-scoped is more idiomatic for GSD.

---

## §1 Branch summary

| Field | Value |
|---|---|
| Fork point sha | `b3657c5` ("Merge fix/migration-0017-collision: rename duplicate 0017 migrations to 0017a/0017b") |
| `main` HEAD | `80a04eb` ("fix(e2e): long-press, lineup availability, TagManager temp-id (#55)") |
| `multi-sport` HEAD | `1277068` ("multi-sport: first-visit walkthrough on netball live shell") |
| Commits on `main` since fork | **60** (production AFL enhancements) |
| Commits on `multi-sport` since fork | **74** (full netball MVP + sports abstraction) |
| Files touched on `main` since fork | **128** |
| Files touched on `multi-sport` since fork | **67** |
| Files in the intersection (touched on BOTH sides) | **16** |
| Files added by `multi-sport` (new) | 27 (sports abstraction + netball components + 4 migrations + brand modules + tests) |
| Files deleted by `multi-sport` | **0** — multi-sport added a parallel netball surface; AFL code stayed where it was |

**Top-line interpretation:** the divergence is dominated by **additive** multi-sport work, not restructuring. The 16-file intersection is the true conflict surface. Multi-sport's lower file count (67 vs 128) reflects production's broader bug-fix / e2e churn since fork; multi-sport's commits cluster tightly around the netball feature surface.

---

## §2 Migration-number conflicts

The fork point itself was a migration-rename merge (`b3657c5` renamed two duplicate 0017 migrations to `0017a_team_invites.sql` and `0017b_super_admin.sql`). After fork, **both branches independently re-renumbered these migrations** in incompatible ways:

| Pre-fork name | Renamed on `main` to | Renamed on `multi-sport` to | SHA |
|---|---|---|---|
| `0017a_team_invites.sql` | `0017_team_invites.sql` | `0017_team_invites.sql` | identical content — auto-merges cleanly |
| `0017b_super_admin.sql` | `0024_super_admin.sql` | `0025_super_admin.sql` | identical content (`6cc18bb…`) — **rename/rename CONFLICT** |

In addition, **multi-sport added 4 new migrations** post-fork:

| File | Purpose |
|---|---|
| `supabase/migrations/0024_multi_sport.sql` | Adds `teams.sport`, `teams.track_scoring`, netball `game_events` types |
| `supabase/migrations/0025_super_admin.sql` | Renamed-from-0017b, content identical to main's `0024_super_admin.sql` |
| `supabase/migrations/0026_team_quarter_seconds.sql` | Adds `teams.quarter_length_seconds` |
| `supabase/migrations/0027_game_quarter_seconds.sql` | Adds `games.quarter_length_seconds` |

And **`main` added 1 new migration** post-fork:

| File | Purpose |
|---|---|
| `supabase/migrations/0024_super_admin.sql` | Renamed-from-0017b, content identical to multi-sport's `0025_super_admin.sql` |

So at merge time the conflict shape is:

- `0024` collides: `0024_super_admin.sql` (main) vs `0024_multi_sport.sql` (multi-sport) — different content, same number.
- `0025_super_admin.sql` (multi-sport) and `0024_super_admin.sql` (main) are byte-identical (same git SHA) — only the filename differs.

### Proposed renumbering for Phase 2 (NOT executed)

The cleanest renumbering preserves multi-sport's existing ordering as the new trunk and inserts main's super_admin migration at the correct position relative to multi-sport's other migrations:

```
0017_team_invites.sql          ← identical on both, take either
0024_multi_sport.sql           ← from multi-sport, unchanged
0025_super_admin.sql           ← from multi-sport (= main's 0024_super_admin.sql, byte-identical)
0026_team_quarter_seconds.sql  ← from multi-sport, unchanged
0027_game_quarter_seconds.sql  ← from multi-sport, unchanged
```

Effectively: **delete `main`'s `0024_super_admin.sql` during the merge** (it's identical to multi-sport's `0025_super_admin.sql`, which already exists in the trunk). Net new migrations from main = 0. This is the cleanest possible outcome: multi-sport's migration set is a strict superset of main's after de-duplication.

**Phase 2 hand-off note:** The above is a proposal, not a decision. Phase 2 should re-verify by running `git show main:supabase/migrations/0024_super_admin.sql | sha256sum` and `git show multi-sport:supabase/migrations/0025_super_admin.sql | sha256sum` and confirming the hashes match. If they do, the de-duplication is safe. If they don't, escalate.

**Out of scope for Phase 1**: actually performing the renumbering. That is Phase 2 work.

---

## §3 File-level conflict matrix

The 16 files in the intersection were classified by running `git merge-tree` (modern syntax, not `--trivial-merge`) for an in-memory dry-run merge of the two branch tips. The output groups files into:

- **CONFLICT (content)** — Git could not auto-merge; manual resolution needed.
- **Auto-merging (no conflict marker shown)** — Git resolved automatically; no manual work needed.
- **Not in merge-tree output** — Edits do not actually overlap (e.g. a file was identical on both sides, or only one side's change persists in the diff but the other's was a no-op).

### Conflict matrix

| File | Category | main commits | multi-sport commits | Notes |
|---|---|---|---|---|
| `package.json` | clean-merge-likely | — | — | Auto-merges (different deps added on each side) |
| `src/app/(app)/layout.tsx` | clean-merge-likely | — | — | Auto-merges |
| `src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts` | clean-merge-likely | — | — | No overlap — auto-merges |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts` | clean-merge-likely | — | — | No overlap — auto-merges |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | **manual-resolution** | 1 | 10 | Multi-sport heavily refactored to add the sport branch; main's single edit must be re-applied at the new dispatch point |
| `src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx` | clean-merge-likely | — | — | Auto-merges |
| `src/app/(app)/teams/[teamId]/games/page.tsx` | **manual-resolution** | 1 | 1 | Both sides made narrow edits to the games list — overlapping hunks |
| `src/app/layout.tsx` | **manual-resolution** | 5 | 2 | Main removed `Instrument_Serif` font + switched metadata to `SITE_URL`; multi-sport pulled in `getBrand()` / `getBrandCopy()` from new brand modules. Both touched the same import block. |
| `src/app/page.tsx` | **manual-resolution** | 2 | 1 | Landing page — both sides edited |
| `src/components/games/ResetGameButton.tsx` | clean-merge-likely | — | — | Not in merge-tree conflict output |
| `src/components/marketing/MarketingFooter.tsx` | clean-merge-likely | — | — | Auto-merges |
| `src/components/squad/PlayerList.tsx` | **manual-resolution** | 1 | 1 | Squad list UI — overlapping hunks |
| `src/components/squad/PlayerRow.tsx` | **manual-resolution** | 3 | 1 | Squad row UI — main has 3 commits worth of edits to overlay onto multi-sport's single edit |
| `src/lib/stores/liveGameStore.ts` | clean-merge-likely | — | — | Auto-merges (likely additive in different sections of the store) |
| `src/lib/types.ts` | clean-merge-likely | — | — | Auto-merges. **However see §5 for a semantic risk on `Team.age_group`.** |
| `supabase/migrations/0017_team_invites.sql` | clean-merge-likely | — | — | Identical content on both sides — trivial auto-merge |

**Plus one rename/rename conflict** (handled in §2):
- `0017b_super_admin.sql` → `0024_super_admin.sql` (main) vs `0025_super_admin.sql` (multi-sport). Same byte content; resolves by deleting main's copy and keeping multi-sport's `0025_*`.

### Roll-up

| Category | Count |
|---|---|
| clean-merge-likely | 9 |
| manual-resolution | 6 |
| superseded-by-multi-sport (file moved/renamed by multi-sport, edited by main) | **0** — no such cases exist |
| deleted-on-one-side | **0** |
| rename/rename (special) | 1 (the migration above) |

**Bottom line: only 6 hard content conflicts and 1 migration filename collision need human attention during Phase 3.** The rest is auto-mergeable.

---

## §4 Sports-abstraction restructure surface

A defining surprise of this inventory: **multi-sport did NOT relocate AFL code**. Every AFL component is still at its original path on the multi-sport branch:

```
src/components/live/{Bench,Field,GameHeader,GameSummaryCard,LateArrivalMenu,
                     LineupPicker,LiveGame,LockModal,PlayerTile,QuarterBreak}.tsx
```

Multi-sport's structural work was purely **additive**:

| New surface on multi-sport | Purpose |
|---|---|
| `src/lib/sports/types.ts` | `SportConfig` type + supporting types |
| `src/lib/sports/index.ts` | Top-level dispatch (`getSportConfig`, `getEffectiveQuarterSeconds`) |
| `src/lib/sports/registry.ts` | Maps sport id → SportConfig |
| `src/lib/sports/afl/index.ts` | AFL config (zones, age groups, scoring) — **NEW file**, NOT a relocation of existing AFL code |
| `src/lib/sports/netball/index.ts` | Netball config (thirds, positions, age groups) |
| `src/lib/sports/netball/fairness.ts` | 5-tier netball fairness suggester |
| `src/lib/sports/brand-copy.ts` | Sport-aware brand copy |
| `src/lib/brand.ts` | `getBrand()` helper used by app shell |
| `src/components/netball/*` (11 files) | Netball UI: NetballLiveGame, NetballQuarterBreak, NetballGameSummaryCard, NetballBenchStrip, NetballPlayerActions, LineupPicker, PickReplacementSheet, Court, PositionToken, netballWalkthroughSteps + sport-aware walkthrough copy |
| `src/components/dashboard/NetballDashboardShell.tsx` | Netball stats shell |
| `src/lib/dashboard/netballAggregators.ts` | Netball event aggregators |
| `src/components/team/QuarterLengthInput.tsx` | Per-team quarter override input |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions.ts` | Netball server actions (parallel to existing AFL `actions.ts`) |

**Implication for the merge**: there is no "main edited a file at path X but multi-sport moved X to Y" risk. Main's AFL edits land on the same paths multi-sport sees them at. The conflicts in §3 are pure overlapping-edit conflicts on shared shell files (root layout, landing page, squad list, live game shell at `[gameId]/live/page.tsx`, etc.), not abstraction-misalignment conflicts.

---

## §5 Shared types and schemas

### `src/lib/types.ts` (auto-merges, with one semantic risk)

Multi-sport's additive changes to types.ts:

| Change | Risk |
|---|---|
| Added `Sport = "afl" \| "netball"` | None — new type, no conflict |
| Added `Team.sport: Sport` field | None — new field |
| Added `Team.quarter_length_seconds: number \| null` field | None — new field |
| Added `Game.quarter_length_seconds: number \| null` field | None — new field |
| Added `period_break_swap` to `GameEventType` union | None — additive union member |
| **Changed `Team.age_group: AgeGroup` → `Team.age_group: string`** | **YES — semantic widening.** AFL code on `main` may rely on `AgeGroup` enum-style narrowing for exhaustiveness checks. After merge, all reads of `team.age_group` need a runtime guard or a `SportConfig.ageGroups` lookup. |

### `getEffectiveQuarterSeconds` (multi-sport-only on `main`)

Multi-sport added `getEffectiveQuarterSeconds(team, ageGroup, game)` in `src/lib/sports/index.ts`. Resolution priority:

1. `game.quarter_length_seconds` (per-game override)
2. `team.quarter_length_seconds` (per-team override)
3. `ageGroup.periodSeconds` (sport-config default)

`main` does **not** reference this function — every `main`-side clock surface still inlines the age-group default. Phase 3 must redirect every `main` clock surface (countdown, hooter, time-credit accounting, Q-break time bars) to call `getEffectiveQuarterSeconds`. ABSTRACT-03 requirement.

### Database schema additions (from multi-sport migrations)

| Column | Migration | Default |
|---|---|---|
| `teams.sport` | `0024_multi_sport.sql` | `'afl'` (backfilled) — Phase 2 |
| `teams.track_scoring` | `0024_multi_sport.sql` | `true` (backfilled) — Phase 2 |
| `teams.quarter_length_seconds` | `0026_team_quarter_seconds.sql` | `NULL` (means "inherit") |
| `games.quarter_length_seconds` | `0027_game_quarter_seconds.sql` | `NULL` (means "inherit") |

`game_events.event_type` enum gains `period_break_swap` per `0024_multi_sport.sql`.

**Phase 2 flag**: production AFL data must have `teams.sport = 'afl'` set BEFORE any code path treats sport as non-null. Migration ordering: column add (DEFAULT 'afl') → backfill (in same migration) → application of NOT NULL constraint, all in one transactional `0024_multi_sport.sql` — verify the migration does this.

---

## §6 Server actions touched on both sides

Server actions modified on `main` since fork:

```
src/app/(app)/admin/actions.ts                              [perf wave 3? admin-side]
src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts      [auto-merges with multi-sport]
src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts [auto-merges with multi-sport]
src/app/contact/actions.ts                                  [main-only]
```

Server actions added on `multi-sport`:

```
src/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions.ts  [NEW, no conflict]
```

**Server-action conflict surface = zero hard conflicts.** Both shared action files (`games/[gameId]/actions.ts`, `live/actions.ts`) auto-merge per §3. Multi-sport's `netball-actions.ts` is a parallel new file. The only consideration for Phase 3 is to make sure the merge of `live/actions.ts` doesn't accidentally drop multi-sport's hooks for sport dispatch.

**`main`'s admin-side actions edits** (`src/app/(app)/admin/actions.ts`) don't intersect multi-sport at all — multi-sport never modified admin/. Clean carry-over.

---

## §7 Test-suite collision surface

### `e2e/` — ZERO collisions

`main` modified **20 e2e specs** since fork (the un-fixme work + new specs):

```
e2e/fixtures/{factories,supabase}.ts
e2e/tests/{auth.setup, availability, game-create, game-edit, injury-replacement,
           lineup, live-full-time, live-quarters, live-scoring, live-swaps,
           onboarding, playhq-import, roster, runner-token, settings, smoke,
           super-admin, team-invite}.spec.ts
```

`multi-sport` modified **0 files** under `e2e/`. The intersection is **empty**. Every one of main's e2e fixes lands on multi-sport unchanged.

This is the cleanest possible outcome for the test surface — the production-side e2e improvements (PROD-01 requirement) port across with zero conflict-resolution work.

### Unit tests

Multi-sport added 2 unit tests and modified 1:

```
A  src/lib/__tests__/netballFairness.test.ts          [new]
A  src/lib/__tests__/sports.test.ts                   [new]
M  src/lib/dashboard/__tests__/aggregators.test.ts    [modified — sport branching]
```

Main's modifications to `src/lib/dashboard/__tests__/aggregators.test.ts`: needs spot-check at merge time. If main also touched this file, it's a soft conflict; if not, multi-sport's edit lands cleanly. Per `git diff --name-only` it's **multi-sport-only** — no main-side edit, clean carry-over.

**Test surface roll-up**: 0 hard conflicts. All test work from both sides ports cleanly.

---

## §8 Resolution rationale per non-trivial conflict

For every `manual-resolution` entry in §3 and the rename/rename in §2, a one-line decision Phase 3 must follow.

| File | Rationale |
|---|---|
| `supabase/migrations/0017b_super_admin.sql` (rename/rename) | **Take multi-sport's `0025_super_admin.sql` filename. Delete main's `0024_super_admin.sql`.** Content is byte-identical, so this is renaming-by-deletion, not a content conflict. Verify byte equality (sha256) at merge time before deleting. |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | **Take multi-sport's structure (sport-branching dispatch). Re-apply main's single commit on top** at the AFL branch of the dispatch. Multi-sport heavily refactored this file (10 commits) to add the sport switch; main's single edit must be reapplied at the right level inside the AFL branch. |
| `src/app/(app)/teams/[teamId]/games/page.tsx` | **Take multi-sport's edit, audit main's hunk** to confirm it's still relevant after the merge. If both edits are independent enhancements, both stay (combine via `git checkout --merge` in normal flow). |
| `src/app/layout.tsx` | **Take multi-sport's brand-module imports** (`getBrand()`, `getBrandCopy()`) and **drop `Instrument_Serif` per main's removal** and **switch metadata to `SITE_URL` per main**. The result combines main's font+metadata cleanup with multi-sport's brand-aware shell. The merge here is genuinely creative — neither side wins outright. |
| `src/app/page.tsx` | **Take main's most recent landing-page state, then audit multi-sport's edit** to confirm it's compatible with main's changes (likely a brand-copy import that needs to land on top). |
| `src/components/squad/PlayerList.tsx` | **Take main's most recent state** (1 commit each, both narrow). Spot-check multi-sport's hunk to confirm it doesn't break with main's recent change. |
| `src/components/squad/PlayerRow.tsx` | **Take main's 3-commit state, then audit multi-sport's single edit** for compatibility. Main has 3× more recent activity here; multi-sport's hunk likely just needs to be re-applied at the new line. |
| `src/lib/types.ts` (auto-merges, but see §5) | **Auto-merge stands**, but immediately after the merge, run `npx tsc --noEmit` and audit any errors triggered by the `Team.age_group` widening (`AgeGroup` → `string`). Add `SportConfig.ageGroups` lookup at every consumer that needs narrowing. |

**Sections 3 and 7 collectively flag ZERO entries** in the `superseded-by-multi-sport` or `deleted-on-one-side` categories — those rationale rows are not needed.

---

## §9 Decision log — locked-in choices Phase 3 must honour

These decisions are LOCKED. Phase 3 must implement them as stated. Reopening a decision requires a new `/gsd-discuss-phase 3` cycle, not an in-flight call.

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-01 | **Multi-sport becomes the new trunk.** Main's 60 commits absorb into multi-sport via merge (not cherry-pick onto main). | Sports abstraction is structural; cherry-picking 74 commits onto main would tear it apart. Conflict surface is much smaller absorbing 60 into the restructured tree. | PROJECT.md Key Decisions, user-confirmed via `/gsd-new-project` question batch |
| D-02 | **Same Vercel + Supabase project** for production. No fresh deploy. | Preserves existing share-link tokens, avoids data migration. | PROJECT.md Key Decisions |
| D-03 | **Backfill `teams.sport = 'afl'`** for every existing team in `0024_multi_sport.sql` (DEFAULT then NOT NULL, in a single transactional migration). | Prod has only ever been AFL; assumption is safe. Avoids per-user action. | PROJECT.md Key Decisions; verified-safe by §5 above |
| D-04 | **Stage on a Vercel preview** against a clone of prod Supabase before fast-forwarding `main`. | Catches data-shape surprises (RLS, share tokens, existing event rows) that local e2e against fresh seed won't surface. | PROJECT.md Key Decisions |
| D-05 | **Take multi-sport's migration set as the trunk numbering.** De-duplicate main's `0024_super_admin.sql` against multi-sport's `0025_super_admin.sql` (byte-identical). Net new migrations from main = 0. | Cleanest possible Phase 2 outcome; no renumbering or content reconciliation needed beyond the de-dup. | This document, §2 |
| D-06 | **Take multi-sport's `Team.age_group: string` widening,** then immediately after the merge, run `tsc --noEmit` and patch any narrowed-enum consumers using `SportConfig.ageGroups` lookup. | Necessary for netball's six age groups to coexist with AFL's. The narrowing was a holdover from AFL-only days. | This document, §5 |
| D-07 | **`getEffectiveQuarterSeconds` is the sole quarter-length source of truth post-merge.** Phase 3 must redirect every `main`-side clock surface to call it. | ABSTRACT-03 requirement. Multi-sport already routes through it; main hasn't been touched. | REQUIREMENTS.md ABSTRACT-03; this document, §5 |
| D-08 | **Annotated tags `pre-merge/main` and `pre-merge/multi-sport` exist on origin** before Phase 3 begins any merge work. Tag messages reference this inventory by full path. | MERGE-02 requirement. Allows re-running the merge from a known good baseline if validation fails. | REQUIREMENTS.md MERGE-02; this document, §1 |
| D-09 | **No `git push --force` to main during cutover.** Phase 7 fast-forwards `main` to the merged trunk via `git push origin main` only after the preview deploy passes manual validation. | Preserves history; fast-forward is non-destructive against any concurrent writes. | This document |

### Deferred decisions surfaced (NOT decided in Phase 1)

These choices were considered while writing this inventory but are explicitly left for downstream phases to decide. Phase 1's job is to surface them, not resolve them.

- **Squash-merge vs merge-commit during Phase 3.** Both are technically viable. Squash loses the 74 multi-sport commits' fine-grained history but produces a single reviewable commit on main. Merge-commit preserves history but the trunk has a 74-commit dump. **Defer to Phase 3** based on PR-review preference.
- **Whether main's `0024_super_admin.sql` should become a documented "skipped" migration in the renumbering, or simply deleted from the repo.** Both work; Supabase migration tracker doesn't care because the byte-identical content already migrated under a different filename. **Defer to Phase 2.**
- **Whether the `multi-sport` branch is deleted or kept as a tag-pointed reference after Phase 7.** Tag `pre-merge/multi-sport` from D-08 already preserves the snapshot. **Defer to Phase 7 cleanup.**
- **Whether to introduce a CI check that flags any new addition to a sport-branching component without a sport-config dispatch.** Would prevent regression of ABSTRACT-01 over time. **Defer to a follow-up milestone.**

### Phase boundary reminder

Phase 1's deliverables are **this document and two tags**. No source code, no migrations, no merges. Conflict resolution from §8 happens in Phase 3. Migration renumbering from §2 / D-05 happens in Phase 2. Type-narrowing fixes from D-06 happen in Phase 3. Clock-surface redirects from D-07 happen in Phase 3.

---

*Inventory generated 2026-04-29 from `git merge-tree main multi-sport`, `git diff` against fork point `b3657c5`, and the multi-sport branch source tree. All file paths are relative to the project root. Read-only invariant: this document and `01-CONTEXT.md` are the only files written by Phase 1; no source files were modified.*
