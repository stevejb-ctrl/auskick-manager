---
phase: 04-netball-verification-on-merged-trunk
plan: 01
subsystem: hygiene
tags: [hygiene, gitignore, seed-audit, kotara-koalas, test-05]

# Dependency graph
requires:
  - phase: 03-branch-merge-abstraction-integrity
    provides: merge/multi-sport-trunk HEAD bd8761f (extended by Phase 4 planning commits to 2390fda); MERGE-LOG §6 side-finding #1; pre-merge tag SHAs frozen
  - phase: 04-netball-verification-on-merged-trunk (CONTEXT)
    provides: D-CONTEXT-side-finding-1 (gitignore inline); D-CONTEXT-seed-strategy (Kotara presence is AUDIT not enforcement); D-CONTEXT-test-scaffolding (e2e/helpers/ allowed, src/ off-limits)
provides:
  - "Three Playwright run-artefact dirs (playwright-report/, playwright/, test-results/) ignored by git so npm run e2e no longer surfaces them as untracked"
  - "e2e/helpers/seed-audit.ts new module exporting auditKotaraKoalas(admin) + KOTARA_KOALAS_TEAM_ID — a non-throwing TEST-05 probe Wave 2+ specs can branch on"
  - "Empirical TEST-05 audit outcome captured: { present: false } against local Supabase at HEAD 7e6b68d — Phase 5 hand-off knows fresh db:reset does NOT seed Kotara Koalas"
affects:
  - 04-02 (netball-walkthrough.spec.ts — uses factories fallback path; Kotara absence confirmed irrelevant)
  - 04-03 (netball-stats / netball-summary specs — factories fallback path)
  - 04-05 (netball-live-flow.spec.ts — factories fallback path)
  - 04-06 (netball-quarter-break.spec.ts — Kotara-optional season-history path; will skip the optional 5-game branch on this DB)
  - 04-07 (full gauntlet + Phase 5 hand-off — TEST-05 result reported as "absent locally; reseed pathway is a Phase 5 concern")
  - phase 5 (test+type green — TEST-05 acceptance gate now has a deterministic boolean to gate on)

# Tech tracking
tech-stack:
  added: []  # No new libraries — uses existing @supabase/supabase-js peer
  patterns:
    - "Non-throwing seed audits in e2e/helpers/ — probe + report shape rather than enforce + throw, so Wave 2+ specs branch on a boolean"
    - "Read-only seed helpers — seed-creation logic stays in factories; helpers don't duplicate it (CONTEXT D-CONTEXT-seed-strategy)"
    - "maybeSingle() for presence probes — returns null instead of throwing on zero rows; cleaner than .single() + try/catch"

key-files:
  created:
    - "e2e/helpers/seed-audit.ts  # 116 lines; exports KOTARA_KOALAS_TEAM_ID, KotaraAuditResult, auditKotaraKoalas"
    - ".planning/phases/04-netball-verification-on-merged-trunk/04-01-SUMMARY.md  # this file"
  modified:
    - ".gitignore  # +5 lines: trailing block 'playwright run artefacts' with 3 patterns + section header comment"
  deleted: []

key-decisions:
  - "Kotara Koalas audit is REPORT, not ENFORCE: helper returns { present: false } when row is missing or wrong-sport; only throws on actual RLS/network errors (CONTEXT D-CONTEXT-seed-strategy)"
  - "Wrong-sport row at the Kotara UUID is also classified as { present: false } and JSDoc'd as a data-drift signal — Phase 4 specs treat it identically to missing-row, but later analytics could grep for the signal"
  - "KOTARA_KOALAS_TEAM_ID exported as a const so specs can branch on the UUID directly without re-importing it (DRY)"
  - "scripts/audit-kotara.mjs created + executed + deleted before commit — one-off SUMMARY evidence capture, not a shipping artefact (kept the plan's files_modified list at exactly 2 as specified)"

patterns-established:
  - "Pattern: e2e/helpers/ as the home for read-only Supabase probes. e2e/fixtures/ stays the home for state-creating helpers (factories.makeTeam, ensureTestUser). This split keeps the audit-vs-mutate boundary obvious in code review."
  - "Pattern: helpers throw ONLY on infrastructure errors (RLS, network) and return structured results for domain absence — Wave 2+ specs can call without try/catch wrapping if they only need presence semantics."

