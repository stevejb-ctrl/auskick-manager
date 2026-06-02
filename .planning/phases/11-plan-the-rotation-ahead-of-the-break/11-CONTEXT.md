# Phase 11: Plan the rotation ahead of the break - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning
**Mode:** decisions folded into the PLAN.md files (planned directly from
spec + requirements + codebase recon, matching the Phase 10 precedent —
no separate discuss-phase / ui-phase pass was run).

<domain>
## Phase Boundary

Let a coach get AHEAD of the rotation instead of only reacting to it.
Two requirements, ONE shared editable surface:

- **ROTPLAN-01 (F1):** Review the upcoming suggested sub rotation
  **before it falls due**, edit it, and the **live game honours the
  override** when the sub comes due. (AFL-centric — only AFL rotates
  within a period via rolling subs.)
- **ROTPLAN-02 (F2):** During the **final minutes of a period**, build
  / preview the **next period's lineup** so the coach arrives at the
  break with a plan already in place. **All sports.**

Both are "edit an upcoming rotation". Success Criterion #3 makes the
architecture non-negotiable: **F1 and F2 share ONE surface, seeded from
current game state via the existing sport-agnostic Game Plan projector
(`src/lib/game-plan/`) — no forked per-sport modal.** AFL is the
reference; netball + league mirror (reuse-before-fork, CLAUDE.md).

**Out of scope this phase:** sub-interval derivation + recency
(Phase 10, done), long-press player summary (F3 → Phase 12), iOS hype
song (B3 → Phase 13). No new score / clock / finalise behaviour — the
override is advisory until the coach confirms the existing action
(the sub "Do all", the break "Start period").
</domain>

<decisions>
## Implementation Decisions

### The shared surface (Success Criterion #3 — the architectural crux)
- **D-01:** There is exactly **one** "plan ahead" editor, reached from
  the live surface during play. It is an **extension of the existing
  `GamePlanModal`** (`src/components/game-plan/GamePlanModal.tsx`), NOT
  a new or forked modal. The modal already does projector-backed,
  tap-to-swap, period-tabbed editing of a `GamePlan`; Phase 11 teaches
  it to (a) seed from live game state instead of a from-scratch
  projection, and (b) **pin** the edited plan (an `onPin(plan)` /
  "Use this plan" affordance) instead of only copy-to-chat. The
  pre-game caller keeps its current copy-only behaviour (the new props
  are optional).
- **D-02:** The surface is **seeded from current game state via
  `projectGamePlan`** through a new **pure** adapter
  `projectUpcomingRotation(...)` in `src/lib/game-plan/live.ts`. Its
  contract: given the current on-field lineup (sport-neutral
  groupId→playerIds + bench), the current 0-based period index, the
  squad + season events + age-group config + on-field size, return a
  `GamePlan` whose **period[0] mirrors the CURRENT on-field reality**
  (not a fresh suggestion) and whose later periods are the projector's
  forward suggestion. Pure, no React, no Supabase — unit-tested in
  isolation. This is the single seam both F1 and F2 read from, so the
  upcoming rotation is sport-agnostic by construction (the projector
  already dispatches AFL/netball/league).
- **D-03:** **Reuse, don't re-derive, the per-sport suggesters.** The
  adapter calls `projectGamePlan`, which already wraps
  `suggestStartingLineup` (AFL), `suggestNetballLineup` (netball) and
  the league block projector. No new fairness logic is added in
  Phase 11 — the plan-ahead surface shows what the break would suggest,
  just earlier and editable.

### Persistence — how an override is pinned & honoured
- **D-04:** The pinned plan lives in the **live Zustand store**
  (`src/lib/stores/liveGameStore.ts`) as a new `plannedRotation` slice,
  added to the narrow `persist` `partialize` so it survives a
  `router.refresh()` (fires after every sub/score) AND a reload —
  exactly how `lockedIds` / `zoneLockedPlayers` / `rotationMode`
  already persist. **NO migration, NO new `GameEventType`.** This
  matches the spec recon ("F1/F2 may not need a migration"). The slice
  is **keyed by `gameId`** so a stale plan from a previous game can
  never bleed into a new one.
- **D-05 (considered & rejected):** A new `rotation_plan_set`
  game-event was considered for durability/replay. **Rejected:** the
  pinned plan is an ephemeral, coach-local, single-device planning
  artifact that is consumed within minutes and then discarded; it does
  not need cross-device durability or to participate in replay/fairness
  derivation. Adding an event would enlarge the replay + types surface
  for no behavioural gain and risks polluting the Phase-10
  `lastSubbedOnMs` / stint derivations. The store slice is the
  right-sized mechanism.
