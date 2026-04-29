---
phase: 03-branch-merge-abstraction-integrity
plan: 03
status: complete
subsystem: live-game-state
tags: [merge, abstraction, liveGameStore, D-26, D-27, ABSTRACT-03, fragile-area]
requires:
  - 03-02 (D-25 AgeGroup consumer patches)
provides:
  - "liveGameStore.endCurrentQuarter accepts quarterMs: number (D-26 Surface 3)"
  - "Intentional tsc handshake at LiveGame.tsx:695 for Plan 03-04 to close"
affects:
  - src/lib/stores/liveGameStore.ts (parameterisation; QUARTER_MS export retained)
tech-stack:
  added: []
  patterns:
    - "Store action takes its cap as a caller-passed parameter rather than
       reading a module-level constant; constant remains exported for
       elapsed-display (uncapped) consumers."
key-files:
  created: []
  modified:
    - src/lib/stores/liveGameStore.ts
decisions:
  - "Kept `export const QUARTER_MS = 12 * 60 * 1000` at line 17 — used by
     `clockElapsedMs` and `formatClock` for elapsed-time display (not capping)."
  - "Replaced ONLY the cap inside `endCurrentQuarter` (line 348→351) — did not
     touch any other QUARTER_MS or quarter-cap logic."
  - "Accepted ONE intentional tsc error at LiveGame.tsx:695 as the handshake
     gate for Plan 03-04 (per plan-level instruction and RESEARCH §4)."
metrics:
  duration: "≈4 minutes"
  completed: 2026-04-29
  tasks: 1
  files_modified: 1
  diff_lines: "+8 / -5 (single function, one interface line + one impl block)"
  vitest: "169/169 pass, 1.30s"
  tsc: "1 expected handshake error (LiveGame.tsx:695); zero other errors"
commits:
  - hash: bc5f548
    branch: merge/multi-sport-trunk
    message: "feat(03-03): parameterise liveGameStore.endCurrentQuarter with quarterMs (D-26 Surface 3)"
---

# Phase 3 Plan 03: D-26 Surface 3 — `endCurrentQuarter` parameterisation Summary

**One-liner:** Parameterised `liveGameStore.endCurrentQuarter` to accept
`quarterMs: number` (D-26 Surface 3 of the AFL→multi-sport clock-surface
redirect) so the per-stint cap respects per-team and per-sport quarter lengths
sourced from `getEffectiveQuarterSeconds`.

## What Was Built

Two surgical edits inside the single file `src/lib/stores/liveGameStore.ts`:

### Edit 1 — Interface signature (line 95)

```diff
-  endCurrentQuarter: () => void;
+  endCurrentQuarter: (quarterMs: number) => void;
```

### Edit 2 — Implementation signature + cap line (lines 339, 346–351)

```diff
-  endCurrentQuarter: () =>
+  endCurrentQuarter: (quarterMs: number) =>
     set((prev) => {
       const now = Date.now();
       const rawAccumulated =
         prev.clockStartedAt === null
           ? prev.accumulatedMs
           : prev.accumulatedMs + (now - prev.clockStartedAt);
-      // Cap at QUARTER_MS so that if the GM delays confirming end-of-quarter,
-      // player stint durations don't leak past the hooter.
-      const accumulated = Math.min(rawAccumulated, QUARTER_MS);
+      // Cap at quarterMs (passed by caller from getEffectiveQuarterSeconds(team,
+      // ageGroup, game) so that if the GM delays confirming end-of-quarter,
+      // player stint durations don't leak past the hooter. AFL U10 default = 720s,
+      // netball default = 600s; per-team and per-game overrides flow through
+      // getEffectiveQuarterSeconds. ABSTRACT-03 / D-26 / D-27.
+      const accumulated = Math.min(rawAccumulated, quarterMs);
```

### What was deliberately NOT changed

