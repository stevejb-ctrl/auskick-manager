# Siren

## What This Is

Siren is a mobile-first PWA that helps junior-sport coaches run a fair live game and produce a clean post-game summary, originally built for AFL Auskick (U10s) and now being extended to netball. The product is opinionated about fairness — equal time, equal positions, equal opportunity — and ruthless about live-game ergonomics so coaches can manage substitutions and scoring with one hand on a phone while the game is happening.

## Core Value

Live-game time-on-ground fairness must be effortless and trustworthy: coaches who use Siren must end every match confident every kid got their fair share, and exit with a polished group-chat summary they can paste in seconds.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from current production codebase. -->

- ✓ AFL Auskick live-game flow with rolling subs, fairness suggester, long-press actions, late-arrival, injury replacement, live swaps — existing prod
- ✓ Quarter-break reshuffle UI with field zones, time bars, fairness header — existing prod
- ✓ Goal scoring + opponent scoring + 8-second undo — existing prod
- ✓ AFL stats dashboard (player stats, minutes equity, chemistry, head-to-head, attendance) — existing prod
- ✓ Game summary card with copyable group-chat text — existing prod
- ✓ Setup wizard, team settings, squad management, player availability — existing prod
- ✓ Supabase auth + RLS, multi-coach team membership, share tokens — existing prod
- ✓ Playwright e2e suite + Vitest unit tests as the contract for "done" — existing prod
- ✓ Vercel deployment + Supabase cloud as the production substrate — existing prod

### Active

<!-- Current milestone: Multi-sport merge to production. -->

