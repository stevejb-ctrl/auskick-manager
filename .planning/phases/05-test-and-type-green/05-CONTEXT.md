# Phase 5: Test + type green - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning
**Mode:** Auto-decided (--auto, recommended defaults locked)

<canonical_refs>
## Canonical References

Downstream agents (researcher, planner, executor) MUST read these:

- `.planning/REQUIREMENTS.md` — TEST-01..05 acceptance gates
- `.planning/ROADMAP.md` — Phase 5 success criteria (5 must-haves)
- `.planning/phases/04-netball-verification-on-merged-trunk/04-EVIDENCE.md` — TEST-01..04 already met by Phase 4's gauntlet (proof: 169/169 vitest + 51 e2e + tsc + lint all green)
- `.planning/phases/04-netball-verification-on-merged-trunk/04-07-SUMMARY.md` — Phase 5 hand-off table (TEST-05 absent + 3 deferred items + 2 deferred side-findings)
- `.planning/phases/04-netball-verification-on-merged-trunk/04-CONTEXT.md` — D-CONTEXT-side-finding-triage decision (#2 + #3 routed to Phase 5)
- `e2e/helpers/seed-audit.ts` — Plan 04-01's auditKotaraKoalas helper (returns `{ present: false }` on local DB)
- `scripts/e2e-setup.mjs` — target for side-finding #2 (stale-dev-server detection)
- `e2e/tests/settings.spec.ts`, `roster.spec.ts`, `game-edit.spec.ts` — three specs that carry the same admin-membership hydration boilerplate (target for side-finding #3 helper extraction)
- `supabase/seed.sql` — currently `select 1;` (no Kotara seed); decision boundary for TEST-05
- `CLAUDE.md` — testing-is-part-of-done rule, regression-test-first rule

</canonical_refs>

<domain>
## Phase Boundary

Achieve a fully-green automated quality gate on the merged trunk and close out the test-infra deferred items so future contributors don't trip the same hydration-race / stale-dev-server / Kotara-absent traps. The "green-bar" is already established by Phase 4's gauntlet; Phase 5's job is to (a) lock that green-bar in as the canonical Phase 5 evidence and (b) clean up the test-infra debt.

**NOT in scope:**
- Production deployment (Phase 6 owns Vercel preview + manual validation; Phase 7 owns prod cutover)
- Pause-event persistence bug (cross-cutting; deferred per Phase 3 CONTEXT)
- ABSTRACT-01 / PROD-04 CI guards (backlog)
- Refactoring NetballLiveGame state-machine (FRAGILE; out of milestone)
- Adding new feature behaviour (this is a hardening phase)

</domain>

<decisions>
## Implementation Decisions

### TEST-05 Kotara Koalas seeding (gray area #1)
**LOCKED:** Author a netball seed pathway that creates the Kotara Koalas seed (`5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11`, "Go", 9 players, 5 simulated games per TEST-05). Two acceptable implementations:
- **Option A (preferred):** Append a Kotara-Koalas insertion block to `supabase/seed.sql` so `db:reset` populates it automatically. Simplest; aligns with existing seed pattern.
- **Option B (fallback):** A standalone `scripts/seed-kotara-koalas.mjs` callable from `npm run db:reset:netball` or similar. Used if Option A introduces complexity (e.g., RLS issues with `select 1;` style).

The existing `auditKotaraKoalas()` helper stays — Phase 4's `test.skip`-when-absent gate becomes a no-op once the seed lands, but the helper remains useful for future contributors running fresh DBs.
**Why:** TEST-05 is an explicit acceptance gate in REQUIREMENTS.md and the milestone audit will check it. Phase 4's hand-off explicitly named this as the Phase 5 owner. Real seed > "covered in spirit by audit" — the latter is a documentation paper-over.

### Side-finding #2: stale-dev-server detection in scripts/e2e-setup.mjs (gray area #2)
**LOCKED:** Add a port-3000 detection guard at the top of `scripts/e2e-setup.mjs` that:
- If port 3000 is already serving (existing dev server detected): log + reuse via Playwright's `reuseExistingServer: !process.env.CI` config (already set in `playwright.config.ts`).
- If port 3000 is occupied by something else (non-dev process): abort with a clear error message naming the PID + suggested kill command.
- Cross-platform: Use `net.createServer().listen(3000)` probe instead of `lsof` (which doesn't exist on Windows; Phase 4 ran on Windows per env signals).

**Why:** Plan 04-06 + 04-07 surfaced cold-compile races during full e2e runs; the workaround was `--workers=1`, which doubles wall-clock time. Detecting + reusing an existing dev server eliminates the cold-compile path entirely.

### Side-finding #3: admin-membership hydration helper (gray area #3)
**LOCKED:** Extract the `await expect(switch).toBeEnabled({ timeout: 5_000 })` pattern (currently duplicated across `e2e/tests/settings.spec.ts`, `roster.spec.ts`, `game-edit.spec.ts`) into a Playwright helper:
- File: `e2e/helpers/admin-hydration.ts`
- Export: `waitForAdminHydration(page: Page, opts?: { timeout?: number }): Promise<void>` — waits for any element with role=switch to be enabled, plus a brief settle delay
- Update the three call-site specs to import + use the helper
- Add JSDoc explaining the race (admin membership hydration is async; switches are disabled until membership resolves)

**Why:** Three specs duplicating the same fragile pattern is a smell + a future-contributor trap. A single helper centralizes the rationale (a comment block in the helper file) and lets future spec authors get the guard for free.

### Deferred from Phase 4: revalidatePath gap (gray area #4)
**LOCKED:** Land the revalidatePath fix:
- File: `src/lib/actions/netball-actions.ts` (or wherever `endNetballQuarter` / `startNetballQuarter` / `periodBreakSwap` live)
- Add `revalidatePath` calls for non-final-quarter endNetballQuarter and startNetballQuarter onStarted
- Verify by removing the `page.reload()` workaround from `e2e/tests/netball-quarter-break.spec.ts` and `netball-live-flow.spec.ts` ABSTRACT-03 tests; assert spec stays green

**Why:** Production users navigate via Next.js naturally so they don't see the gap, BUT the spec workaround is technical debt. Real fix is small (one or two `revalidatePath` calls); cleanup is an afternoon's work.

### Deferred from Phase 4: router.refresh gap (gray area #5)
**LOCKED:** Same scope as #4 above — `startNetballQuarter`'s `onStarted` callback should `router.refresh()` after the period_break_swap event lands so the live shell rerenders into Q2 without manual reload. Combine with #4 in a single source-fix plan if practical.

### Test-infra plan ordering (gray area #6)
**LOCKED:**
- Plan 05-01: Add Kotara Koalas seed (TEST-05 closure) — `supabase/seed.sql` extension; verify with `auditKotaraKoalas()` returning `present: true` after `npm run db:reset`
- Plan 05-02: Side-finding #3 admin-hydration helper extraction — pure refactor, no source change, three specs updated
- Plan 05-03: Side-finding #2 stale-dev-server detection — `scripts/e2e-setup.mjs` extension
- Plan 05-04: revalidatePath + router.refresh source fixes (combined; small) — verify by removing `page.reload()` workarounds from netball-live-flow.spec.ts + netball-quarter-break.spec.ts; specs must stay green
- Plan 05-05: Final gauntlet + 05-EVIDENCE.md → Phase 6 hand-off (mirror Plan 04-07 pattern)
**Why:** Order minimizes risk — TEST-05 first (small + isolated), helpers next (pure refactor), then source fixes (potentially touchy), then gauntlet. Each plan is small enough to commit + verify atomically; no plan blocks parallel-eligible work in subsequent plans.

### Wave structure
**LOCKED:** Strictly sequential 5-wave chain (no parallel) — each plan touches a different surface and the gauntlet at the end depends on all prior work. This is unlike Phase 4's wave-parallel structure because the deferred items here are too small to justify the parallel-coordination overhead.

### Quality bar carry-over
**LOCKED:** Every Phase 5 plan must run a focused verify gate (the touched specs + AFL non-regression + tsc/lint/vitest). End-of-phase 05-EVIDENCE.md mirrors 04-EVIDENCE.md structure.
**Why:** Phase 4 established the quality template; reusing it keeps the milestone audit consistent.

### Out-of-scope items (re-confirmed deferred)
- ABSTRACT-01 CI guard — backlog (per Phase 3 CONTEXT)
- PROD-04 CI guard — backlog (per Phase 3 CONTEXT)
- Pause-event persistence bug — cross-cutting deferred (per Phase 3 CONTEXT)
- Performance benchmarking — Phase 6/7 (per Phase 3 CONTEXT)
- `games.quarter_length_seconds` UI exposure — v2 (per Phase 3 CONTEXT)

</decisions>

<code_context>
## Existing Code Insights

**Test infrastructure** (mature, established by Phase 4):
- `e2e/helpers/seed-audit.ts` — auditKotaraKoalas returns structured `{ present, playerCount, gameCount, ... }` non-throwingly
- `e2e/fixtures/factories.ts` — makeTeam, makePlayers, makeGame; widened in Phase 2 for sport + ageGroup
- `e2e/tests/auth.setup.ts` — admin login flow re-used by all specs

**Specs that need updating** (side-finding #3):
- `e2e/tests/settings.spec.ts:line ~?` — `await expect(switch).toBeEnabled({ timeout: 5_000 })` pattern
- `e2e/tests/roster.spec.ts:line ~?` — same pattern (×2 occurrences)
- `e2e/tests/game-edit.spec.ts:line ~?` — DB-poll variant of the same race guard

**Source files in scope for revalidatePath fix:**
- `src/lib/actions/netball-actions.ts` (most likely location based on Phase 4 evidence; verify during planning)
- Specifically: `endNetballQuarter`, `startNetballQuarter`, `periodBreakSwap`

**Seed pathway:**
- `supabase/seed.sql` — currently `select 1;`
- `supabase/migrations/0024_multi_sport.sql` — established `teams.sport` + `teams.track_scoring` columns
- `supabase/migrations/0026_team_quarter_seconds.sql` — `teams.quarter_length_seconds`

**Phase 4 hand-off invariants** (must STAY frozen):
- `pre-merge/main` and `pre-merge/multi-sport` tags
- PROD-04 fixme in playhq-import.spec.ts
- D-26/D-27 quarterMs wiring at LiveGame.tsx + liveGameStore.ts
- ABSTRACT-01 4 UI-presentation matches outside src/lib/sports/
- All netball + AFL e2e specs from earlier phases must stay green

</code_context>

<specifics>
## Specific Ideas

- **Kotara Koalas seed (Plan 05-01):** Append insertion block to `supabase/seed.sql` covering: 1 team row (id=5ba1eb72-..., sport='netball', name='Kotara Koalas', track_scoring=true OR false per CONTEXT — verify which is intended), 9 players, ~5 finalised games' worth of events for season-tier coverage. Verify via `auditKotaraKoalas()` returning `present: true` after `npm run db:reset`.
- **`waitForAdminHydration` helper (Plan 05-02):** Read existing pattern from settings.spec.ts (likely simplest); extract verbatim to `e2e/helpers/admin-hydration.ts`; update three call sites; commit each spec update separately for clean blame.
- **`scripts/e2e-setup.mjs` port detection (Plan 05-03):** Use Node's `net.createServer().listen(3000)` to probe; on EADDRINUSE, log "Existing dev server detected on port 3000 — reusing" and continue; otherwise spawn the dev server as today.
- **revalidatePath source fix (Plan 05-04):** Add `revalidatePath('/teams/[teamId]/games/[gameId]/live', 'page')` to `endNetballQuarter` non-final branch and `startNetballQuarter` onStarted branch. Verify by removing two `page.reload()` calls from netball specs.
- **Plan 05-05 gauntlet:** Mirror 04-07's structure — full tsc + vitest + lint + e2e suite; PROD-01 per-spec re-run; EVIDENCE.md aggregates TEST-01..05 → status; Phase 3 + Phase 4 invariants re-verified.

</specifics>

<deferred>
## Deferred Ideas

| Idea | Reason | Target |
|------|--------|--------|
| ABSTRACT-01 CI guard (grep rule) | Backlog per Phase 3 CONTEXT | v2 / future |
| PROD-04 CI guard (fixme presence check) | Backlog per Phase 3 CONTEXT | v2 / future |
| Pause-event persistence bug | Cross-cutting; deferred per Phase 3 CONTEXT | Future milestone |
| `games.quarter_length_seconds` UI exposure | UX polish, not blocking acceptance | v2 |
| PROD-02 quantitative benchmarking | Performance work | Phase 6/7 |
| Audit log for game event mutations | Backlog per CONCERNS.md | Future milestone |
| Refactoring NetballLiveGame state machine | FRAGILE; out of milestone | Future milestone |

</deferred>

<open_questions>
## Open Questions for Researcher / Planner

- Confirm Kotara Koalas seed shape: track_scoring=true or false? "Go" age group is netball-specific — is there an existing AGE_GROUPS["go"] config in the source, or does it need adding? (Phase 4 noted AGE_GROUPS["go"] doesn't exist; this is a real gap for the seed pathway to land cleanly.)
- Confirm whether `supabase/seed.sql` is the right location vs a separate netball-seed script. Check existing seed conventions; pick the lower-friction option.
- Confirm the exact location of `endNetballQuarter` / `startNetballQuarter` / `periodBreakSwap` server actions for the revalidatePath fix — Phase 4's evidence pointed at `src/lib/actions/netball-actions.ts` but the planner should grep to be sure.

</open_questions>