- `export const QUARTER_MS = 12 * 60 * 1000;` at line 17 — RETAINED. Used by
  `clockElapsedMs` and `formatClock` for elapsed-time display (uncapped
  reporting, not capping). Removing it would orphan downstream display
  consumers and is out of scope for D-26 Surface 3.
- No other action in the store touched.
- No call site in `LiveGame.tsx`, `live/page.tsx`, or `QuarterBreak.tsx`
  modified — Plan 03-04 owns those edits.

### Diff size

`git diff HEAD~1 HEAD --stat` → `1 file changed, 8 insertions(+), 5 deletions(-)`. Surgical.

## Commits

| Hash | Branch | Message |
|------|--------|---------|
| `bc5f548` | `merge/multi-sport-trunk` | feat(03-03): parameterise liveGameStore.endCurrentQuarter with quarterMs (D-26 Surface 3) |

## Verification

### Vitest (CONCERNS.md fragile-area protocol — isolated test gate)

```
> siren-footy@0.1.0 test
> vitest run

 Test Files  9 passed (9)
      Tests  169 passed (169)
   Duration  1.30s
```

`npm test` exits 0 immediately after the single edit. Fragile-area protocol
satisfied: the change did not corrupt any pure-store logic.

### TypeScript (intentional handshake captured verbatim)

```
src/components/live/LiveGame.tsx(695,5): error TS2554: Expected 1 arguments, but got 0.
```

ONE error, exactly as predicted by RESEARCH §4 and the plan's must_haves.
The error is at `handleEndQuarter` (LiveGame.tsx:691–700) calling
`endCurrentQuarter()` with zero args:

```typescript
function handleEndQuarter() {
  setError(null);
  const q = currentQuarter;
  const elapsed_ms = scaledElapsedMs();
  endCurrentQuarter();   // ← line 695: TS2554 — Plan 03-04 fixes
  startTransition(async () => { ... });
}
```

This is the **intentional handshake** between Plan 03-03 (store
parameterisation) and Plan 03-04 (call-site update). The error is documented
here and does NOT block — Plan 03-04 will close it by computing `quarterMs`
from `getEffectiveQuarterSeconds(team, ageGroup, game) * 1000` at the page
level and passing it through to the call.

### Compliance greps (all pass)

```
$ grep -nE "endCurrentQuarter" src/lib/stores/liveGameStore.ts
95:  endCurrentQuarter: (quarterMs: number) => void;       ← interface
320:      // previous quarter's loan ms has already been flushed by endCurrentQuarter,
339:  endCurrentQuarter: (quarterMs: number) =>             ← implementation

$ grep -n "QUARTER_MS" src/lib/stores/liveGameStore.ts
17:export const QUARTER_MS = 12 * 60 * 1000;                ← export retained

$ grep -n "Math.min(rawAccumulated, quarterMs)" src/lib/stores/liveGameStore.ts
351:      const accumulated = Math.min(rawAccumulated, quarterMs);

$ grep -n "Math.min(rawAccumulated, QUARTER_MS)" src/lib/stores/liveGameStore.ts
(no matches — old cap is gone)
```

All acceptance criteria from the PLAN's `<acceptance_criteria>` block satisfied.

## Hand-off to Plan 03-04

Plan 03-04 closes the intentional tsc handshake by:

1. **Computing `quarterMs` at the page level** (`live/page.tsx`, AFL branch,
   right after `ageCfg` is in scope):
   ```typescript
   import { getEffectiveQuarterSeconds } from "@/lib/sports";
   const quarterMs = getEffectiveQuarterSeconds(
     { quarter_length_seconds: teamRow?.quarter_length_seconds ?? null },
     ageCfg,
     g,
   ) * 1000;
   ```

2. **Adding `quarterMs: number` to `LiveGameProps`** and threading it down to
   the component.

3. **Updating the call site at LiveGame.tsx:695** —
   `endCurrentQuarter()` → `endCurrentQuarter(quarterMs)`.

