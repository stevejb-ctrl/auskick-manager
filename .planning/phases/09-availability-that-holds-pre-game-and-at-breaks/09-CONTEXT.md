# Phase 9: Availability that holds — pre-game & at breaks - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make a coach's availability decisions trustworthy across the whole
match-day lifecycle. Two requirements:

- **AVAIL-01 (B1):** A player marked unavailable pre-game stays
  unavailable at kickoff. The edit persists to `game_availability`
  (it already does) and is **honoured when the game starts**, across
  all sports.
- **AVAIL-02 (B2):** At any period break a coach can **add a
  newly-arrived player**, **mark a present player out**, or **mark a
  player injured** — on the shared break surface, across all sports.

Sport-agnostic by rule (AFL / netball / rugby league). "Break" = any
period boundary (quarter or half), resolved via the Phase 8
`periodPhase()` helper — never a hardcoded "quarter".

**Out of scope this phase:** sub-interval derivation (F4 → Phase 10),
recency-aware suggester (B4 → Phase 10), upcoming-rotation override
(F1/F2 → Phase 11), long-press summary (F3 → Phase 12), iOS hype song
(B3 → Phase 13). The WR-01 fairness ms-vs-minutes mismatch is a
Phase 10 carry-forward — not touched here.

</domain>

<decisions>
## Implementation Decisions

### B1 — "the picker" discrepancy (Success Criterion #2, RESOLVED)
- **D-01:** "The picker" the coach means is the **dedicated
  Availability screen** — in-app, signed in
  (`teams/[teamId]/games/[gameId]/availability/page.tsx` →
  `AvailabilityList` → `AvailabilityRow` → `setAvailability`). It is
  NOT the Lineup Picker (zones) screen, which has no availability
  control. **No new availability control is added to `LineupPicker`.**
  The recon discrepancy is reconciled: availability is correctly
  edited on the Availability screen today; the bug is elsewhere.
- **D-02:** The **save path is fine** — marking a player unavailable
  persists to `game_availability` and survives a reload of the
  Availability screen (user confirmed). So the optimistic-flip +
  write-queue path in `AvailabilityRow.tsx` is NOT the bug. The defect
  is **downstream on the read/seed path**, not the write.

