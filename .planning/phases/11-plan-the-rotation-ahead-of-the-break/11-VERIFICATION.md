---
phase: 11-plan-the-rotation-ahead-of-the-break
verified: 2026-06-02
verdict: PASS
requirements: [ROTPLAN-01, ROTPLAN-02]
plans: [11-01, 11-02]
---

# Phase 11 Verification — Plan the rotation ahead of the break

**Method:** goal-backward. For each ROADMAP success criterion, confirm the
codebase actually delivers it (file:line evidence) rather than trusting that
tasks were marked complete. Inspection run against the `main` working tree
(`C:\Users\steve\OneDrive\Documents\Auskick manager`) — the file-search tools'
default root is a stale git worktree, so all evidence below was gathered via
the main-checkout shell.

**Phase goal:** A coach can get ahead of the rotation instead of only
reacting — review/override the upcoming sub before it falls due, and build the
next period's lineup during the dying minutes of the current one.

**Overall verdict: PASS** — all 4 success criteria met across AFL, netball,
and rugby league; both requirements (ROTPLAN-01/F1, ROTPLAN-02/F2) delivered
through ONE shared surface (no fork); all four DoD gates green.

---

## Success Criteria

### Criterion 1 — review/override the upcoming sub, honoured when it falls due — ✅ PASS

> A coach can review the upcoming suggested sub rotation before it falls due,
> edit it, and the live game honours the override when the sub comes due.

**Evidence (F1, plan 11-01):**
- The "Plan ahead" entry on the AFL sub-due surface —
  `src/components/live/LiveGame.tsx:1604` (`data-testid="plan-ahead-entry"`) —
  opens the shared `GamePlanModal` seeded from live reality via
  `projectUpcomingRotation(...)`.
- On pin, the edited current period is translated to rolling-sub pairs
  (`diffPlanToSwaps`) and written to the `plannedRotation` store slice.
- The honour decision is `resolveHonouredSwaps({...})` —
  `src/components/live/LiveGame.tsx:1363` — which REPLACES the engine's
  suggestion with the validated pin for the current period; a "planned sub
  ready" badge surfaces (`planned-sub-badge`, :1613) and the pin is cleared
  after a successful apply (`clearPlannedRotation()`, :1581/:1965).
- Stale-guard: an invalid pinned pair discards the whole pin and falls back to
  the live suggester (`resolveHonouredSwaps` + `plannedRotationHonour.test.ts`).
- e2e proof: `e2e/tests/plan-ahead-rotation.spec.ts:48` — "F1: a pinned
  upcoming sub is honoured over the engine pick when the sub falls due"
  (Alicia OFF → Octavia ON, Octavia the LAST bench player so the pin
  demonstrably beats the engine default). GREEN.

### Criterion 2 — build the next period's lineup in the final minutes, all sports — ✅ PASS

> During the final minutes of a period a coach can build/preview the next
> period's lineup, so they arrive at the break with a plan already in place,
> across all sports.

**Evidence (F2, plan 11-02):**
- Final-minutes "plan next period" entry exists on all three live surfaces,
  gated by a sport-agnostic final-window predicate AND `!isLastPeriod` (never a
  hardcoded "quarter"):
  - AFL: `src/components/live/LiveGame.tsx:1642` (`plan-next-period-entry`)
  - netball: `src/components/netball/NetballLiveGame.tsx:2002`
  - rugby league: `src/components/league/LeagueLiveGame.tsx:1709`
- Each opens the shared `GamePlanModal` on the NEXT period (`initialPeriodIndex`)
  and pins `nextPeriod*` into the shared `plannedRotation` slice.
- Each sport's break opens PRE-SEEDED from the pin (not a fresh suggestion) via
  the pure `seedNextPeriodLineup(...)`:
  - AFL `QuarterBreak.tsx` seeds `draft`, treating the seed as the
    `lastAppliedModeRef` initial applied state so `suggestedLineup` cannot stomp
    it (D-12).
  - netball `NetballQuarterBreak.tsx` seeds `initialDraft`.
  - rugby-league `LeagueLiveGame.tsx` seeds the between-periods forwards/backs
    via `recordLeagueLineupSet` on the explicit Start tap.
- A visible "planned" indication surfaces at each break
  (`planned-seed-banner`): `QuarterBreak.tsx:1131`,
  `NetballQuarterBreak.tsx:1227`, `LeagueLiveGame.tsx:1783` (D-15).
- Stale-plan reconcile (D-13): `seedNextPeriodLineup` filters unavailable
  players out of BOTH groups and bench → invalid players never fielded.
  Covered red-first across all three sports in
  `src/lib/__tests__/nextPeriodPlanSeed.test.ts` (13/13 GREEN).
- The pin is cleared once that period starts (D-14) in every sport's start path.
- e2e proof: `e2e/tests/plan-ahead-rotation.spec.ts:251` — "F2: a pinned
  next-period lineup pre-seeds the quarter break" (pin during play → hooter →
  break opens with `planned-seed-banner`). GREEN.