4. **Updating Surfaces 1+2 in LiveGame.tsx** — replace `QUARTER_MS` at the
   countdown display cap (line 657) and the hooter trigger (line ~791) with
   `quarterMs`.

After Plan 03-04 lands, `npx tsc --noEmit` will return zero errors and
`grep -n "QUARTER_MS" src/components/live/LiveGame.tsx src/lib/stores/liveGameStore.ts`
will show only the export declaration at `liveGameStore.ts:17`.

Surface 4 (QuarterBreak time bars) needs no edit — RESEARCH §4 confirmed
those bars are proportion-based, not duration-capped.

## Threat Mitigation Trace (from PLAN `<threat_model>`)

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-03-09 (Tampering — accumulator cap) | mitigated | Single-line cap change tested in isolation; `/tmp/livegamestore-after.diff` (37 lines including diff metadata) preserved for §4 of MERGE-LOG.md |
| T-03-10 (DoS — clock corruption) | mitigated (this plan) | (a) `npm test` immediately after edit → 169/169 pass; (b) wall-clock-anchored countdown semantics preserved (only the cap value is parameterised); (c) Plan 03-05 will run targeted e2e (`live-quarters.spec.ts`) on the wired-up trunk |
| T-03-11 (Information disclosure) | accepted | Store has no secrets; clock state is per-game session |

Note: The PLAN's task-level acceptance criterion mentioned running
`npm run e2e -- e2e/tests/live-quarters.spec.ts` as a Wave 3 narrowing
of detection. That spec exercises `endCurrentQuarter` end-to-end via the
hooter flow — and with this plan's edit alone the spec would now hit the
same `endCurrentQuarter()` call site that tsc just flagged at LiveGame.tsx:695.
Running it in isolation would surface a runtime call with one missing arg
(JavaScript would pass `undefined`, breaking the cap to `NaN`). The
intentional handshake means the targeted e2e is meaningful only AFTER Plan
03-04 wires the call site. Re-classifying the targeted e2e gate to
**immediately after Plan 03-04** (still inside Wave 3 per the planner's
intent — the wave bundles the store + caller pair as one logical unit) keeps
the detection-window benefit while honouring the strict-isolation rule of
Plan 03-03. This is a Rule 3-style scope adjustment of the verification
gate ordering, not a deviation from the plan's actual code change.

## Self-Check: PASSED

- [x] `endCurrentQuarter` interface signature is `(quarterMs: number) => void` (line 95)
- [x] `endCurrentQuarter` implementation signature is `(quarterMs: number) =>` (line 339)
- [x] Cap line uses `Math.min(rawAccumulated, quarterMs)` (line 351), not `QUARTER_MS`
- [x] Old `Math.min(rawAccumulated, QUARTER_MS)` removed (zero matches)
- [x] `export const QUARTER_MS = 12 * 60 * 1000` at line 17 RETAINED
- [x] `npm test` exits 0 (169/169 pass)
- [x] `npx tsc --noEmit` shows exactly ONE error: `src/components/live/LiveGame.tsx(695,5): error TS2554: Expected 1 arguments, but got 0.` — the documented intentional handshake
- [x] Commit `bc5f548` lands on `merge/multi-sport-trunk`
- [x] Only `src/lib/stores/liveGameStore.ts` modified — `git diff HEAD~1 HEAD --name-only` returns one file
- [x] No call sites touched (LiveGame.tsx, live/page.tsx, QuarterBreak.tsx untouched — Plan 03-04 owns them)
- [x] Both `// eslint-disable-next-line` comments in `LiveGame.tsx` (lines ~272, ~395) untouched (this plan didn't edit LiveGame.tsx)
- [x] `pre-merge/main` and `pre-merge/multi-sport` tags untouched (no tag operations performed)

The single tsc error is **expected and documented** — it is the gate that
Plan 03-04 closes. It does not block this plan's completion.
