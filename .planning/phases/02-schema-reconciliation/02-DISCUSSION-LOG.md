# Phase 2: Schema reconciliation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `02-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 02-schema-reconciliation
**Areas discussed:** Migration de-dup mechanic, e2e spec scope, e2e spec deliverable location, SCHEMA-04 boundary, Spec surfaces, Phase 2 source-tree boundary, Artifact location

---

## Migration de-dup mechanic (D-05 follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Delete main's `0024_super_admin.sql` in the merge | Cleanest repo state. Multi-sport's `0025_super_admin.sql` is the canonical record. The 0024 number is reused for `0024_multi_sport.sql` in the trunk. | ✓ |
| Keep as a documented no-op file | Rename to `0024a_super_admin_skipped.sql` with header comment. Slightly more traceability. Trade-off: extra dead file in `supabase/migrations/`. | |

**User's choice:** Delete in the merge.
**Notes:** Hash equality verified at branch HEADs (`main@80a04eb`, `multi-sport@1277068`): both `0024_super_admin.sql` and `0025_super_admin.sql` are sha256 `1761d40…`. Recorded as D-10 in CONTEXT.md.

---

## e2e spec scope (SCHEMA-03)

| Option | Description | Selected |
|--------|-------------|----------|
| One spec, journey-level for both sports | Single new spec, two test cases (AFL wizard + netball wizard), team-settings round-trip. ~150-200 lines. | ✓ |
| Minimum smoke: one column per assertion | Three tiny tests. Faster but less faithful to a real coach flow. | |
| Full coverage including all `track_scoring=false` suppression surfaces | Journey spec PLUS dedicated suppression spec. Drags NETBALL-04 / Phase 4 work into Phase 2. | |

**User's choice:** One journey-level spec for both sports.
**Notes:** Recorded as D-13 in CONTEXT.md. Surfaces narrowed to wizard + team-settings quarter-length round-trip in the second-pass question (D-14, D-15).

---

## e2e spec deliverable location

| Option | Description | Selected |
|--------|-------------|----------|
| Write spec on this worktree as part of Phase 2 plan; defer running until Phase 3 | Spec authored against post-merge contract. Committed on `claude/vibrant-banzai-a73b2f` but not expected green until Phase 3. | ✓ |
| Write and run spec on the multi-sport worktree | Author and validate green on multi-sport (where netball UI exists). Pro: spec is proven before Phase 3. Con: writes to multi-sport branch outside this worktree. | |
| Write spec twice — stub here, real on multi-sport | Strictly more work for marginal benefit. | |

**User's choice:** Write on this worktree, defer running.
**Notes:** Recorded as D-12 in CONTEXT.md. The Phase 2 plan's `verification` block will explicitly note `npm run e2e` is expected to fail for this spec on this branch — Phase 3 verification flips it green.

---

## SCHEMA-04 boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 covers migration-content side only; rest is Phase 6 | Phase 2 verifies (via code-read) no destructive ops, no breaking RLS, transactional backfill. Live "queryable through merged code" is Phase 6's prod-clone preview. | ✓ |
| Phase 2 also runs a local prod-shape simulation | Seed local DB with main-shaped data, apply multi-sport migrations, assert. Stronger evidence but significant fixture engineering. | |
| Defer fully to Phase 6 prod-clone validation | Phase 2 doesn't touch SCHEMA-04. Risk: Phase 6 surfaces a too-late problem. | |

**User's choice:** Migration-content side here, prod-clone validation in Phase 6.
**Notes:** Recorded as D-16 / D-17 in CONTEXT.md. CONTEXT.md §"Specific Ideas" lists the exact Phase 6 acceptance criteria so they don't get dropped on the handoff.

---

## Spec surfaces (multi-select follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Setup wizard: create AFL team + create netball team | Two test cases. Verifies sport set on creation, default `track_scoring` lands per migration default for AFL and per netball wizard for netball. | ✓ |
| Team settings: round-trip `quarter_length_seconds` | Edit team → set custom → reload → verify persisted. Hits per-team override (0026). | ✓ |
| Game edit: round-trip `games.quarter_length_seconds` | Per-game override (0027). Smaller surface; absence means a column without a UI test in this milestone. | |
| Live screen: `track_scoring=false` suppresses score buttons on netball | Confirms the gate works through actual live UI. Overlaps NETBALL-04 / Phase 4. | |

**User's choice:** Setup wizard for both sports + team-settings round-trip. Game-edit and live-screen suppression deferred.
**Notes:** Recorded as D-14 / D-15 in CONTEXT.md. The deferred items are tracked in CONTEXT.md `<deferred>`.

---

## Phase 2 source-tree boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Document-only on this branch; physical rename happens during Phase 3 merge | Phase 2 produces `02-SCHEMA-PLAN.md`. `supabase/migrations/` not modified on this worktree. Preserves the merge as the single moment migrations are reconciled. | ✓ |
| Phase 2 also performs the rename/delete on this branch | Strongly not recommended. Bypasses the merge; produces 'main' branch state that lies about its history. | |

**User's choice:** Document-only.
**Notes:** Recorded as D-11 in CONTEXT.md. The e2e spec source file IS allowed to be written on this branch (D-12) — that's a separate concern from the migrations tree.

---

## Artifact location

| Option | Description | Selected |
|--------|-------------|----------|
| New `02-SCHEMA-PLAN.md` in Phase 2's directory | Self-contained Phase 2 deliverable. Idiomatic GSD. | ✓ |
| Extend Phase 1's `01-MERGE-NOTES.md` with a Phase 2 addendum | One-place inventory but mutates Phase 1's deliverable post-completion. | |

**User's choice:** New `02-SCHEMA-PLAN.md`.
**Notes:** Recorded as D-18 in CONTEXT.md. Suggested section structure listed in CONTEXT.md `<decisions>` "Claude's Discretion".

---

## Claude's Discretion

- Final filename for the new e2e spec (suggested `e2e/tests/multi-sport-schema.spec.ts`, planner picks).
- Whether `e2e/fixtures/factories.ts` needs extending — depends on multi-sport's `makeTeam` signature.
- Whether to read multi-sport branch source while authoring the spec — yes, cross-worktree reads are expected.
- Format / section structure of `02-SCHEMA-PLAN.md` — markdown with the suggested sections, planner finalizes.

## Deferred Ideas

- `games.quarter_length_seconds` UI test — possibly a Phase 5 follow-up.
- `track_scoring=false` suppression surfaces — Phase 4 / NETBALL-04.
- Squash-merge vs merge-commit during Phase 3 — still Phase 3's call.
- Game-edit form exposure of per-game quarter override — UI scope, possibly v2.
- Per-sport default for `teams.track_scoring` — Not in this milestone.
- CI lint that flags duplicate migration numbers — follow-up milestone.