requirements-completed: [TEST-05]  # ⚠ partial: helper authored + audit run; absent-state confirmed. Full TEST-05 (Kotara queryable with 9 players + 5 games) requires a Phase 5 reseed step, captured here for hand-off.

# Metrics
duration: ~25min (interactive — read plan + CONTEXT + ROADMAP + 03-01-SUMMARY shape, edit .gitignore, write seed-audit.ts, run audit against local DB, write SUMMARY)
completed: 2026-04-30
---

# Phase 4 Plan 01: gitignore + Kotara Koalas seed audit Summary

**Two atomic commits land Phase 3 side-finding #1 (Playwright artefact gitignore) and Wave 1's `e2e/helpers/seed-audit.ts` foundation — a non-throwing `auditKotaraKoalas()` that returns `{ present, gameCount, playerCount, teamId }` so every Wave 2+ netball spec can branch on TEST-05 deterministically.**

## Performance

- **Duration:** ~25min (interactive)
- **Started:** 2026-04-30 (post Plan 03-06 close-out + Phase 4 planning artefacts on trunk)
- **Completed:** 2026-04-30
- **Tasks:** 2 substantive (Tasks 1 and 2) — both `type="auto"`, fully autonomous (no checkpoints, no deviations)
- **Files modified:** exactly 2 (`.gitignore` and the new `e2e/helpers/seed-audit.ts`) — matches the plan's `files_modified` declaration verbatim

## Accomplishments

- **Side-finding #1 closed.** `.gitignore` now has a `# playwright run artefacts (per Phase 3 side-finding #1, MERGE-LOG §6)` block listing `playwright-report/`, `playwright/`, `test-results/`. `git status --short` no longer surfaces those three dirs as untracked, and `git check-ignore -v` for each prints the matching `.gitignore:48-50` rule.
- **TEST-05 audit primitive landed.** `e2e/helpers/seed-audit.ts` exports `KOTARA_KOALAS_TEAM_ID`, `KotaraAuditResult` interface, and `auditKotaraKoalas(admin)` — a read-only probe against `teams`, `games`, and `players` that returns a structured result without throwing on missing rows. Throws ONLY on actual RLS / network errors (the only failures that would render the audit itself meaningless).
- **`{ present: false }` empirically confirmed locally.** Ran the audit against the running local Supabase (`http://127.0.0.1:54321`, service-role key from `.env.test`): the `teams` row at `5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11` is **absent**. This is the expected "fresh `db:reset`" outcome per CONTEXT (the seed.sql is intentionally tiny). Phase 4 Wave 2+ specs will use the `factories.makeTeam({ sport: 'netball' })` fallback in every case — the Kotara branch is a future seeding option, not a precondition.
- **Phase 3 invariants intact.**
  - `pre-merge/main` = `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` (untouched)
  - `pre-merge/multi-sport` = `e13e787cb8abe405c18aca73e66c7c928eb359d8` (untouched)
  - `e2e/tests/playhq-import.spec.ts` PROD-04 fixme: `git diff` is empty against Phase 3 closure HEAD; `grep -c "test\.fixme"` returns 1.
  - `src/`, `supabase/`, `scripts/` all clean — zero source-tree drift.
- **`npx tsc --noEmit` exits 0** at HEAD `7e6b68d` (post-Task 2). No type regressions across the merged codebase.

## Task Commits

Each task was committed atomically per CLAUDE.md commit style:

1. **Task 1: Append Playwright artefact patterns to .gitignore** — `58b822f` (`chore(04-01): gitignore playwright run artefacts`)
2. **Task 2: Create e2e/helpers/seed-audit.ts with auditKotaraKoalas()** — `7e6b68d` (`feat(04-01): add Kotara Koalas seed audit helper`)

## Files Created/Modified

