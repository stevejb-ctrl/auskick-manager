# Phase 4: Netball verification on merged trunk - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning
**Mode:** Auto-decided (--auto, recommended defaults locked)

<canonical_refs>
## Canonical References

Downstream agents (researcher, planner, executor) MUST read these:

- `.planning/REQUIREMENTS.md` — NETBALL-01..08 acceptance gates
- `.planning/ROADMAP.md` — Phase 4 boundary, success criteria
- `.planning/phases/03-branch-merge-abstraction-integrity/03-MERGE-LOG.md` §6 — Phase 4 hand-off block: merge target branch (`merge/multi-sport-trunk`), HEAD `bd8761f`, recommended branch strategy, three side-findings deferred
- `.planning/phases/03-branch-merge-abstraction-integrity/03-06-SUMMARY.md` — final Phase 3 audit artefact
- `CLAUDE.md` (project root) — testing-is-part-of-done rule, schema-migration spec rule
- `e2e/README.md` — when-to-add-a-test table
- `src/lib/sports/netball/` — netball sport-config (fairness tiers, period rules)
- `src/components/netball/` — NetballLiveGame, NetballQuarterBreak, NetballGameSummaryCard, NetballPlayerActions, etc.
- `src/lib/__tests__/netballFairness.test.ts` — Vitest contract for NETBALL-02 fairness tier ordering
- `src/components/netball/netballWalkthroughSteps.ts` + its sibling `*.test.ts` — NETBALL-07 walkthrough coverage
- `e2e/tests/multi-sport-schema.spec.ts` — Phase 2's spec that proves columns exist; NOT a flow spec
- `e2e/fixtures/factories.ts` — `makeTeam({ sport: 'netball', track_scoring? })` factory wired in Phase 2

</canonical_refs>

<domain>
## Phase Boundary

Verify every netball capability from the multi-sport branch works correctly on the merged trunk. Coaches must be able to run a full netball game from lineup → live → quarter-break rotation → live → finalise → summary card, with both `track_scoring=true` and `track_scoring=false` paths working, walkthrough firing on first visit, and stats dashboard rendering correctly with no AFL/netball aggregator cross-contamination.

**Branch:** All Phase 4 source modifications happen on `merge/multi-sport-trunk` (current HEAD `bd8761f`). Planning artefacts on the planning worktree continue mirroring per the established Phase 3 pattern.

**NOT in scope:**
- Branch hygiene / fast-forwarding `multi-sport` to merge trunk (deferred to Phase 7)
- Pause-event persistence bug (cross-cutting, deferred per CONTEXT D-of Phase 3)
- ABSTRACT-01 CI guard (backlog)
- v2 features (soccer, basketball, co-coaching)

</domain>

<decisions>
## Implementation Decisions

### Verification approach (gray area #1)
**LOCKED:** Combination — automated Playwright e2e specs for deterministic flows (walkthrough firing, `track_scoring=false` suppression, undo timing, fairness tier ordering, scoring confirm sheet → DB write) PLUS targeted Vitest contracts for any pure-function netball logic not already covered by `netballFairness.test.ts` / `netballWalkthroughSteps.test.ts`. NO manual-only verification — every NETBALL-N must have at least one automated assertion.
**Why:** code is already written and shipping on multi-sport branch. Phase 4's job is regression confidence on the merged trunk, not greenfield TDD. Automated coverage is what unblocks Phase 5's "test + type green" gate.

### Test coverage scope (gray area #2)
**LOCKED:** New netball-specific Playwright specs, one or two per major NETBALL capability cluster. Existing AFL specs stay unchanged (already proven green in Phase 3 Plan 03-05). Re-use `e2e/fixtures/factories.ts:makeTeam({ sport: 'netball' })` for spec-local team creation. Re-use `auth.setup.ts` for admin login.
**Why:** isolating netball-specific specs means a netball-only regression flags clearly without polluting AFL specs. AFL coverage is already saturated; doubling it adds no signal.

### Failure handling (gray area #3)
**LOCKED:** Bugs blocking any NETBALL-N acceptance criterion get fixed in-Phase. Non-blocker UI polish (e.g., minor copy / spacing / colour) gets captured as deferred ideas and rolled into Phase 5 hygiene plan. Cross-cutting bugs (e.g., pause-event persistence flagged in Phase 3 CONTEXT) stay deferred.
**Why:** the milestone exists to ship netball to production. Anything blocking that is in-scope; pure polish is not.

