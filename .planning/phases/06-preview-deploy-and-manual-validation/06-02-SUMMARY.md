---
phase: 06-preview-deploy-and-manual-validation
plan: 02
subsystem: deploy-runbook
tags: [deploy, runbook, supabase-clone, vercel-preview, documentation-only, user-facing]
requires: ["Plan 06-01 (06-DEPLOY-CHECKLIST.md committed at 76c70d3 — env-var matrix authority)"]
provides:
  - ".planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-RUNBOOK.md (Plan 06-04 walks this; references 06-DEPLOY-CHECKLIST + verify-prod-clone.mjs + 06-VALIDATION)"
affects: []
tech-stack:
  added: []
  patterns: ["Phase A–E + rollback runbook structure", "two-path deploy trigger (git push vs vercel CLI)", "two-path migration apply (supabase db push vs SQL Editor)"]
key-files:
  created:
    - ".planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-RUNBOOK.md"
  modified: []
decisions:
  - "Runbook references 06-DEPLOY-CHECKLIST.md §1 as the env-var matrix authority — does NOT duplicate the matrix"
  - "Both deploy-trigger paths documented (Path D1 git push preferred; Path D2 vercel CLI alternative)"
  - "Both migration-apply paths documented (Path B1 `supabase db push` preferred; Path B2 manual SQL Editor as fallback)"
  - "Both Supabase-clone paths documented (Path A1 new project recommended; Path A2 existing staging restored)"
  - "§F Rollback path emphasises pre-merge tags are FROZEN per Phase 1 — do not move them in any rollback"
metrics:
  duration: "~5 min (read context + write doc + verify)"
  completed: "2026-04-30"
  tasks: 1
  files: 1
---

# Phase 6 Plan 2: Preview-deploy runbook — Summary

One-liner: Authored a 368-line operational runbook (`06-DEPLOY-RUNBOOK.md`) — six top-level phases plus rollback + hand-off — that Plan 06-04 will walk with the user once creds are ready, with all three cross-plan hand-offs (checklist + verify script + validation doc) referenced by exact filename.

## What landed

`06-DEPLOY-RUNBOOK.md` (368 lines, +368/-0 net) at `.planning/phases/06-preview-deploy-and-manual-validation/`. Structure:

- **§0 Preface** — audience (Plan 06-04 + user), source baseline (HEAD `90364ee`), phase goal (dress rehearsal for Phase 7), env-var/migration authority pointer to checklist.
- **§A Provision Supabase prod clone** — Path A1 (new project, recommended) and Path A2 (existing staging restored). Inputs / Steps / Acceptance / Estimated time. Acceptance: `supabase migration list` shows 0001..0023 applied + 0024..0027 PENDING.
- **§B Apply migrations 0024..0027** — Path B1 (`supabase db push`) and Path B2 (manual SQL Editor). Acceptance: 27 applied + `node scripts/verify-prod-clone.mjs` exit 0.
- **§C Configure Vercel preview env vars** — Path C1 (dashboard) and Path C2 (CLI). Authority pointer to `06-DEPLOY-CHECKLIST.md` §1; matrix NOT re-derived. Acceptance: `vercel env ls preview` lists the three Phase-6-CRITICAL vars.
- **§D Trigger preview deploy** — Optional pre-flight `npm run build`; Path D1 (`git push origin merge/multi-sport-trunk`) and Path D2 (`vercel deploy --target preview` + the `vercel build && vercel deploy --prebuilt` faster variant). Acceptance: deploy "Ready" status, `curl -fsS <preview-url>/` returns 200, build log warnings match the Phase 5 baseline trio.
- **§E Smoke check** — auto probes (curl `/` + `/login`); auto verify-prod-clone.mjs re-run; sample share-token capture for Plan 06-05; hand-off pointer.
- **§F Rollback path** — per-phase rollback (B, D, E) plus Vercel deploy revert + code revert. Emphasises pre-merge tags are FROZEN.
- **§G Hand-off** — explicit pointer to Plan 06-05 (`06-VALIDATION.md`) for AFL + netball flows on the live preview.

## Cross-plan hand-offs verified

All three references are present by exact filename:

- `06-DEPLOY-CHECKLIST.md` — referenced from §0 preface + §B + §C as the env-var/migration authority.
- `scripts/verify-prod-clone.mjs` — referenced from §B + §E as the automated acceptance probe.
- `06-VALIDATION.md` — referenced from §E + §G as the Plan 06-05 hand-off target.

The runbook does NOT re-derive the env-var matrix or migration list — it links to the checklist for both. (Plan-level success criterion #5.)

## Verification at execute time

- All required substrings present (Phase A..E + Rollback + supabase db push + vercel deploy --target preview + verify-prod-clone + 06-DEPLOY-CHECKLIST + 06-VALIDATION).
- File size 368 lines (within 220–400 target).
- `git status -- src/ scripts/ supabase/ e2e/ package.json vercel.json next.config.mjs` clean — only `.planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-RUNBOOK.md` appeared as new.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] File exists at canonical path
- [x] All 6 sections (Phase A..E + Rollback) + preface + hand-off + cross-plan index
- [x] References 06-DEPLOY-CHECKLIST.md (Plan 06-01 hand-off)
- [x] References scripts/verify-prod-clone.mjs (Plan 06-03 hand-off)
- [x] References 06-VALIDATION.md (Plan 06-05 hand-off)
- [x] Both deploy paths documented (git push + vercel deploy --target preview)
- [x] Both migration-apply paths documented (supabase db push + manual SQL Editor)
- [x] File 368 lines (within 220–400 target)
- [x] Commit `b9a009c` recorded

## Self-Check: PASSED

## Hand-off

- **Plan 06-03 (verify-prod-clone.mjs)** is the next autonomous prep — once committed, the runbook's §B and §E acceptance steps are fully executable.
- **Plans 06-04 + 06-05** are BLOCKED on user creds (Supabase prod-clone provisioning + Vercel preview env-var configuration). Will be dispatched later by the orchestrator once the user signals ready.

## Commit

- `b9a009c` — `docs(06-02): preview-deploy runbook — Phases A–E + rollback + manual-validation hand-off`
