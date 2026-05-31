# Siren Footy — Match Day Changes Spec

> Input document for the **Match Day Changes** milestone. Captures the
> 8 work items (4 bugs, 4 features), the global sport-agnostic rule,
> the answered open decisions, and the read-only reconnaissance that
> mapped each item to its root cause (file:line). This is the durable
> source of truth — the conversation that produced it ran across a
> context boundary.

## Global rule — sport-agnostic, always

Siren ships three sports (AFL, netball, rugby league) on one shared
coach. **Everything in this milestone must be sport-agnostic:**

- **Never hardcode "quarter".** Read the sport's period structure
  (`periodCount` / `periodSeconds` / `periodLabel` = "quarter" /
  "half" / "period") from the age-group config. AFL/netball are 4
  quarters; rugby league is quarters **or** halves by age group.
- **Zones / positions are per-sport data**, enumerated from
  `getAgeGroupConfig(sport, ageGroup).zones` — never a hardcoded list.
- Confirm where sport config lives before touching live-game logic
  (done — see Recon §"Sport config").

## Answered decisions

| Question | Decision |
|----------|----------|
| Process | **GSD milestone plan** (this milestone). |
| F4 interval floor | **Per-age-group + default** — add `subIntervalFloorSeconds` to age-group config with a ~4-min (240s) default; per-age-group override allowed. |
| B1 repro | **"In the picker screen"** — user marks a player unavailable on the lineup picker itself, but at game start they still show available. NOTE: recon found no availability *toggle* on `LineupPicker.tsx`; reconcile during B1 discussion (recon may have missed a control, or the user's mental model maps a different control to "the picker"). |

---

## Bugs

### B1 — Pre-game lineup availability changes don't persist
A player marked **unavailable** in the picker still shows **available**
at game start. The availability edit made in the picker flow is lost
before the game reads availability.

**Recon:**
- `src/components/live/LineupPicker.tsx` has **no** availability control
  (zero `availability` matches); it writes lineup *zones* only —
  `saveLineupDraft` (`:558` / `:1001`) and `startGame`
  (`:520` → `live/actions.ts:131`).
- Availability writer = `setAvailability` in
  `src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts:54`.
- `/live` reads `game_availability` server-side
  (`live/page.tsx:736-739`).
- `addLateArrival` (`live/actions.ts:595`) upserts
  `game_availability` → available + `player_arrived` event; wired only
  to LiveGame / LiveAdminUtilityRow / LateArrivalMenu.
- **Discrepancy to reconcile** (see Answered decisions / B1).

### B2 — Availability can't be changed at period breaks
At a period break the coach can't add an arrived player, mark someone
out, or mark someone injured.

**Recon:**
- `QuarterBreak.tsx` has `markLoan` (`:533`), `markInjury` (`:558`),
  UI (`:1052-1093`), `handleTap` (`:301`) — but **no add-player /
  mark-available** affordance.
- `addLateArrival` exists (`live/actions.ts:595`) but is not wired into
  the quarter-break surface.

### B3 — Team song stops after Q1 on iOS
Hype song plays in Q1 then goes silent for the rest of the game on iOS.
Suspected backgrounding / AudioContext suspension.

**Recon:**
- `src/lib/live/useHypeSong.ts` — song = YouTube iframe or `new Audio()`
  (`:133-140`); triggered on goal (LiveGame.tsx:734,
  NetballLiveGame.tsx:1110/2154).
- `_audioCtx` (LiveGame.tsx:110-144) is **beep-only**, unlocked on
  `pointerdown` (`:1051-1063`). No `visibilitychange` /
  `appStateChange` handler re-arms the song.
- Silent `.catch(()=>{})` swallows failures (useHypeSong.ts:136).
- Song effect tears down only on `gameId` change / unmount
  (`:108-113`), **not** at a period break.
- **Hypothesis (b) confirmed:** the audio element/context is never
  re-armed after iOS suspends it. Fix lives in `useHypeSong.ts`.
- **Independent** of the rest — no shared dependency.

### B4 — Sub suggester ignores time-since-last-sub
A player subbed **late in Q3** is wrongly suggested **off again early
in Q4**. The suggester ranks on cumulative game minutes only; it has no
notion of *recency* (how long since this player last came on).

**Recon:**
- `src/lib/fairness.ts` — `suggestSwaps` (`:839`, live) ranks on
  cumulative game minutes + zone diversity. **No per-player last-sub
  timestamp exists anywhere** (not in `game_events`, the store, or
  migration 0047). `subBaseMs` (LiveGame.tsx:351) is a single global
  anchor, not per-player.
- A per-player "on since" / "last subbed" signal must be derived
  (from stint-start / swap events) and fed into the ranking as a
  recency guard.

---

## Features

### F1 — Override the suggested upcoming sub rotation ahead of time
Let the coach pre-empt and edit the *next* suggested rotation before it
is due, rather than only reacting at the moment a sub falls due.

**Recon:**
- No live override of the upcoming rotation today. The only pre-emptive
  editing is the **pre-game** `GamePlanModal` tap-to-swap; live subs are
  reactive (`SwapCard.tsx`, `SubDueModal.tsx:1123`,
  msUntilDue math LiveGame.tsx:1085-1110).
- DB already has `games.sub_interval_seconds` (migration 0004, default
  180s) — a per-game knob exists, but not a per-upcoming-rotation
  override.

### F2 — Build the next period's plan during the final minutes of current
During the dying minutes of a period, surface a "plan next period"
affordance so the coach walks into the break with a lineup ready.

**Recon:**
- Reuses the Game Plan projector (`src/lib/game-plan/`) — already
  sport-agnostic. The seam is a live entry point that seeds the
  projector from current game state + remaining periods.
- `QuarterBreak.tsx` is the natural consumer; F1 + F2 share the
  "edit an upcoming rotation" surface (reuse before fork).

### F3 — Long-press player summary
Long-press a player → a summary showing:
- **In-game:** per-zone time, last-sub time, per-period breakdown.
- **Season:** per-zone **percentages only** (no raw minutes).

**Recon:**
- Long-press → `LockModal` (`src/components/live/LockModal.tsx`); gesture
  in `PlayerTile.tsx:86-112`; `handleLongPress` LiveGame.tsx:1262-1265;
  modal LiveGame.tsx:1766-1834.
- In-game zone time = `zoneMsByPlayer` (LiveGame.tsx:1068-1083);
  `replayGame` → `basePlayedZoneMs` + `pastQuarterZones`
  (fairness.ts:975 — **ending-zone-per-period only**). The
  **per-period minutes-per-zone breakdown is MISSING** and must be
  derived from the event replay.
- Last-sub derivable from `stintStartMs` / swap events (ties to B4's
  recency signal — share the derivation).
- Season per-zone = `seasonZoneMinutes` (fairness.ts:439-455, raw
  minutes via `getSeasonEvents` in `src/lib/season.ts`,
  live/page.tsx:647/782). Convert to **percentages** for display.
- Zone enumeration: `getAgeGroupConfig(sport, ageGroup).zones`
  (`ZoneDef` label/shortLabel) vs hardcoded `ALL_ZONES`
  (fairness.ts:34) — use the config.
- **No migration needed.**

### F4 — Sub interval derived from period length
Replace the fixed sub interval with one **derived from period length**:
smallest **even divisor** of the period length that is **≥ a floor**
(~4 min); **near-even fallback** when no clean divisor exists.

**Recon:**
- Currently `subIntervalSeconds` is fixed per age group
  (`rugby_league/index.ts:80-81`: QUARTER=4·60, HALF=10·60;
  `ageGroups.ts` legacy). `games.sub_interval_seconds` overrides per
  game (default 180s).
- Need a **pure function**: `(periodSeconds, floorSeconds) → intervalSeconds`
  picking the smallest even divisor ≥ floor; near-even fallback.
- Add per-age-group **`subIntervalFloorSeconds`** to the config with a
  ~240s default (decision above).

---

## Phase 0 — sport-config centralization (prerequisite)

Sport config is ~85% centralized; a small Phase 0 removes the remaining
AFL-hardcoded live-game literals so the rest can be sport-agnostic:

- `LiveGame.tsx:1019-1021` and `NetballLiveGame.tsx:1659/1696/1780`
  (`currentQuarter >= 4` / `< 4`) → use `ageGroup.periodCount`.
- `fairness.ts:601` `FULL_QUARTER_MS = 12*60*1000` → derive off
  `periodSeconds`.
- `LeagueLiveGame.tsx:529/613/1227/1231` already uses
  `ageGroup.periodCount` — **reference implementation**.
- Add per-age-group `subIntervalFloorSeconds` (~240s default) — feeds F4.

## Sport config — where it lives (confirmed)

- `src/lib/sports/types.ts:73-126` (`AgeGroupConfig`), `:175-176`
  (`SportConfig` labels).
- `src/lib/sports/afl/index.ts:49` (`periodCount: 4`), zones `:10-24`.
- `src/lib/sports/netball/index.ts` (4 quarters, 5 zones / 7 positions
  `:29-88`).
- `src/lib/sports/rugby_league/index.ts:80-81` (sub intervals).
- `src/lib/sports/index.ts:36-45` (`getEffectiveQuarterSeconds` —
  game → team → age override).
- `src/lib/ageGroups.ts` (legacy quarterSeconds + subIntervalSeconds).

## Suggested build order

Phase 0 (centralize period literals + add `subIntervalFloorSeconds`)
→ **B1** (lineup availability persistence)
→ **B2** (availability at breaks)
→ **F4** (interval calc)
→ **B4** (recency weighting)
→ **F1 + F2** (override / build upcoming rotation — shared surface)
→ **F3** (long-press summary).
**B3** (iOS song) is independent — can run any time / in parallel.

## Definition of done (CLAUDE.md)

- Bug fixes (B1–B4) land with a **regression test written first**
  (red → green).
- Schema migrations (if any) ship with an e2e spec exercising the
  change **through the UI**.
- `npm test`, `npm run e2e`, `npx tsc --noEmit`, `npm run lint` all
  green before any commit is considered done.
- Small, reviewable commits. Reuse-before-fork cross-sport consistency.