### Created
- `e2e/helpers/seed-audit.ts` (116 lines) — Module-level JSDoc explains the TEST-05 acceptance gate, why presence is probed rather than enforced (CONTEXT D-CONTEXT-seed-strategy), and the two acceptable outcomes for callers. Exports:
  - `KOTARA_KOALAS_TEAM_ID = "5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11"` const
  - `KotaraAuditResult` interface (`present`, `gameCount`, `playerCount`, `teamId`)
  - `auditKotaraKoalas(admin: SupabaseClient): Promise<KotaraAuditResult>` async function
- `.planning/phases/04-netball-verification-on-merged-trunk/04-01-SUMMARY.md` (this file)

### Modified
- `.gitignore` — appended a 5-line block (one blank line + `# playwright run artefacts (per Phase 3 side-finding #1, MERGE-LOG §6)` comment + 3 patterns). No existing entries reordered or removed; diff is purely additive.

### Deleted
None.

## Decisions Made

1. **Kotara audit is REPORT, not ENFORCE** — the helper returns `{ present: false }` for missing-row OR wrong-sport-row; throws only on RLS / network errors. Locked in CONTEXT D-CONTEXT-seed-strategy ("Two-tier: Kotara is the season-history seed; factories.makeTeam is the isolation seed; specs choose"). Carrying that forward into the helper API means callers don't need try/catch wrapping for the common case.

2. **Wrong-sport row at the Kotara UUID also returns `{ present: false }`** — JSDoc'd as a data-drift signal worth logging upstream. We don't throw because the surrounding semantics ("is the netball seed available?") still resolves cleanly to "no". Future Phase 5+ analytics could grep this signal if drift ever appeared, but the helper itself stays simple.

3. **`KOTARA_KOALAS_TEAM_ID` exported as a const** alongside the function — Wave 2+ specs that need to assert "the row I just inserted is NOT the Kotara seed" can import the UUID directly without round-tripping through `auditKotaraKoalas`.

4. **One-off `scripts/audit-kotara.mjs` created → executed → deleted** before any commit, so the plan's `files_modified` list stays at exactly 2 (`.gitignore` + `e2e/helpers/seed-audit.ts`) as specified. The audit JSON output captured here in §Accomplishments is the durable artefact; the runner script was scaffolding.

5. **`maybeSingle()` over `.single()`** for the teams probe — `.single()` throws PGRST116 on zero rows, which would force a try/catch wrapper for the common case (Kotara absent, fall through to factories). `.maybeSingle()` returns `null` cleanly.

6. **`Promise.all` for the games + players counts** — both are independent count probes against the local PostgREST. Sequential `await` would add ~10ms latency that compounds when Wave 2+ specs call the audit at every `beforeAll`.

## Deviations from Plan

None. Plan executed exactly as written:
- Task 1 done block: 3 patterns added to .gitignore, no other lines modified, no untracked-dir surfacing → ✓
- Task 2 done block: file exists, exports KOTARA_KOALAS_TEAM_ID + KotaraAuditResult + auditKotaraKoalas, `npx tsc --noEmit` exits 0, src/ untouched → ✓
- Plan-level success criteria 1-6: all green (see §Self-Check below)

## Issues Encountered

- **Kotara Koalas absent locally** — expected per CONTEXT, not a deviation. Documented as a Phase 5 hand-off concern (the seeding pathway needs to be located / re-run if Phase 5 wants TEST-05 fully green rather than just "deterministically queryable"). Wave 2+ Phase 4 specs are unaffected because every netball spec was designed to use `factories.makeTeam` per CONTEXT D-CONTEXT-seed-strategy point 2.

## User Setup Required

None — no external service configuration required. The audit runs against the same local Supabase that all e2e specs already target (`http://127.0.0.1:54321` with the deterministic CLI demo keys from `.env.test`).

## Next Phase Readiness

**Hand-off to Plan 04-02 (netball-walkthrough.spec.ts):**
- The helper is importable: `import { auditKotaraKoalas, KOTARA_KOALAS_TEAM_ID } from "@/../e2e/helpers/seed-audit"` (or relative path equivalent — Wave 2 will pick the import style).
- Walkthrough spec doesn't actually need Kotara — fresh `factories.makeTeam({ sport: 'netball' })` per CONTEXT is the right path. The audit is for specs that benefit from the season-history seed (NETBALL-02 fairness over 5 prior games — Plan 04-06's branch).