- **D-06:** The pinned plan shape (in the store, sport-neutral):
  ```
  plannedRotation: {
    gameId: string;
    // F1 (AFL): the imminent sub the coach approved ahead of time,
    //   to honour when the NEXT sub falls due in the CURRENT period.
    pinnedSwaps?: { off: string; on: string; zone: Zone }[];
    pinnedForPeriod?: number;          // current period the swaps apply within
    // F2 (all sports): the NEXT period's starting lineup, sport-neutral.
    nextPeriodGroups?: Record<string, string[]>;  // groupId -> playerIds
    nextPeriodBench?: string[];
    nextPeriodIndex?: number;          // the upcoming period it seeds
  } | null
  ```
  F1 sets `pinnedSwaps`/`pinnedForPeriod`; F2 sets the
  `nextPeriod*` fields. One slice, two readers.

### F1 — review/override the imminent sub, honour when due (AFL)
- **D-07:** F1 is **AFL-only** because only AFL has
  `rotatesWithinPeriod: true` (mid-period rolling subs); netball +
  league sub only at the break (their "plan ahead" need is F2). The
  entry point sits on/around the **`SwapCard`**
  (`src/components/live/SwapCard.tsx`) / the sub-due path in
  `LiveGame.tsx` — the surface that already shows "next subs" during
  the soft/countdown window. The coach taps to open the shared modal on
  the **current period**, edits who comes off / on, and pins it.
- **D-08:** **Honour = the pinned swaps REPLACE the freshly-computed
  `suggestions` for the current period when valid.** In `LiveGame.tsx`,
  when `plannedRotation.pinnedSwaps` exists, applies to the current
  period, and every referenced player is still valid (off-player on
  field, on-player on a swappable bench, neither injured/loaned), the
  `SwapCard` shows the **pinned** swaps; when the sub falls due and the
  coach taps "Do all", the pinned swaps are what `persistSwap` applies.
  The override is **advisory** — the coach still confirms (no automatic
  mutation), preserving the Phase-10 safety posture.
- **D-09:** **Stale-plan guard (correctness + security).** Before
  honouring, validate the pinned swaps against the *current* squad /
  availability / on-field-size. If any referenced player is no longer
  valid (subbed elsewhere, injured, loaned, removed), **discard the
  pin and fall back to the live suggester** — never apply a stale or
  invalid swap. This is a red-first test (see plan threat models).
- **D-10:** The pin is **cleared when consumed or stale** — after the
  pinned swap is applied, or when the period advances past
  `pinnedForPeriod`.

### F2 — build the next period's lineup in the dying minutes (all sports)
- **D-11:** Reuse the **same** shared modal + store slice from F1; **no
  new component**. The entry point appears during the **final minutes**
  of a period (live play). "Final minutes" is resolved sport-agnostically
  from the existing live clock math (`msUntilDue` / quarter elapsed vs
  `quarterMs`), NOT a hardcoded "quarter" — gate it on a derived
  threshold (e.g. last ~N% / final sub window of the period), planner to
  pin the exact predicate. The coach opens the modal on the **next
  period** tab, builds/edits the lineup, and pins it.
