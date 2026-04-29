# Phase 3: Branch merge + abstraction integrity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `03-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 03-branch-merge-abstraction-integrity
**Areas discussed:** Merge mechanic (target + style + tag preservation), Conflict-resolution order + cadence, D-06 + D-07 patching strategy. PROD-01..04 verification approach was offered but skipped — left as Claude's discretion.

---

## Merge mechanic — target branch

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh branch off `multi-sport` HEAD (`merge/multi-sport-trunk`) | Preserves D-01 cleanly: multi-sport is the trunk, main absorbs in. Merge command: `git merge claude/vibrant-banzai-a73b2f` (which captures both main source + Phase 1+2 planning). | ✓ |
| On this `claude/vibrant-banzai-a73b2f` worktree merging multi-sport in | Convenient (planning artifacts already here) but conceptually inverse of D-01. | |
| On the `multi-sport` worktree directly | Direct on canonical multi-sport branch. Trade-off: planning artifacts live elsewhere. | |

**User's choice:** Fresh branch off `multi-sport` HEAD.
**Notes:** Recorded as D-19 in CONTEXT.md. The exact branch name is Claude's discretion (suggested: `merge/multi-sport-trunk`).

---

## Merge mechanic — squash vs merge-commit (Phase 1 §9 deferred)

| Option | Description | Selected |
|--------|-------------|----------|
| Merge-commit preserving multi-sport's 74-commit history (`--no-ff`) | Keeps `git blame` accurate for every netball / abstraction commit. | ✓ |
| Squash-merge into a single trunk commit (`--squash`) | Loses fine-grained history; single megacommit on the trunk. | |

**User's choice:** Merge-commit (`--no-ff`).
**Notes:** Recorded as D-20 in CONTEXT.md. Phase 7's eventual fast-forward of `main` to the merged trunk is a separate operation (D-09: fast-forward only, no `--force`).

---

## Merge mechanic — `pre-merge/main` tag re-tag?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave `pre-merge/main` at `80a04eb` | Preserves the rollback baseline as the LAST commit of true production main code. | ✓ |
| Re-tag `pre-merge/main` to current `claude/vibrant-banzai-a73b2f` HEAD | Captures planning-included state but erases the historical baseline meaning. | |

**User's choice:** Leave at `80a04eb`.
**Notes:** Recorded as D-21 in CONTEXT.md. `pre-merge/multi-sport` similarly stays at `1277068`.

---

## Conflict-resolution order

| Option | Description | Selected |
|--------|-------------|----------|
| One-pass merge — all 6 conflicts resolved in single `git merge` operation | Single merge-commit on the trunk; matches D-20 history-preserving choice. | ✓ |
| Batched / staged merge — resolve in categories (server actions → shell files → components → live shell) | Easier regression localization; conflicts with single-merge-commit story. | |

**User's choice:** One-pass merge.
**Notes:** Recorded as D-22 in CONTEXT.md.

---

## Test cadence during the merge

| Option | Description | Selected |
|--------|-------------|----------|
| After each conflict resolved — `npx tsc --noEmit` only (fast); full gauntlet at end | Fast feedback at conflict resolution time; full Vitest + e2e meaningful only after merged state + db:reset. | ✓ |
| After each category batch | Only meaningful with batched merge (rejected). | |
| Only at the end | Single signal; harder to localize regressions across 6 conflicts. | |

**User's choice:** Tsc per conflict; full gauntlet after merge commit + db:reset.
**Notes:** Recorded as D-23 in CONTEXT.md. The Phase 2 e2e spec (currently expected red per D-12) flips green during the post-merge full gauntlet run.

---

## Unmapped-conflict handling

| Option | Description | Selected |
|--------|-------------|----------|
| Stop and document each surprise in `03-MERGE-LOG.md` before resolving (mirrors Phase 1 §8) | Slower but every resolution reviewable post-hoc per MERGE-03 / D-09. | ✓ |
| Continue resolving organically; flag in merge commit message | Faster but harder to review post-hoc. | |

**User's choice:** Stop and document.
**Notes:** Recorded as D-24 in CONTEXT.md. `03-MERGE-LOG.md` is a Phase 3 deliverable; structural template suggested in CONTEXT.md `<specifics>`.

