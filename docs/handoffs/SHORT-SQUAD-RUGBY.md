# Short-Squad / Open Positions — Rugby League Handoff

## The problem (real match-day report)

> "Under-10s AFL, 12 on the field, only had 11 players. App put the blank
> slot in FWD by default. I couldn't move it to BACK. At Q2 break the
> same FWD-blank layout came back from scratch."

Three things were broken:

1. The swap-to-empty UI was unreachable mid-quarter.
2. Replay/store didn't understand a move-into-empty.
3. The Q-break suggester wiped the coach's manual blank-zone choice
   every quarter.

## The fix shape (apply this pattern to rugby league)

### 1. Data model — the on-court size is per-game, not per-team

`games.on_field_size` already exists. The coach picks it pre-game in the
LineupPicker dropdown, and can resize at Q-break or mid-quarter via the
"Game settings" collapse. Server actions clamp to the age group's
`[minOnFieldSize, defaultOnFieldSize]` range.

For rugby league, mirror this:

- Age group config exposes `defaultOnFieldSize` + `minOnFieldSize` (and
  `maxOnFieldSize` if oversize squads are a thing).
- New server action `setRugbyOnFieldSize(auth, gameId, size)` writes
  `games.on_field_size` directly.

### 2. Suggester — preserve the previous quarter's shape

Key file: [`src/lib/fairness.ts`](../../src/lib/fairness.ts) → exported
helper `deriveEffectiveZoneCaps(previousLineup, currentOnFieldSize,
positionModel, fallbackCaps)`.

The rule: **if the previous quarter's per-zone counts sum to the current
`on_field_size`, keep them.** Only fall back to the prop-derived caps on
Q1 or when the size changed. That's what stopped Q2 from re-suggesting
"blank in Forwards" after the coach moved it to Backs in Q1.

Rugby league analog: write `deriveEffectiveRugbyPositions(previousLineup,
currentOnFieldSize, positionModel, fallbackPositions)` with the same
"shape preserved if total matches" semantic. Wire it into the rugby
Q-break component's `effectivePositions` memo.

### 3. Mid-quarter swap-to-empty (UI + replay + store)

Three coordinated changes per sport:

**`LiveGame.tsx` (or rugby equivalent)** — `handleTapField` needs a
`field-selected → tap-empty-slot` branch that fires
`recordFieldZoneSwap` with `player_b_id: null`. The toast reads
"Henry → Forwards" (movement-shaped) instead of the two-player
"Henry ⇄ Maya — zones swapped".

**`src/lib/fairness.ts` `replayGame`** — add the `!pidB` branch to the
`field_zone_swap` event handler. Player A's stint closes at the event
timestamp; no second stint is opened.

**`src/lib/stores/liveGameStore.ts` `applyFieldZoneSwap`** — same
`pidB === ""` branch on the optimistic-update path.

**Server action signature** — `recordFieldZoneSwap.player_b_id: string |
null` (not just `string`). The DB row stores `null`; the replayer reads
it back.

### 4. Q-break — empty-slot tile accepts "Move here"

The empty-slot placeholder in the Q-break picker (and pre-game
LineupPicker) gets the same treatment as in-game: when a player is
selected, the placeholder text flips to "Move here" and the tap target
accepts the move. Mirrors the in-game swap-to-empty so the coach's
mental model is identical pre-game / mid-quarter / at the break.

### 5. Netball-specific (skip if rugby has no rules-of-play position constraints)

Netball was harder because its validator requires all 7 positions
filled. Added:

- `NETBALL_FILL_PRIORITY: Record<ageGroup, readonly string[]>` — which
  positions to leave empty first when short.
- `pickNetballPositionsToFill(ageGroup, onFieldSize, alreadyFilled?)` —
  drives both the pre-game LineupPicker AND the Q-break suggester.
- Validator rewritten to take optional `onFieldSize` and check count,
  not specific positions.

If rugby league has position-binding rules (e.g. must have a hooker,
must have two props), copy this pattern with a `RUGBY_FILL_PRIORITY`
per age group.

## Files to touch in your rugby branch

Reference commits to read the full diffs:

| Commit | What it does |
|---|---|
| `8a92f71` | AFL: all three layers (in-game UI + replay + store + Q-break suggester preservation). **Start here** — it's the cleanest template. |
| `2760d76` | Netball data layer: `pickNetballPositionsToFill` + `NETBALL_FILL_PRIORITY` + validator rewrite |
| `98de84e` | Netball UI: on-field-size dropdown in pre-game LineupPicker + Q-break |
| `751f0a6` | Netball mid-quarter swap-to-empty (paired vacate+fill `midQuarterSubs[]`) |
| `bb47a07` | Test matrix — 60 tests across AFL U8-U17 + all netball age groups. **Replicate this for rugby.** |

## Tests you must add (CLAUDE.md non-negotiable)

For every age group rugby supports, with three sizes each (default,
default-1, min):

1. `zoneCapsFor` / `pickRugbyPositionsToFill` matrix — exact expected
   per-zone counts.
2. Shape preservation — Q1 manual layout survives
   `deriveEffectiveRugbyPositions` into Q2.
3. End-to-end Playwright: short-squad pre-game → quarter ends → blank
   stays in the chosen zone → finalise.

Bug-fix tests written **first** (watch them go red against the pre-fix
code), then the fix.

## Decisions already locked (don't re-litigate)

- **Default blank position** — AFL uses `[mid, back, fwd]` priority for
  the remainder; netball uses age-specific priority lists. Pick rugby's
  based on which positions are "must-have" for the rules.
- **Range surfaced in UI** only when the age group actually has one
  (`minOnFieldSize < defaultOnFieldSize`). For age groups with a fixed
  size, no dropdown.
- **Manual override is sticky for that quarter only** — coach moving
  the blank zone at Q2 doesn't get rolled back at Q3 (shape
  preservation).
- **Mid-quarter resize** persists via `setSportOnFieldSize` to
  `games.on_field_size` and the page rerender threads the new value
  back through `currentOnFieldSize` for the suggester.
