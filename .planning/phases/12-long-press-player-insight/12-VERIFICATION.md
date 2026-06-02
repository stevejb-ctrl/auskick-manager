---
phase: 12-long-press-player-insight
verified: 2026-06-02
verdict: PASS
requirements: [PLAYERVIEW-01, PLAYERVIEW-02]
plans: [12-01, 12-02]
---

# Phase 12 Verification — Long-press player insight

**Method:** goal-backward. For each ROADMAP success criterion, confirm the
codebase actually delivers it (file:line evidence) rather than trusting that
tasks were marked complete. Inspection run against the `main` working tree
(`C:\Users\steve\OneDrive\Documents\Auskick manager`) — the file-search tools'
default root is a stale git worktree, so all evidence below was gathered via
the main-checkout shell.

**Phase goal:** Long-pressing any player gives the coach a complete,
trustworthy read on that kid's time — where they've played this game and across
the season — without leaving the live surface.

**Overall verdict: PASS** — all 4 success criteria met across AFL, netball,
and rugby league; both requirements (PLAYERVIEW-01, PLAYERVIEW-02) delivered
through ONE shared summary (pure `buildPlayerInsight` VM + shared
`PlayerInsightSummary`) embedded via an `insight?` slot in each sport's EXISTING
long-press host (no new modal, no fork of the summary); all four DoD gates green.

---

## Success Criteria

### Criterion 1 — in-game breakdown (per-zone time + last-sub + per-period), all sports — ✅ PASS

> Long-pressing a player shows their in-game breakdown — per-zone time, time
> since last sub, and a per-period minutes-per-zone breakdown (derived from the
> event replay), across all sports.

**Evidence:**
- The shared pure VM `buildPlayerInsight(input)`
  (`src/lib/player-insight.ts:82`) emits `inGameZones[]` + `inGameTotalMs`,
  `perPeriod[]`, and `msSinceLastSub` (`= max(0, nowAbsMs - lastSubbedOnMs)`,
  `null` when never subbed — `:109-111`, D-06). The shared
  `PlayerInsightSummary` renders the in-game section (testid
  `player-insight-ingame`, `:32`) and the per-period section gated on data
  (`vm.perPeriod.length > 0`, testid `player-insight-periods`, `:71-73`).
- The per-period × per-zone minutes — the one datum the replays did NOT already
  store (they kept only the ending zone) — is derived additively at each
  engine's existing per-zone credit site as `playedZoneMsByPeriod`, red-first
  cross-checked to SUM to the existing whole-game per-zone output:
  - **AFL:** `GameState.playedZoneMsByPeriod` accumulated in `addPlayed`
    (`src/lib/fairness.ts`); consumed at `LiveGame.tsx:2087`
    (`initialState.playedZoneMsByPeriod[pid]`) with the open period overlaid
    live. Spec `src/lib/__tests__/playedZoneMsByPeriod.test.ts`.
  - **netball:** exported `playedZoneMsByPeriod(events, periodSeconds,
    thirdLookup, inProgress?)` (`src/lib/sports/netball/fairness.ts`), keyed by
    the three config third zone ids; consumed at `NetballLiveGame.tsx:1156`.
    Spec `src/lib/__tests__/playedZoneMsByPeriod.netball.test.ts` (cross-checks
    to `playerThirdMs`).
  - **rugby league:** exported `playedZoneMsByPeriod(events)`
    (`src/lib/sports/rugby_league/fairness.ts`), single `"field"` zone per half;
    consumed at `LeagueLiveGame.tsx:441`. Spec
    `src/lib/__tests__/playedZoneMsByPeriod.league.test.ts`.
- Each host builds the VM input with its sport-correct period label
  (`buildInsightInput`): AFL via `playedZoneMsByPeriod[pid]` + live overlay
  (`LiveGame.tsx:2112`); netball `${periodAbbrev}${q}` → `Q1`
  (`NetballLiveGame.tsx:1201/1214`); league `${periodAbbrev}${q}` → `H1`
  (`LeagueLiveGame.tsx:493/513`), overlaying the open stint onto the current
  period.
- e2e proof: `e2e/tests/player-insight.spec.ts` — AFL (completed Q1 +
  in-progress Q2), netball ("Q1" period row), and rugby-league ("H1" period
  row) cases each assert `player-insight-ingame` + `player-insight-periods`
  visible. GREEN (4/4 incl. setup).

### Criterion 2 — season per-zone split as PERCENTAGES only, all sports — ✅ PASS

> The same summary shows the player's season per-zone split as percentages only
> — no raw season minutes — across all sports.

**Evidence:**
- The VM takes `seasonZoneMs` in any consistent unit and emits ONLY
  `seasonZonePct` (each row exposes a `pct` field, no raw ms surfaces) —
  `src/lib/player-insight.ts:114-121` (D-04): `seasonTotal` reduce → `pct =
  round(zoneMs / seasonTotal * 100)`, guarded against divide-by-zero.
- `PlayerInsightSummary` renders the season section (testid
  `player-insight-season`, `:109`) mapping `vm.seasonZonePct` only (`:114`) —
  there is no raw-minutes branch in the season section.
- Each host feeds season COUNTS, never minutes that could leak: AFL maps season
  to `%` before the VM; netball derives `seasonZoneCounts` from
  `seasonPositionCounts` → thirds (`NetballLiveGame.tsx:1136/1222`); league
  feeds season field counts. Because the VM only ever surfaces `pct`, no sport
  can render raw season ms.
- e2e proof: all three cases in `player-insight.spec.ts` assert
  `player-insight-season` is visible. GREEN.

