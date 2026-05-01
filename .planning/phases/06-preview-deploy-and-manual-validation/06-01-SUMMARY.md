---
phase: 06-preview-deploy-and-manual-validation
plan: 01
subsystem: deploy-hygiene
tags: [deploy, hygiene, env-matrix, vercel-config, documentation-only]
requires: ["Phase 5 close at 90364ee — gauntlet green; tsc/lint/vitest/e2e all PASSing"]
provides:
  - ".planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-CHECKLIST.md (env-var matrix authority for Plan 06-02 + 06-03)"
affects: []
tech-stack:
  added: []
  patterns: ["documentation-only audit doc"]
key-files:
  created:
    - ".planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-CHECKLIST.md"
  modified: []
decisions:
  - "Re-derived env-var matrix by re-running `grep -rE process.env. src/` at execute time (not relying on plan's pre-baked block)"
  - "Confirmed vercel.json + next.config.mjs blocks in plan match the live files byte-for-byte — zero drift since plan authoring"
  - "Confirmed migration set is 27 files (0001..0027) per `ls supabase/migrations/`"
metrics:
  duration: "~6 min (read context + write doc + verify)"
  completed: "2026-04-30"
  tasks: 1
  files: 1
---

# Phase 6 Plan 1: Pre-deploy hygiene checklist — Summary

One-liner: Authored a 250-line operational hygiene doc (`06-DEPLOY-CHECKLIST.md`) — env-var matrix + vercel.json/next.config.mjs audit + migration enumeration + ready-to-deploy boolean checklist — that the deploy runbook (06-02) and verify script (06-03) both consume by reference.

## What landed

`06-DEPLOY-CHECKLIST.md` (250 lines, +250/-0 net) at `.planning/phases/06-preview-deploy-and-manual-validation/`. Five top-level sections plus a §6 boolean-criteria table:

- **§1 Env Var Matrix** — 11 rows. Three Phase-6-CRITICAL vars flagged (Supabase URL + anon + service-role); two Vercel-injected (VERCEL_ENV + CRON_SECRET); five OPTIONAL (Resend, Telegram, NEXT_PUBLIC_DEFAULT_BRAND).
- **§2 vercel.json audit** — embeds the live JSON verbatim (only PlayHQ cron, no preview overrides). Concludes "no changes required for Phase 6."
- **§3 next.config.mjs audit** — embeds the empty config object verbatim. Concludes "no changes required for Phase 6."
- **§4 Build sanity** — Vercel runs `next build`; Phase 5 e2e gauntlet implicitly proves `next build` succeeds at HEAD `90364ee`; local `npm run build` is RECOMMENDED but OPTIONAL.
- **§5 Migration set** — all 27 migrations enumerated, grouped: 23 shared (0001..0023) NO-OP against the prod clone, 4 net-new (0024..0027) the operator must apply on top of the snapshot. Explicitly excludes `supabase/seed.sql` from prod-clone application.
- **§6 Ready-to-deploy boolean criteria** — 10-row checkbox table the operator walks before triggering Phase D of the runbook.

## Verification at execute time

- `grep -rE "process\.env\.[A-Z_]+" src/` returned the same 11 distinct vars listed in the plan's `<env_var_inventory>` block — zero drift since plan authoring.
- `vercel.json` byte-for-byte matches the plan's embedded block.
- `next.config.mjs` byte-for-byte matches the plan's embedded block.
- `ls supabase/migrations/` returned exactly 27 files in the documented order; the last is `0027_game_quarter_seconds.sql`.
- `npx tsc --noEmit` exit 0 (sanity — documentation-only changes can't break tsc, but ran for completeness).
- `git status -- src/ scripts/ supabase/ e2e/ package.json vercel.json next.config.mjs` clean — only `.planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-CHECKLIST.md` appears as new.

## Deviations from Plan

None — plan executed exactly as written. The plan's `<context>` blocks (env-var inventory, vercel.json, next.config.mjs, migration set) were cross-checked against the live source and reconciled to zero drift, so no rule-1/2/3 fix was triggered.

## Self-Check

- [x] File exists at canonical path
- [x] All 5 numbered sections (§1..§5) present + §6 readiness table
- [x] Env-var matrix references Phase-6-CRITICAL three by exact name
- [x] Migration set names `0027_game_quarter_seconds` (proves complete enumeration)
- [x] File size 250 lines (within 150–280 target)
- [x] Commit `76c70d3` recorded

## Self-Check: PASSED

## Hand-off

- **Plan 06-02 (deploy runbook)** consumes §1 (env-var matrix) and §5 (migration set) by reference. The runbook MUST NOT re-derive either.
- **Plan 06-03 (verify-prod-clone.mjs)** consumes §5 + Phase 2 §6 acceptance criteria. The script automates §6 boolean criteria 6, 7, 8, and 9.
- **Plan 06-04 (deploy execute, BLOCKED on creds)** walks the runbook with the user; this checklist is the operator's pre-flight sanity check.
- **Plan 06-05 (manual validation, BLOCKED on creds)** uses §6 #9's emitted sample share-token URL for the `/run/<token>` manual smoke step.

## Commit

- `76c70d3` — `docs(06-01): pre-deploy hygiene checklist — env-var matrix + vercel/next/migration audit`
