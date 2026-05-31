# Phase 8 — Discussion Log

**Date:** 2026-06-01
**Mode:** discuss (config: workflow.discuss_mode = "discuss")
**Outcome:** `08-CONTEXT.md` written; ready for planning.

## Gray areas presented (multiSelect)

Phase 8 is mostly mechanical (centralize period literals + add a config field),
so four gray areas were surfaced where the *how* wasn't pre-decided:

1. **AFL LiveGame prop shape** — full `ageGroup` object vs scalar `periodCount`.
2. **fairness.ts period source** — what length feeds the season full-period threshold.
3. **subIntervalFloorSeconds shape** — optional+central-default vs required-per-age-group; how much of F4 is in scope.
4. **Verification strategy** — unit-only vs e2e vs both, given the literals are correct-by-coincidence today.

**User selected to discuss:** 2, 3, 4.
**Skipped (recommended default applied):** 1 → pass the full `ageGroup` object
into `LiveGame.tsx` to align all three live components (CLAUDE.md cross-sport
consistency). Recorded as D-01.

## Decisions (each went AGAINST the recommended default — deliberate)

| Area | Options offered | User chose | Recorded as |
|------|-----------------|------------|-------------|
| fairness.ts period source | (rec) optional param + age default · required param everywhere · **use per-game effective length** | **Use per-game effective length** — season threshold tracks this game's actual clock incl. per-game/team overrides | D-02..D-04 |
| subIntervalFloor shape | (rec) optional field + central 240s default · **required on every age group** · define field + F4 calc now | **Required on every age group**, explicit `240`, no central fallback constant; F4 calc stays in Phase 10 | D-05..D-06 |
| Verification | (rec) extract helper + unit test · **add a 2-period e2e too** · tsc + existing suite only | **Both** — pure helper unit test (periodCount 4 AND 2) PLUS a 2-period rugby-league e2e through the period boundary | D-07..D-11 |

## Key nuance captured for the planner

The `>= 4` literals live in AFL/netball live components that only ever render
4-period sports; rugby league (2 periods) uses `LeagueLiveGame.tsx` (already
correct). So the e2e exercises the league path + shared page booleans, NOT the
refactored AFL/netball literals — the **pure-helper unit test at periodCount=2**
is what proves the AFL/netball refactor. Both are required; the e2e is not
sufficient alone. (Documented in CONTEXT.md → Existing Code Insights.)

## Scout findings beyond the original recon

Two additional CONFIG-01 targets the original recon missed, both with
`periodCount` already in scope:
- `live/page.tsx:496` (netball branch sticky-bar `currentQuarter < 4`)
- `live/page.tsx:659` (AFL branch sticky-bar `currentQuarter < 4`)

---

*Phase: 08-sport-agnostic-period-foundation*
