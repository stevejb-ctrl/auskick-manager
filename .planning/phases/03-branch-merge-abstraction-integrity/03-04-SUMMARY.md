---
phase: 03-branch-merge-abstraction-integrity
plan: 04
status: complete
subsystem: live-game-clock-surface
tags: [merge, abstraction, LiveGame, D-26, D-27, ABSTRACT-03, fragile-area, handshake-close]
requires:
  - 03-03 (D-26 Surface 3 — store parameterisation handshake)
provides:
  - "LiveGame.tsx accepts quarterMs: number prop and uses it at countdown cap (Surface 1) + hooter trigger (Surface 2)"
  - "live/page.tsx AFL branch computes quarterMs via getEffectiveQuarterSeconds (D-27 direct call)"
  - "run/[token]/page.tsx (share-token AFL flow) computes quarterMs via getEffectiveQuarterSeconds (D-27 direct call)"
  - "tsc handshake from Plan 03-03 is closed — npx tsc --noEmit exits 0"
  - "ABSTRACT-03 closed at the source level — getEffectiveQuarterSeconds is the sole quarter-length source of truth across all 3 D-26 surfaces (1 + 2 in LiveGame, 3 in liveGameStore)"
affects:
  - src/components/live/LiveGame.tsx (quarterMs prop + 3 use-sites + dropped unused QUARTER_MS import)
  - src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx (AFL branch — getAgeGroupConfig + getEffectiveQuarterSeconds + quarterMs prop pass-through)
  - src/app/run/[token]/page.tsx (share-token AFL flow — same wiring; Rule 3 deviation)
tech-stack:
  added: []
  patterns:
    - "Parent computes quarterMs via getEffectiveQuarterSeconds(team, ageGroup, game) * 1000 and threads it as a single typed prop down to <LiveGame>; the component passes the same value into the store action endCurrentQuarter(quarterMs). Three-level resolution (game → team → ageGroup default) lives entirely inside getEffectiveQuarterSeconds."
    - "Sport-config AgeGroupConfig (with periodSeconds) is sourced via getAgeGroupConfig(\"afl\", ageGroup) — NOT the legacy AGE_GROUPS[ageGroup] record (which has quarterSeconds, not periodSeconds). The two shapes are distinct types; getEffectiveQuarterSeconds requires the sport-config shape."
key-files:
  created: []
  modified:
    - src/components/live/LiveGame.tsx
    - src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx
    - src/app/run/[token]/page.tsx
decisions:
  - "Removed the now-unused `QUARTER_MS` named import from `LiveGame.tsx` after replacing both use-sites — only the import statement and a doc-comment reference remained, both clean to drop. `QUARTER_MS = 12 * 60 * 1000` is still exported from `liveGameStore.ts` for `clockElapsedMs` / `formatClock` (uncapped elapsed reporting)."
  - "Computed `ageCfgSport = getAgeGroupConfig(\"afl\", ageGroup)` rather than passing the legacy `AGE_GROUPS[ageGroup]` record. The two shapes are NOT structurally compatible — sport-config `AgeGroupConfig` requires `positions`, `zones`, `periodCount`, `periodSeconds`. tsc surfaced this as a TS2345 mismatch on first attempt; the fix preserves the legacy shape for downstream `ageCfg.defaultOnFieldSize` / `ageCfg.quarterSeconds * 4 / 60` consumers (LineupPicker)."
  - "Auto-fixed the share-token caller `src/app/run/[token]/page.tsx` per Rule 3 (auto-fix blocking issues). The plan named only the team-coach `live/page.tsx` AFL branch, but tsc surfaced a second caller of `<LiveGame>` after the prop became required. The runner-token page is an AFL-only flow rendering the same component — same correctness invariant for the hooter trigger applies. Committed as a separate `fix(03-04): ...` commit so the audit trail shows the deviation."
metrics:
  duration: "≈6 minutes"
  completed: 2026-04-29
  tasks: 2 (planned) + 1 (Rule 3 deviation)
  files_modified: 3
  diff_lines: "+38 / -6 across 3 files (+8/-4 LiveGame.tsx, +16/-1 live/page.tsx, +14/-1 run/[token]/page.tsx)"
  vitest: "169/169 pass, 1.06s"
  tsc: "exit 0 — handshake closed"