### B1 — root cause & expected behaviour
- **D-03:** **Root cause = stale lineup draft seeds an unavailable
  player onto the field.** Sequence: coach builds a lineup (player is
  placed into a zone, saved to `game_lineup_drafts`) → later marks
  that player unavailable on the Availability screen → starts the
  game. `startGame` (`live/actions.ts:131`) commits **whatever lineup
  the client passes** as a `lineup_set` event with **zero
  reconciliation against `game_availability`**; the picker hydrates
  from the saved draft row (`live/page.tsx:245`, league branch; AFL/
  netball branches mirror it) which still contains the now-unavailable
  player. Net effect: the correct availability write is bypassed by
  the draft→picker→`lineup_set` path. Matches the user's repro exactly
  ("edit, THEN start" + "sticks on the Availability screen but the
  game shows them available").
- **D-04:** **Expected behaviour = AUTO-REMOVE from field at kickoff.**
  Availability is the source of truth — the game must **never start an
  unavailable player**, even if an earlier draft placed them. **No
  prompt, no warning** — silent auto-removal; the normal rotation
  fills the vacated spot. (User explicitly chose auto-remove over
  block-and-warn or rotation-only.)
- **D-05:** **Fix = reconcile `lineup ∩ availableIds` server-side
  before the `lineup_set` insert.** Strip lineup entries whose
  `player_id` is not currently available — mirror the `availableIds`
  union logic already in `live/page.tsx` (explicit `game_availability`
  'available' rows + fill-ins + `player_arrived` events). The server
  write is authoritative. **Plus** a client-side picker-hydration
  filter so the coach visibly sees the player drop off the field when
  the picker loads against current availability (UX), but correctness
  does not depend on the client.
  **Pattern-mapping refinement (2026-06-01):** there is NOT a single
  `startGame` chokepoint — there are **three per-sport start actions**,
  each with its own `lineup_set` insert: `startGame`
  (`live/actions.ts:131`, AFL), `startNetballGame`
  (`live/netball-actions.ts:114`), `startLeagueGame`
  (`live/league-actions.ts:150`). The reconciliation MUST land in all
  three, immediately before each `lineup_set` insert. Extract a shared
  `reconcileLineupToAvailability(lineup, availableIds)` helper so the
  union semantics cannot drift between sports (reuse-before-fork). For
  league, run reconciliation **before** the vest pre-flight in
  `startLeagueGame` (~`:208-252`) so vest validation sees the
  post-reconcile field. The client-side filter likewise applies to all
  three sport picker branches in `live/page.tsx` (AFL ~`:768-770`,
  netball ~`:442-451`, league ~`:211-221`).
- **D-06:** **Primary test/repro path = in-app signed-in Availability
  page.** The run-token mount (`run/[token]/page.tsx`) uses the same
  `setAvailability` writer and the same `startGame`, so the
  server-side fix (D-05) covers it for free — add a sanity check, do
  **not** fork a token-specific code path.

### B2 — break-time availability actions
- **D-07:** **All three actions** at a period break: **add an arrived
  player** (mark available — via `addLateArrival`, which writes
  `available` + a `player_arrived` event), **mark a present player
  out** (unavailable), and **mark a player injured** (the existing
  `markInjury` affordance stays).
- **D-08:** **Placement = a single "Manage availability" entry** on
  the break surface that opens the **same availability control used
  pre-game** (`setAvailability` / `addLateArrival`). One consistent
  surface, minimal new UI, trivially identical across sports. NOT
  inline per-player controls; NOT the in-game `LateArrivalMenu`.
  **Pattern-mapping refinement (2026-06-01):** `AvailabilityList`
  (`src/components/games/AvailabilityList.tsx`) is an **async Server
  Component** (imports `@/lib/supabase/server` + `createAdminClient`) —
  it **cannot be mounted inline** inside the `"use client"` break
  surfaces. The planner must pick a concrete mechanism and document it.
  **Preferred direction:** keep the coach on the break surface — render
  the availability control **in place** (e.g. extract a client-friendly
  availability sheet that reuses the existing `AvailabilityRow` client
  component + the same `setAvailability`/`addLateArrival` actions, or
  reuse an existing client-side player-picker sheet). **Fallback:**
  navigate to the `/availability` screen (requires relaxing the
  mid-game redirect guard at `availability/page.tsx:74-76`), accepted
  only if in-place reuse is impractical. Either way the writers
  (`setAvailability` / `addLateArrival`) and `AvailabilityRow` are
  reused — do not fork a new availability writer or row UI.
- **D-09:** **Mark-out semantics = "out + force a replacement now."**
  Marking a present player out **mirrors the injury flow** — reuse
  `InjuryReplacementModal` to prompt the coach to pick who takes the
  vacated on-field spot for the upcoming period. The player keeps the
  time-on-ground already earned; "out" differs from "injured" only in
  the **recorded reason**, not the mechanic.
- **D-10:** **Cross-sport = ship to all three break surfaces this
  phase**, reusing `InjuryReplacementModal` for the forced replacement.
  Surfaces: AFL `QuarterBreak.tsx` (reference), netball
  `NetballQuarterBreak.tsx`, rugby-league break path. AFL is the
  reference implementation; netball + league mirror its rhythm
  (reuse-before-fork, per CLAUDE.md).

### Claude's Discretion
- Exact label/position of the "Manage availability" button within each
  break surface — must match the visual rhythm across sports (AFL
  reference), but the precise token/placement is open.
- Whether the server-side `startGame` reconciliation also emits a
  telemetry/event noting an auto-removal (nice-to-have, not required).
- The precise client-side mechanism for the picker-hydration filter
  (filter `availablePlayers ∩ draft.lineup` at load vs. reactive
  recompute) — as long as the unavailable player visibly drops off.
- Whether "mark out" records a distinct event `type`/reason vs. a
  metadata flag on the existing availability/loan event — planner's
  call, provided the reason is recoverable for display.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone spec & requirements
- `.planning/MATCH-DAY-CHANGES-SPEC.md` — B1 §Bugs and B2 §Bugs recon
  (file:line root-cause map); §Global rule (sport-agnostic); B1 repro
  decision ("in the picker screen") that this phase reconciles.
- `.planning/REQUIREMENTS.md` §AVAIL (lines 159–162) — locked
  AVAIL-01 / AVAIL-02 wording.
- `.planning/ROADMAP.md` §"Phase 9" (lines 308–318) — goal, 4 success
  criteria, "UI hint: yes".

### Phase 8 foundation (consume, do not re-derive)
- `.planning/phases/08-sport-agnostic-period-foundation/08-CONTEXT.md`
  — sport-agnostic decisions (D-01..D-11); `LeagueLiveGame` as the
  reference implementation; `getEffectiveQuarterSeconds`.
- `src/lib/live/periodPhase.ts` — pure helper for
  isAtFullTime / isBetweenPeriods / isLastPeriod. Use to resolve
  "break" sport-agnostically; never hardcode "quarter".

### B1 — availability write path (CORRECT — do not change)
- `src/components/games/AvailabilityRow.tsx` — optimistic-flip +
  write-queue toggle (`setAvailability`); two-state UI
  (unknown/unavailable → available). The write is fine (D-02).
- `src/components/games/AvailabilityList.tsx` — the list that renders
  `AvailabilityRow`; reuse for the B2 break sheet (D-08).
- `src/app/(app)/teams/[teamId]/games/[gameId]/availability/page.tsx`
  — in-app Availability screen; the surface the coach means by "the
  picker" (D-01). Primary test path (D-06).
- `src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts:54` —
  `setAvailability` writer.

### B1 — the broken read/seed path (FIX HERE)
- `src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts:131` —
  `startGame`; commits client `lineup` as a `lineup_set` event with no
  availability reconciliation. **Server-side fix chokepoint (D-05).**
  Deletes the draft at `:199`.
- `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx:183-221`
  — `availableIds` union (explicit `game_availability` rows + fill-ins
  + `player_arrived` events) and draft hydration at `:240-250` (league
  branch). The `availableIds` union is the reconciliation logic to
  reuse server-side; AFL/netball branches in the same file mirror it.
- `src/app/run/[token]/page.tsx` — run-token Availability + start
  path; covered by the server fix (D-06), sanity-check only.

### B2 — break surfaces & the canonical writers (REUSE)
- `src/components/live/QuarterBreak.tsx` — AFL/shared break surface;
  has `markLoan` (:533), `markInjury` (:558), UI (:1052-1093),
  `handleTap` (:301). Add the "Manage availability" entry here first
  (reference impl).
- `src/components/netball/NetballQuarterBreak.tsx` — netball break
  surface; mirror.
- `src/components/league/LeagueLiveGame.tsx` — rugby-league
  between-period / break path; mirror.
- `src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts:595` —
  `addLateArrival` (available + `player_arrived` event). **Canonical
  arrival/availability writer — wire this in, do NOT fork a new
  writer** (Success Criterion #4).
- `src/components/live/InjuryReplacementModal.tsx` — reuse for the
  "out + force a replacement" flow (D-09).
- `src/components/live/LateArrivalMenu.tsx`,
  `src/components/live/LiveAdminUtilityRow.tsx` — existing in-game
  consumers of `addLateArrival` (pattern reference, not the chosen
  placement).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AvailabilityList` / `AvailabilityRow`: the exact UI to surface from
  the break "Manage availability" entry — same component pre-game and
  at the break (D-08), so the coach sees one consistent control.
- `addLateArrival` (`live/actions.ts:595`): canonical writer for
  "add an arrived player" — sets `available` + emits `player_arrived`,
  which the live read already unions into `availableIds`
  (`live/page.tsx:213-219`). Wiring it into the break surface needs no
  new server action.
- `InjuryReplacementModal`: drives the forced-replacement prompt for
  both injury (existing) and the new "mark out" (D-09).
- `periodPhase()` (Phase 8): resolves "is this a break / which period
  boundary" without hardcoding "quarter".

### Established Patterns
- The live read computes availability as a **union**
  (`game_availability` rows + fill-ins + `player_arrived` events) at
  `live/page.tsx:211-221`. The server-side `startGame` reconciliation
  (D-05) should reuse the same union semantics so "available" means
  the same thing at start as it does live.
- `startGame` is the **single seam all three sports pass through** to
  commit the kickoff lineup — the reuse-before-fork chokepoint for B1.
- Reuse-before-fork (CLAUDE.md): AFL `QuarterBreak.tsx` is the
  reference; netball/league break surfaces mirror its rhythm.

### Integration Points
- **B1:** insert an availability filter between the draft/picker
  `lineup` and the `lineup_set` insert in `startGame`
  (`live/actions.ts:162-167`); optional client-side picker-hydration
  filter where `availablePlayers` is computed
  (`live/page.tsx:221` and the AFL/netball equivalents).
- **B2:** new "Manage availability" entry in each break surface →
  opens `AvailabilityList`; "mark out" branch opens
  `InjuryReplacementModal`; "add arrived" calls `addLateArrival`.

</code_context>

<specifics>
## Specific Ideas

- User's verbatim repro for B1: marks a player unavailable on the
  **in-app Availability screen**, the edit **"sticks on the screen"**
  (survives reload), then **starts the game** and the player **shows
  available** — i.e. the write lands but the kickoff lineup ignores it.
  The regression test (red-first, per CLAUDE.md) must reproduce this
  exact chain: set unavailable → start game → assert the player is NOT
  in the committed `lineup_set` / not on field, across all sports.
- For B2, the coach wants the break-time control to feel like the same
  availability surface they already know from pre-game (one mental
  model), not a separate bespoke mini-UI.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Adjacent items explicitly
left for later phases: F4 interval derivation + B4 recency (Phase 10),
F1/F2 upcoming-rotation surface (Phase 11), F3 long-press summary
(Phase 12), B3 iOS hype song (Phase 13), and the WR-01 fairness
ms-vs-minutes mismatch (Phase 10 carry-forward, tracked in STATE.md).

</deferred>

---

*Phase: 9-Availability that holds — pre-game & at breaks*
*Context gathered: 2026-06-01*