- [ ] Single trunk on `main` containing both production-side enhancements (60 commits since fork point `b3657c5`) and the multi-sport branch's full netball MVP (74 commits)
- [ ] Netball capability shipped to production: live game, quarter-break, scoring, stats dashboard, summary card, walkthrough — all gated correctly by `teams.sport`
- [ ] Schema reconciled: migrations 0024–0026 from multi-sport applied without colliding with anything `main` has shipped since fork; existing AFL teams backfilled to `teams.sport = 'afl'`
- [ ] Per-team `track_scoring` and `quarter_length_seconds` overrides surfaced in setup wizard + team settings, gated to applicable sports
- [ ] Sports abstraction (`src/lib/sports/`) is the single dispatch point for sport-specific logic, replacing AFL-baked-in assumptions throughout the live-game / stats / summary surfaces
- [ ] Production-side e2e fixes (long-press, lineup availability, TagManager temp-id, injury-replacement, live-swaps, live-scoring) preserved through the merge — no regressions
- [ ] Performance wave 3 changes (static marketing + auth, DB indexes, spinners) preserved through the merge
- [ ] Preview-deploy validation against a clone of prod Supabase before fast-forwarding `main`
- [ ] Full test green: `npm test`, `npm run e2e`, `npx tsc --noEmit`, `npm run lint`
- [ ] Test team Kotara Koalas (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`) survives the merge as a seed for ongoing netball validation

### Out of Scope

<!-- Explicit boundaries for THIS milestone. -->

- Additional sports beyond AFL and netball (no soccer, basketball, rugby) — netball MVP is the second sport; further sports come later once the abstraction is proven
- Real-time multi-coach co-scoring / co-managing during a live game — would require subscriptions/push channels we haven't designed; current single-coach assumption is preserved
- Tournament / fixture / ladder structure — Siren stays a per-team coach tool, not a league management platform
- New stats metrics / analytics surfaces — we ship what multi-sport already built; no new dashboard work in this milestone
- iOS/Android native apps — PWA stays the only client surface
- PlayHQ live-import — stays fixme'd per `chore(e2e): document why playhq-import stays fixme'd (architecture)` (commit `e9bbc47`); architectural rework is a separate milestone

## Context

**Two parallel branches:**
- `main` (60 commits ahead of fork point `b3657c5`): production AFL-only with recent enhancements — e2e un-fixme work (long-press, lineup availability, TagManager temp-id, injury-replacement specs, live-swaps, live-scoring), perf wave 3 (static marketing + auth, DB indexes, spinners), UX (back-arrow removal from authenticated header), bug fixes.
- `multi-sport` (74 commits ahead of fork point, in worktree at `.claude/worktrees/multi-sport`): full netball MVP. Sports abstraction under `src/lib/sports/netball/{index,fairness,actions}.ts`. Components under `src/components/netball/` (NetballLiveGame, NetballQuarterBreak, NetballGameSummaryCard, NetballBenchStrip, NetballPlayerActions, NetballLineupPicker, PickReplacementSheet, Court, PositionToken, netballWalkthroughSteps). Dashboard via `src/components/dashboard/NetballDashboardShell.tsx` + `src/lib/dashboard/netballAggregators.ts`. Server actions at `src/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions.ts`. Migrations 0024 (sport column), 0025 (track_scoring), 0026 (per-team quarter override).

**Notable engineering details from multi-sport worth preserving:**
- Wall-clock-anchored countdown (`Date.now() − Date.parse(quarterStartedAt)`) replaces an earlier `+= 500ms` ticker that lost time when tabs were backgrounded.
- Hooter single-fire via ref to prevent double-`endQuarter` writes.
- Tier-4 friend-pair split magnitude bumped −200 → −5,000 to actually outvote tier-2/3 ties.
- Sort-key bug fix: use `thisGameTotalMs` (numeric ms) not game count, so a player with 1 minute on court doesn't get suggested over a player with a full quarter.
- Locked-but-sidelined players filtered from suggester candidate pool.
- Late-arrivals unioned from `player_arrived` events so a stale availability row can't shadow them.
- Fill-ins treated as implicitly available (FK to players rejects them via `game_availability`).
- 153/153 vitest green on multi-sport; new `netballWalkthroughSteps.test.ts` pins the scoring-step gate; `netballFairness.test.ts` covers all 5 tiers + clumping scenarios.

**Codebase intel:** Already mapped at `.planning/codebase/` (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS) — see those for stack/architecture/concerns details.

**Test team for hand-off:** Kotara Koalas (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`), netball, "Go" age group, 9 active players, 5 simulated games seeded for stats verification.

## Constraints

- **Tech stack**: Next.js 14.2.29, React 18, Zustand 5, Supabase (`@supabase/supabase-js` 2.45.4 + `@supabase/ssr` 0.5.2), Tailwind 3, TypeScript 5 strict — locked. No new framework introductions in this milestone.
- **Deployment**: Same Vercel project, same Supabase project (no fresh deploy, no parallel prod). Schema must migrate forward in place against existing AFL data.
- **Data preservation**: Existing AFL production teams, players, games, events must survive the merge intact. `teams.sport` backfilled to `'afl'` for every existing row.
- **Test discipline (CLAUDE.md)**: Bug fixes need a regression test that fails first then goes green. Schema migrations need an e2e spec exercising the new column/table through the UI. `npm test`, `npm run e2e`, `npx tsc --noEmit` must all pass before any merge to `main`.
- **Mobile-first**: All UI changes validated at Pixel 7 viewport (Playwright default device).
- **One-handed live-game ergonomics**: Any new control or affordance on the live-game surface must be reachable + tappable while holding the phone in one hand and watching the game with the other eye.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Multi-sport branch becomes the new trunk; pull main's 60 commits in via merge/rebase | Sports abstraction is a structural change. Cherry-picking 74 commits onto main would tear it apart. Cleaner conflict surface to absorb 60 commits into restructured tree than to rebuild structure 74 commits at a time. | — Pending |
| Backfill `teams.sport = 'afl'` for all existing teams in the migration | Prod has only ever been AFL; assumption is safe. Avoids per-user action and avoids any code path hitting null sport. | — Pending |
| Stage on a Vercel preview deploy against a clone of prod Supabase before fast-forwarding `main` | Catches data-shape surprises (RLS, share tokens, existing event rows) that local e2e against fresh seed won't surface. One extra phase, much smaller blast radius. | — Pending |
| Same Vercel + Supabase project; no fresh deploy | User explicitly chose "same repo, new main" target. Avoids data migration overhead and keeps existing share links working. | — Pending |
| GSD config: balanced models, standard granularity, parallel execution, YOLO mode, plan_check on, verifier on, research off | Brownfield merge work — domain research adds little; codebase rigor matters more. | ✓ Set |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-29 after initialization (milestone: Multi-sport merge to production)*
