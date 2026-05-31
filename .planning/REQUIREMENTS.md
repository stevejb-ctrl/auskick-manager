# Requirements: Siren — Multi-sport merge to production

**Defined:** 2026-04-29
**Core Value:** Live-game time-on-ground fairness must be effortless and trustworthy across both AFL and netball — coaches end every match confident every kid got their fair share.

## v1 Requirements

Requirements for this milestone (Multi-sport merge to production). Each maps to a roadmap phase.

### Merge mechanics

- [ ] **MERGE-01**: A single trunk on `main` contains every commit from production-side `main` (60 commits since fork point `b3657c5`) and every commit from `multi-sport` (74 commits), with all merge conflicts resolved coherently
- [ ] **MERGE-02**: Pre-merge state of both branches is preserved as immutable tags (`pre-merge/main`, `pre-merge/multi-sport`) so the merge can be re-run if validation fails
- [ ] **MERGE-03**: Conflict-resolution rationale is captured in commit messages (or a MERGE-NOTES.md) so any non-trivial decision is reviewable post-hoc

### Schema reconciliation

- [ ] **SCHEMA-01**: Migration ordering is monotonic and unique — any post-fork migrations on `main` are renumbered or interleaved with multi-sport's 0024–0026 such that no two migrations share a number and `supabase migration up` runs cleanly from scratch
- [ ] **SCHEMA-02**: Migration backfills `teams.sport = 'afl'` for every existing team row before any code path treats sport as non-null (DEFAULT then NOT NULL, or backfill-then-alter pattern)
- [ ] **SCHEMA-03**: A Playwright spec exercises the new `teams.sport`, `teams.track_scoring`, and `teams.quarter_length_seconds` columns end-to-end through the setup wizard / team settings UI for both AFL and netball — per CLAUDE.md schema-migration rule
- [ ] **SCHEMA-04**: Existing AFL data (teams, players, games, events, availability, share tokens) survives the migration intact and is queryable through the merged code without RLS or null errors

### Sports abstraction

- [ ] **ABSTRACT-01**: All sport-specific live-game logic dispatches through `src/lib/sports/` — no AFL-baked-in conditionals survive in shared components, server actions, or stats aggregators
- [ ] **ABSTRACT-02**: AFL flow behaves identically to pre-merge prod — every existing AFL e2e spec passes unchanged on the merged trunk (regression-test contract)
- [ ] **ABSTRACT-03**: `getEffectiveQuarterSeconds(team, ageGroup, game)` resolves quarter length consistently across countdown, hooter, time-credit accounting, and Q-break time bars for both AFL and netball, in priority order: `game.quarter_length_seconds` → `team.quarter_length_seconds` → `ageGroup.periodSeconds`

### Netball capability in production

- [ ] **NETBALL-01**: NetballLiveGame renders correctly through all six branches (pre-kickoff, pre-Q1, live, Q-break, between-Q4-and-finalise, finalised) on the merged trunk — wall-clock-anchored countdown, pause/resume, auto-end-at-hooter all working
- [ ] **NETBALL-02**: NetballQuarterBreak ships with all 5 fairness tiers intact — unplayed-third (+100k), same-position (−50k), same-third (−10k), friend-pair-split (−5k per overlap), season under-utilisation tiebreak — and tie-breaks on `thisGameTotalMs` then seasonAvailability ratio then seeded shuffle
- [ ] **NETBALL-03**: Goal scoring flow (GS/GA tap → confirm sheet → `recordNetballGoal`, opponent `+G`, 8-second undo toast → persistent undo chip) is fully wired; per-player goal counts surface on bench strip and summary card
- [ ] **NETBALL-04**: `track_scoring=false` correctly suppresses scoring affordances on every surface — GS/GA no-op, `+G` hidden, undo hidden, score numbers hidden in score bug, walkthrough scoring step dropped, "def/drew with" + "Goals:" lines suppressed in summary card. Long-press still opens actions modal.
- [ ] **NETBALL-05**: Netball stats dashboard renders all 5 sections (player stats, minutes equity, chemistry, head-to-head, attendance) with per-position breakdown beneath each third %; `stats/page.tsx` branches on sport so AFL aggregators don't run on netball events and vice versa
- [ ] **NETBALL-06**: NetballGameSummaryCard renders with copyable group-chat text (🏐 result, 🥅 goals, 👟 player count, ⏱ per-player time + third %), with all gates respecting `track_scoring`
- [ ] **NETBALL-07**: First-visit walkthrough fires on netball live shell, persists `nb-walkthrough-seen` localStorage, drops scoring step when `track_scoring=false` — regression covered by `netballWalkthroughSteps.test.ts`
- [ ] **NETBALL-08**: Long-press actions modal (Mark injured, Lend to opposition, Lock-for-next-break) + mid-quarter replacement sheet + late-arrival menu all functional on netball live shell

### Production-side enhancements preserved

