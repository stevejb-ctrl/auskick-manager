# Phase 6: Preview deploy + manual validation - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning
**Mode:** Auto-decided (--auto, recommended defaults locked)

<canonical_refs>
## Canonical References

Downstream agents MUST read these:

- `.planning/REQUIREMENTS.md` — DEPLOY-01 + DEPLOY-02 acceptance gates
- `.planning/ROADMAP.md` — Phase 6 success criteria (4 must-haves)
- `.planning/phases/05-test-and-type-green/05-EVIDENCE.md` — TEST-01..05 all PASS; gauntlet baseline; Phase 6 prerequisites named
- `.planning/phases/05-test-and-type-green/05-05-SUMMARY.md` — Phase 6 hand-off table; BLOCKERS flagged
- `.planning/phases/03-branch-merge-abstraction-integrity/03-MERGE-LOG.md` §6 — Phase 6 prod-clone acceptance criteria from Phase 2/3 hand-off
- `.planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md` §6 — Phase 6 acceptance criteria (apply migrations; load AFL team; sport=null=0; distinct sport='afl'; share token via /run/[token])
- `vercel.json` — current Vercel config (only crons; no env-specific overrides)
- `next.config.mjs` — Next.js config
- `supabase/migrations/` — 27 migrations to apply on the prod clone
- `supabase/seed.sql` — Plan 05-01 Kotara seed (NOT run on prod clone — that's local-dev seed only)
- `CLAUDE.md` — testing-is-part-of-done; UI changes verified in browser

</canonical_refs>

<domain>
## Phase Boundary

Deploy the merged trunk to a Vercel preview environment backed by a Supabase prod-clone DB; manually validate that both AFL and netball flows work end-to-end against real-shape data. Phase 6 is the first time the merged trunk meets prod-shape data — it's the dress rehearsal for Phase 7's production cutover.

**Deliverables:**
- Vercel preview deployment of merge/multi-sport-trunk pointing at a Supabase env with a recent prod snapshot
- AFL game flow validated: lineup → live → quarter-break → summary card → share link
- Netball game flow validated: lineup → live → quarter-break → stats dashboard → summary card
- Existing AFL share links (`/run/[token]`) resolve correctly without RLS errors

**NOT in scope:**
- Production cutover (Phase 7 — fast-forward main + apply migrations to prod Supabase)
- Performance benchmarking (Phase 6/7 candidate per Phase 3 deferred items, but not a Phase 6 acceptance gate)
- Pause-event persistence bug (cross-cutting, deferred per Phase 3 CONTEXT)
- The `deleteTestUser` cleanup race in `team-invite.spec.ts` (Phase 6/7 candidate, not blocker)

</domain>

<decisions>
## Implementation Decisions

### Deploy target shape (gray area #1)
**LOCKED:** Vercel preview environment (the existing Vercel project's "preview" deployment slot — no fresh Vercel project) backed by EITHER:
- A new Supabase project initialized with a recent prod snapshot (preferred — cleanest isolation), OR
- The existing staging/preview Supabase project, restored from a recent prod snapshot

The choice between these depends on what infrastructure already exists in the Auskick Manager Vercel + Supabase accounts; planner should grep for env files / vercel CLI config / supabase project config before locking.
**Why:** Per milestone init: "Same Vercel + Supabase project; no fresh deploy; same repo target." Phase 6 reads "no fresh DEPLOY" as "no fresh Vercel project" — the preview slot of the existing project is the canonical staging path.

### Prod-clone authority (gray area #2)
**LOCKED:** User provisions the Supabase prod clone (BLOCKER per STATE). The clone must:
- Have all 27 migrations from `supabase/migrations/` applied
- Have a recent (last 30 days) snapshot of prod data restored
- Have RLS policies + auth schema intact (i.e., a real Supabase backup-restore, not a SELECT-and-INSERT migration)
- Be reachable from Vercel preview environment (env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)

Phase 6 plans CAN'T author the clone-creation script themselves — that's a Supabase Console / CLI operation requiring user creds. Plans CAN author:
- A migration-apply runbook the user runs against the clone
- A backfill-verify script (e.g., assert all teams have non-null sport='afl')
- Acceptance-test scripts that run against an arbitrary Supabase env

**Why:** Cred-required infrastructure operations belong in human-driven runbooks; automated planning can produce the runbooks but not execute them.

### Validation approach (gray area #3)
**LOCKED:** Three-layer validation:
1. **Smoke automated** — Re-run the Phase 5 gauntlet (Vitest + tsc + lint) against the merge trunk's HEAD (no env change). Confirms code didn't drift since Phase 5 close.
2. **Preview-targeted automated** — A small subset of e2e specs runnable against an arbitrary baseURL (e.g., `playwright test --base-url=https://preview-{hash}.vercel.app`). Useful as a smoke test of the deployed preview before manual validation. Limited because most specs require admin login + DB seeding which prod-clone may not support.
3. **Manual** — Human walks through AFL + netball flows on the preview against real-shape data. Captures screenshots / notes; surfaces any issues.

**Why:** Layered validation gives confidence without requiring the full e2e suite to run against prod-clone (which would require auth.users seeding that we can't safely do on a prod snapshot).

### Acceptance criteria — DEPLOY-01 + DEPLOY-02 (locked from REQUIREMENTS)
**LOCKED:**
- DEPLOY-01: Vercel preview deployment built from merged trunk, pointing at Supabase env populated with recent prod snapshot
- DEPLOY-02: Manual validation passes — actual AFL game flow + actual netball game flow + stats dashboards for both + summary card for both + share-link viewing
**Why:** Carry-forward from REQUIREMENTS.md; Phase 6 ROADMAP gates these as success criteria.

### Plan structure (gray area #4)
**LOCKED:** 5 plans:
- Plan 06-01 (auto): Pre-deploy hygiene — verify vercel.json, env-var matrix, build-step sanity check on the merge trunk; produce a "ready-to-deploy" checklist
- Plan 06-02 (auto): Author preview-deploy runbook (`.planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-RUNBOOK.md`) with step-by-step commands for the user: Supabase prod-clone provisioning, migration application, env-var configuration, Vercel deploy invocation, smoke-check criteria
- Plan 06-03 (auto): Author migration-apply verification script — a Node script that connects to a Supabase env (URL + service-role key) and asserts: 27 migrations applied; all teams have sport not-null; distinct sports include 'afl'; existing share tokens resolve via `/run/[token]` shape
- Plan 06-04 (autonomous: false, BLOCKED): Execute the runbook — provision clone, apply migrations, deploy preview. **Cannot run autonomously; requires user creds.** Plan can pause and wait for user signal.
- Plan 06-05 (autonomous: false, BLOCKED): Manual AFL + netball validation on the preview; capture results in `06-VALIDATION.md`. **Cannot run autonomously.**

Plans 06-01 + 06-02 + 06-03 are autonomous (no creds needed — pure documentation + script authoring). Plans 06-04 + 06-05 are autonomous: false and will pause waiting for user.

**Why:** Splits the "what we can prep autonomously" from "what needs human creds". Phase 6 makes maximum progress without forcing the user to provision infra prematurely.

### Phase 6 stops at "ready to deploy" if creds aren't ready
**LOCKED:** If Plans 06-04 + 06-05 require creds the user can't supply in this session, the autonomous workflow STOPS after Plans 06-01..03 land. STATE.md flags Phase 6 as "Plans 1-3 ready; Plans 4-5 blocked on user creds." Resume command: `/gsd-execute-phase 6 --wave 4` once prerequisites are in place.
**Why:** Honors the user's `--to 6` target without burning cycles waiting for creds.

### Wave structure
**LOCKED:** 5 plans in 5 waves; strict-sequential. Plans 06-01..03 ship the prep; 06-04 ships the deploy; 06-05 ships the validation.

### Out-of-scope items (re-confirmed deferred)
- Performance benchmarking (PROD-02 quantitative) — Phase 6/7 deferred per Phase 3, not a Phase 6 acceptance
- Pause-event persistence bug — cross-cutting, deferred per Phase 3
- ABSTRACT-01 / PROD-04 CI guards — backlog
- `deleteTestUser` cleanup race — Phase 6/7 candidate, not Phase 6 blocker

</decisions>

<code_context>
## Existing Code Insights

**Vercel + Next config:**
- `vercel.json` — only PlayHQ cron job (`/api/cron/sync-playhq`, daily at 3am). No build-step overrides, no preview-specific config. Probably doesn't need changes.
- `next.config.mjs` — read during planning to assess any preview-affecting config
- `package.json` — `"build": "next build"` — standard Next.js build invocation

**Migration set (27 total per Phase 4 close-out):**
- `0001_initial_schema.sql` … `0023_perf_indexes.sql` shared from prod
- `0024_multi_sport.sql` (sport, track_scoring, age_group columns + backfill `sport='afl'`)
- `0025_super_admin.sql`
- `0026_team_quarter_seconds.sql`
- `0027_game_quarter_seconds.sql`

**Phase 2 §6 acceptance criteria** (carry-forward from 02-SCHEMA-PLAN.md):
1. `supabase migration up` runs cleanly against the prod clone
2. After migration, every existing AFL team row has `sport='afl'` (not null)
3. `select count(*) from teams where sport is null` returns 0
4. `select distinct sport from teams` returns at least `'afl'`
5. An existing AFL share link via `/run/[token]` resolves on the preview without RLS errors

**Env vars expected** (per `.env.test` / `.env.example` if they exist):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- (Possibly more — verify during Plan 06-01 hygiene check)

**Phase 5 baseline:** TEST-01..05 ALL PASS; full gauntlet 52/1 stable; AFL non-regression intact.

**Phase 4 source modifications survived:** trackScoring prop chain wired (Plan 04-04); revalidatePath + router.refresh on netball server actions (Plan 05-04). These are the only Phase 4+5 deltas the prod clone will see — both are netball-specific, AFL flows untouched.

</code_context>

<specifics>
## Specific Ideas

- **Plan 06-01 (hygiene):** Read vercel.json + next.config.mjs + .env.example (if exists); produce a checklist of env vars + Vercel project settings to verify; commit checklist to `.planning/phases/06-preview-deploy-and-manual-validation/06-DEPLOY-CHECKLIST.md`
- **Plan 06-02 (runbook):** Step-by-step: Supabase Console "Restore from backup" → apply migrations via `supabase db push` or `supabase migration up` → configure Vercel preview env vars → trigger deploy via `vercel --prebuilt` or push-to-branch → confirm preview URL → run smoke-check criteria
- **Plan 06-03 (verify script):** `scripts/verify-prod-clone.mjs` — connects via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars, runs the 5 Phase 2 acceptance queries, exits 0 only if all pass
- **Plan 06-04 (deploy execute, BLOCKED):** Pause and wait for user to confirm clone is provisioned + creds are configured; then run the runbook
- **Plan 06-05 (manual validation, BLOCKED):** Provide validation checklist; user runs through AFL + netball flows on preview; results captured in `06-VALIDATION.md`

</specifics>

<deferred>
## Deferred Ideas

| Idea | Reason | Target |
|------|--------|--------|
| Performance benchmarking (PROD-02 quantitative) | Phase 6/7 deferred per Phase 3 CONTEXT; not a Phase 6 acceptance gate | Phase 7 or post-milestone |
| `deleteTestUser` cleanup race fix | Test-infra ergonomic; not milestone-blocker | Phase 7 candidate or post-milestone |
| ABSTRACT-01 / PROD-04 CI guards | Backlog per Phase 3 CONTEXT | v2 / future |
| Pause-event persistence bug | Cross-cutting, deferred per Phase 3 | Future milestone |

</deferred>

<open_questions>
## Open Questions for Researcher / Planner

- Does the project have an existing Supabase staging/preview project, or does the prod clone need to be a fresh project? (Check vercel CLI config + Supabase project list — likely user-only knowledge)
- Where does Vercel currently get its env vars for preview deployments? (Per-project Vercel dashboard settings; not in repo)
- Is there a documented "deploy preview" command in the repo (`vercel --prebuilt`, `vercel deploy --target preview`, etc.) or does the user trigger via push-to-branch?
- For DEPLOY-02's manual validation: should validation include creating a NEW netball team on the preview (full flow exercise), or only loading existing AFL data (since prod doesn't have netball teams yet)?

</open_questions>
