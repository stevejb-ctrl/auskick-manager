---
phase: 12-long-press-player-insight
type: context
mode: folded-decisions
requirements: [PLAYERVIEW-01, PLAYERVIEW-02]
feature: F3
source: .planning/MATCH-DAY-CHANGES-SPEC.md (lines 127-149)
ui_spec: none (reuse existing long-press action sheets — LockModal / NetballPlayerActions)
research: skipped (read-only feature over existing replay state + season events)
created: 2026-06-02
---

# Phase 12 Context — Long-press player insight (F3)

> **Planning mode:** the user chose *plan directly from the spec* (no separate
> discuss-phase), *skip research*, and *plan without a UI-SPEC* (reuse the
> existing long-press action-sheet chrome). This file folds the design
> decisions the planner/executor need so they don't re-ask. AFL is the
> reference implementation; netball + rugby league mirror (per CLAUDE.md
> reuse-before-fork).

## Goal (from ROADMAP Phase 12)

Long-pressing any player gives the coach a complete, trustworthy read on that
kid's time — **where they've played this game and across the season** — without
leaving the live surface. Two requirements:

- **PLAYERVIEW-01** — in-game breakdown: per-zone time, **time since last sub**,
  and a **per-period minutes-per-zone** breakdown, across all sports.
- **PLAYERVIEW-02** — season per-zone split as **percentages only** (no raw
  season minutes), across all sports.

## What already exists (read-only recon — main checkout)

The long-press gesture and the data sources are already in place; F3 is almost
entirely a **read + present** feature. Nothing new is written to the DB.

### Long-press → action sheet (the surface to extend, per sport)
- **AFL** `src/components/live/LiveGame.tsx` — `PlayerTile` long-press (500ms
  hold) → `handleLongPress` (:1305) → `lockModal` state → renders the shared
  `LockModal` (:2072). Tile testid `player-tile-${id}`; e2e triggers it with
  `.click({ delay: 600 })` (see `e2e/tests/live-switch.spec.ts`).
- **Rugby league** `src/components/league/LeagueLiveGame.tsx` — long-press →
  `actionSheetPlayer` → the **same shared `LockModal`** (:2271, imported :39).
- **Netball** `src/components/netball/NetballLiveGame.tsx` — long-press →
  `handleTokenLongPress` (:1179) → `actionsTarget` → `NetballPlayerActions`
  (:2125, a **pre-existing fork** of LockModal scoped to netball's action set,
  `src/components/netball/NetballPlayerActions.tsx`).

→ So the long-press host differs by sport: **LockModal** (AFL + RL) vs the
forked **NetballPlayerActions** (netball). The reuse boundary for F3 is the
**summary content**, not the host.

### Data sources (all already computed or trivially derivable)
- **In-game per-zone ms** — AFL `zoneMsByPlayer` (`LiveGame.tsx:1102-1117`,
  `basePlayedZoneMs` + live stint overlay); netball `playerThirdMs(...)`
  (`src/lib/sports/netball/fairness.ts:981`); league `playerMsOnField` /
  `playerZoneMsOnField` (`src/lib/sports/rugby_league/fairness.ts:1560/1751`).
- **Time since last sub** — Phase-10 `lastSubbedOnMs` (absolute game-elapsed
  frame `completedQuarterMs + elapsed_ms`) is already on **all three** replay
  states (`fairness.ts:1002`, `netball/fairness.ts:828`,
  `rugby_league/fairness.ts:62`). The AFL replay comment at `fairness.ts:998`
  explicitly reserves it "for F3 (Phase 12 long-press 'time since last sub')".
