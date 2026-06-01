---
phase: 10-substitution-timing-thats-fair
plan: 02
subsystem: fairness / live-game suggesters
tags: [sub-recency, B4, SUB-01, fairness, replay, cross-sport, soft-guard, absolute-timeline]
provides:
  - per-player lastSubbedOnMs (absolute game-elapsed ms of most recent bench->field) on all 3 replay states
  - completedQuarterMs accumulator on AFL GameState (absolute-timeline anchor for live callers)
  - soft recency guard in suggestSwaps (AFL), cross-period stint fix in suggestLeagueSubs (league), pure recency tiebreak in suggestNetballLineup (netball)
affects: [phase-12, F3, lineup-suggester, sub-due-timing]
tech-stack:
  added: []
  patterns: [absolute-timeline-replay, soft-guard-partition, pure-tiebreak, red-first-tdd, reuse-before-fork]
key-files:
  created: []
  modified:
    - src/lib/fairness.ts
    - src/components/live/LiveGame.tsx
    - src/lib/sports/rugby_league/fairness.ts
    - src/lib/sports/netball/fairness.ts
    - src/components/netball/NetballQuarterBreak.tsx
    - src/lib/__tests__/subRecencyGuard.test.ts
key-decisions:
  - "D-01: derive lastSubbedOnMs at replay time from existing events — no schema migration, no last-sub column"
  - "D-02: absolute timeline = completedQuarterMs accumulator (summed quarter durations) + quarter-local elapsed_ms; persists across period boundaries"
  - "D-03 (deviation): league needs NO new minStintMs param — fixing the cross-period stint makes the existing msAt-desc off-sort honour recency naturally; suggestNextLeagueSub inherits it"
  - "D-04 (deviation): netball uses a PURE windowless tiebreak, not the AFL minStintMs window — netball subs are period-granular so a 'just arrived' player came on a whole period ago (> any derived sub-interval)"
  - "D-05 (deviation): live pages pass the whole replay `state` as initialState, so lastSubbedOnMs/completedQuarterMs flow through without an explicit per-field thread in page.tsx"
duration: ~split across Task 2 (AFL) + Task 3 (league/netball)
completed: 2026-06-02
---

# Phase 10 / Plan 02: Recency-aware sub suggester (SUB-01 / B4)

**A player subbed on late in one period is no longer suggested off again
early in the next. All three suggesters now factor in RECENCY — the
absolute game-elapsed time since a player most recently came on — derived
at replay time with no schema change, and persisting across the period
boundary.**

## The bug (SUB-01 / B4)
Each suggester ranked who-to-pull purely on cumulative game time (AFL,
netball) or on a per-quarter stint that RESET at every period boundary
(league). So a player who came back on 20s ago but happened to carry the
most total minutes was the first one pulled — churn that ignored how
recently they arrived.

## The fix
A per-player `lastSubbedOnMs` — the **absolute** game-elapsed ms of each
player's most recent bench→field transition — is derived at replay time
from existing events (swaps + period-break/quarter-start lineup
transitions). It persists across period boundaries via a
`completedQuarterMs` accumulator (sum of completed quarter durations) added
to the event's quarter-local `elapsed_ms`. The same map is exposed by all
three replay functions, ready for reuse by F3 (Phase 12 long-press summary).

Each sport then consumes it idiomatically:

- **AFL (`suggestSwaps`)** — a SOFT guard: after the most-played-first sort,
  field players who came on within the last rotation window (`minStintMs`,
  STRICT `<`) fall to the back of their zone queue but stay eligible (no
  deadlock when everyone is recent). Inert when `minStintMs <= 0`, so every
  legacy caller's ordering is byte-for-byte unchanged.
- **Rugby league (`suggestLeagueSubs`)** — the per-quarter stint that reset
  at `quarter_start` is replaced with an ABSOLUTE-timeline stint that
  survives the boundary; only a genuine bench→field transition restarts a
  stint. The existing `msAt`-desc off-sort then honours recency naturally
  (a just-arrived player has the shortest stint → sorts last), so **no new
  parameter** was added. `suggestNextLeagueSub` inherits the fix.
- **Netball (`suggestNetballLineup`)** — recency is a PURE tiebreak: among
  players tied on game time, the more-recently-arrived one stays on court
  and the longer-serving teammate benches. Windowless by design (see D-04).

## Performance
- **Tasks:** 3/3 completed (Task 1 RED, Task 2 GREEN AFL, Task 3 GREEN league + netball)
- **Files modified:** 5 (+1 test spec)
- **New schema:** NONE (replay-time derivation only)

## Task Commits
1. **Task 1: RED cross-sport spec** — `2cd9d33` — `test(10-02): add failing cross-sport sub-recency-guard spec`
2. **Task 2: GREEN AFL reference** — `991df01` — `feat(10-02): recency-aware sub suggester (AFL reference) + shared lastSubbedOnMs`
3. **Task 3: GREEN league + netball mirror** — `74bd51e` — `feat(10-02): mirror recency guard into league + netball + DoD gates`

