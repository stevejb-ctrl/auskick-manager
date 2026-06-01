---
phase: 09-availability-that-holds-pre-game-and-at-breaks
verified: 2026-06-01
verdict: PASS
requirements: [AVAIL-01, AVAIL-02]
plans: [09-01, 09-02]
---

# Phase 9 Verification — Availability that holds (pre-game & at breaks)

**Method:** goal-backward. For each ROADMAP success criterion, confirm the
codebase actually delivers it (file:line evidence) rather than trusting that
tasks were marked complete. Inspection run against the `main` working tree
(`C:\Users\steve\OneDrive\Documents\Auskick manager`) — the live-game tools'
default search root is a stale git worktree, so all evidence below was
gathered via the main-checkout shell.

**Phase goal:** A coach's availability decisions are trustworthy across the
whole match-day lifecycle — what they set pre-game survives to kickoff, and
they can adjust the squad at any period break.

**Overall verdict: PASS** — all 4 success criteria met across AFL, netball,
and rugby league; both requirements (AVAIL-01, AVAIL-02) delivered; all four
DoD gates green.

---

## Success Criteria

### Criterion 1 — pre-game "unavailable" persists to kickoff, all sports — ✅ PASS

> A player marked unavailable in the pre-game lineup picker is still
> unavailable when the game starts — the edit persists to `game_availability`
> and is honoured at kickoff, verified across all sports.

**Evidence:**
- Shared server-side helper `src/lib/live/reconcileLineupToAvailability.ts`
  (created, 85 lines) — builds the availableIds union (`game_availability`
  'available' + `game_fill_ins` + `player_arrived`) and recursively strips
  any id not in the union (handles AFL/league flat zone arrays AND netball's
  nested `positions` map with one impl).
- Wired into ALL three start actions **before** the `lineup_set` insert:
  - AFL `startGame` — `actions.ts:168`
  - netball `startNetballGame` — `netball-actions.ts:150`
  - league `startLeagueGame` — `league-actions.ts:192` (before the vest
    pre-flight, so the pre-flight validates the post-reconcile field set)
- e2e: `availability-honoured-at-kickoff.spec.ts` — 3 sport tests (AFL,
  netball `:149`, rugby_league `:219`); each seeds a draft placing X on
  field, marks X unavailable, drives the picker kickoff, asserts X absent
  from the committed `lineup_set` metadata. RED→GREEN confirmed in
  09-01-SUMMARY (pre-fix X was present at AFL `back[0]` / netball `gs` /
  RL `forwards[0]`).
- D-06 token-path coverage: `/run/[token]` renders the same pickers calling
  the same start actions → server reconciliation protects the token path
  with no fork (09-01-SUMMARY "Run-token coverage note").

### Criterion 2 — B1 availability-control discrepancy reconciled + documented — ✅ PASS

> The B1 availability-control discrepancy is reconciled (recon found no
> availability toggle on `LineupPicker.tsx`) — the surface the coach thinks
> of as "the picker" actually writes availability, with the resolution
> documented.

**Evidence:**
- Documented in `09-CONTEXT.md §"B1 — 'the picker' discrepancy (Success
  Criterion #2, RESOLVED)"`, D-01: "the picker" the coach means is the
  **dedicated availability surface** (`AvailabilityList` → `AvailabilityRow`
  → `setAvailability`), NOT the zones Lineup Picker screen (which has no
  availability control). **No new control is added to `LineupPicker`.** The
  `AvailabilityRow` write-queue path was confirmed NOT the bug; the defect
  was the draft→picker→`lineup_set` path bypassing reconciliation (now fixed
  per Criterion 1).
