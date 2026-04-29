# Phase 3: Branch merge + abstraction integrity — Research

**Researched:** 2026-04-29
**Domain:** Git merge execution, TypeScript type patching, clock-surface refactor (Zustand + React)
**Confidence:** HIGH — all findings derived from reading actual source files on both branches and re-running `git merge-tree`

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-19** — Fresh branch off `multi-sport` HEAD; absorb `claude/vibrant-banzai-a73b2f` via `git merge claude/vibrant-banzai-a73b2f --no-ff`
- **D-20** — `git merge --no-ff` (merge-commit, no squash)
- **D-21** — `pre-merge/main` (80a04eb) and `pre-merge/multi-sport` (1277068) tags stay untouched
- **D-22** — One-pass merge; resolve all 6 mapped conflicts plus the rename/rename in a single session, then commit atomically
- **D-23** — After each individual conflict resolved: `npx tsc --noEmit` only. After merge commit + file ops: full gauntlet (`tsc && npm test && npm run lint && npm run e2e`)
- **D-24** — Surprise conflicts beyond the mapped 6: STOP, add "Surprise conflicts" section to 03-MERGE-LOG.md with per-file rationale before resolving
- **D-25** — Uniform `getSportConfig(team.sport).ageGroups.find(g => g.id === team.age_group)` lookup pattern; no type casts, no per-call-site runtime guard helpers
- **D-26** — All 4 main-side clock surfaces in scope: countdown banner in LiveGame.tsx, hooter end-of-quarter in LiveGame.tsx, time-credit accounting in liveGameStore.ts, Q-break time bars in QuarterBreak.tsx
- **D-27** — Direct call to `getEffectiveQuarterSeconds(team, ageGroup, game)` at each use-site; imports from `src/lib/sports/index.ts`; no prop-drilling layer, no hook abstraction

### Claude's Discretion

- Final merge branch name (suggested: `merge/multi-sport-trunk`)
- PR strategy (single PR default; split only if reviewer demands it)
- Format of `03-MERGE-LOG.md`
- Whether to insert human checkpoints during the merge
- Whether to delete `merge/multi-sport-trunk` after Phase 7 cutover
- Whether Phase 2 e2e spec needs minor locator edits after merge

### Deferred Ideas (OUT OF SCOPE)

- PR strategy details
- Performance benchmarking for perf wave 3 changes (PROD-02) — Phase 6/7
- `merge/multi-sport-trunk` branch deletion — Phase 7
- CI enforcement of "no AFL-baked-in conditionals in shared components" — backlog
- `games.quarter_length_seconds` exposure in game-edit form — v2
- NetballGameSummaryCard polish — Phase 4+
- Pause event persistence — cross-cutting backlog bug
- Audit log for game event mutations — backlog
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MERGE-01 | Single trunk containing all 60 main + 74 multi-sport commits, all conflicts resolved coherently | §2 conflict re-verification; §5 per-file rationale |
| ABSTRACT-01 | No AFL-baked-in conditionals in shared components, server actions, or stats aggregators | §4 D-26 redirect site list; post-merge grep compliance command |
| ABSTRACT-02 | AFL flow identical to pre-merge prod — all existing AFL e2e specs pass | §6 PROD-01 spec inventory |
| ABSTRACT-03 | `getEffectiveQuarterSeconds` is sole source of truth for countdown, hooter, time-credit, Q-break time bars | §3 D-25 list; §4 D-26 list |
| PROD-01 | All post-fork prod e2e fixes pass on merged trunk | §6 spec inventory |
| PROD-02 | Perf wave 3 preserved (static pages, DB indexes, spinners) | §6 grep/diff commands |
| PROD-03 | UX changes preserved — back-arrow removal | §6 grep command |
| PROD-04 | PlayHQ live-import remains intentionally fixme'd | §6 grep command |
</phase_requirements>

---

## 1. Phase Scope Summary