## Files Created/Modified
- `src/lib/fairness.ts` — AFL `GameState` gains `lastSubbedOnMs` +
  `completedQuarterMs`; `replayGame` derives both on an absolute timeline;
  `suggestSwaps` gains the soft recency partition (trailing optional args).
- `src/components/live/LiveGame.tsx` — threads `initialState.lastSubbedOnMs`,
  the absolute current elapsed (`completedQuarterMs + nowMs*clockMultiplier`,
  game-ms frame), and `minStintMs = subIntervalMs` into `suggestSwaps`.
- `src/lib/sports/rugby_league/fairness.ts` — `LeagueGameState.lastSubbedOnMs`;
  `replayLeagueGame` stamps it; `suggestLeagueSubs` rebuilt on an absolute
  cross-period stint timeline (drops the `quarter_start` reset).
- `src/lib/sports/netball/fairness.ts` — `NetballGameState.lastSubbedOnMs`;
  `replayNetballGame` stamps it (`lineup_set` + `period_break_swap`);
  `suggestNetballLineup` adds the pure recency tiebreak.
- `src/components/netball/NetballQuarterBreak.tsx` — threads
  `replayNetballGame(thisGameEvents).lastSubbedOnMs` into the suggester input.
- `src/lib/__tests__/subRecencyGuard.test.ts` — 4 red-first cases (AFL pull +
  AFL soft-guard-no-deadlock, league cross-period, netball tiebreak).

## Decisions & Deviations
- **D-03 — league: no new `minStintMs` param.** The plan framed all three
  sports around a `minStintMs` window. For league, fixing the root cause
  (the per-quarter stint reset) makes the existing longest-stint-first
  off-sort honour recency for free, so adding a window param would have been
  dead weight. `suggestLeagueSubs` keeps its 5-arg signature (+ optional chip
  map); `suggestNextLeagueSub` delegates and inherits the fix.
- **D-04 — netball: pure windowless tiebreak.** Netball subs only at the
  period break, so recency is period-granular: a "just arrived" netballer
  came on at the PREVIOUS break — a whole period ago — which already exceeds
  any derived sub-interval. A `minStintMs` window would therefore never fire
  in real play. Instead the guard is a pure tiebreak among game-time ties
  (more-recent stays, longer-serving benches). `elapsedMs`/`minStintMs`
  remain on `NetballSuggestInput` for cross-sport input-shape parity but are
  unused by netball; documented inline.
- **D-05 — live pages need no per-field thread.** Both AFL live entry points
  (`teams/.../live/page.tsx` and `run/[token]/page.tsx`) already pass the
  whole `replayGame(...)` state as `initialState={state}`. Because
  `lastSubbedOnMs` + `completedQuarterMs` are now fields on that state, they
  flow through to `LiveGame` transitively — so the plan's per-page
  `lastSubbedOnMs` key_link is satisfied without editing the pages. (A
  literal grep for `lastSubbedOnMs` in `page.tsx` returns nothing by design.)
- **Reuse-before-fork:** no new components or forked writers — netball
  reuses the existing `NetballQuarterBreak` suggester input; league reuses
  the existing `suggestLeagueSubs`/`suggestNextLeagueSub` delegation.

## DoD Gates
| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0; only pre-existing exhaustive-deps + `<img>` warnings) |
| `npm test` (Vitest) | PASS (821 tests, 46 files — incl. all 4 subRecencyGuard cases) |
| `npm run e2e` (Playwright) | See note below |
| Schema drift | NONE — no migration (replay-time derivation) |

### e2e note (Phase-9 environmental protocol)
The full parallel run reported 112 passed / 7 failed. The failures were
**non-deterministic and environmental**, not a regression:
- The 7 failing specs spanned unrelated features (account-deletion, roster,
  live-scoring, afl-hooter, quarter-break-rotation, two netball specs) —
  none of which exercise the quarter-break suggester this change touches.
- Re-running those 7 serially (`--workers=1`) **passed 6 of the 7** and
  failed 4 *different* `netball-live-flow` tests (tap-to-score, long-press
  modal, injury/switch flows — again unrelated to the suggester).
- Running `netball-live-flow.spec.ts` in **isolation** passed **14/14**
  (1 intentional `.skip`), including every test that had flaked.
This pattern (different tests fail each run; full green in isolation) is the
known cold-start/resource-contention flakiness the `playwright.config.ts`
comment calls out ("cap workers so cold-starts don't stack"). The DB-reset
step also hit an intermittent Docker `error running container: exit 1` on
two of the runs (transient, succeeded on retry). No spec ordering shifted
because of the recency change, so no e2e spec required updating.

## Next Phase Readiness
- **F3 (Phase 12 long-press player summary)** can reuse `lastSubbedOnMs`
  directly from all three replay states for its "time since last sub" line —
  the map is exposed and on an absolute timeline.
- Phase 10 (SUB-01 + SUB-02) is functionally complete pending phase
  verification.