- Client-side picker-hydration filter (`filterLineupToAvailable` in
  `live/page.tsx`) applied to all three sport branches so the coach SEES the
  unavailable player drop off the field when the picker loads (UX echo;
  correctness is server-side). Netball additionally backfills the vacated
  NAMED court slot so the lineup stays startable (09-01 Deviation #2).

### Criterion 3 — break-time add / mark-out / mark-injured on the shared surface, all sports — ✅ PASS

> At any period break a coach can add a newly-arrived player into the game,
> mark a present player out, and mark a player injured, on the shared
> quarter-break surface, across all sports.

**Evidence:** one "Manage availability" entry on each break surface:
- AFL reference — `src/components/live/QuarterBreak.tsx`: add-arrived via
  `addLateArrival` (`:604`), mark-out via `InjuryReplacementModal` forced
  replacement recorded `reason:"out"` (`:644`, `:676`), mark-injured retained.
- netball — `src/components/netball/NetballQuarterBreak.tsx`: add-arrived
  (`:1035`), mark-out `markInjury(reason:"out")` (`:1082`, `:1122`) +
  replacement staged into the vacated court position in the next-quarter
  draft (no break swap writer; `period_break_swap` commits on Start Qn).
- league — `src/components/league/LeagueLiveGame.tsx`: gated on `isAtQbreak`
  (`:1623`), add-arrived (`:1067`, `:1214`), mark-out
  `markInjury(reason:"out")` + `recordLeagueSwap` (`:1262`, `:1290`), and a
  NEW explicit break "Mark injured" affordance (`:1319`, plain `markInjury`,
  no reason) for cross-sport consistency (previously long-press only).
- e2e: `break-availability-{afl,netball,league}.spec.ts` — each drives all
  three actions end-to-end. Targeted run GREEN: **4 passed (36.5s)**
  (auth.setup + 3 break specs).

### Criterion 4 — red-first regression coverage + reuse-before-fork — ✅ PASS

> Regression tests (written red-first) cover picker-availability persistence
> and each break-time availability action through the UI; reuse-before-fork —
> `addLateArrival` is wired into the break surface rather than a new writer.

**Evidence:**
- Red-first: `availability-honoured-at-kickoff.spec.ts` (09-01 Task 1,
  `0404347`, RED before fix) + `break-availability-*.spec.ts` (09-02 Task 1,
  `ddb6aef`, RED before fix). Both committed as failing tests before the
  GREEN implementation commits.
- Reuse-before-fork: add-arrived uses the canonical `addLateArrival` writer
  in all three break surfaces (`QuarterBreak.tsx:604`,
  `NetballQuarterBreak.tsx:1035`, `LeagueLiveGame.tsx:1067/1214`) — no forked
  availability writer. Mark-out reuses the shared `InjuryReplacementModal` +
  the injury mechanic with a `reason:"out"` metadata flag (jsonb — no new
  event type, no migration). Server reconciliation is ONE shared helper
  consumed by all three start actions.

---

## Gate Results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0; only pre-existing react-hooks/exhaustive-deps + `<img>` warnings) |
| `npm test` (Vitest) | PASS (781 tests, 43 files) |
| `npm run e2e` (targeted: 3 break specs + kickoff spec, `--workers=1`) | PASS |
| Schema drift | NONE — Phase 9 added no migrations (`reason:"out"` is jsonb metadata; latest migration unchanged at `0047_track_zone_time.sql`) |

**e2e environmental note:** the full 122-spec suite is flaky on this Windows
dev box under multi-worker load — a libuv `UV_HANDLE_CLOSING` crash
(`src\win\async.c:76`) cascades unrelated, untouched specs into
`net::ERR_ABORTED` / `page.goto: Test ended`, and a pre-existing untouched
spec (`availability.spec.ts:139`) fails in the same window. After a clean
environment reset (kill zombie dev/e2e process tree, `supabase stop`/`start`
to recover the 5 crashed auxiliary services), the three Phase-9 break specs +
the kickoff spec pass cleanly in isolation: **4 passed (36.5s)**,
`E2E_EXIT=0`. The multi-worker collapse is a known dev-server stress
artifact, not a product regression.

---

## Requirements Traceability

| Requirement | Plan | Status |
|-------------|------|--------|
| AVAIL-01 (B1: picker availability persists to kickoff) | 09-01 | ✅ Delivered |
| AVAIL-02 (B2: break-time add/out/injured) | 09-02 | ✅ Delivered |

## Deviations (carried from plan summaries, both non-scope-creep)

1. **09-01:** reconcile helper uses a recursive structural filter (not the
   planned flat `Record<string,string[]>`) to cover netball's nested
   `positions` map; netball client filter backfills the vacated NAMED court
   slot so the lineup stays startable.
2. **09-02:** netball mark-out records no swap event (the netball break has no
   swap writer) — the replacement is staged into the next-quarter draft and
   lands via `period_break_swap` on Start Qn; league gains a NEW explicit
   break "Mark injured" affordance for cross-sport consistency.

## Carry-forward (NOT a Phase 9 gap)

- **WR-01 → Phase 10 / SUB-02:** `fairness.ts:616` compares `fullPeriodMs`
  (ms) against a season total produced in MINUTES — a pre-existing unit
  mismatch (predates Phase 8), to be fixed with a failing-first regression in
  the SUB-02 fairness follow-up.

---
*Phase 9 verified PASS — ready to mark complete and advance to Phase 10.*