**Hand-off to Plan 04-06 (netball-quarter-break.spec.ts):**
- 04-06 should call `auditKotaraKoalas(admin)` in `beforeAll`. On this DB the result is `{ present: false }` → 04-06 will exercise the factories-only branch (3-game synthetic history rather than 5-game real history). The plan author can choose to skip the optional 5-game branch via `test.skip` when present is false, or unconditionally exercise the synthetic branch — both satisfy NETBALL-02 because the fairness-tier ordering math is the same regardless of history depth.

**Hand-off to Plan 04-07 (full gauntlet + Phase 5 hand-off):**
- 04-07's `04-EVIDENCE.md` should call out: "TEST-05 helper authored and run; outcome `{ present: false }` against fresh `db:reset`. Phase 5 owns the seeding pathway if it wants `{ present: true, gameCount: 5, playerCount: 9 }`."

**Hand-off to Phase 5 (test + type green):**
- TEST-05 acceptance gate ("Kotara Koalas team queryable in local Supabase with 9 active players and 5 simulated games") is **NOT yet met** on a fresh `db:reset`. Phase 5 must either:
  1. Locate / re-run the netball-specific seed pathway that originally created Kotara, OR
  2. Document TEST-05 as "covered in spirit by the audit + factories fallback; full real-seed not required for production cutover".
- This decision belongs to Phase 5, not 04-01. The audit primitive lives in the trunk; the seeding decision is downstream.

**No blockers carried into Plan 04-02.**

## Self-Check: PASSED

Verification commands run on `merge/multi-sport-trunk` worktree (HEAD = `7e6b68d`):

| Check | Command | Result |
|-------|---------|--------|
| Task 1 commit exists | `git log --oneline \| grep 58b822f` | match present |
| Task 2 commit exists | `git log --oneline \| grep 7e6b68d` | match present |
| `.gitignore` has 3 patterns | `grep -nE '^(playwright-report\|playwright\|test-results)/' .gitignore` | 3 lines (48, 49, 50) |
| `git check-ignore` for playwright-report/ | `git check-ignore -v playwright-report/` | `.gitignore:48:playwright-report/` |
| `git check-ignore` for playwright/ | `git check-ignore -v playwright/` | `.gitignore:49:playwright/` |
| `git check-ignore` for test-results/ | `git check-ignore -v test-results/` | `.gitignore:50:test-results/` |
| `git status` no longer surfaces Playwright dirs | `git status --short \| grep -E '^\?\? (playwright-report\|playwright\|test-results)/'` | (empty — no match) |
| seed-audit.ts file exists | `ls -la e2e/helpers/seed-audit.ts` | present (116 lines, 4184 bytes) |
| Helper exports the documented surface | `grep -nE 'export (const\|async function\|interface)' e2e/helpers/seed-audit.ts` | 3 matches: KOTARA_KOALAS_TEAM_ID, KotaraAuditResult, auditKotaraKoalas |
| `npx tsc --noEmit` post-Task-2 | `npx tsc --noEmit` | exit 0 (no errors) |
| No `src/` drift | `git status --short src/` | (empty) |
| No `supabase/` drift | `git status --short supabase/` | (empty) |
| No `scripts/` drift | `git status --short scripts/` | (empty) |
| `pre-merge/main` tag frozen (D-21) | `git rev-parse pre-merge/main` | `e9073dd205bdd8eae8e7b66097e3b2275c4b5958` |
| `pre-merge/multi-sport` tag frozen (D-21) | `git rev-parse pre-merge/multi-sport` | `e13e787cb8abe405c18aca73e66c7c928eb359d8` |
| PROD-04 fixme intact | `grep -c "test\.fixme" e2e/tests/playhq-import.spec.ts` | 1 |
| Live-DB audit outcome captured | `node scripts/audit-kotara.mjs` (one-off, since deleted) | `{ present: false, gameCount: 0, playerCount: 0, teamId: "5ba1eb72-..." }` |

All 17 self-check items PASSED.

---
*Phase: 04-netball-verification-on-merged-trunk*
*Plan: 01*
*Completed: 2026-04-30*