- **D-12:** **Honour = each sport's break path opens PRE-SEEDED from
  `plannedRotation.nextPeriod*`** instead of recomputing its own
  suggestion. Consumers:
  - **AFL `QuarterBreak.tsx`** — seed the initial `draft` (and surface
    a "planned" lineupMode / indication) from the pinned next-period
    lineup; the existing `lastAppliedModeRef` guard must not stomp it.
  - **Netball `NetballQuarterBreak.tsx`** (mounted by
    `NetballLiveGame.tsx`) — seed its `initialDraft` / lineup the same
    way.
  - **Rugby league `LeagueLiveGame.tsx`** break path (no separate
    component — the between-periods section with the "Ready for
    {period} {n+1}" CTA) — seed the next-period forwards/backs lineup.
  AFL is the reference; netball + league mirror its rhythm.
- **D-13:** Same **stale-plan guard** as D-09 applies at the break:
  validate the pinned next-period lineup against current
  squad/availability/caps; drop invalid players to the bench / fall
  back to the suggester. Red-first across all three sports.
- **D-14:** The next-period pin is **cleared once that period starts**
  (after the break's `quarter_start` / start-period commit), so it
  can't leak into a later period.

### One-handed reachability (Success Criterion #4)
- **D-15:** Both entry points must be **thumb-reachable on the live
  surface** (the app's live screens already bottom-anchor primary
  controls — e.g. the sticky scorebug, the `SwapCard` above the field).
  Reuse that placement idiom; the exact token/position is Claude's
  discretion but must match the AFL/netball/league visual rhythm.

### Claude's Discretion
- Exact label/copy + placement of the "Plan ahead" / "Edit upcoming"
  entry points (must match cross-sport rhythm; AFL reference).
- The precise "final minutes" predicate for F2's entry visibility.
- Whether the pinned-plan indication in the break/`SwapCard` is a badge,
  a distinct lineupMode pill, or a banner — provided it is visible.
- The internal implementation of `projectUpcomingRotation` (anchor
  period[0] to current reality) as long as the pure CONTRACT + unit test
  hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.
All paths are against the MAIN checkout
(`C:\Users\steve\OneDrive\Documents\Auskick manager`). File-search tools
default to a STALE worktree — use Bash (cd into the main checkout) or
absolute-path Read for ALL inspection.**

### Milestone spec & requirements
- `.planning/MATCH-DAY-CHANGES-SPEC.md` — F1 + F2 recon: "No live
  override of the upcoming rotation today"; "Reuses the Game Plan
  projector (`src/lib/game-plan/`)… F1 + F2 share the 'edit an upcoming
  rotation' surface (reuse before fork)"; "F1/F2 may not need a
  migration".
- `.planning/REQUIREMENTS.md` §ROTPLAN (lines 171–172) — locked
  ROTPLAN-01 / ROTPLAN-02 wording.
- `.planning/ROADMAP.md` §"Phase 11" — goal, 4 success criteria,
  "UI hint: yes".

### The shared surface foundation (REUSE — do not fork)
- `src/lib/game-plan/types.ts` — `GamePlan`, `GamePlanPeriod`
  (`groups` + `bench`/interchange queue), `GamePlanGroup`,
  `ProjectGamePlanInput`. Add an optional live-seed input here (D-02).
- `src/lib/game-plan/project.ts` — `projectGamePlan(input)` dispatch
  (afl/netball/rugby_league) + exported `computeTotals`. The adapter
  builds on this; do NOT duplicate the per-sport projection.
- `src/lib/game-plan/edit.ts` — `swapPlayersInPeriod(plan, periodIndex,
  idA, idB)`: pure tap-to-swap, recomputes totals. The modal's editor
  already drives this — reuse verbatim for the live edits.
- `src/lib/game-plan/index.ts` — barrel; export the new
  `projectUpcomingRotation` here.
- `src/components/game-plan/GamePlanModal.tsx` — the reusable editor
  (period `SegTabs`, group `SFCard`s, Interchange/Bench card,
  tap-to-swap `tapPlayer`/`renderRow`, `CopyableTextBlock`). Extend
  with an optional seeded `initialPlan` + `onPin` (D-01).

### F1 — live sub-due path (AFL)
- `src/components/live/LiveGame.tsx` — sub-due math (`subBaseMs`,
  `subIntervalMs`, `msUntilDue`, `subState`, `:1080-1118`);
  `rawSuggestions = suggestSwaps(...)` (`:1276-1301`, Phase-10 recency
  args); `subPastHooter` → `suggestions` (`:1312-1316`); `SwapCard`
  render with `onApply`→`persistSwap` loop (`:1488-1518`);
  `LiveAdminUtilityRow` + `LiveGameSettingsButton` (`:1568-1595`,
  AFL-only mid-game settings — the existing precedent for an AFL-only
  live affordance). The honour logic (D-08) sits here.
- `src/components/live/SwapCard.tsx` — collapsible engine-suggestion
  card above the Field; `suggestions`, `onApply`/`onApplyOne`,
  `TimerRing`. F1's "edit upcoming" entry attaches here (D-07).

### F2 — per-sport break paths (all sports)
- `src/components/live/QuarterBreak.tsx` — AFL break: `suggestedLineup`
  useMemo (`:406`, `suggestStartingLineup`), `lineupMode`
  suggested/keep/manual (`:280`), `manualLineup` (`:458`),
  `lastAppliedModeRef` guard effect (`:484-497`), `draft`/`setDraft`,
  `handleConfirmStart` (`:990`, `recordLineupSet` then
  `startQuarterAction`). Seed `draft` from the pin (D-12); the guard
  must not stomp it.
- `src/components/live/LiveGame.tsx:1245-1268` — where AFL mounts
  `<QuarterBreak>` (`isBetweenQuarters` from `periodPhase`).
- `src/components/netball/NetballQuarterBreak.tsx` +
  `src/components/netball/NetballLiveGame.tsx` (`:1711` mounts it;
  `initialDraft`/`initialLineup` props `:165-172`, `:1506`) — netball
  mirror.
- `src/components/league/LeagueLiveGame.tsx` — league between-periods
  section: `suggestLeagueSubs` (`:516`), "Ready for {period} {n+1}" CTA
  (`:1631-1639`), `setStartPeriodConfirmOpen`. League mirror (no
  separate break component).

### Persistence
- `src/lib/stores/liveGameStore.ts` — `LiveGameState`; `persist`
  middleware + narrow `partialize` (`:824-831`). Add the
  `plannedRotation` slice + `setPlannedRotation`/`clearPlannedRotation`
  actions; extend `partialize` (D-04).

### Foundations to consume (do not re-derive)
- `src/lib/live/periodPhase.ts` (Phase 8) — resolve "break" / "final
  period" sport-agnostically; never hardcode "quarter".
- Phase 10 `lastSubbedOnMs` / `deriveSubIntervalSeconds` — the upcoming
  rotation already reflects the derived interval + recency via the
  projector + live suggester; Phase 11 does not change them.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `projectGamePlan` + `swapPlayersInPeriod` + `GamePlanModal`: the
  entire editable, sport-agnostic plan surface already exists for
  pre-game. Phase 11 seeds it from live state and adds a pin — it does
  NOT build a new editor.
- The live store already persists rotation-affecting client state
  (`lockedIds`, `zoneLockedPlayers`, `rotationMode`) via a narrow
  `partialize` — the `plannedRotation` slice follows the same pattern,
  so no migration is needed.
- AFL `QuarterBreak` already computes + lets the coach edit the next
  period's lineup (`suggestedLineup` + tap-to-swap draft); netball
  `NetballQuarterBreak` + league break mirror it. F2 surfaces that SAME
  capability earlier (during play) and seeds the break from the result.

### Established Patterns
- Reuse-before-fork (CLAUDE.md): AFL is the reference, netball + league
  mirror. One projector, one modal, one store slice — three consumers.
- Override is **advisory**: like Phase 10's suggester, the coach
  confirms the actual mutation (sub "Do all" / break "Start period").
  Pins influence what's SHOWN, never auto-commit.
- `router.refresh()` re-reads server events after every sub/score; any
  client-held plan MUST be in `partialize` to survive it (D-04).

### Integration Points
- **F1:** `LiveGame.tsx` sub-due path — open the shared modal on the
  current period from the `SwapCard`; on pin, write
  `plannedRotation.pinnedSwaps`; when `subState==="due"`, the SwapCard
  renders the validated pinned swaps; `onApply` persists them.
- **F2:** live-play "final minutes" entry opens the shared modal on the
  next period; on pin, write `plannedRotation.nextPeriod*`; each sport's
  break path seeds its initial draft/lineup from it (validated).

</code_context>

<specifics>
## Specific Ideas

- F1 red-first regression: pin an imminent AFL sub (e.g. force a
  specific bench player on for a specific field player) → advance the
  clock to sub-due → assert the SwapCard/`onApply` applies the PINNED
  pair, not the engine default; AND a stale-pin case (pinned on-player
  becomes injured) → assert fallback to the live suggester, no invalid
  swap.
- F2 red-first regression (×3 sports): pin the next period's lineup
  during play → reach the break → assert the break opens pre-seeded
  with the pinned lineup (not a fresh suggestion); AND a stale-pin case
  (a pinned player marked out at the break) → assert the invalid player
  is not fielded.
- e2e (Success Criterion #4): one spec exercises **override-then-honour**
  (F1) and **build-next-period** (F2) through the live UI, one-handed
  reachable.

</specifics>

<deferred>
## Deferred Ideas

- Cross-device / durable plan sharing (would need an event or table) —
  explicitly out of scope (D-05); the live game is single-coach,
  single-device.
- Auto-applying a pinned sub without coach confirmation — rejected;
  overrides stay advisory.
- Surfacing the long-press per-player breakdown alongside the plan
  editor — that's F3 (Phase 12); the `lastSubbedOnMs` reuse point is
  already exposed.

</deferred>

---

*Phase: 11-Plan the rotation ahead of the break*
*Context gathered: 2026-06-02*