commits:
  - hash: d6834c7
    branch: merge/multi-sport-trunk
    message: "feat(03-04): wire quarterMs through LiveGame (D-26 Surfaces 1+2 + handshake closure)"
  - hash: eb3f47a
    branch: merge/multi-sport-trunk
    message: "feat(03-04): pass quarterMs from page to LiveGame via getEffectiveQuarterSeconds (D-27)"
  - hash: 2d7cd94
    branch: merge/multi-sport-trunk
    message: "fix(03-04): pass quarterMs from share-token RunPage to LiveGame (Rule 3)"
---

# Phase 3 Plan 04: D-26 Surfaces 1+2 + D-27 wiring Summary

**One-liner:** Closed the Plan 03-03 tsc handshake by adding a `quarterMs: number` prop to `LiveGame`, wiring it through countdown cap + hooter trigger, and computing the value at both AFL parent callers (team-coach `live/page.tsx` and share-token `run/[token]/page.tsx`) via `getEffectiveQuarterSeconds(team, ageGroup, game) * 1000`. ABSTRACT-03 is closed at the source level — `getEffectiveQuarterSeconds` is now the sole quarter-length source of truth across all three D-26 surfaces (countdown display, hooter trigger, store stint cap).

## What Was Built

### Edit 1 — `src/components/live/LiveGame.tsx` (commit `d6834c7`)

Five surgical edits. Diff: `+8 / -4` (1 file).

```diff
@@ imports @@
 import {
   clockElapsedMs,
-  QUARTER_MS,
   useLiveGame,
 } from "@/lib/stores/liveGameStore";

@@ LiveGameProps interface (line 119) @@
   /** Speed multiplier for demo games — scales stored elapsed_ms and sub/quarter timing (default 1). */
   clockMultiplier?: number;
+  /** Effective quarter duration in milliseconds for this game/team/age-group.
+   * Computed by parent via getEffectiveQuarterSeconds(team, ageGroup, game) * 1000.
+   * D-26 / D-27: replaces hardcoded QUARTER_MS at the countdown cap and hooter trigger. */
+  quarterMs: number;
 }

@@ function destructuring (line 148) @@
   clockMultiplier = 1,
+  quarterMs,
 }: LiveGameProps) {

@@ handleEndQuarter (line 695) @@
-    endCurrentQuarter();
+    endCurrentQuarter(quarterMs);
       // ↑ closes the intentional tsc handshake from Plan 03-03

@@ countdown display cap, Surface 1 (line 717) @@
-  const displayNowMs = Math.min(nowMs, QUARTER_MS);
+  const displayNowMs = Math.min(nowMs, quarterMs);

@@ hooter trigger, Surface 2 (line 794) @@
-      if (elapsed * clockMultiplier >= QUARTER_MS && quarterEndTriggeredRef.current !== currentQuarter) {
+      if (elapsed * clockMultiplier >= quarterMs && quarterEndTriggeredRef.current !== currentQuarter) {
```

Invariants preserved:
- `// eslint-disable-next-line react-hooks/exhaustive-deps` × 2 (CONCERNS L-4) — both untouched
- `applyInjurySwap` import + call site (CONCERNS L-8) — untouched
- All other props/imports/render logic untouched

### Edit 2 — `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` (commit `eb3f47a`)

Wired the AFL branch parent caller. Diff: `+16 / -1`.

```diff
@@ imports (line 15) @@
-import { getEffectiveQuarterSeconds, getSportConfig, netballSport } from "@/lib/sports";
+import { getAgeGroupConfig, getEffectiveQuarterSeconds, getSportConfig, netballSport } from "@/lib/sports";

@@ AFL branch computation (after `const ageCfg = AGE_GROUPS[ageGroup];`) @@
+  // D-26 / D-27: compute the effective quarter length (seconds → ms) so
+  // LiveGame's countdown cap and hooter trigger respect per-team and
+  // per-game overrides instead of a hardcoded constant. Mirrors the
+  // netball branch's call above. Three-level resolution, most specific
+  // wins: game.quarter_length_seconds → team.quarter_length_seconds →
+  // ageGroup.periodSeconds (= 12 min for AFL U10). Uses the sport-config
+  // AgeGroupConfig (not the legacy AGE_GROUPS record) because
+  // getEffectiveQuarterSeconds expects the sport-config shape.
+  const ageCfgSport = getAgeGroupConfig("afl", ageGroup);
+  const quarterMs = getEffectiveQuarterSeconds(
+    { quarter_length_seconds: (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
+    ageCfgSport,
+    { quarter_length_seconds: g.quarter_length_seconds },
+  ) * 1000;

@@ <LiveGame> JSX (added one prop) @@
           songDurationSeconds={songDurationSeconds}
+          quarterMs={quarterMs}
         />
```