- **Per-period minutes-per-zone** — **MISSING.** The replays expose only
  `pastQuarterZones` (the *ending* zone per period, `fairness.ts:1036`), not
  minutes-per-zone-per-period. This is the one piece of new derivation, and it
  must come **from the event replay** (ROADMAP criterion #1).
- **Season per-zone minutes** — AFL `seasonZoneMinutes(events)`
  (`fairness.ts:439`), fetched via team-scoped `getSeasonEvents(teamId)`
  (`src/lib/season.ts`) at the page level (`.../live/page.tsx:761`) and already
  passed to `LiveGame` as the `season: PlayerZoneMinutes` prop (`LiveGame.tsx:177`,
  destructured :264). Netball/league have their own season per-zone counts.
- **Labelled zones** — `getAgeGroupConfig(sport, ageGroup).zones` is a
  `ZoneId[]`; the labels (`label`/`shortLabel`) live on `SportConfig.zones`
  (`ZoneDef[]`, `src/lib/sports/types.ts:32/177`). AFL also exposes
  `ZONE_LABELS` / `ZONE_SHORT_LABELS` (`src/lib/ageGroups.ts:286/295`). RL's
  config `zones` is `["field"]` (single); netball's is the 5 court thirds.

## Decisions (folded — do not re-ask)

- **D-01 — Reuse the existing long-press host; embed a SHARED summary block.**
  Do NOT build a new modal. Add an optional `insight?: React.ReactNode` slot to
  BOTH `LockModal` (AFL + RL) and `NetballPlayerActions` (netball), rendered
  just under the "Player actions" header. Each live surface composes
  `insight={<PlayerInsightSummary insight={vm} />}`. The host action sheets stay
  presentational and otherwise unchanged.
- **D-02 — One shared, sport-agnostic, pure VM builder + one shared component.**
  `buildPlayerInsight(input)` in a new `src/lib/player-insight.ts` (pure — no
  Supabase, no React) produces the view-model; `PlayerInsightSummary` in
  `src/components/live/PlayerInsightSummary.tsx` renders it. Both are consumed
  verbatim by all three sports (reuse-before-fork — the summary is shared chrome).
- **D-03 — Zones enumerated from config, never hardcoded.** The builder takes
  labelled `ZoneDef[]` for the current age group (caller derives them from
  `getAgeGroupConfig(...).zones` ∩ `SportConfig.zones`) and emits exactly those
  zones, in config order, with config labels. The summary contains NO hardcoded
  zone array and never imports `ALL_ZONES`. (ROADMAP criterion #3.)
- **D-04 — Season view is PERCENTAGES ONLY.** The builder converts season
  per-zone ms → percentage of the player's total season ms; the output exposes
  `pct` and NO raw-minutes field. All-zero when the player has no season data.
  (PLAYERVIEW-02 + the v1.1 Out-of-Scope row: "no raw season minutes".)
- **D-05 — Per-period minutes-per-zone is derived from the event replay.**
  Extend each sport's replay with a `playedZoneMsByPeriod` accumulator at the
  EXISTING stint-flush points (where `basePlayedZoneMs` / per-zone ms is already
  credited): AFL `replayGame` (`fairness.ts`, reference, Wave 1), then
  `replayNetballGame` + `replayLeagueGame` (Wave 2). The current in-progress
  period is overlaid in the live component using the SAME stint overlay pattern
  that `zoneMsByPlayer` already uses, so the breakdown is live. Red-first unit
  coverage per engine.
- **D-06 — Time-since-last-sub reuses Phase-10 `lastSubbedOnMs`.** `msSinceLastSub
  = max(0, nowAbsMs - lastSubbedOnMs)` where `nowAbsMs = completedQuarterMs +
  current-period elapsed`; `null` when the player has no `lastSubbedOnMs` (never
  subbed on / benched all game). No new derivation — share the signal.
- **D-07 — Two waves, serial.** 12-01 = shared core (`buildPlayerInsight` +
  `PlayerInsightSummary` + AFL `playedZoneMsByPeriod`) + AFL reference wiring +
  AFL e2e. 12-02 = netball + rugby-league mirror (per-period extension in each
  engine, wire the host sheets, netball + league e2e). 12-02 `depends_on: [01]`
  because both touch the shared `LockModal` / `PlayerInsightSummary` seam.
  Mirrors the Phase 10/11 reference-then-mirror shape.
- **D-08 — No migration, no new GameEventType, no new store slice.** F3 reads
  already-loaded replay state + the already-fetched, team-scoped season events.
  Read-only; no new write path, no new network input, no new auth surface.

## Out of scope (this phase)

- Raw season minutes in the summary (percentages only — locked by PLAYERVIEW-02).
- Any new persistence, migration, or game-event type.
- Re-skinning or forking the host action sheets beyond adding the `insight` slot.
- Surfacing the insight anywhere other than the long-press action sheet.

## Canonical refs

```
# Long-press hosts (extend with an `insight` slot — D-01)
src/components/live/LockModal.tsx                       # shared host: AFL + RL
src/components/live/LiveGame.tsx:1305,2072              # AFL long-press → LockModal
src/components/league/LeagueLiveGame.tsx:39,2271        # RL long-press → LockModal
src/components/netball/NetballPlayerActions.tsx         # netball host (pre-existing fork)
src/components/netball/NetballLiveGame.tsx:1179,2125    # netball long-press → NetballPlayerActions

# Data sources
src/lib/fairness.ts:439                                 # seasonZoneMinutes (AFL season per-zone)
src/lib/fairness.ts:1002,1009,1036                      # lastSubbedOnMs, completedQuarterMs, pastQuarterZones (ending-zone only)
src/lib/fairness.ts:1100-1104                           # addPlayed (the per-zone credit funnel — add per-period accumulator here)
src/components/live/LiveGame.tsx:1102-1117              # zoneMsByPlayer in-game per-zone overlay (pattern to reuse)
src/components/live/LiveGame.tsx:177,264,1288           # `season: PlayerZoneMinutes` prop already on LiveGame
src/lib/sports/netball/fairness.ts:828,981             # replayNetballGame.lastSubbedOnMs, playerThirdMs
src/lib/sports/rugby_league/fairness.ts:62,1560,1751   # replayLeagueGame.lastSubbedOnMs, playerMsOnField, playerZoneMsOnField
src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx:761  # seasonZoneMinutes wired from getSeasonEvents

# Zones / labels (config-driven — D-03)
src/lib/sports/types.ts:32,79,177                       # ZoneDef {id,label,shortLabel}; AgeGroupConfig.zones (ZoneId[]); SportConfig.zones (ZoneDef[])
src/lib/ageGroups.ts:286,295                            # ZONE_LABELS / ZONE_SHORT_LABELS
src/lib/sports/afl/index.ts:11,74                       # AFL_ZONES_FULL
src/lib/sports/netball/index.ts:30,115                  # NETBALL_ZONES (5 thirds)
src/lib/sports/rugby_league/index.ts:48,350             # RL_ZONES (single "field")

# e2e long-press trigger pattern
e2e/tests/live-switch.spec.ts:81                        # page.getByTestId(`player-tile-${id}`).click({ delay: 600 })
```