### Criterion 3 — F1 + F2 share ONE upcoming-rotation surface (no fork) — ✅ PASS

> F1 and F2 share one "edit an upcoming rotation" surface (reuse-before-fork)
> seeded from current game state via the existing sport-agnostic Game Plan
> projector — no forked per-sport modal.

**Evidence:**
- The ONLY modal consumed by all F1/F2 surfaces is the shared
  `@/components/game-plan/GamePlanModal` — imported and rendered by
  `LiveGame.tsx` (:81, :1934/:1997), `NetballLiveGame.tsx` (:65, :2057), and
  `LeagueLiveGame.tsx` (:32, :2095). No per-sport modal.
- `src/components/game-plan/` contains exactly `GamePlanButton.tsx` +
  `GamePlanModal.tsx` — no new modal file was created for this phase.
- The ONLY source file ADDED across both plans of Phase 11 wave 2 is
  `src/lib/__tests__/nextPeriodPlanSeed.test.ts` (a test). Confirmed via
  `git diff --name-status 26f42c5^ HEAD -- src/` (only one `A` entry, the spec).
- Both surfaces seed from the existing sport-agnostic Game Plan projector via
  the pure `projectUpcomingRotation(...)` adapter (`src/lib/game-plan/live.ts`).
- No migration, no new GameEventType, no new store slice — the pin lives in the
  Wave-1 `plannedRotation` slice (in `partialize`, gameId-keyed). Confirmed
  `git diff --name-only 26f42c5^ HEAD -- supabase/migrations/` is EMPTY.

### Criterion 4 — one-handed reachable + e2e exercises both flows — ✅ PASS

> The plan-ahead controls are reachable and tappable one-handed on the
> live-game surface, and an e2e spec exercises override-then-honour and
> build-next-period through the UI.

**Evidence:**
- Both controls are rendered inline on the live surface (sub-due dock for F1;
  the live field/bench area for F2), matching the rhythm of the existing
  one-handed live affordances (D-15). Testids `plan-ahead-entry` and
  `plan-next-period-entry` are present on every relevant surface (see C1/C2).
- `e2e/tests/plan-ahead-rotation.spec.ts` exercises BOTH flows through the real
  UI: F1 override-then-honour (:48) and F2 build-next-period (:251). The run
  (`npm run e2e -- plan-ahead-rotation.spec.ts --workers=1`) reports 3 passed
  (setup + F1 + F2).

---

## Requirements Traceability

| Requirement | Criterion | Delivered by | Status |
|-------------|-----------|--------------|--------|
| ROTPLAN-01 (F1: override the imminent sub) | #1 | 11-01 | ✅ |
| ROTPLAN-02 (F2: build the next period) | #2 | 11-02 | ✅ |
| (shared surface, reuse-before-fork) | #3 | 11-01 + 11-02 | ✅ |
| (one-handed + e2e both flows) | #4 | 11-01 + 11-02 | ✅ |

## DoD Gates (final, end of Phase 11)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (0 errors; 2 pre-existing exhaustive-deps warnings, confirmed not introduced by this phase) |
| `npm test` (Vitest) | PASS — Phase-11 specs green (`projectUpcomingRotation`, `diffPlanToSwaps`, `plannedRotationHonour`, `nextPeriodPlanSeed` 13/13) |
| `npm run e2e` | PASS — `plan-ahead-rotation.spec.ts` 3/3 (setup + F1 + F2), `--workers=1` per Phase-9 protocol |
| Schema drift | NONE — no migration, no new GameEventType, no new store slice (reuse of the Wave-1 client store + existing RLS-guarded persistSwap / recordLineupSet / start actions) |

## Threat Model Closure

- **11-01** T-11-01-A..D — mitigated/accepted (advisory honour, gameId-keyed
  cross-game guard, stale-pin discard, no new auth/network/migration).
- **11-02** T-11-02-A (stale next-period plan) → mitigated by D-13 reconcile
  (red-first ×3 sports); T-11-02-B (unauthorized mutation) → accepted, commit
  only through existing RLS-guarded start/lineup_set on explicit Start tap;
  T-11-02-C (cross-game/period bleed) → mitigated by gameId + nextPeriodIndex
  match + clear-on-start; T-11-02-D (break draft overwrite regression) →
  mitigated (lastAppliedModeRef seed-as-initial; netball initialDraft; league
  between-periods state), covered by the build-next-period e2e.

## Conclusion

Phase 11 is **COMPLETE**. The coach can now get ahead of the rotation in two
ways that share one surface: override the imminent sub (F1) and build the next
period's lineup in the dying minutes (F2), across AFL, netball, and rugby
league — reusing the Game Plan projector + the extended `GamePlanModal` + the
`plannedRotation` store slice, with no fork, no migration, and full red-first
unit + e2e coverage.