---

## D-06 follow-through — `Team.age_group` patching pattern

| Option | Description | Selected |
|--------|-------------|----------|
| `SportConfig.ageGroups` lookup at the call site | Properly multi-sport. Each consumer becomes `getSportConfig(team.sport).ageGroups.find(...)`. | ✓ |
| Runtime guard helper `assertAflAgeGroup(s: string)` | AFL-only; not multi-sport friendly. | |
| Type cast `as AgeGroup` at call sites | Fastest to unblock tsc; loses type safety. Strongly not recommended. | |

**User's choice:** `SportConfig.ageGroups` lookup uniformly.
**Notes:** Recorded as D-25 in CONTEXT.md. Exact consumer list is unknown until `npx tsc --noEmit` runs post-merge — Phase 3 plan must include "discover via tsc, patch uniformly, re-run until clean" task.

---

## D-07 redirect scope

| Option | Description | Selected |
|--------|-------------|----------|
| Countdown banner | Visible to coach; ABSTRACT-03 explicit. | ✓ |
| Hooter end-of-quarter logic | Drives quarter-end event; ABSTRACT-03 explicit. | ✓ |
| Time-credit accounting in `liveGameStore.ts` | ABSTRACT-03 explicit; most invasive (multiple sites). | ✓ |
| Q-break time bars | ABSTRACT-03 explicit; bars depend on per-quarter duration. | ✓ |

**User's choice:** All four — full ABSTRACT-03 surface.
**Notes:** Recorded as D-26 in CONTEXT.md. The `liveGameStore.ts` redirect is flagged as the highest-risk single edit (CONCERNS.md fragile-area on the live-game state machine).

---

## D-07 redirect pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Direct call to `getEffectiveQuarterSeconds(team, ageGroup, game)` at each surface | Matches multi-sport's existing pattern; single source of truth; greppable for compliance. | ✓ |
| Compute once in LiveGame, pass via prop / context | Adds prop-drilling layer; inconsistent with multi-sport's at-each-surface idiom. | |
| Memoize via custom hook `useEffectiveQuarterSeconds()` | Adds an abstraction layer over a pure function; overkill. | |

**User's choice:** Direct call at each surface.
**Notes:** Recorded as D-27 in CONTEXT.md. Compliance verifiable via `grep -r 'getEffectiveQuarterSeconds' src/components/live/ src/lib/stores/` returning ≥4 hits post-merge.

---

## Skipped / deferred areas

- **PROD-01..04 verification approach** — Offered as a discussion area; user declined. Marked as Claude's discretion in CONTEXT.md `<decisions>`. Planner picks combinations of: per-feature smoke (run affected e2e specs), file-level grep audit (e.g. PlayHQ `test.fixme` preservation), diff audit against `pre-merge/main`. The Phase 2 spec flipping green is the implicit smoke for the merged netball UI.

## Claude's Discretion items recorded in CONTEXT.md

- Final merge branch name (suggested `merge/multi-sport-trunk`).
- PR strategy (default single PR; split only if review demands).
- `03-MERGE-LOG.md` formatting details (structural template suggested but planner finalises).
- Whether to insert human-checkpoints during the merge (recommended: at least one after the merge commit lands and before D-25/D-26 patching).
- Whether the Phase 2 e2e spec needs minor edits if locator strings need adjustment vs the real merged DOM (allowed — spec-fixing-itself is not scope expansion).

## Deferred Ideas

- PR strategy details — single vs split.
- Performance benchmark of perf wave 3 (Phases 6/7).
- `merge/multi-sport-trunk` branch deletion — Phase 7 cleanup.
- CI lint rule for "no AFL-baked-in conditionals outside `src/lib/sports/`" — backlog (post-milestone).
- `games.quarter_length_seconds` UI exposure in game-edit form — possibly v2.
- NetballGameSummaryCard polish — future milestone.
- Pause-event persistence (CONCERNS.md cross-cutting bug) — backlog.
- Audit log for game event mutations (CONCERNS.md cross-cutting feature) — backlog.