### Criterion 3 — zones enumerated from config, not hardcoded — ✅ PASS

> Zones in the summary are enumerated from `getAgeGroupConfig(sport,
> ageGroup).zones`, not a hardcoded list, so AFL/netball/rugby-league zone
> labels render correctly.

**Evidence:**
- AFL: `insightZones = getSportConfig("afl").zones.filter((z) =>
  ageGroup.zones.includes(z.id))` — `LiveGame.tsx:291-292` (config order ∩
  age-group zones, D-03).
- rugby league: `insightZones = rugbyLeagueSport.zones.filter((z) =>
  ageGroup.zones.includes(z.id))` — `LeagueLiveGame.tsx:431-432` (RL config zones
  = single `["field"]`, so the per-zone view honestly degenerates to total field
  time + 100% season field — forwards/backs are vests, out of scope).
- netball: `insightZones` is derived by running `primaryThirdFor` over
  `ageGroup.positions` (`NetballLiveGame.tsx:1120-1123`), so only the three
  credited config third zone ids (`attack/centre/defence-third`) appear — the
  two goal CIRCLES never get time, keeping the set config-driven rather than a
  hardcoded ALL_ZONES.
- The VM itself iterates `input.zones` (the `ZoneDef[]` passed in) for both the
  in-game and season sections — it never references a literal zone list.
- No `ALL_ZONES` / hardcoded zone array exists on any of the three insight
  paths.

### Criterion 4 — opens from existing long-press → host (reuse-before-fork) + e2e — ✅ PASS

> The summary opens from the existing long-press → `LockModal` gesture
> (reuse-before-fork), and an e2e spec verifies the in-game and season sections
> render through the UI.

**Evidence:**
- The summary rides into each sport's EXISTING long-press host via an optional
  `insight?: ReactNode` slot — no new modal was created:
  - `LockModal` (AFL + rugby league share it) gained `insight?: ReactNode`
    (`src/components/live/LockModal.tsx:93`), rendered under the player header
    (`:147`). AFL passes `insight={insight}` (`LiveGame.tsx:2132`); league passes
    `<PlayerInsightSummary .../>` (`LeagueLiveGame.tsx:2390`).
  - the forked `NetballPlayerActions` gained the mirror slot
    (`NetballPlayerActions.tsx:64`, rendered `:129`); netball passes
    `<PlayerInsightSummary .../>` (`NetballLiveGame.tsx:2262`).
- The reuse boundary is the summary CONTENT — ONE pure `buildPlayerInsight`
  (`src/lib/player-insight.ts`) + ONE `PlayerInsightSummary`
  (`src/components/live/PlayerInsightSummary.tsx`) consumed verbatim by all
  three sports — not the host. No per-sport summary component was forked.
- e2e proof: `e2e/tests/player-insight.spec.ts` exercises the real long-press
  gesture (`.click({ delay: 600 })` ≥500ms hold) for AFL, netball, AND rugby
  league, each asserting the in-game + per-period + season sections render and
  that the host's own action set (switch/injure) still renders alongside. The
  run (`npm run e2e -- player-insight.spec.ts --workers=1`) reports 4 passed
  (setup + AFL + netball + rugby league).

---

## Requirements Traceability

| Requirement | Criterion | Delivered by | Status |
|-------------|-----------|--------------|--------|
| PLAYERVIEW-01 (in-game per-zone + last-sub + per-period, all sports) | #1 | 12-01 (AFL + core) + 12-02 (netball + league) | ✅ |
| PLAYERVIEW-02 (season per-zone PERCENTAGES only) | #2 | 12-01 (VM) + 12-02 (netball + league inputs) | ✅ |
| (zones from config, not hardcoded) | #3 | 12-01 + 12-02 | ✅ |
| (existing long-press host, reuse-before-fork, + e2e) | #4 | 12-01 (LockModal slot + AFL e2e) + 12-02 (NetballPlayerActions slot + netball/league e2e) | ✅ |

## DoD Gates (final, end of Phase 12)

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (0 errors; only pre-existing exhaustive-deps warnings in LiveGame/QuarterBreak/FeatureSection/NetballQuarterBreak — none introduced by this phase) |
| `npm test` (Vitest) | PASS — 875/875 (54 files); `playerInsight.test.ts`, `playedZoneMsByPeriod.test.ts` (AFL), `playedZoneMsByPeriod.netball.test.ts`, `playedZoneMsByPeriod.league.test.ts` all green |
| `npm run e2e` | PASS — `player-insight.spec.ts` 4/4 (setup + AFL + netball + rugby league), `--workers=1` per Phase-9 protocol |
| Schema drift | NONE — no migration, no new GameEventType, no new store slice, no new server action; read-only derivation over already-loaded replay state + the already-fetched team-scoped `season` prop |

## Conclusion

Phase 12 is **COMPLETE**. Long-pressing a player in any sport now opens that
sport's EXISTING long-press host with one shared summary: this game's per-zone
time + time-since-last-sub, a per-period minutes-per-zone breakdown derived
additively from the event replay (the one datum that was missing), and the
player's season per-zone split as PERCENTAGES only. The reuse boundary is the
summary content — a pure sport-agnostic `buildPlayerInsight` VM + a shared
`PlayerInsightSummary` component embedded via an `insight?` slot (added to
`LockModal`, mirrored onto the forked `NetballPlayerActions`) — with zones
enumerated from config (never hardcoded), no new modal, no fork of the summary,
no migration, and full red-first unit + e2e coverage across AFL, netball, and
rugby league.