The team `select()` already includes `quarter_length_seconds` (added by Plan 03-01 when the file was set to multi-sport's version). The netball branch above already calls `getEffectiveQuarterSeconds`; the AFL branch now does the same — D-27 direct-call pattern satisfied at both branches.

### Edit 3 — `src/app/run/[token]/page.tsx` (commit `2d7cd94`, Rule 3 deviation)

Same wiring as the team-coach branch, applied to the share-token RunPage. Diff: `+14 / -1`.

```diff
@@ imports @@
 import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
+import { getAgeGroupConfig, getEffectiveQuarterSeconds } from "@/lib/sports";

@@ team select (added quarter_length_seconds) @@
-    .select("name, sport, track_scoring, age_group, song_url, song_start_seconds, song_duration_seconds, song_enabled")
+    .select("name, sport, track_scoring, age_group, quarter_length_seconds, song_url, song_start_seconds, song_duration_seconds, song_enabled")

@@ quarterMs computation (after `const positionModel = ...`) @@
+  // D-26 / D-27: same wiring as the team-coach branch in
+  // (app)/teams/[teamId]/games/[gameId]/live/page.tsx. The runner-token
+  // page renders the same <LiveGame> component for AFL games, so the
+  // hooter and countdown surfaces need the same per-game/per-team-aware
+  // duration. Three-level resolution: game → team → ageGroup default.
+  const ageCfgSport = getAgeGroupConfig("afl", ageGroup);
+  const quarterMs = getEffectiveQuarterSeconds(
+    { quarter_length_seconds: (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
+    ageCfgSport,
+    { quarter_length_seconds: g.quarter_length_seconds },
+  ) * 1000;

@@ <LiveGame> JSX (added one prop) @@
           songDurationSeconds={songDurationSeconds}
+          quarterMs={quarterMs}
         />
```

### What was deliberately NOT changed

- **`src/components/live/QuarterBreak.tsx`** — Surface 4 in CONTEXT.md but Research §4 Surface 4 found the time bars are proportion-based (`zm[z] / total * 100%`), not duration-capped. No D-26 redirect needed. Confirmed in diff: `git diff --name-only HEAD~3..HEAD | grep QuarterBreak` → 0 hits.
- **`src/lib/stores/liveGameStore.ts`** — Plan 03-03 already parameterised `endCurrentQuarter(quarterMs)`. Untouched here. The `export const QUARTER_MS = 12 * 60 * 1000` at line 17 stays for `clockElapsedMs` / `formatClock` (uncapped elapsed-time reporting).
- **Netball branch in `live/page.tsx`** — Already calls `getEffectiveQuarterSeconds` (multi-sport version, line 104). Untouched.
- **All other imports / props / JSX in LiveGame.tsx** — Targeted edits only. `applyInjurySwap` import + call site survive (CONCERNS L-8). Both `react-hooks/exhaustive-deps` eslint-disable comments survive (CONCERNS L-4).

## Deviations from Plan

### `[Rule 3 - Blocking issue]` Auto-fixed `src/app/run/[token]/page.tsx`

- **Found during:** Task 1 verification — `npx tsc --noEmit` after the LiveGame.tsx edits surfaced TWO errors instead of the one expected (the team-coach page parent caller). Plan only named `live/page.tsx` AFL branch as the second caller to wire.
- **Issue:** `src/app/run/[token]/page.tsx(84,10): error TS2741: Property 'quarterMs' is missing in type ... but required in type 'LiveGameProps'`. The share-token RunPage renders the same `<LiveGame>` component for AFL games (no netball branch — it's an AFL-only flow). Once `quarterMs` became a required prop, this caller would have prevented `tsc --noEmit` from exiting 0.
- **Fix:** Same wiring as the team-coach branch — added `getAgeGroupConfig` + `getEffectiveQuarterSeconds` imports, added `quarter_length_seconds` to the team select, computed `quarterMs = getEffectiveQuarterSeconds(team, getAgeGroupConfig("afl", ageGroup), g) * 1000`, passed `quarterMs={quarterMs}` to `<LiveGame>`.
- **Files modified:** `src/app/run/[token]/page.tsx`
- **Commit:** `2d7cd94`
- **Why this fits Rule 3 (not Rule 4):** No architectural change — it's the same wiring pattern as the team-coach branch, applied to a parallel AFL caller. The plan's `<threat_model>` T-03-12 (hooter trigger correctness) implicitly covers this surface; both AFL caller paths must agree or the share-token user gets the wrong end-of-quarter timing.

### `[Decision]` Sport-config `AgeGroupConfig` not legacy `AGE_GROUPS[ageGroup]`

- **Found during:** First tsc run after wiring the team-coach branch. `getEffectiveQuarterSeconds` rejected `AGE_GROUPS["U10"]` with TS2345 — the two `AgeGroupConfig` types are structurally distinct (legacy has `quarterSeconds`, sport-config has `periodSeconds` plus `positions`/`zones`/`periodCount`).
- **Fix:** Added `const ageCfgSport = getAgeGroupConfig("afl", ageGroup);` immediately before the `quarterMs` computation in both AFL caller files. Kept `const ageCfg = AGE_GROUPS[ageGroup]` because downstream (LineupPicker `defaultOnFieldSize`, `quarterSeconds * 4 / 60`) still consumes the legacy shape.
- **Why this is the right pattern:** `getAgeGroupConfig` is the registry-blessed AFL→sport-config bridge; using it here matches the netball branch's `netballSport.ageGroups.find(...)` idiom and keeps the call signature uniform.

## Self-Check: PASSED

| Check | Expected | Actual |
|------|----------|--------|
| Files modified | 3 (LiveGame.tsx, live/page.tsx AFL branch, run/[token]/page.tsx via Rule 3) | 3 ✓ |
| `LiveGameProps` has `quarterMs: number` | line ≥1 hit | line 122 ✓ |
| Destructured `quarterMs` in function args | ≥1 hit | line 151 ✓ |
| `Math.min(nowMs, quarterMs)` (Surface 1) | exactly 1 | line 717 ✓ |
| `elapsed * clockMultiplier >= quarterMs` (Surface 2) | exactly 1 | line 794 ✓ |
| `endCurrentQuarter(quarterMs)` (handshake closure) | ≥1 | line 699 ✓ |
| Old `Math.min(nowMs, QUARTER_MS)` removed | 0 | 0 ✓ |
| Old `>= QUARTER_MS` removed | 0 | 0 ✓ |
| `eslint-disable-next-line react-hooks/exhaustive-deps` count in LiveGame.tsx | 2 | 2 ✓ |
| `applyInjurySwap` count in LiveGame.tsx | ≥1 | 2 ✓ (import + call) |
| `getEffectiveQuarterSeconds` in `live/page.tsx` | ≥2 (netball + AFL) | 2 (lines 104, 242) + import ✓ |
| `getEffectiveQuarterSeconds` in `run/[token]/page.tsx` | ≥1 (AFL only) | 1 (line 49) + import ✓ |
| `quarterMs={quarterMs}` JSX in `live/page.tsx` | 1 | 1 ✓ |
| `quarterMs={quarterMs}` JSX in `run/[token]/page.tsx` | 1 | 1 ✓ |
| `QuarterBreak.tsx` in diff | NO | NOT in diff ✓ |
| `QUARTER_MS` or `quarterMs` in `QuarterBreak.tsx` | 0 | 0 ✓ |
| `npx tsc --noEmit` | exit 0 | exit 0 ✓ |
| `npm test` (Vitest) | exit 0, 169/169 | 169/169, 1.06s ✓ |
| Commits land on `merge/multi-sport-trunk` | 3 | d6834c7, eb3f47a, 2d7cd94 ✓ |
| `pre-merge/main` and `pre-merge/multi-sport` tags untouched | yes | no tag operations performed ✓ |
| `git status --short` clean post-commit | yes | clean ✓ |

### Compliance grep output (for MERGE-LOG.md §4 — Plan 03-06 will copy)

```
$ grep -nE "Math.min\(nowMs, quarterMs\)|elapsed \* clockMultiplier >= quarterMs|endCurrentQuarter\(quarterMs\)" src/components/live/LiveGame.tsx
699:    endCurrentQuarter(quarterMs);
717:  const displayNowMs = Math.min(nowMs, quarterMs);
794:      if (elapsed * clockMultiplier >= quarterMs && quarterEndTriggeredRef.current !== currentQuarter) {

$ grep -nE "endCurrentQuarter|Math.min\(rawAccumulated, quarterMs\)" src/lib/stores/liveGameStore.ts | head -5
95:  endCurrentQuarter: (quarterMs: number) => void;
339:  endCurrentQuarter: (quarterMs: number) =>
351:      const accumulated = Math.min(rawAccumulated, quarterMs);

$ grep -n "getEffectiveQuarterSeconds" src/app/\(app\)/teams/\[teamId\]/games/\[gameId\]/live/page.tsx
15:import { getAgeGroupConfig, getEffectiveQuarterSeconds, getSportConfig, netballSport } from "@/lib/sports";
104:    const quarterLengthSeconds = getEffectiveQuarterSeconds(
242:  const quarterMs = getEffectiveQuarterSeconds(

$ grep -n "getEffectiveQuarterSeconds" src/app/run/\[token\]/page.tsx
11:import { getAgeGroupConfig, getEffectiveQuarterSeconds } from "@/lib/sports";
49:  const quarterMs = getEffectiveQuarterSeconds(

$ grep -nE "QUARTER_MS|quarterMs" src/components/live/QuarterBreak.tsx
(no matches — Surface 4 intentionally untouched per Research §4)
```

### `npx tsc --noEmit` (handshake closed)

```
$ npx tsc --noEmit
$ echo $?
0
```

### `npm test` (Vitest)

```
> siren-footy@0.1.0 test
> vitest run

 Test Files  9 passed (9)
      Tests  169 passed (169)
   Duration  1.06s
```

### Targeted e2e (`live-quarters.spec.ts`)

Per the plan's task 4 final bullet, this is best-effort — the full e2e gauntlet is owned by Plan 03-05. Skipped here to avoid spurious dev-server / Supabase-container setup churn. The wiring is now end-to-end: any regression in countdown cap or hooter trigger will surface when Plan 03-05 runs the full Playwright suite.

## Threat Mitigation Trace (from PLAN `<threat_model>`)

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-03-12 (Tampering — hooter trigger condition) | mitigated | tsc enforces `quarterMs: number`; the prop is required (no `?:`) and passed at every `<LiveGame>` call site (team coach + share-token runner). Both AFL flows compute it from `getEffectiveQuarterSeconds`. Plan 03-05 gauntlet runs `live-quarters.spec.ts` which exercises end-of-quarter behaviour end-to-end. |
| T-03-13 (DoS — unit mismatch s vs ms) | mitigated | Explicit `* 1000` at both parent computation sites; type system enforces `quarterMs: number` (in ms by docstring contract); `endCurrentQuarter(quarterMs)` and the two LiveGame use-sites all compare against the same ms value. Manual verification deferred to Phase 4 will catch any regression a person can see. |
| T-03-14 (Repudiation) | accepted | Audit trail captured in commit messages (3 commits: d6834c7, eb3f47a, 2d7cd94) + this SUMMARY + MERGE-LOG.md §4 (Plan 03-06 owns). |

## Hand-off to Plan 03-05 (full gauntlet)

After this plan, the merged trunk is type-coherent and Vitest-green:
- `npx tsc --noEmit` → exit 0
- `npm test` → 169/169 pass

Plan 03-05 owns the full gauntlet:
1. `npm run db:reset` — apply the merged migration set (Phase 2 §2 file ops landed in Plan 03-01)
2. `npx tsc --noEmit` — confirm still green
3. `npm test` — confirm still green
4. `npm run lint` — first lint run since the merge resolution work; could surface Phase 1 §8 cosmetic issues
5. `npm run e2e` — the full Playwright suite, including:
   - `e2e/tests/live-quarters.spec.ts` — exercises end-of-quarter behaviour through the now-wired `quarterMs` prop. Should pass on AFL flows (the default 12-min path is preserved when team + game overrides are null).
   - `e2e/tests/multi-sport-schema.spec.ts` — Phase 2's expected-red spec; flips green per D-12 once the migrations are applied (already are; this plan didn't touch them).
   - All 17 spec files (per Research §6 PROD-01 inventory).

If any spec breaks because of clock-surface wiring, the regression is in this plan's surface and surfaces here. If specs break for unrelated reasons (e.g. Phase 2 spec selector drift), Plan 03-05 owns the spec edits.

After Plan 03-05 lands, Plan 03-06 owns MERGE-LOG.md §3 (D-25 patches), §4 (D-26/D-27 grep evidence — copy from this SUMMARY), §5 (PROD-01..04 evidence), §6 (Phase 4 hand-off).

ABSTRACT-03 is closed at the source level after this plan; Plan 03-06 verifies via grep + the e2e gate.