### Seed data strategy (gray area #4)
**LOCKED:** Two-tier:
1. **Kotara Koalas** (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`, netball, "Go") — verify presence via `select` on local DB at the start of Phase 4 (TEST-05 acceptance). If absent, re-seed via the netball-specific seed pathway. Use for season-history-dependent assertions (NETBALL-02 fairness tiers depend on prior-game data).
2. **Fresh `factories.makeTeam({ sport: 'netball' })`** — for spec isolation. Each spec creates and tears down its own team to avoid cross-spec coupling. Phase 2's factory work makes this trivial.
**Why:** Kotara Koalas exercises realistic multi-game history; fresh teams keep specs deterministic.

### Track-scoring matrix (gray area #5)
**LOCKED:** Both `track_scoring: true` and `track_scoring: false` paths covered for every surface NETBALL-04 names: walkthrough (scoring step shown vs dropped), live shell (`+G` shown vs hidden, score numbers shown vs hidden), summary card ("def/drew with" + "Goals:" lines suppressed when false), long-press (always opens regardless of `track_scoring`).
**Why:** NETBALL-04 is a hard acceptance gate; both branches must pass.

### Stats dashboard coverage (gray area #6)
**LOCKED:** Dedicated `e2e/tests/netball-stats.spec.ts` — creates a netball team with at least one finalised game, navigates to `/stats`, asserts all 5 sections render with per-position breakdown, and asserts AFL-flavoured aggregator output (e.g., quarter-time data) does NOT appear (NETBALL-05 dispatch correctness).
**Why:** stats is route + render — easier to isolate and re-run than embedding inside a flow spec.

### Hand-off side-finding triage (gray area #7)
**LOCKED:**
- **Side-finding #1 (Playwright artefact dirs untracked):** address inline in Phase 4 — single `.gitignore` update is trivial and prevents accidental commits during Phase 4 spec authoring.
- **Side-finding #2 (stale-dev-server detection):** push to Phase 5 — proper fix is a script-level guard with `lsof` / port detection that's better scoped to test-infra hygiene.
- **Side-finding #3 (admin-membership hydration helper):** push to Phase 5 — Playwright fixture refactor that touches three existing specs; doesn't block netball verification.
**Why:** Phase 4's blast radius stays focused on netball flows. Test-infra refactors land in Phase 5 alongside the full-gauntlet green sweep.

### Walkthrough localStorage cleanup (NETBALL-07 spec hook)
**LOCKED:** Each netball-flow spec MUST clear `nb-walkthrough-seen` from localStorage at start (or use a fresh browser context) so the walkthrough fires deterministically. Pattern: `await page.addInitScript(() => localStorage.removeItem('nb-walkthrough-seen'))` before navigation.
**Why:** without this, only the first run of any spec sees the walkthrough; subsequent runs skip it silently.

### Quarter-length override coverage
**LOCKED:** At least one netball spec exercises a non-default `team.quarter_length_seconds` value (e.g., 8 minutes instead of 12), and at least one exercises `game.quarter_length_seconds` overriding the team value. Both paths exercise `getEffectiveQuarterSeconds` priority chain (game → team → ageGroup default) per ABSTRACT-03.
**Why:** Phase 3 Plan 03-04 wired `quarterMs` end-to-end; Phase 4 is the first place that actually exercises a netball game with a custom quarter length under the new wiring.

### Test scaffolding boundary
**LOCKED:** Phase 4 may add Playwright fixtures, helper functions, or test utilities under `e2e/fixtures/` and `e2e/helpers/` (or equivalent). Source code in `src/` is touched ONLY to fix bugs blocking NETBALL-N — no refactors-of-opportunity, no abstraction tightening that could be its own phase.
**Why:** keeps Phase 4 scope focused; refactors get their own phase if warranted.

</decisions>

<code_context>
## Existing Code Insights

**Netball component surface** (`src/components/netball/`):
- `NetballLiveGame.tsx` — live shell (six-state state machine: pre-kickoff, pre-Q1, live, Q-break, between-Q4-and-finalise, finalised)
- `NetballQuarterBreak.tsx` — rotation suggestions (5 fairness tiers per NETBALL-02)
- `NetballPlayerActions.tsx` — long-press actions modal (NETBALL-08)
- `NetballGameSummaryCard.tsx` — copyable group-chat text with track_scoring gates (NETBALL-04, NETBALL-06)
- `NetballBenchStrip.tsx` — bench display with per-player goal counts (NETBALL-03)
- `PickReplacementSheet.tsx` — mid-quarter replacement (NETBALL-08)
- `LineupPicker.tsx`, `Court.tsx`, `PositionToken.tsx` — lineup affordances
- `netballWalkthroughSteps.ts` — first-visit walkthrough config (NETBALL-07)

**Sports abstraction** (`src/lib/sports/`):
- `registry.ts`, `index.ts`, `types.ts` — dispatch entry points
- `afl/`, `netball/` — per-sport configs
- `getEffectiveQuarterSeconds(team, ageGroup, game)` resolves quarter length (ABSTRACT-03 — verified Phase 3)

**Test infrastructure** (`e2e/`):
- `fixtures/factories.ts:makeTeam` — Phase 2 widened to accept `sport` + string `ageGroup`; supports netball
- `auth.setup.ts` — admin login flow re-used by all specs
- `tests/multi-sport-schema.spec.ts` — Phase 2's column-exists proof (NOT a flow spec; do not extend)
- `tests/live-*.spec.ts` (full-time, quarters, scoring, swaps) — AFL flow patterns to model netball specs after
- `tests/playhq-import.spec.ts` — PROD-04 fixme MUST stay fixme (DO NOT "fix")

**Vitest contracts** (`src/lib/`):
- `__tests__/netballFairness.test.ts` — fairness tier ordering (covers NETBALL-02 logic; do not duplicate in e2e)
- `netballWalkthroughSteps.test.ts` (sibling to component) — walkthrough step config (covers NETBALL-07 step-drop logic)

**Live-game wiring delivered by Phase 3:**
- `LiveGame.tsx` — accepts `quarterMs` prop (Plan 03-04)
- `liveGameStore.ts:endCurrentQuarter(quarterMs)` — capped stint accumulation (Plan 03-03)
- `live/page.tsx` — both AFL and netball branches compute `quarterMs` via `getEffectiveQuarterSeconds` and thread it down

**Hand-off invariants from Phase 3:**
- `pre-merge/main` and `pre-merge/multi-sport` tags MUST stay frozen
- PROD-04 fixme guard: `e2e/tests/playhq-import.spec.ts` keeps `test.fixme`
- ABSTRACT-01 4 UI-presentation matches are pre-classified as acceptable; do not refactor

</code_context>

<specifics>
## Specific Ideas

- **Add `e2e/tests/netball-live-flow.spec.ts`:** NETBALL-01 + NETBALL-03 + NETBALL-04 (flow with `track_scoring=true` + flow with `track_scoring=false`)
- **Add `e2e/tests/netball-quarter-break.spec.ts`:** NETBALL-02 (rotation suggestions, fairness tier ordering as observed end-to-end, tie-breaks)
- **Add `e2e/tests/netball-walkthrough.spec.ts`:** NETBALL-07 (first-visit fire, `nb-walkthrough-seen` persistence, scoring step gate)
- **Add `e2e/tests/netball-stats.spec.ts`:** NETBALL-05 (dashboard sections + AFL aggregator non-leak)
- **Add `e2e/tests/netball-summary.spec.ts`:** NETBALL-06 (copyable text rendering, track_scoring gates re-verified end-to-end)
- **Add `e2e/tests/netball-actions.spec.ts`** OR fold into `netball-live-flow.spec.ts`: NETBALL-08 (long-press, mid-quarter replacement, late-arrival)
- **`.gitignore` update:** add `playwright-report/`, `playwright/`, `test-results/` (side-finding #1 from Phase 3 hand-off)
- **Kotara Koalas presence check:** seed re-validation step, possibly as a `vitest` data-integrity check or part of one e2e spec setup

</specifics>

<deferred>
## Deferred Ideas

| Idea | Reason | Target |
|------|--------|--------|
| Pause-event persistence bug fix | Cross-cutting; deferred per Phase 3 CONTEXT.md | Future milestone |
| Stale-dev-server detection in `scripts/e2e-setup.mjs` | Test-infra; better scoped to Phase 5 hygiene | Phase 5 |
| `await waitForAdminHydration(page)` Playwright fixture | Test-infra refactor; touches three existing specs | Phase 5 |
| ABSTRACT-01 CI guard (grep rule) | Backlog; out of milestone | v2 / future |
| PROD-04 CI guard (fixme presence check) | Backlog; out of milestone | v2 / future |
| `games.quarter_length_seconds` UI exposure in game-edit form | UX polish, not blocking netball acceptance | v2 |
| Performance benchmarking of perf wave 3 (PROD-02 quantitative) | Phase 6 / 7 | Phase 6/7 |
| Audit log for game event mutations | Backlog per CONCERNS.md | Future milestone |

</deferred>

<open_questions>
## Open Questions for Researcher / Planner

- Confirm whether the netball flow needs Supabase RLS coverage validation (or if Phase 3's RLS audit on the share-token / runner-token surface already covers netball games of the same shape).
- Confirm whether `track_scoring=false` testing requires creating teams with that flag set at insert time, or if toggling via team-settings UI mid-spec is preferred (probably both: one fresh-with-flag spec + one toggle-flag spec).
- Confirm Kotara Koalas data: 5 games, 9 active players. If the local DB lost it during Phase 3's `db:reset` cycles, the seed script needs to be located / re-run.

</open_questions>