- [ ] **PROD-01**: All post-fork production e2e fixes pass on the merged trunk — long-press, lineup availability, TagManager temp-id, injury-replacement specs, live-swaps, live-scoring (commits #52–#55)
- [ ] **PROD-02**: Performance wave 3 changes are preserved — static marketing + auth pages, DB indexes, spinners
- [ ] **PROD-03**: UX changes are preserved — back-arrow removal from authenticated header, any other UX commits on `main` since fork
- [ ] **PROD-04**: PlayHQ live-import remains intentionally fixme'd per commit `e9bbc47` — status documented, not regressed, not accidentally "fixed"

### Test + type discipline

- [ ] **TEST-01**: `npm test` (Vitest) — all unit tests green on merged trunk (≥153 tests from multi-sport plus any prod-side unit tests)
- [ ] **TEST-02**: `npm run e2e` (Playwright) — all e2e specs green on merged trunk
- [ ] **TEST-03**: `npx tsc --noEmit` clean across merged trunk
- [ ] **TEST-04**: `npm run lint` clean across merged trunk
- [x] **TEST-05**: Test team Kotara Koalas (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`, netball, "Go", 9 players, 5 simulated games) survives the merge as a usable seed for ongoing netball validation ✓ Phase 5 Plan 01 (2026-04-30) — `supabase/seed.sql` extended; `auditKotaraKoalas()` returns `{ present: true, gameCount: 5, playerCount: 9 }`; netball-quarter-break.spec.ts:380 Kotara-optional test FLIPPED from SKIP to PASS

### Preview deploy + production cutover

- [ ] **DEPLOY-01**: Vercel preview deployment of the merged trunk is built against a clone of prod Supabase (or staging Supabase populated with a recent prod snapshot)
- [ ] **DEPLOY-02**: Preview deploy is manually validated — actual AFL game flow + actual netball game flow + stats dashboards for both + summary card for both + share-link viewing
- [ ] **DEPLOY-03**: After preview validation passes, `main` is fast-forwarded to the merged trunk; production Supabase takes the new migrations in order; production Vercel deploy goes green
- [ ] **DEPLOY-04**: Post-cutover smoke test on prod confirms existing AFL teams still load, no RLS errors, existing share links still resolve

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Additional sports

- **V2-SPORT-01**: Soccer support (4 quarters / 2 halves, position constraints, scoring)
- **V2-SPORT-02**: Basketball support (rolling subs, fouls, scoring)
- **V2-SPORT-03**: Sport-picker UX in setup wizard with full multi-sport tab navigation in nav

### Co-coaching

- **V2-COACH-01**: Real-time multi-coach co-scoring during a live game
- **V2-COACH-02**: Coach role hierarchy (head coach vs assistant)

### Tournaments / fixtures

- **V2-LEAGUE-01**: Fixture import beyond PlayHQ
- **V2-LEAGUE-02**: Ladder / standings view
- **V2-LEAGUE-03**: Cross-team admin (club view)

### Stats expansion

- **V2-STATS-01**: Per-quarter heatmaps
- **V2-STATS-02**: Trend lines across season
- **V2-STATS-03**: Exportable PDF post-season report

## Out of Scope

| Feature | Reason |
|---------|--------|
| Soccer / basketball / rugby in this milestone | Netball is the second sport; further sports come once the abstraction is proven |
| Real-time multi-coach co-scoring | Requires subscriptions / push channels not in current architecture; current single-coach assumption is preserved through this milestone |
| Tournament / fixture / ladder structure | Siren stays a per-team coach tool, not a league management platform |
| New stats metrics or analytics surfaces | Ship what multi-sport already built; no new dashboard work in this milestone |
| iOS / Android native apps | PWA stays the only client surface |
| PlayHQ live-import fix | Stays fixme'd per `e9bbc47` — architectural rework is a separate milestone |
| Fresh repo / fresh Vercel project | User confirmed: same repo, new main, same Supabase project |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MERGE-01 | Phase 3 | Pending |
| MERGE-02 | Phase 1 | Pending |
| MERGE-03 | Phase 1 | Pending |
| SCHEMA-01 | Phase 2 | Pending |
| SCHEMA-02 | Phase 2 | Pending |
| SCHEMA-03 | Phase 2 | Pending |
| SCHEMA-04 | Phase 2 | Pending |
| ABSTRACT-01 | Phase 3 | Pending |
| ABSTRACT-02 | Phase 3 | Pending |
| ABSTRACT-03 | Phase 3 | Pending |
| NETBALL-01 | Phase 4 | Pending |
| NETBALL-02 | Phase 4 | Pending |
| NETBALL-03 | Phase 4 | Pending |
| NETBALL-04 | Phase 4 | Pending |
| NETBALL-05 | Phase 4 | Pending |
| NETBALL-06 | Phase 4 | Pending |
| NETBALL-07 | Phase 4 | Pending |
| NETBALL-08 | Phase 4 | Pending |
| PROD-01 | Phase 3 | Pending |
| PROD-02 | Phase 3 | Pending |
| PROD-03 | Phase 3 | Pending |
| PROD-04 | Phase 3 | Pending |
| TEST-01 | Phase 5 | Pending |
| TEST-02 | Phase 5 | Pending |
| TEST-03 | Phase 5 | Pending |
| TEST-04 | Phase 5 | Pending |
| TEST-05 | Phase 5 | Complete |
| DEPLOY-01 | Phase 6 | Pending |
| DEPLOY-02 | Phase 6 | Pending |
| DEPLOY-03 | Phase 7 | Pending |
| DEPLOY-04 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0

---

# Milestone v1.1: Match Day Changes

**Defined:** 2026-06-01
**Spec + recon:** `.planning/MATCH-DAY-CHANGES-SPEC.md`
**Scope:** 4 bugs (B1–B4) + 4 features (F1–F4) for live match-day management, plus a foundation phase. Everything sport-agnostic across AFL / netball / rugby league — never hardcode "quarter"; period structure and zones/positions come from age-group config.

> The v1.0 requirements above remain in place (that milestone is paused at Phase 6, not abandoned). The requirements below are the **only** ones in scope for v1.1 and map to phases **8+**.

## v1.1 Requirements

### Sport-agnostic foundations (CONFIG) — prerequisite

- [ ] **CONFIG-01**: Live-game period logic reads the sport's period structure from age-group config — no hardcoded period-count literals (`currentQuarter >= 4` / `< 4` in `LiveGame.tsx`/`NetballLiveGame.tsx`, `FULL_QUARTER_MS` in `fairness.ts`) survive; AFL, netball, and rugby league all drive "is this the last period / is the game over" and full-period accounting off `periodCount` / `periodSeconds`. (`LeagueLiveGame.tsx` is the reference.)
- [ ] **CONFIG-02**: Every age-group config exposes a `subIntervalFloorSeconds` (default 240s ≈ 4 min, per-age-group overridable) that the sub-interval derivation reads as its floor.

### Pre-game & break availability (AVAIL)

- [ ] **AVAIL-01** (B1): A player marked unavailable in the pre-game lineup picker stays unavailable at kickoff — the picker's availability edits persist to `game_availability` and are honoured when the game starts, across all sports.
- [ ] **AVAIL-02** (B2): At any period break a coach can add a newly-arrived player to the game, mark a present player out, or mark a player injured — across all sports.

### Substitution timing (SUB)

- [ ] **SUB-01** (B4): The sub suggester accounts for time-since-last-sub — a player subbed on late in one period is not suggested off again early in the next, across all sports.
- [ ] **SUB-02** (F4): The sub interval is derived from period length (smallest even divisor of the period length that is ≥ the age-group `subIntervalFloorSeconds`; near-even fallback when no clean divisor exists) instead of a fixed constant, across all sports.

### Rotation planning controls (ROTPLAN)

- [ ] **ROTPLAN-01** (F1): A coach can review and override the upcoming suggested sub rotation before it falls due, and the live game honours the override.
- [ ] **ROTPLAN-02** (F2): During the final minutes of a period a coach can build/preview the next period's lineup so they walk into the break with a plan ready.

### Player insight (PLAYERVIEW)

- [ ] **PLAYERVIEW-01** (F3): Long-pressing a player shows their in-game breakdown — per-zone time, time since last sub, and a per-period breakdown — across all sports.
- [ ] **PLAYERVIEW-02** (F3): The same long-press summary shows the player's season per-zone split as percentages only (no raw minutes), across all sports.

### Match-day audio (AUDIO)

- [ ] **AUDIO-01** (B3): The team hype song keeps playing after Q1 on iOS — the audio element/context is re-armed after the OS suspends it (backgrounding / period transitions) so goals scored in later periods still trigger it.

## v1.1 Out of Scope

| Item | Reason |
|------|--------|
| New per-player game-time *minutes* surfacing in F3 season view | Decision: season view shows per-zone **percentages only**, no raw minutes |
| Persisting a per-player last-sub timestamp to the DB schema | B4's recency signal is derived from existing stint/swap events at replay time — no migration |
| Real-time multi-coach co-editing of the overridden rotation (F1) | Single-coach assumption preserved (carried over from v1.0 Out of Scope) |
| Reworking the YouTube-iframe song path beyond re-arming it (B3) | Fix scope is re-arming after suspension, not replacing the audio mechanism |

## v1.1 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONFIG-01 | Phase 8 | Pending |
| CONFIG-02 | Phase 8 | Pending |
| AVAIL-01 | Phase 9 | Pending |
| AVAIL-02 | Phase 9 | Pending |
| SUB-01 | Phase 10 | Pending |
| SUB-02 | Phase 10 | Pending |
| ROTPLAN-01 | Phase 11 | Pending |
| ROTPLAN-02 | Phase 11 | Pending |
| PLAYERVIEW-01 | Phase 12 | Pending |
| PLAYERVIEW-02 | Phase 12 | Pending |
| AUDIO-01 | Phase 13 | Pending |

**Coverage (v1.1):**
- Requirements: 11 total
- Mapped to phases: 11

---
*Requirements defined: 2026-04-29 (v1.0); 2026-06-01 (v1.1 Match Day Changes appended)*
*Last updated: 2026-06-01 — v1.1 requirements defined; traceability filled by roadmapper (phases 8–13)*
