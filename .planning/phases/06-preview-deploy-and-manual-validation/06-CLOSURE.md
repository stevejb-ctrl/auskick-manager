---
phase: 06-preview-deploy-and-manual-validation
doc: closure
verdict: SUPERSEDED-BY-CONTINUOUS-DELIVERY
closed: 2026-06-02
requirements: [DEPLOY-01, DEPLOY-02]
also_closes_phase: 7  # DEPLOY-03, DEPLOY-04 — same supersession
plans_executed: [06-01, 06-02, 06-03]
plans_superseded: [06-04, 06-05]
---

# Phase 6 (+ 7) Closure — Superseded by continuous delivery

## Decision

Phase 6 (*preview deploy + manual validation*) and Phase 7 (*production
cutover + smoke test*) are **closed as superseded by continuous delivery.**
They were authored 2026-04-30 as **pre-merge safety gates** for the v1.0
multi-sport merge — at a time when that code had not yet reached production.
Their whole purpose was to rehearse the cutover on an isolated Supabase
**prod clone** before touching the real database.

That premise no longer holds. **727 commits later, the merged multi-sport
trunk is already in `main` and already serving production at
`https://www.sirenfooty.com.au`** — `main` auto-deploys to Vercel, and the
production Supabase is already on the current (47-migration) schema.
Confirmed with the project owner 2026-06-02 ("production is already live on
current code"). Provisioning a Supabase clone now would rehearse a cutover
that has already happened in production. The clone was never the goal — it
was a sandbox to de-risk an unshipped merge, and that risk has been retired
empirically by the code running live without incident.

## Requirements — how each is satisfied without executing the clone runbook

| Req | Phase | Intent | Satisfied by |
|-----|-------|--------|--------------|
| **DEPLOY-01** | 6 | Merged multi-sport code deployed to a production-shaped environment | ✅ Live in production (`sirenfooty.com.au`), auto-deployed from `main`, serving real users. |
| **DEPLOY-02** | 6 | A human confirms AFL + netball flows + AFL share links (`/run/[token]`) work end-to-end against real-shape data | ✅ Risk retired empirically: the merged code is in production without breakage, backed by **green e2e** (16 live-flow specs across AFL `live-scoring` + netball `netball-live-flow` + share tokens; 1 intentional PROD-04 fixme) and **889/889 Vitest**. Owner elected to close on tests + live usage rather than a now-redundant manual walkthrough. |
| **DEPLOY-03** | 7 | `main` is the trunk; prod Supabase has executed all new migrations (incl. the `teams.sport='afl'` backfill); no pending migrations | ✅ `main` IS the merged trunk; production schema is current (the multi-sport migrations, incl. `0024_multi_sport.sql`, shipped through continuous delivery). |
| **DEPLOY-04** | 7 | Post-cutover smoke: an existing AFL team loads, history intact, an AFL share link resolves | ✅ Production is live and in daily use by real AFL teams on the merged code; the same flows are guarded by the green e2e/unit suites. |

## What was (and wasn't) executed

- **Executed (autonomous prep, retained as reference):** `06-01` deploy
  checklist, `06-02` deploy runbook, `06-03` `scripts/verify-prod-clone.mjs`.
  Plus the `06-DEPLOY-REFRESH.md` addendum (commit `79010a1`) that re-derived
  the drifted deploy inputs against `main@f0a1481` and patched the verify
  probe's Q1 count 27 → 47.
- **Superseded (deliberately NOT executed):** `06-04` (clone + deploy
  runbook execution) and `06-05` (manual prod-clone validation). Running them
  would clone Supabase to rehearse a cutover already live in production.

## Retained assets

`06-DEPLOY-CHECKLIST.md`, `06-DEPLOY-RUNBOOK.md`, `06-DEPLOY-REFRESH.md`, and
`scripts/verify-prod-clone.mjs` are kept as a **reference deploy kit**. If a
future change ever warrants a genuine clone-and-rehearse before touching prod
(e.g. a high-risk destructive migration), the refreshed runbook + read-only
verify probe are ready to use — they just aren't needed for the v1.0 merge,
which is already in production.

## Net effect

**Milestone v1.0 (multi-sport merge to production) is COMPLETE** — Phases
1–5 delivered the merge + green gates, and Phases 6–7's deploy/cutover goals
are met by the code already running in production. Nothing outstanding blocks
v1.0; there is no pending production action.
