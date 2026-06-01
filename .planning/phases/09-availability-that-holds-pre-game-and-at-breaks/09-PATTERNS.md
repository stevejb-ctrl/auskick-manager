# Phase 9: Availability that holds — pre-game & at breaks - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 9 modify/create targets (3 server actions, 1 RSC page, 5 client components) + 3 test files
**Analogs found:** 9 / 9 (every target has a strong in-repo analog — this phase is reuse-heavy by design)

> **CRITICAL CORRECTION TO CONTEXT D-05.** CONTEXT.md D-05 says `startGame`
> is "the single chokepoint covering all three sports." It is **not.** The
> codebase has THREE separate start actions, one per sport, each with its
> own `lineup_set` insert:
> - AFL → `startGame` in `live/actions.ts:131`
> - Netball → `startNetballGame` in `live/netball-actions.ts:114`
> - Rugby league → `startLeagueGame` in `live/league-actions.ts:150`
>
> The B1 server-side reconciliation (D-04/D-05 auto-remove) must be added
> to **all three** functions, immediately before each one's `lineup_set`
> insert. The "single chokepoint" intent still holds *per sport* (each
> sport's picker funnels through exactly one start action), but the planner
> must NOT plan a one-file fix. See the Pattern Assignments below for the
> exact insert site in each.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `live/actions.ts` → `startGame` (AFL) | server action | event-write (CRUD) | `live/page.tsx:768-770` availableIds union (read-side) | exact (port read→write) |
| `live/netball-actions.ts` → `startNetballGame` | server action | event-write (CRUD) | `live/page.tsx:442-451` netball availableIds union | exact (port read→write) |
| `live/league-actions.ts` → `startLeagueGame` | server action | event-write (CRUD) | `live/page.tsx:211-221` league availableIds union | exact (port read→write) |
| `live/page.tsx` (3 sport branches) | RSC page | read/seed | itself — existing `availableIds` ∩ draft hydration | self-analog (extend) |
| `src/components/live/QuarterBreak.tsx` (AFL break) | client component | event-driven UI | itself — existing Lend / Mark-injured panels (:1106-1157) | self-analog (add 3rd panel) |
| `src/components/netball/NetballQuarterBreak.tsx` | client component | event-driven UI | `QuarterBreak.tsx` (AFL ref) + its own :1122-1240 | role+flow exact |
| `src/components/league/LeagueLiveGame.tsx` (break path) | client component | event-driven UI | `QuarterBreak.tsx` ref + its own `handleAddLateArrival`/InjuryReplacementModal | role+flow exact |
| Reuse: `AvailabilityList`/`AvailabilityRow` (the break sheet) | RSC + client | CRUD toggle | `availability/page.tsx:104-119` mount | exact (consume verbatim) |
| Reuse: `InjuryReplacementModal` (mark-out forced replace) | client component | request-response modal | `LeagueLiveGame.tsx:1851-1882` invocation | exact (consume verbatim) |
| New: B1 regression spec (×3 sports) | test | e2e | `e2e/tests/availability.spec.ts` + `injury-replacement.spec.ts` | role+flow exact |
| New: B2 break-availability spec (×3 sports) | test | e2e | `quarter-break-rotation.spec.ts` / `netball-quarter-break.spec.ts` / `injury-replacement.spec.ts` | role+flow exact |

---

## Shared / canonical primitives (apply across all sports)

### The `availableIds` UNION semantics — the single rule "available" means everywhere
**Source (read-side, three near-identical copies):** `live/page.tsx`
- League: lines **211-221** (built as a `Set<string>`)
- Netball: lines **442-451** (built as an `Array` via `Array.from(new Set(...))`)
- AFL: lines **768-770** (`Set` + fill-ins added via loop)

The union is: explicit `game_availability` rows with `status = 'available'`
**+** all `game_fill_ins` ids (implicitly available) **+** every `player_arrived`
event's `player_id`. The B1 server reconciliation MUST reuse this exact union
so "available at kickoff" == "available live".

AFL copy (`live/page.tsx:768-770`, plus the fill-in read at `:731-740`):
```typescript
const availableIds = new Set((avail ?? []).map((a) => a.player_id));
for (const f of fillInsForPicker) availableIds.add(f.id);
const availablePlayers = allActive.filter((p) => availableIds.has(p.id));
```

League copy (`live/page.tsx:211-221`) — includes the `player_arrived` union the AFL pre-game copy omits:
```typescript
const lateArrivedFromEvents = ((thisGameEvents ?? []) as GameEvent[])
  .filter((e) => e.type === "player_arrived" && e.player_id)
  .map((e) => e.player_id as string);
const availableIds = new Set<string>([
  ...(avail ?? []).map((a) => a.player_id),
  ...fillInsForLive.map((f) => f.id),
  ...lateArrivedFromEvents,
]);
const availablePlayers = squad.filter((p) => availableIds.has(p.id));
```
> **Use the LEAGUE/NETBALL copy as the reference for the server-side union** —
> it folds in `player_arrived` events, which the AFL *pre-game* copy at :768
> does not (the AFL *live* branch handles arrivals separately). The server
> reconciliation runs at kickoff after a coach may have added arrivals, so
> the 3-source union is the correct, complete semantics.

### Lineup shapes (the thing being filtered) + their helpers
**Source:** `src/lib/types.ts`
- AFL `Lineup` (`:314-321`): `{ back, hback, mid, hfwd, fwd, bench }` — all `string[]`. Normalizer `normalizeLineup` (`:336`), `emptyLineup` (`:347`).
- League `LeagueLineup` (`:363-367`): `{ forwards, backs, bench }`. `leagueOnField(lineup)` (`:395`) returns `[...forwards, ...backs]`. Normalizer `normalizeLeagueLineup` (`:375`).
- Netball `GenericLineup`: object keyed by court positions (imported from `@/lib/sports/netball/fairness`), arrays of ids.

The reconciliation filters each zone/bucket array down to `id ∈ availableIds`.
The vacated spots are intentionally left empty — D-04 says "the normal
rotation fills the vacated spot," so no backfill in `startGame`; just strip.

### Availability sheet (the B2 "Manage availability" surface)
**Source:** `src/components/games/AvailabilityList.tsx` (async RSC) + `AvailabilityRow.tsx` (client).
**Mount pattern:** `availability/page.tsx:104-119` — wrap in `<Suspense>`, pass
`auth={{ kind: "team", teamId }}`, `teamId`, `gameId`, `canMarkAvailability`,
`canManageMatch`, `showJerseyNumber={sport !== "netball"}`.
> `AvailabilityList` is an **async server component**. A client break surface
> (`QuarterBreak`, `NetballQuarterBreak`, `LeagueLiveGame`) cannot render it
> inline. Planner must choose ONE of: (a) navigate to `/availability` (already
> redirects to `/live` mid-game — see `availability/page.tsx:74-76`, so a
> guard relaxation is needed), or (b) extract the list body into a
> client-renderable variant, or (c) reuse the existing `SlotFillSheet`-based
> in-break pickers (the rhythm AFL already uses for Lend/Mark-injured) instead
> of literally mounting `AvailabilityList`. **Flag this as the single biggest
> open design decision for the planner** — D-08 says "reuse `AvailabilityList`,"
> but its RSC-ness blocks a naive inline mount in a `"use client"` break surface.

### `setAvailability` writer (the toggle behind every row)
**Source:** `src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts:54`. Upserts
`game_availability` with `onConflict: "game_id,player_id"`; sets `updated_by` +
`updated_at` (RLS INSERT WITH CHECK requires `updated_by = auth.uid()`). Token
path bypasses RLS via admin client. Client invokes it via the write-queue:
`enqueueLiveAction("setAvailability", [auth, gameId, playerId, next])`
(`AvailabilityRow.tsx:130-135`) — NOT a direct server-action call. Used for
"mark a present player out" (status `"unavailable"`).

### `addLateArrival` writer (the canonical "add an arrived player")
**Source:** `live/actions.ts:595-634`. Upserts `game_availability` → `available`
THEN inserts a `player_arrived` event. **Do NOT fork a new writer** (Success
Criterion #4). Input shape is an object: `{ player_id, quarter, elapsed_ms }`.
Existing consumer pattern (`LeagueLiveGame.tsx:1003-1022`):
```typescript
const { flushed } = enqueueLiveAction("addLateArrival", [
  auth, game.id,
  { player_id: playerId, quarter: Math.max(1, state.currentQuarter), elapsed_ms: elapsedMs },
]);
await flushed;
router.refresh();
```
Netball consumer: `NetballLiveGame.tsx:1321-1323` (`handleLateArrival`).

### `periodPhase()` — resolve "is this a break" sport-agnostically
**Source:** `src/lib/live/periodPhase.ts:9-21`. Returns
`{ isAtFullTime, isBetweenPeriods, isLastPeriod }`. Never hardcode
`currentQuarter >= 4`. The break surfaces already derive equivalent local
flags (`isAtQbreak` etc.) — see `LeagueLiveGame.tsx:1222-1239` (the reference
the helper was extracted from) and AFL `live/page.tsx:656-672`.

---

## Pattern Assignments

### B1 — `live/actions.ts` → `startGame` (AFL server action, `:131-226`)

**Role:** server action · **Data flow:** event-write (CRUD)
**Analog:** the read-side AFL availableIds union at `live/page.tsx:768-770`
(port read→write); the league union at `:211-221` for the complete 3-source
semantics; `clampOnFieldSize` (`:19-34`) is the existing "fetch team context +
backstop the client" precedent in this same function.

**Insert site — between `clampOnFieldSize` and the `lineup_set` insert:**
```typescript
// live/actions.ts — current shape, lines 156-168
const { value: clampedSize } = await clampOnFieldSize(w.supabase, w.teamId, onFieldSize);

// ⬇ INSERT RECONCILIATION HERE (before the lineup_set insert) ⬇

const { error: insertError } = await w.supabase.from("game_events").insert({
  game_id: gameId,
  type: "lineup_set",
  metadata: { lineup },          // ← `lineup` must be the FILTERED lineup
  created_by: w.userId,
});
```
The reconciliation must, using `w.supabase`:
1. SELECT `game_availability` (`status = 'available'`), `game_fill_ins` ids, and this game's `player_arrived` events → build `availableIds` (the league union shape).
2. Filter every AFL zone array + `bench` in `lineup` to `id ∈ availableIds` (shape `Lineup` from `types.ts:314`).
3. Write the FILTERED lineup as the `lineup_set` metadata.
The draft delete already happens at `:199` — leave it.
**Auth/error pattern to copy:** `resolveWriter(auth, gameId)` (`:43-93`) → guard `if (w.error) return {success:false, error:w.error}` (`:150-151`). Token path covered for free (D-06) — admin client bypasses RLS but reads the same tables.

---

### B1 — `live/netball-actions.ts` → `startNetballGame` (`:114-208`)

**Role:** server action · **Data flow:** event-write (CRUD)
**Analog:** AFL `startGame` reconciliation (above) + netball read union at `live/page.tsx:442-451`.

**Insert site — between the clamp (`:139-143`) and the `lineup_set` insert (`:145-151`):**
```typescript
// netball-actions.ts:139-151 — current shape
const { value: clampedSize } = await clampOnFieldSize(w.supabase, w.teamId, onFieldSize);

// ⬇ INSERT RECONCILIATION HERE ⬇

const { error: insertError } = await w.supabase.from("game_events").insert({
  game_id: gameId,
  type: "lineup_set",
  metadata: { lineup, sport: "netball" },   // ← filtered `lineup`
  created_by: w.userId,
});
```
Filter the `GenericLineup` (object keyed by court position → arrays of ids) down
to `availableIds`. Draft delete already at `:194`. Shares `resolveWriter` /
`clampOnFieldSize` (same helpers, this file imports them).

---

### B1 — `live/league-actions.ts` → `startLeagueGame` (`:150-260+`)

**Role:** server action · **Data flow:** event-write (CRUD)
**Analog:** AFL `startGame` reconciliation + league read union at `live/page.tsx:211-221`.

**Insert site — after the vest pre-flight loop (`:208-252`), before the `lineup_set` insert (`:254-260`):**
```typescript
// league-actions.ts:254-260 — current shape
const { error: insertError } = await w.supabase.from("game_events").insert({
  game_id: gameId,
  type: "lineup_set",
  metadata: { lineup, sport: "rugby_league" },   // ← filtered `lineup`
  created_by: w.userId,
});
```
Filter `LeagueLineup` (`forwards`, `backs`, `bench`) to `availableIds`.
> **Ordering caveat:** the vest pre-flight (`:208-252`) builds
> `const fieldSet = new Set([...lineup.forwards, ...lineup.backs])` and validates
> that FR/DH vest wearers are on the field. If reconciliation strips a player who
> was also a vest pick, the pre-flight could pass on the stale lineup but the
> committed lineup would lack that wearer. Planner decision: run reconciliation
> **before** the vest pre-flight so the pre-flight validates the post-reconcile
> field set (preferred), OR re-validate after. Call this out in the plan.
Draft delete already at `:355`.

---

### B1 — `live/page.tsx` (client-side picker-hydration filter, all 3 branches)

**Role:** RSC page · **Data flow:** read/seed (UX backstop, not correctness — D-05)
**Analog:** the page's own existing `availableIds` ∩ logic. The draft is hydrated
into the picker via `initialDraft`:
- AFL pre-kickoff: `initialDraft = draftRow` at `:787-792`, passed to `<LineupPicker initialDraft={...}/>` (`:856`). Available players already computed at `:770`.
- League pre-kickoff: `initialDraft` at `:240-250`, passed to `<LeagueLineupPicker initialDraft={...}/>` (`:311`). `availablePlayers` at `:221`.
- Netball: `netballDraft` at `:467-477`, passed to `<NetballLiveGame initialDraft={...}/>` (`:548`). `availableIds` at `:445`.

**Fix shape (D-05 client half):** when seeding the picker from the draft, filter
draft lineup entries to `availableIds` so an unavailable player visibly drops off
the field at picker load. The server backstop (above) is authoritative; this is
purely so the coach SEES the drop. Discretion (D-05): filter-at-load vs reactive
recompute — either is fine.

---

### B2 — `src/components/live/QuarterBreak.tsx` (AFL break surface — REFERENCE IMPL)

**Role:** client component · **Data flow:** event-driven UI
**Analog:** ITSELF — the existing "Lend a player" + "Injured / left early" panels
inside the Match-adjustments collapse are the exact rhythm a third
"Manage availability" entry must follow.

**Existing panel pattern to mirror (`:1106-1157`):** each affordance is a
dashed-border "+ {verb}" button that opens a `SlotFillSheet`, whose `onPick`
calls a toggle handler that fires a server action via the write queue.

`markLoan` wiring — `handleLoanToggle` (`:541-560`), optimistic flip + rollback:
```typescript
function handleLoanToggle(pid: string, nextLoaned: boolean) {
  setLoanError(null);
  setLoaned(pid, nextLoaned);
  startLoanTransition(async () => {
    const result = await markLoan(auth, gameId, {
      player_id: pid, loaned: nextLoaned, quarter: nextQuarter, elapsed_ms: 0,
    });
    if (!result.success) { setLoaned(pid, !nextLoaned); setLoanError(result.error); }
  });
}
```
`markInjury` wiring — `handleInjuryToggle` (`:566-581`), identical shape.
`SlotFillSheet` invocation — lend picker (`:1109-1130`), injured picker (`:1136-1157`).
Action imports at `:13-22` (`markInjury`, `markLoan` from `live/actions.ts`).
Picker open state pattern: `const [lendPickerOpen, setLendPickerOpen] = useState(false)` (`:539`), `injuredPickerOpen` (`:608`).

**New work (D-07/D-08/D-09):** add a third entry "Manage availability" that surfaces:
- **add arrived** → call `addLateArrival` (canonical writer, see Shared Patterns). Candidates = squad members NOT in `availableIds`. `LateArrivalMenu.tsx:51-60` shows the candidate-mapping shape for `SlotFillSheet`.
- **mark out** → D-09: reuse `InjuryReplacementModal` ("out + force replacement now"); differs from injury only in recorded reason. See the `LeagueLiveGame` invocation below for the canonical reuse.
- **mark injured** → already exists; keep it. (D-07 keeps the existing affordance.)
> NOTE: AFL `QuarterBreak` does NOT currently import `InjuryReplacementModal`
> (its existing mark-injured uses `markInjury` directly with no replacement
> prompt). The forced-replacement modal lives in AFL `LiveGame.tsx`
> (`handleInjuryReplacement`) and `LeagueLiveGame.tsx`. To honour D-09 at the
> break, the planner will import `InjuryReplacementModal` into `QuarterBreak`
> and wire it the way `LeagueLiveGame` does.

---

### B2 — `src/components/netball/NetballQuarterBreak.tsx` (mirror AFL)

**Role:** client component · **Data flow:** event-driven UI
**Analog:** AFL `QuarterBreak.tsx` (per CLAUDE.md reuse-before-fork; this file's
header literally says "Visual + interaction language mirrors AFL's QuarterBreak").

**Existing parallels already present:**
- Match-adjustments collapse: `matchAdjustmentsOpen` (`:880`).
- Lend panel (`:1122-1155`) + injured panel (`:1157-1192`), same dashed "+" button rhythm as AFL.
- Toggle handlers fire via write queue: `enqueueLiveAction("markInjury", [...])` (`:729`, `:941`), `enqueueLiveAction("markLoan", [...])` (`:747`, `:927`).
- `SlotFillSheet` lend picker (`:1205-1219`), injured picker (`:1225-1240`).
- Picker open state: `lendPickerOpen` / `injuredPickerOpen`.

**New work:** add the same "Manage availability" entry (add-arrived via
`addLateArrival`, mark-out via `InjuryReplacementModal`), matching AFL's
placement and token palette exactly. Netball already wires `addLateArrival` in
`NetballLiveGame.tsx:1321` (`handleLateArrival`) — lift that pattern into the break.

---

### B2 — `src/components/league/LeagueLiveGame.tsx` (rugby-league break path — mirror)

**Role:** client component · **Data flow:** event-driven UI
**Analog:** AFL `QuarterBreak.tsx` rhythm; but **this file is already the strongest
in-repo example of the D-09 forced-replacement reuse** — copy from here for the
`InjuryReplacementModal` wiring across all three sports.

> **Confirm the break surface:** the league between-period UI is rendered inside
> `LeagueLiveGame.tsx` (there is no separate `LeagueQuarterBreak` component). The
> break state is `isAtQbreak` (`:1224-1228`); full time is `isAtFinalQ`
> (`:1229-1232`) which hands off to `LeagueFullTimeReview` (imported `:44`,
> rendered `:1477`). The "Manage availability" entry belongs on the `isAtQbreak`
> surface; consider whether it should also appear at `isAtFinalQ`/review
> (probably not — game is ending).

**`addLateArrival` already wired — `handleAddLateArrival` (`:1003-1022`):** copy verbatim.

**`InjuryReplacementModal` reuse — the canonical D-09 pattern (`:1851-1882`):**
```typescript
{injuryReplacementModal && (() => {
  const injPlayer = squad.find((p) => p.id === injuryReplacementModal.injuredId);
  if (!injPlayer) return null;
  const candidates: InjuryReplacementCandidate[] = swappableBench
    .map((p) => ({ player: p, totalMs: totalMsByPlayer[p.id] ?? 0 }))
    .sort((a, b) => a.totalMs - b.totalMs);   // least-played first = suggested
  return (
    <InjuryReplacementModal
      injuredPlayer={injPlayer}
      zone={injuryReplacementModal.zone}
      candidates={candidates}
      onPickReplacement={(rid) => void handleInjuryReplacement(injuryReplacementModal.injuredId, rid, injuryReplacementModal.zone)}
      onSkipReplacement={() => void handleInjuryMarkOnly(injuryReplacementModal.injuredId)}
      onCancel={() => setInjuryReplacementModal(null)}
    />
  );
})()}
```
**The forced-replacement handler — `handleInjuryReplacement` (`:1090-1125`):** fires
`markInjury` THEN a swap (`recordLeagueSwap` for league; `recordSwap` for AFL) in
FIFO order so the replacement lands at the vacated slot. For "mark out" (D-09),
reuse this exact two-step but record the distinct reason (discretion D-Discretion:
new event type/reason vs metadata flag — planner's call, must be display-recoverable).
**Modal contract:** `InjuryReplacementModal.tsx:18-37` — props `injuredPlayer`,
`zone` (accepts AFL `Zone` OR plain string like `"forward"`/`"back"`), pre-sorted
`candidates: InjuryReplacementCandidate[]` (`{player, totalMs}`),
`onPickReplacement`/`onSkipReplacement`/`onCancel`.

---

## Test Pattern Assignments (CLAUDE.md: testing is part of "done"; bug fixes = red-first)

### B1 regression spec (×3 sports) — `e2e/tests/availability-honoured-at-kickoff.spec.ts` (new)

**Analog:** `e2e/tests/availability.spec.ts` (toggle + DB poll pattern) + the
lineup-seeding pattern in `injury-replacement.spec.ts:41-69`.

**Repro chain to encode (CONTEXT specifics):** seed players → save a
`game_lineup_drafts` row that places player X in a zone → set X
`game_availability.status = 'unavailable'` (via the `/availability` UI or a
direct `admin.from("game_availability").upsert`) → start the game → assert X is
**NOT** in the committed `lineup_set` event metadata / not on field.

**Fixtures:** `createAdminClient` + `makeTeam`/`makePlayers`/`makeGame` from
`../fixtures/` (used by every spec). DB-poll assertion pattern from
`availability.spec.ts:63-76` (`expect.poll` against `game_availability`); adapt to
poll `game_events` for the `lineup_set` row and assert X absent. Write it RED
first against pre-fix code (it should currently FAIL because the unavailable
player IS committed), then implement.

**Three sports:** AFL lineup shape per `injury-replacement.spec.ts:44-51`; netball
+ league use their lineup shapes. Reference full playthroughs:
`full-game-playthrough.spec.ts` (AFL), `netball-full-game-playthrough.spec.ts`,
`rugby-league-full-game-playthrough.spec.ts` for sport-specific start flows.

### B2 break-availability spec (×3 sports) — extend or add per sport

**Analog:** `quarter-break-rotation.spec.ts` (AFL break), `netball-quarter-break.spec.ts`
(netball break), and `injury-replacement.spec.ts` (the `InjuryReplacementModal`
assertions: long-press → "Mark injured" → pick replacement → assert both injury +
swap events land). Seed a mid-game at a quarter break (lineup_set + quarter_start +
quarter_end events), open "Manage availability", exercise add-arrived
(`player_arrived` + availability event lands) / mark-out (injury/out event + swap
lands) / mark-injured (existing).

---

## No Analog Found

None. Every target maps to an existing in-repo pattern.

| File | Role | Notes |
|------|------|-------|
| — | — | All 9 targets + 3 tests have concrete analogs. |

---

## Cross-Sport Mirror Obligations (CLAUDE.md)

- **AFL `QuarterBreak.tsx` is the reference**; `NetballQuarterBreak.tsx` and the
  league `isAtQbreak` surface in `LeagueLiveGame.tsx` must mirror its
  "Manage availability" placement, token palette, and SlotFillSheet/modal rhythm.
- **Consume verbatim (do NOT fork):** `AvailabilityList`/`AvailabilityRow`
  (subject to the RSC-vs-client caveat above), `InjuryReplacementModal`,
  `SlotFillSheet`, `addLateArrival`, `setAvailability`.
- **Three start actions, not one** (the key B1 surprise): replicate the same
  reconciliation in `startGame` / `startNetballGame` / `startLeagueGame`. Consider
  extracting a shared `reconcileLineupToAvailability(supabase, gameId, lineup, sport)`
  helper so the union semantics live in ONE place and can't drift (matches CLAUDE.md
  "extract a shared primitive if the seam is wide enough to be re-violated").

---

## Metadata

**Analog search scope:** `src/app/(app)/teams/[teamId]/games/[gameId]/{live,availability}/`,
`src/components/{live,games,netball,league}/`, `src/lib/{live,types}.ts`, `e2e/tests/`.
**Files read in full or targeted:** `live/actions.ts`, `live/page.tsx`,
`live/league-actions.ts`, `live/netball-actions.ts`, `availability/page.tsx`,
`games/actions.ts`, `AvailabilityList.tsx`, `AvailabilityRow.tsx`,
`QuarterBreak.tsx` (targeted), `NetballQuarterBreak.tsx` (targeted),
`LeagueLiveGame.tsx` (targeted), `InjuryReplacementModal.tsx`, `LateArrivalMenu.tsx`,
`periodPhase.ts`, `types.ts` (lineup shapes), `availability.spec.ts`,
`injury-replacement.spec.ts`.
**Pattern extraction date:** 2026-06-01