Phase 3 creates a fresh branch off `multi-sport` HEAD (1277068), runs one `git merge claude/vibrant-banzai-a73b2f --no-ff` to absorb all 60 production commits and 28 Phase 1+2 planning commits, and resolves the 6 mapped content conflicts plus the rename/rename migration conflict in a single session. After committing the merge, it executes Phase 2 §2 file ops (delete `supabase/migrations/0024_super_admin.sql`, keep multi-sport's 4 new migrations), then patches D-25 `AgeGroup` consumers and D-26/D-27 clock-surface redirects. The phase ends when `tsc`, `npm test`, `npm run lint`, and `npm run e2e` are all green — including `e2e/tests/multi-sport-schema.spec.ts` which flips from expected-red to expected-green here.

---

## 2. Conflict Surface Re-Verification

**Re-run date:** 2026-04-29  
**Command:** `git merge-tree --write-tree HEAD multi-sport` on `claude/vibrant-banzai-a73b2f`

### Output (verbatim conflict lines)

```
CONFLICT (content): Merge conflict in package.json                                   ← NEW — not in Phase 1 §3
CONFLICT (content): Merge conflict in src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx
CONFLICT (content): Merge conflict in src/app/(app)/teams/[teamId]/games/page.tsx
CONFLICT (content): Merge conflict in src/app/layout.tsx
CONFLICT (content): Merge conflict in src/app/page.tsx
CONFLICT (content): Merge conflict in src/components/squad/PlayerList.tsx
CONFLICT (content): Merge conflict in src/components/squad/PlayerRow.tsx
CONFLICT (rename/rename): supabase/migrations/0017b_super_admin.sql renamed to
  0024_super_admin.sql in HEAD and to 0025_super_admin.sql in multi-sport.
```

### Drift Report

**`package.json` is a new CONFLICT not mapped in Phase 1 §3.**

Phase 1 classified `package.json` as "clean-merge-likely (auto-merges, different deps added on each side)." The Phase 2 work on `claude/vibrant-banzai-a73b2f` added `e2e` and `db:*` scripts to `package.json` (Plan 02-02), creating an overlapping-hunk conflict with the Phase 2 additions against the multi-sport baseline.

**Resolution directive for the executor (D-24 compliant):** This is a straightforward additive conflict — both sides added scripts/devDependencies in different sections. Resolution: take all changes from both sides. The final `package.json` must include multi-sport's sport-abstraction devDependencies AND Phase 2's `e2e`, `db:reset`, `db:seed`, `db:push` scripts. Verify with `npm install --frozen-lockfile` after resolution. Record this in `03-MERGE-LOG.md §2 Unmapped conflict surprises`.

The other 6 content conflicts and 1 rename/rename match Phase 1 §3 exactly — no additional drift detected.

### Clean-merge files verified

The following files Phase 1 flagged as potentially conflicting but expected to auto-merge DID auto-merge cleanly:
- `src/app/(app)/layout.tsx` — auto-merged
- `src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx` — auto-merged
- `src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts` — auto-merged
- `src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts` — auto-merged
- `src/components/marketing/MarketingFooter.tsx` — auto-merged
- `src/lib/stores/liveGameStore.ts` — **auto-merged** (this is the most important confirmed auto-merge — the store has no content conflict)
- `src/lib/types.ts` — auto-merged (semantic widening issue documented in §3)

---

## 3. D-25 Consumer List

**What happens post-merge:** `src/lib/types.ts` auto-merges with `Team.age_group` widened from `AgeGroup` (narrow enum) to `string` (per multi-sport). TypeScript will flag every site that passed `team.age_group` into a function expecting `AgeGroup` or used it as a key into `AGE_GROUPS[team.age_group]`.

**Discovery command (run after merge commit):**
```bash
npx tsc --noEmit 2>&1 | grep -E "(Type 'string' is not assignable to type 'AgeGroup'|Argument of type 'string' is not assignable to parameter of type 'AgeGroup')" | sort -u
```

**Pre-verified consumer list** (from reading source on this branch — tsc will confirm post-merge):

### Consumer 1: `src/components/squad/PlayerList.tsx` line 29

**Current code (main branch):**
```typescript
const ageGroup = ageGroupOf((team as { age_group?: string } | null)?.age_group);
const maxPlayers = AGE_GROUPS[ageGroup].maxSquadSize;
```

Note: Line 29 already casts via `ageGroupOf()` which narrows `string → AgeGroup`. This consumer may auto-survive after the widening (it already does a string lookup). **However** the import of `AGE_GROUPS` from `@/lib/ageGroups` is still present and the `maxSquadSize` lookup should migrate to the sport-config pattern.

**Multi-sport's resolution** (`src/components/squad/PlayerList.tsx`):
```typescript
// Line 5: import { getAgeGroupConfig } from "@/lib/sports";
// Line 6: import type { Sport } from "@/lib/types";
// ...
const sport = ((team as { sport?: string | null } | null)?.sport ?? "afl") as Sport;
const ageGroupCfg = getAgeGroupConfig(
  sport,
  (team as { age_group?: string | null } | null)?.age_group ?? null,
);
const maxPlayers = ageGroupCfg.maxSquadSize;
const showJersey = sport === "afl";
```

Also: the `select()` must be updated to fetch `sport` alongside `age_group`:
```typescript
supabase.from("teams").select("age_group, sport").eq("id", teamId).single()
```
(multi-sport's version already has this at line 22)

**After merge-conflict resolution** of this file (which takes the combined edit per Phase 1 §8), the D-25 pattern is already present. This consumer is resolved by the conflict resolution itself — no additional patch needed if the resolution follows multi-sport's structure. [VERIFIED: reading both branch versions]

### Consumer 2: `src/app/(app)/teams/[teamId]/games/page.tsx` line 48

**Current code (main branch):**
```typescript
const ageGroup = (team?.age_group ?? "U10") as import("@/lib/types").AgeGroup;
```

This is a direct type cast — tsc will not error here because the cast bypasses checks. However it is semantically wrong post-merge (netball teams have non-AgeGroup ids) and violates D-25 ("no type casts").

**Multi-sport's resolution** (`src/app/(app)/teams/[teamId]/games/page.tsx`):
```typescript
// Line 7: import { getAgeGroupConfig } from "@/lib/sports";
// Line 8: import type { Sport } from "@/lib/types";
// ...
const sport = ((team as { sport?: string | null } | null)?.sport ?? "afl") as Sport;
const ageGroupCfg = getAgeGroupConfig(sport, team?.age_group as string | null);
```
Also `select("age_group, sport, playhq_url")` replacing `select("age_group, playhq_url")`.

After merge-conflict resolution for this file, multi-sport's version takes precedence (per Phase 1 §8 "audit main's hunk and confirm it's still relevant"). The main-side change added `GamesFilter`, `Eyebrow`, and `searchParams` — these survive; the `AgeGroup` cast is replaced by multi-sport's `getAgeGroupConfig` call. **Planner note:** The conflict resolution task must verify that both multi-sport's sport lookup AND main's filter/searchParams additions are present in the resolved file. [VERIFIED: reading both branch versions]

### Consumer 3: `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` line 86

**Current code (main branch):**
```typescript
const ageGroup = ageGroupOf(teamRow?.age_group);
// ...
const positionModel = AGE_GROUPS[ageGroup].positionModel;
// ...
const ageCfg = AGE_GROUPS[ageGroup];
```

`ageGroupOf()` returns `AgeGroup` (narrows string→AgeGroup with fallback U10). Post-merge this is still technically safe for the AFL branch (will return U10 fallback for netball ids) but conceptually wrong. Multi-sport's AFL branch of this file continues using `AGE_GROUPS[ageGroup]` for the AFL path — so this consumer does NOT need to change for ABSTRACT-03 compliance because it's inside an AFL-only code path that multi-sport preserved.

**Multi-sport's pattern:** The AFL branch of `live/page.tsx` continues:
```typescript
const ageGroup = ageGroupOf(teamRow?.age_group);
const positionModel = AGE_GROUPS[ageGroup].positionModel;
const ageCfg = AGE_GROUPS[ageGroup];
```
These lines persist unchanged in multi-sport's AFL branch. No D-25 patch needed here — the dispatch has already been wrapped by `if (sport === "netball") { ... }` so the AFL path's `ageGroupOf` fallback is safe.

The critical D-25 compliance here is the `team.select()` must include `sport` and `quarter_length_seconds`. **After merge-conflict resolution, the select string becomes:** `"name, sport, track_scoring, age_group, quarter_length_seconds, song_url, song_start_seconds, song_duration_seconds, song_enabled"` (multi-sport's version). [VERIFIED: reading multi-sport's live/page.tsx]

### Summary table

| File | Line | Current Pattern | Post-merge Action | Resolution Source |
|------|------|----------------|-------------------|-------------------|
| `src/components/squad/PlayerList.tsx` | 29-30 | `ageGroupOf()` + `AGE_GROUPS[ageGroup].maxSquadSize` | Conflict resolution takes multi-sport's `getAgeGroupConfig()` — auto-resolved by §5 rationale | Merge conflict |
| `src/app/(app)/teams/[teamId]/games/page.tsx` | 48 | `as AgeGroup` cast | Conflict resolution takes multi-sport's `getAgeGroupConfig()` — auto-resolved | Merge conflict |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | 86 | `ageGroupOf()` → AFL path only | No patch needed post-merge (safe within AFL branch) | No action |

**Post-merge tsc scan** will be the ground truth. The planner should include a task: "run `npx tsc --noEmit`, collect any remaining `AgeGroup` errors, patch each with `getSportConfig(team.sport).ageGroups.find(g => g.id === team.age_group)` per D-25."

**D-25 compliance grep (post-patch):**
```bash
grep -rn "as AgeGroup\|: AgeGroup\b" src/ | grep -v "types.ts\|ageGroups.ts"
# Should return zero matches outside the type definition files
```

---

## 4. D-26 Redirect Site List

**Context:** D-26 requires redirecting 4 clock surfaces to call `getEffectiveQuarterSeconds(team, ageGroup, game)` (D-27). The critical finding from reading both branches is that **multi-sport has NOT yet redirected these surfaces** — it still uses the module-level constant `QUARTER_MS = 12 * 60 * 1000` hardcoded in `liveGameStore.ts`. The D-26/D-27 requirement is therefore a **new implementation task**, not a conflict-resolution task.

### Finding: Multi-sport's actual state of QUARTER_MS

Multi-sport `src/lib/stores/liveGameStore.ts` line 17:
```typescript
export const QUARTER_MS = 12 * 60 * 1000;
```

Multi-sport `src/components/live/LiveGame.tsx` line 7 (import), used at:
- Line 657: `const displayNowMs = Math.min(nowMs, QUARTER_MS);`
- Line 734: `if (elapsed * clockMultiplier >= QUARTER_MS && quarterEndTriggeredRef.current !== currentQuarter)`

Multi-sport `src/lib/stores/liveGameStore.ts` `endCurrentQuarter` action:
- Line 261: `const accumulated = Math.min(rawAccumulated, QUARTER_MS);`

**These are identical to main's versions** — multi-sport is also using the hardcoded constant. Multi-sport only resolved `getEffectiveQuarterSeconds` at the **page level** (in `live/page.tsx` for the netball branch), not at the component/store level.

**The correct interpretation of D-26/D-27:** After the merge, the merged trunk inherits `QUARTER_MS = 12 * 60 * 1000` everywhere. D-26/D-27 require the executor to add `quarterMs` prop plumbing so each surface calls `getEffectiveQuarterSeconds(team, ageGroup, game)` at the page level and passes the result down, or calls it directly at each use-site.

**Recommended approach per D-27 ("no prop drilling layer"):** Compute `quarterMs` at `live/page.tsx` (AFL branch, where `ageCfg` is already in scope) and pass it as a prop to `LiveGame` and `QuarterBreak`. Within the store's `endCurrentQuarter`, the cap is `Math.min(rawAccumulated, quarterMs)` where `quarterMs` is passed in by the caller. This is the minimal change that satisfies D-27.

### Surface 1: Countdown banner — `src/components/live/LiveGame.tsx` line 657 and 712

**Current code (main-side, post-merge identical to multi-sport):**
```typescript
// Line 657:
const displayNowMs = Math.min(nowMs, QUARTER_MS);
// Line 712 (passed to GameHeader via display logic in useMemo/render):
// GameHeader receives `displayNowMs` indirectly via zoneMsByPlayer calc
```

The countdown visual comes from `GameHeader` which reads the clock via the Zustand store. The cap at `QUARTER_MS` on line 657 drives `displayNowMs` — this is the countdown "remaining" display.

**Required change:**
1. Add `quarterMs: number` prop to `LiveGameProps` interface.
2. Replace `Math.min(nowMs, QUARTER_MS)` with `Math.min(nowMs, quarterMs)` at line 657.
3. The parent (`live/page.tsx`) computes: `const quarterMs = getEffectiveQuarterSeconds(team, ageCfg, g) * 1000;` and passes `quarterMs={quarterMs}` to `<LiveGame>`.

### Surface 2: Hooter end-of-quarter — `src/components/live/LiveGame.tsx` lines 785–806

**Current code:**
```typescript
// Lines 785-806 (the maybeTrigger useEffect):
function maybeTrigger() {
  const elapsed = clockElapsedMs({ clockStartedAt, accumulatedMs });
  if (elapsed * clockMultiplier >= QUARTER_MS && quarterEndTriggeredRef.current !== currentQuarter) {
    quarterEndTriggeredRef.current = currentQuarter;
    pauseClock();
    setShowQuarterEndModal(true);
    // ...
  }
}
```

Line 791 is the hooter trigger: `elapsed * clockMultiplier >= QUARTER_MS`. This must become `elapsed * clockMultiplier >= quarterMs`.

**Required change:** Same `quarterMs` prop as Surface 1 — reuse the same prop. Replace `QUARTER_MS` at line 791 (and line 657) with `quarterMs`.

### Surface 3: Time-credit accounting — `src/lib/stores/liveGameStore.ts` lines 339–379

**Current code (the `endCurrentQuarter` action):**
```typescript
endCurrentQuarter: () =>
  set((prev) => {
    // Lines 341-344:
    const rawAccumulated = prev.clockStartedAt === null
      ? prev.accumulatedMs
      : prev.accumulatedMs + (now - prev.clockStartedAt);
    // Line 347 — the cap:
    const accumulated = Math.min(rawAccumulated, QUARTER_MS);
    // Lines 352-357 — per-player stint calculation uses `accumulated`:
    const dur = Math.max(0, accumulated - start);
    // ...
  }),
```

`QUARTER_MS` at line 347 is the cap for stint duration. For AFL U10 this is correct (720s). For netball (600s default) or custom durations this is wrong.

**Required change:** `endCurrentQuarter` must accept a `quarterMs` parameter:
```typescript
endCurrentQuarter: (quarterMs: number) =>
  set((prev) => {
    // ...
    const accumulated = Math.min(rawAccumulated, quarterMs);
    // ...
  }),
```

The caller in `LiveGame.tsx` (function `handleEndQuarter`, line 691) already calls `endCurrentQuarter()` — update to `endCurrentQuarter(quarterMs)`.

**Also:** `QUARTER_MS` remains exported for backwards compatibility in `clockElapsedMs` and `formatClock` (which don't cap, they just report elapsed). Only the `endCurrentQuarter` cap and the `LiveGame.tsx` hooter/display caps need the parameterised value.

**Note:** `CONCERNS.md` flags `liveGameStore.ts` (574 lines) as fragile. The D-27 change is narrow: one function signature addition and one constant replacement inside `endCurrentQuarter`. The executor must run `npm test` immediately after this change before any other modification. [VERIFIED: reading liveGameStore.ts lines 339-379]

### Surface 4: Q-break time bars — `src/components/live/QuarterBreak.tsx`

**Current code:** QuarterBreak.tsx does NOT reference `QUARTER_MS` directly. It uses `basePlayedZoneMs` (already computed and capped by `endCurrentQuarter`) to draw the proportional time bars. The proportion calculation at lines 369-370:
```typescript
const zm = currentGameZoneMins[pid] ?? emptyZM();
const total = zones.reduce((a, z) => a + zm[z], 0) || 1;
// style={{ width: `${(zm[z] / total) * 100}%` }}
```

This is a **relative** proportion (zone minutes as fraction of total), not an absolute comparison against `QUARTER_MS`. It does not need a D-26 redirect. The time bars are already correct because they use the accumulated zone minutes from the store, which were capped by `endCurrentQuarter`.

**Conclusion:** Surface 4 (QuarterBreak time bars) requires NO D-26 edit — the bars are proportion-based, not duration-based. The D-26 scope described in CONTEXT.md is satisfied by the store-level cap fix (Surface 3). [VERIFIED: reading QuarterBreak.tsx lines 369-435]

### D-26/D-27 Compliance Grep (post-redirect)

```bash
# Must show hits in LiveGame.tsx (surfaces 1+2) and liveGameStore.ts (surface 3):
grep -n "QUARTER_MS" src/components/live/LiveGame.tsx src/lib/stores/liveGameStore.ts src/components/live/QuarterBreak.tsx
# Expected post-redirect: only the export declaration in liveGameStore.ts (if kept), zero uses in the capping logic

grep -n "quarterMs" src/components/live/LiveGame.tsx src/lib/stores/liveGameStore.ts
# Expected post-redirect: ≥3 hits total (prop in LiveGame, endCurrentQuarter param, hooter line)
```

### Summary of D-26 changes required

| Surface | File | Line(s) | What changes |
|---------|------|---------|--------------|
| Countdown display cap | `LiveGame.tsx` | 657 | `Math.min(nowMs, QUARTER_MS)` → `Math.min(nowMs, quarterMs)` |
| Hooter trigger | `LiveGame.tsx` | 791 | `>= QUARTER_MS` → `>= quarterMs` |
| Stint duration cap | `liveGameStore.ts` | 347 | `Math.min(rawAccumulated, QUARTER_MS)` → `Math.min(rawAccumulated, quarterMs)` + add param to `endCurrentQuarter` |
| Q-break time bars | `QuarterBreak.tsx` | n/a | **NO CHANGE NEEDED** — proportional, not duration-based |

**Where `getEffectiveQuarterSeconds` is called (D-27):**
```typescript
// In live/page.tsx AFL branch — add after line ~232 where ageCfg is defined:
import { getEffectiveQuarterSeconds } from "@/lib/sports"; // post-merge path
const quarterMs = getEffectiveQuarterSeconds(
  { quarter_length_seconds: teamRow?.quarter_length_seconds ?? null },
  ageCfg,
  g,
) * 1000;
```
Pass `quarterMs` to `<LiveGame quarterMs={quarterMs} .../>`. LiveGame passes it to `endCurrentQuarter(quarterMs)` inside `handleEndQuarter()`.

---

## 5. Phase 1 §8 Rationale Recap

Per Phase 1 §8 (re-verified against current `multi-sport` tip at `1277068`). All decisions remain valid.

| File | Phase 1 §8 Rationale | Re-verification |
|------|---------------------|-----------------|
| `supabase/migrations/0017b_super_admin.sql` (rename/rename) | Take multi-sport's `0025_super_admin.sql` filename. Delete main's `0024_super_admin.sql`. Content is byte-identical (`sha256: 1761d404...`). | Phase 2 §1 re-confirmed sha256 equality. Delete is safe. |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | Take multi-sport's structure (sport-branching dispatch). Re-apply main's single commit on top at the AFL branch of the dispatch. | Verified: main has no edit to this file's content post-fork (only auto-merges in §3 apply). Multi-sport added the `if (sport === "netball")` dispatch. Resolution: take multi-sport's version as-is — main's "single edit" is actually the fill-in / availability fix which is in `actions.ts` not `page.tsx`. [VERIFIED: reading both versions] |
| `src/app/(app)/teams/[teamId]/games/page.tsx` | Take multi-sport's edit; audit main's hunk to confirm it's still relevant. | Main added `GamesFilter`, `searchParams`, `Eyebrow`, and the `(team?.age_group ?? "U10") as AgeGroup` cast line. Multi-sport added `getAgeGroupConfig`, `Sport` import, and `select("age_group, sport, playhq_url")`. Both are independent enhancements. Resolution: merge both — keep main's `GamesFilter`/`Eyebrow`/searchParams and multi-sport's `getAgeGroupConfig` call (replacing the AgeGroup cast). |
| `src/app/layout.tsx` | Take multi-sport's brand-module imports (`getBrand()`, `getBrandCopy()`) AND drop `Instrument_Serif` per main AND switch metadata to `SITE_URL` per main. | Verified: main has `Instrument_Serif` import and `SITE_URL` metadata. Multi-sport removed both and added `getBrand()`/`getBrandCopy()` dynamic metadata. Resolution: take multi-sport's version (no `Instrument_Serif`, dynamic metadata) AND add `GeistSans.variable` and `instrumentSerif.variable` to `<html className>` from main if they're needed for the SirenWordmark. Check if multi-sport kept `GeistSans` — it did (it's still in the html classname). `Instrument_Serif` removal is main's UX choice; keep it removed. |
| `src/app/page.tsx` | Take main's most recent landing-page state; audit multi-sport's edit for compatibility (likely a brand-copy import). | Verified: main has static `FEATURES` array and `metadata: { alternates: { canonical: "/" } }`. Multi-sport uses `getBrandCopy()` for dynamic features. Resolution: take multi-sport's version (dynamic brand-copy features, no static array) AND preserve main's `metadata` canonical export. |
| `src/components/squad/PlayerList.tsx` | Take main's most recent state; spot-check multi-sport's hunk. | Main has `AGE_GROUPS`/`ageGroupOf` imports and `SFCard`/`Eyebrow` UI components. Multi-sport replaced `AGE_GROUPS` with `getAgeGroupConfig`, added `Sport` type import, added `showJersey` prop pass-through to `PlayerRow`, and removed `SFCard`/`Eyebrow` in favour of plain divs. Resolution: take multi-sport's structure (sport-aware maxSquadSize + jersey visibility) AND preserve main's `SFCard`/`Eyebrow` UI components if present — spot-check shows multi-sport dropped them for plain divs, main kept them. Planner: resolve by preferring multi-sport's sport logic with main's SFCard wrapper if both are additive. |
| `src/components/squad/PlayerRow.tsx` | Take main's 3-commit state; audit multi-sport's single edit. | Main has `Guernsey` jersey badge SVG component, full edit/save/cancel UI, toggle, `data-testid`. Multi-sport added `showJersey?: boolean` prop (defaults true) that hides jersey badge and input for netball. Resolution: take main's full version (Guernsey, all UI) AND add multi-sport's `showJersey` prop. Main's `Guernsey` import stays; add the `showJersey` prop with default `true` so AFL behaviour is unchanged. |

---

## 6. PROD-01..04 Verification Command Library

### PROD-01: Post-fork e2e fixes preserved

These specs exist on the current branch and cover the prod-side fixes:

```bash
# Run AFTER merge + db:reset — each must pass individually:
npm run e2e -- e2e/tests/long-press.spec.ts
npm run e2e -- e2e/tests/availability.spec.ts
npm run e2e -- e2e/tests/injury-replacement.spec.ts
npm run e2e -- e2e/tests/live-swaps.spec.ts
npm run e2e -- e2e/tests/live-scoring.spec.ts
npm run e2e -- e2e/tests/live-quarters.spec.ts

# Or all at once via full suite:
npm run e2e
```

All 17 spec files verified present on this branch:
`availability`, `game-create`, `game-edit`, `injury-replacement`, `lineup`, `live-full-time`, `live-quarters`, `live-scoring`, `live-swaps`, `multi-sport-schema`, `onboarding`, `playhq-import`, `roster`, `runner-token`, `settings`, `smoke`, `super-admin`, `team-invite`

**Note:** `auth.setup.ts` is a fixture, not a spec — it appears in `git log` but not in `ls e2e/tests/*.spec.ts`. Correct.

### PROD-02: Perf wave 3 preserved

Perf wave 3 is preserved if the merged tree contains these files from main's commits:

```bash
# Static marketing/auth pages — verify key static pages exist:
ls src/app/\(auth\)/login/page.tsx src/app/\(marketing\)/page.tsx 2>/dev/null || echo "MISSING"

# DB indexes — check for index definitions in migrations:
grep -r "create index\|CREATE INDEX" supabase/migrations/ | grep -v "0024_multi_sport\|0025\|0026\|0027"

# Spinners — verify Spinner component exists (added in perf wave 3):
grep -rn "Spinner\|spinner" src/components/ui/ --include="*.tsx" | head -5

# Full diff audit — confirm all 60 main commits appear in merged history:
git log --oneline pre-merge/main..HEAD -- src/ | wc -l
# Must be > 0 (non-zero: main commits are present in merged tree)
```

### PROD-03: Back-arrow removal preserved

The back-arrow was removed from the authenticated header layout. Evidence from reading `src/app/(app)/layout.tsx`:

```bash
# Post-merge — should return zero matches:
grep -n "ArrowLeft\|ChevronLeft\|back.*arrow\|backArrow\|href.*back\|← Back" src/app/\(app\)/layout.tsx
# Expected: exit code 1, no matches (confirmed absent in current branch version)

# Confirm current layout has no back-navigation element:
grep -c "back" src/app/\(app\)/layout.tsx
# Expected: 0 or only in comments
```

**Note:** The current `src/app/(app)/layout.tsx` on this branch (64 lines) contains no back-arrow — it has only SirenWordmark, Admin link, Help link, email display, and SignOutButton. This is confirmed absent. After the merge, run the same grep.

### PROD-04: PlayHQ fixme preserved

```bash
# Must return at least one line (the intentional fixme):
grep -n "test.fixme\|testFixme" e2e/tests/playhq-import.spec.ts
# Current output: "28:test.fixme("PlayHQ preview + import creates game rows", async ({ page }) => {"
# After merge: same line must still be present

# Compliance check — exit code 0 means fixme IS present (expected):
grep -q "test.fixme" e2e/tests/playhq-import.spec.ts && echo "PROD-04 PASS: fixme preserved" || echo "PROD-04 FAIL: fixme accidentally removed"
```

---

## 7. Validation Architecture (Nyquist)

`nyquist_validation: true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (unit) + Playwright (e2e) |
| Vitest config | `vitest.config.ts` |
| Playwright config | `playwright.config.ts` |
| Quick run command | `npx tsc --noEmit` (< 15 s) |
| Full suite command | `npm run db:reset && npx tsc --noEmit && npm test && npm run lint && npm run e2e` |

### Phase 3 Nyquist Dimensions

| Dimension | What to check | Automated command |
|-----------|--------------|-------------------|
| Dim-1: Merge commit shape | Both branches' commits visible; no orphans | `git log --oneline --graph HEAD | head -20` — must show two parents in merge commit |
| Dim-2: Merge commit shape (tags) | `pre-merge/main` and `pre-merge/multi-sport` untouched | `git rev-parse pre-merge/main pre-merge/multi-sport` → must still equal `e9073dd` and `e13e787` |
| Dim-3: Type safety | tsc clean post-merge and post-patch | `npx tsc --noEmit` exits 0 |
| Dim-4: Unit tests | Vitest green including multi-sport's 3 new test files | `npm test` exits 0; `npm test -- --reporter=verbose 2>&1 | grep -E "pass|fail|Tests"` shows count ≥153 |
| Dim-5: e2e green | All specs green including multi-sport-schema | `npm run e2e` exits 0 |
| Dim-6: D-25/D-26/D-27 compliance | No AgeGroup casts outside type files; `getEffectiveQuarterSeconds` called at clock surfaces | See grep commands in §3 and §4 |
| Dim-7: PROD-01..04 preserved | See §6 grep/spec commands | Per-feature commands in §6 |
| Dim-8: Migration set correct | Exactly migrations 0001..0023 + 0024_multi_sport + 0025_super_admin + 0026 + 0027 | `npm run db:reset && supabase migration list 2>/dev/null | tail -5` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| MERGE-01 | Both branches' commits in `git log` | smoke | `git log --oneline HEAD | wc -l` — must be ≥135 (60+74+planning) | N/A |
| ABSTRACT-01 | No AFL hardcoded outside sports/ | grep | `grep -rn "team\.sport.*=== 'afl'\|sport.*=== \"afl\"" src/components/ src/app/ \| grep -v "lib/sports"` → 0 in shared components | N/A |
| ABSTRACT-02 | AFL e2e specs pass | e2e | `npm run e2e` | ✅ all 17 spec files present |
| ABSTRACT-03 | getEffectiveQuarterSeconds used at all clock surfaces | grep | `grep -n "quarterMs\|QUARTER_MS" src/components/live/LiveGame.tsx src/lib/stores/liveGameStore.ts` | ✅ post-patch |
| PROD-01 | Long-press, availability, injury-replacement, live-swaps, live-scoring specs green | e2e | `npm run e2e` | ✅ |
| PROD-02 | Perf wave 3 files present | diff/grep | `git log --oneline pre-merge/main..HEAD -- src/ | wc -l` > 0 | N/A |
| PROD-03 | Back-arrow absent | grep | `grep -c "ArrowLeft\|ChevronLeft" src/app/\(app\)/layout.tsx` → 0 | ✅ |
| PROD-04 | PlayHQ fixme present | grep | `grep -q "test.fixme" e2e/tests/playhq-import.spec.ts` | ✅ |

### Sampling Rate

- **Per conflict resolved:** `npx tsc --noEmit` (per D-23)
- **Per merge commit + file ops:** `npm run db:reset && npx tsc --noEmit && npm test && npm run lint && npm run e2e`
- **Per D-25/D-26 patch group:** `npx tsc --noEmit && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work` or human sign-off

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. The `multi-sport-schema.spec.ts` spec is already committed (from Phase 2); it flips green when Phase 3 lands the netball UI and migrations per D-12.

---

## 8. Landmines for the Executor

### L-1: Package.json conflict is a surprise (D-24 applies)

The `package.json` conflict is new since Phase 1. It MUST be recorded in `03-MERGE-LOG.md §2` before resolving. Resolution is mechanical (take all additions from both sides) but the audit trail requirement (D-24) means it cannot be silently resolved.

### L-2: Worktree-in-worktree — merge target branch must be created elsewhere

The current worktree is at `.claude/worktrees/vibrant-banzai-a73b2f`. Do NOT create the new `merge/multi-sport-trunk` branch from within this worktree. Instead:
1. Work from the main worktree at `C:\Users\steve\OneDrive\Documents\Auskick manager\` (which is currently on `fix/e2e-cleanup-and-selector-fixes` per `git worktree list`).
2. Or create a new worktree: `git worktree add .claude/worktrees/merge-trunk multi-sport && cd .claude/worktrees/merge-trunk && git checkout -b merge/multi-sport-trunk`.
3. The `claude/vibrant-banzai-a73b2f` branch is the SOURCE of the merge (it will be `git merge`'d in), not the target. Never merge FROM within the `vibrant-banzai-a73b2f` worktree itself.

### L-3: liveGameStore.ts is fragile — QUARTER_MS change requires isolated testing

`CONCERNS.md` explicitly flags `liveGameStore.ts` as fragile (3-layer architecture, recent string of e2e fixes). The D-26 change to `endCurrentQuarter` adds a parameter. Consequences:
- The `endCurrentQuarter` action is called in `LiveGame.tsx:handleEndQuarter` — must update the call site.
- The `LiveGameState` interface in `liveGameStore.ts` declares `endCurrentQuarter: () => void` — must update to `endCurrentQuarter: (quarterMs: number) => void`.
- The `DEFAULT_LIVE_STATE_DATA` does not include actions, but the action type declaration does. Check `useLiveGame((s) => s.endCurrentQuarter)` callers.
- **Required test sequence:** After ONLY this change: `npm test` → must stay green. Then continue with other D-26 changes.

### L-4: eslint-disable comments in LiveGame.tsx must survive

`CONCERNS.md` documents two `// eslint-disable-next-line react-hooks/exhaustive-deps` comments:
- `LiveGame.tsx:272` (YouTube effect)
- `LiveGame.tsx:395` (subBaseMs effect)

When resolving the `live/page.tsx` conflict and making D-26 edits to `LiveGame.tsx`, verify these disable comments are still present in the output. `npm run lint` will catch their absence.

### L-5: `Instrument_Serif` font import — keep main's removal, don't re-introduce it

Multi-sport's `src/app/layout.tsx` removed `Instrument_Serif`. Main's version still has it. Per Phase 1 §8 the resolution takes multi-sport's version (removes the font). However, the `--font-instrument-serif` CSS variable must still work post-merge because it may be referenced in `tailwind.config.ts` or CSS files. **Check:** 
```bash
grep -rn "instrument-serif\|font-instrument" tailwind.config.ts src/app/globals.css
```
If references exist, either keep the import or remove the CSS variable too.

### L-6: `pre-merge/main` tag points to `e9073dd`, not `80a04eb`

From `git rev-parse pre-merge/main` output: `e9073dd205bdd8eae8e7b66097e3b2275c4b5958`. This is the `claude/vibrant-banzai-a73b2f` branch's initial commit (Phase 1 setup), not `80a04eb` (the original main HEAD). Phase 1 §1 documented main HEAD as `80a04eb` but the tag was created on the worktree branch. The merge source (`claude/vibrant-banzai-a73b2f` HEAD at `0464218`) is the correct absorb target — it contains both `80a04eb`'s commits and Phase 1+2 planning artifacts. D-21 says do not re-tag — this is correct behaviour; just note it for the executor to avoid confusion.

### L-7: No `.gitattributes` — no line-ending merge rules

There is no `.gitattributes` file in the repo. On Windows, git's `core.autocrlf` setting controls line endings. If the executor runs on Windows and `autocrlf=true`, the merge may produce line-ending conflicts that appear as content conflicts. Mitigation: run `git config core.autocrlf false` before the merge, or verify the setting matches what both branches used.

### L-8: `applyInjurySwap` is missing from the multi-sport LiveGame import list

Multi-sport's `LiveGame.tsx` does NOT import `applyInjurySwap` from the store (not visible in the props dump). Main's `LiveGame.tsx` does use `applyInjurySwap` (line 162). After merge-conflict resolution, verify `applyInjurySwap` is still imported and called. Since `liveGameStore.ts` auto-merges, the function definition will be present — the import in `LiveGame.tsx` just needs to survive the conflict resolution.

### L-9: `QuarterBreak.tsx` auto-merges but verify `positionModel` prop

`QuarterBreak.tsx` is not in the conflict list (it auto-merges). After merge, verify its `positionModel` prop is still passed from the `LiveGame` isBetweenQuarters branch at lines 815-826 of current `LiveGame.tsx`. The multi-sport version of `QuarterBreak.tsx` may expect a different prop set.

---

## 9. Out-of-Scope Reminders

The following are DEFERRED per CONTEXT.md and must NOT be included in Phase 3 work:

- No new netball features beyond what multi-sport already shipped — Phase 4 verifies them
- No new database migrations beyond the four lined up by Phase 2 (the sealed set from 02-SCHEMA-PLAN.md)
- No `git push --force` to `main` — Phase 7 fast-forwards
- No Vercel deployment — Phase 6
- No production Supabase migration application — Phase 6/7
- No PlayHQ fixme resolution — explicitly intentional per commit `e9bbc47`; it must REMAIN fixme'd
- No CI enforcement rule for "no AFL-baked-in conditionals" — backlog
- No `games.quarter_length_seconds` UI exposure — v2
- No performance benchmarking of perf wave 3 — Phase 6/7
- No `merge/multi-sport-trunk` cleanup — Phase 7

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | QuarterBreak.tsx time bars are proportion-based and do not reference `QUARTER_MS` — confirmed by reading the file, which shows no such reference | §4 Surface 4 | If wrong, an additional D-26 edit is needed in QuarterBreak.tsx |
| A2 | Multi-sport's `LiveGame.tsx` and `liveGameStore.ts` still use the hardcoded `QUARTER_MS = 12 * 60 * 1000` constant — confirmed by `git show multi-sport:...` | §4 | If wrong (multi-sport already redirected these), the D-26 work description changes |
| A3 | `Instrument_Serif` removal in `src/app/layout.tsx` is safe without checking for downstream CSS variable consumers | §8 L-5 | If `tailwind.config.ts` references `--font-instrument-serif`, removing the import breaks font rendering |

All other claims in this research were verified by reading actual source files on `HEAD` and `multi-sport` via `git show`.

---

## Sources

### PRIMARY (HIGH confidence — direct source reads)

- `HEAD:src/lib/types.ts` — confirmed `Team.age_group: AgeGroup` narrow enum on main side
- `HEAD:src/components/live/LiveGame.tsx` — confirmed `QUARTER_MS` usage at lines 657, 791
- `HEAD:src/lib/stores/liveGameStore.ts` — confirmed `QUARTER_MS = 12 * 60 * 1000` at line 17, `endCurrentQuarter` cap at line 347
- `HEAD:src/components/live/QuarterBreak.tsx` — confirmed no `QUARTER_MS` reference, proportion-based bars
- `HEAD:src/components/squad/PlayerList.tsx` — confirmed `AGE_GROUPS[ageGroup]` consumer at line 30
- `HEAD:src/app/(app)/teams/[teamId]/games/page.tsx` — confirmed `as AgeGroup` cast at line 48
- `HEAD:src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` — confirmed AFL-only path with `AGE_GROUPS[ageGroup]`
- `HEAD:src/app/(app)/layout.tsx` — confirmed no back-arrow element
- `HEAD:src/lib/ageGroups.ts` — confirmed `AGE_GROUPS` record shape, `ageGroupOf()` definition
- `multi-sport:src/lib/sports/index.ts` — confirmed `getEffectiveQuarterSeconds` signature and resolution priority
- `multi-sport:src/lib/sports/types.ts` — confirmed `AgeGroupConfig.periodSeconds` field
- `multi-sport:src/components/live/LiveGame.tsx` — confirmed still uses `QUARTER_MS` (identical to main)
- `multi-sport:src/lib/stores/liveGameStore.ts` — confirmed still uses `QUARTER_MS = 12 * 60 * 1000`
- `multi-sport:src/components/live/QuarterBreak.tsx` — no `QUARTER_MS` reference
- `multi-sport:src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` — confirmed `getEffectiveQuarterSeconds` called for netball branch only; AFL branch still uses `AGE_GROUPS[ageGroup]`
- `multi-sport:src/components/squad/PlayerList.tsx` — confirmed `getAgeGroupConfig()` pattern, `showJersey` addition
- `multi-sport:src/components/squad/PlayerRow.tsx` — confirmed `showJersey?: boolean` prop addition
- `git merge-tree --write-tree HEAD multi-sport` — re-verified conflict surface 2026-04-29
- `git rev-parse multi-sport pre-merge/multi-sport pre-merge/main` — verified tag hashes
- `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` §3, §8
- `.planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md` §2
- `.planning/codebase/CONCERNS.md` — live game state machine fragile area
- `e2e/tests/playhq-import.spec.ts:28` — confirmed `test.fixme` present

---

## RESEARCH COMPLETE

**Phase:** 3 — Branch merge + abstraction integrity
**Confidence:** HIGH

### Key Findings

1. **`package.json` is a new unmapped conflict** (Phase 1 said "clean-merge-likely" but Phase 2 added scripts, creating an overlapping hunk). D-24 requires logging it in `03-MERGE-LOG.md §2` before resolving. Resolution is mechanical — take both sides.

2. **D-26/D-27 is new implementation work, not conflict resolution.** Both branches still use `QUARTER_MS = 12 * 60 * 1000` hardcoded in `liveGameStore.ts` and `LiveGame.tsx`. Multi-sport only added `getEffectiveQuarterSeconds` at the page level for the netball branch. The 4 clock surfaces need explicit patching after the merge commit.

3. **Surface 4 (QuarterBreak time bars) does NOT need a D-26 redirect** — the bars are proportion-based (`zm[z] / total * 100%`), not compared against an absolute duration. Only 3 sites need patching: display cap in `LiveGame.tsx:657`, hooter trigger in `LiveGame.tsx:791`, and stint cap in `liveGameStore.ts endCurrentQuarter:347`.

4. **D-25 consumers are mostly resolved by the conflict resolutions themselves.** `PlayerList.tsx` and `games/page.tsx` conflicts take multi-sport's `getAgeGroupConfig()` pattern. The `live/page.tsx` AFL path continues using `AGE_GROUPS[ageGroup]` safely (within a sport-dispatched AFL branch). Post-merge tsc scan is the ground truth for any remaining consumers.

5. **`src/lib/stores/liveGameStore.ts` auto-merges (no content conflict)** — this is the highest-risk file (CONCERNS.md "fragile") but the D-26 edit is narrow: add one parameter to `endCurrentQuarter` and replace one `QUARTER_MS` reference. Run `npm test` immediately after this change.

6. **Branch tags are correctly positioned:** `multi-sport` HEAD = `1277068` (confirmed), `pre-merge/multi-sport` = `e13e787` (confirmed). `pre-merge/main` = `e9073dd` (the worktree init commit, not `80a04eb` directly — but the full 60-commit main history is reachable via `claude/vibrant-banzai-a73b2f` HEAD which IS the merge source).

### File Created

`.planning/phases/03-branch-merge-abstraction-integrity/03-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Conflict surface | HIGH | Re-run `git merge-tree` on 2026-04-29; output matches Phase 1 §3 + one new package.json conflict |
| D-25 consumer list | HIGH | Read actual source on both branches; 2 consumers resolve via conflict resolution, 1 is safe within AFL branch |
| D-26 redirect sites | HIGH | Read both branches' actual source; lines confirmed |
| Phase 1 §8 rationale | HIGH | Re-read both branch versions of all 7 conflict files |
| PROD verification commands | HIGH | Verified spec files exist; grep patterns confirmed against live source |

### Open Questions

1. **`Instrument_Serif` downstream CSS consumers:** Does `tailwind.config.ts` or `src/app/globals.css` reference `--font-instrument-serif`? Resolution of `src/app/layout.tsx` should audit this before removing the import entirely.

2. **Multi-sport's `applyInjurySwap` absence:** Multi-sport's `LiveGame.tsx` doesn't show `applyInjurySwap` in the visible import list. If multi-sport removed it, the conflict resolution for `live/page.tsx` must preserve main's injury-replacement modal. Executor should search: `git show multi-sport:src/components/live/LiveGame.tsx | grep applyInjurySwap`.

### Ready for Planning

Research complete. Planner can now create PLAN.md tasks with exact file/line references for all 6 mapped conflicts, the package.json surprise conflict, D-25 consumer patches, and D-26/D-27 clock-surface redirects.
