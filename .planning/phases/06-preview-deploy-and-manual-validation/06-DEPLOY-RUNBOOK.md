---
phase: 06-preview-deploy-and-manual-validation
artifact: deploy-runbook
generated: 2026-04-30
audience: human operator (user); Plan 06-04 executor following user signal
prerequisites:
  - Phase 5 closed green (06-CONTEXT.md confirms)
  - Plan 06-01 06-DEPLOY-CHECKLIST.md committed (env-var matrix authority)
  - Plan 06-03 scripts/verify-prod-clone.mjs committed (post-migration acceptance probe)
  - User has Supabase account access; access to a recent prod backup; Vercel project access
---

# Phase 6 — Preview deploy runbook

Step-by-step runbook for: provisioning the Supabase prod clone → applying migrations 0024..0027
→ configuring Vercel preview env vars → triggering the preview deploy → smoke-checking the
result → manual validation hand-off (Plan 06-05).

Six top-level sections: §A Supabase prod clone · §B Migration application · §C Vercel preview
env-var configuration · §D Deploy trigger · §E Smoke check · §F Rollback path · §G Hand-off.

---

## §0 — Preface

**Audience.** A human operator (the user) executes this runbook. Plan 06-04 (deploy execute)
waits at a `checkpoint:human-verify` gate until the user signals "creds ready"; once
signalled, the executor walks the runbook with the user's creds and prompts the user at any
step requiring dashboard interaction (Vercel + Supabase Console clicks).

**Source baseline.** The merged-trunk source is at HEAD `90364ee` (Phase 5 close — captured
in `05-EVIDENCE.md` §5). Phase 6 plans 06-01 + 06-02 + 06-03 add documentation/script
commits on top, but the source code (src/, supabase/migrations/, e2e/) MUST remain at the
Phase 5 baseline — verified by Phase 5's invariant table (15 invariants intact at HEAD
`90364ee`).

**Phase goal.** Phase 6 is a DRESS REHEARSAL for Phase 7 production cutover. Anything that
goes wrong here is in scope for fixing before Phase 7. Anything that goes right validates
DEPLOY-01 + DEPLOY-02.

**Authority for env vars + migrations.** This runbook does NOT re-derive the env-var matrix
or migration list. Both live in `06-DEPLOY-CHECKLIST.md` (Plan 06-01 — §1 + §5 respectively).
Phase C of this runbook references the checklist by section number; Phase B references the
checklist's §5.

---

## §A — Phase A: Provision Supabase prod clone

**What.** Stand up a Supabase project (new or existing-restored) populated with a recent
prod data snapshot, schema currently at the pre-merge state (last migration applied =
`0023_perf_indexes`).

**Inputs.**
- Supabase account credentials.
- Access to the production Supabase project (Auskick Manager prod) for snapshot export.
- Decision: **Path A1** (NEW project — cleanest isolation, recommended) OR **Path A2**
  (EXISTING staging project restored — faster if a staging project already exists).

**Estimated time.** 10–20 min (mostly waiting on snapshot download/restore).

### Path A1 — New Supabase project (recommended)

1. Open Supabase Console → "New Project".
2. Name it e.g. `siren-footy-preview-clone` (the name appears in the project URL).
3. Choose a region close to the prod region (latency parity for honest dress rehearsal).
4. Set a strong DB password; record it in the user's password manager.
5. Wait for project provision (~2 min).
6. From the **prod project**: Database → Backups → "Download" the most recent daily backup
   (`.sql` file).
7. From the **new clone project**: Database → Backups → "Restore" → upload the prod `.sql`
   → confirm.
8. After restore completes, the clone now mirrors prod (schema + data + auth).

### Path A2 — Existing staging project, restored

1. Identify the existing staging Supabase project. User-only knowledge — check the Vercel
   project's existing env vars on the "Preview" environment scope; the URL there names the
   staging project.
2. Repeat steps 6–8 from Path A1, restoring INTO the existing staging project. **This
   OVERWRITES staging data — confirm with user before proceeding.**

### Acceptance for Phase A

- From the runbook executor's terminal, with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  set to the clone's values:
  - `supabase link --project-ref <clone-ref>` succeeds (links the merged-trunk repo to the
    clone).
  - `supabase migration list` shows the migration list with 0001..0023 marked as applied
    (the prod snapshot brought them forward) and 0024..0027 marked as **PENDING**.
- If `supabase migration list` shows 0024..0027 already applied: STOP. The clone was created
  from a snapshot newer than the merge — Phase 6 expectations don't hold. Investigate before
  continuing.

---

## §B — Phase B: Apply migrations 0024..0027

**What.** Apply the four net-new migrations on top of the prod-cloned schema, atomically,
leaving the clone at the merged-trunk schema state. See `06-DEPLOY-CHECKLIST.md` §5 for the
full migration enumeration; only the four net-new migrations need application here.

**Inputs.**
- Phase A complete (clone has 0001..0023 applied; 0024..0027 pending).
- Local checkout of `merge/multi-sport-trunk` at HEAD `90364ee` or later.
- Supabase CLI authenticated and linked to the clone.

**Estimated time.** 2–5 min.

### Path B1 — `supabase db push` (preferred)

1. From repo root with `supabase link --project-ref <clone-ref>` complete:
   ```
   supabase db push
   ```
   (applies all pending migrations in order)
2. Watch for the four migrations to land:
   - `0024_multi_sport.sql`
   - `0025_super_admin.sql`
   - `0026_team_quarter_seconds.sql`
   - `0027_game_quarter_seconds.sql`
3. If `supabase db push` errors, fall back to Path B2.

### Path B2 — Manual SQL Editor application (fallback)

1. Open Supabase Console → SQL Editor for the clone project.
2. Open `supabase/migrations/0024_multi_sport.sql` from the local checkout, paste verbatim,
   run.
3. Repeat for `0025_super_admin.sql`, `0026_team_quarter_seconds.sql`,
   `0027_game_quarter_seconds.sql` IN ORDER.
4. After each, manually `INSERT INTO supabase_migrations.schema_migrations (version)
   VALUES (...)` if Supabase didn't auto-record (check Database → Migration History pane).

### Acceptance for Phase B

- `supabase migration list --linked` shows all 27 migrations applied; the PENDING column is
  empty.
- Run the verify script (Plan 06-03) — exit 0:
  ```
  SUPABASE_URL=https://<clone>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt> \
  node scripts/verify-prod-clone.mjs
  ```
  Expected: Q1 PASS (or WARN with PostgREST-exposure note — the script handles this
  defensively; manual `supabase migration list` is the documented fallback), Q3 PASS, Q4
  PASS, Q5 PASS or WARN-zero-tokens, exit code 0.
- If the verify script exits non-zero: Phase B is INCOMPLETE. Investigate the failing query
  before advancing to Phase C.

---

## §C — Phase C: Configure Vercel preview env vars

**What.** Set the three Phase-6-CRITICAL env vars on the Vercel project's "Preview"
environment scope, pointing at the clone provisioned in Phase A.

**Inputs.**
- Vercel project access (the existing Siren Footy / Auskick Manager Vercel project).
- Supabase clone URL + anon key + service-role key (from Phase A — copy from Supabase
  Console → Project Settings → API).
- `06-DEPLOY-CHECKLIST.md` §1 — **the env-var matrix is the authority. Do NOT re-derive
  the matrix here.**

**Estimated time.** 5 min.

### Path C1 — Vercel dashboard

1. Open Vercel dashboard → Project → Settings → Environment Variables.
2. Click "Add New".
3. For each of the three Phase-6-CRITICAL vars (per `06-DEPLOY-CHECKLIST.md` §1):
   - Name: exact var name (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`)
   - Value: paste from Phase A output
   - Environment: check "Preview" ONLY (do NOT touch Production — that's Phase 7's job)
   - For `SUPABASE_SERVICE_ROLE_KEY`: confirm Vercel's "Sensitive" toggle is set so the
     value is masked in the dashboard.

### Path C2 — Vercel CLI (alternative)

1. `vercel env add NEXT_PUBLIC_SUPABASE_URL preview` → paste value when prompted.
2. `vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview` → paste value.
3. `vercel env add SUPABASE_SERVICE_ROLE_KEY preview` → paste value (CLI marks
   service-role as sensitive automatically when the value matches the JWT pattern).

### Acceptance for Phase C

- `vercel env ls preview` lists exactly the three Phase-6-CRITICAL vars (plus any
  Vercel-injected ones like `VERCEL_ENV` — those don't appear in `vercel env ls`).
- Optional vars (`RESEND_*`, `TELEGRAM_*`, `NEXT_PUBLIC_DEFAULT_BRAND`) are deliberately
  NOT set per `06-DEPLOY-CHECKLIST.md` §1 (Phase 6 doesn't exercise the contact form,
  sign-up notification, or branding).
- If `CRON_SECRET` appears in `vercel env ls preview`: that's fine, but it's not required
  for Phase 6 (preview deploys do not run crons by Vercel default).

---

## §D — Phase D: Trigger preview deploy

**What.** Build the merged trunk and deploy it to a Vercel preview URL backed by the env
config from Phase C.

**Inputs.**
- Phases A + B + C complete.
- `merge/multi-sport-trunk` branch pushed to GitHub remote (or Vercel CLI logged in
  locally).

**Estimated time.** 5–10 min (mostly Vercel build wall-clock).

### Optional pre-flight: local `npm run build`

Per `06-DEPLOY-CHECKLIST.md` §4, a local `npm run build` against `.env.local` (filled with
local Supabase CLI values) gives high confidence Vercel will succeed. RECOMMENDED but
OPTIONAL — Phase 5's e2e gauntlet implicitly proves `next build` works at HEAD `90364ee`,
so a fresh local build is a sanity check, not a gate.

### Path D1 — `git push` (preferred)

1. From local checkout:
   ```
   git push origin merge/multi-sport-trunk
   ```
2. Vercel git integration auto-triggers a Preview deploy.
3. Watch deploy progress: Vercel dashboard → Deployments tab → newest deploy → "View
   Function Logs".
4. Build target: `npm install && npm run build` (Vercel default — no override in
   `vercel.json`).
5. After ~2–4 min: deploy URL appears (e.g.
   `siren-footy-<hash>-<gh-user>.vercel.app`).

### Path D2 — Local CLI

1. From repo root with `vercel` CLI logged in:
   ```
   vercel deploy --target preview
   ```
   (uploads working tree, builds on Vercel side)

   OR for faster deploys on slow remote networks:
   ```
   vercel build && vercel deploy --prebuilt --target preview
   ```
   (builds locally, uploads pre-built artefact)

2. CLI prints preview URL on success.

### Acceptance for Phase D

- Deploy status: **"Ready"** in Vercel dashboard.
- Build log shows zero errors. Warnings expected — match the 3 pre-existing lint warnings
  from Phase 5 close per `05-EVIDENCE.md` §1:
  - `LiveGame.tsx:810` exhaustive-deps
  - `FeatureSection.tsx:77` no-img-element
  - `NetballLiveGame.tsx:509` exhaustive-deps

  If MORE warnings appear, investigate — possible Phase 6 doc/script change drift.
- Preview URL responds: `curl -fsS <preview-url>/` returns 200 on the marketing landing
  page.

---

## §E — Phase E: Smoke check

**What.** Confirm the preview is functionally up before handing off to Plan 06-05's manual
walk-through.

**Estimated time.** 3–5 min.

### Steps

1. **Preview alive** (auto):
   - `curl -fsS <preview-url>/` → 200
   - `curl -fsS <preview-url>/login` → 200 (auth route compiles)
   - Open preview URL in browser → marketing landing page renders without console errors.

2. **Migrations applied to clone** (auto — re-run from Phase B for completeness):
   ```
   SUPABASE_URL=https://<clone>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt> \
   node scripts/verify-prod-clone.mjs
   ```
   Expected exit 0 — all 5 Phase 2 §6 acceptance queries automated. If Q1 returns WARN
   (PostgREST schema-exposure edge), the operator manually verifies via
   `supabase migration list --linked` per `06-DEPLOY-CHECKLIST.md` §6 #6.

3. **Sample share-token captured** (manual hand-off):
   - The verify script's Q5 PASS line emits a sample `/run/<token>` URL on the clone's
     dataset.
   - Record this URL — Plan 06-05 (`06-VALIDATION.md`) walks the user through opening it
     on the live preview to confirm `/run/[token]` resolves without RLS errors (closing
     the manual half of Phase 2 §6 query 5).

4. **Hand-off to manual validation**:
   - Plan 06-05 (`06-VALIDATION.md`) owns the AFL flow + netball flow + share-link smoke
     walk-through.
   - At this point, Phase 6 plans 06-01..06-04 have completed all the autonomous work; the
     human walks the preview from the validation checklist.

---

## §F — Rollback path

### If Phase B migrations go wrong

- Restore the clone Supabase project from a fresh prod snapshot (Phase A all over again).
- Investigate the migration error locally against `npm run db:reset` first; do NOT iterate
  on the clone.
- If the migration is intrinsically broken at HEAD `90364ee` (i.e. the four net-new
  migrations 0024..0027 won't apply on top of a real prod snapshot): STOP. This is a
  Phase 7 blocker — file under STATE.md "Blockers/Concerns" and surface to the user
  immediately.

### If Phase D deploy fails to build

- Check the Vercel build log; common causes:
  - Missing env vars (re-run Phase C).
  - Node version mismatch (Vercel defaults to Node 20+, repo's `package.json` has no
    `engines` field → Vercel default works).
  - New dependency not in `package-lock.json` (shouldn't apply — Phase 6 plans add zero
    deps).
- Fix locally, push a new commit, Vercel auto-redeploys.

### If Phase E smoke surfaces an issue

- DO NOT promote to production.
- Phase 6 STOPS until the issue is fixed; the Phase 5 baseline is the rollback target
  (`git checkout 90364ee` in a fresh worktree if needed).
- File a Phase-6-blocker entry in `.planning/STATE.md` "Blockers/Concerns".

### Vercel deploy revert

- Vercel dashboard → Deployments → previous green deploy → "Promote to Production" /
  "Rollback".
- Note: For Phase 6 there's no production promotion; this is purely about backing out a
  broken preview if it confuses team members. The previous preview deploy automatically
  becomes the active preview when a new one is rolled back.

### Code revert

- `git revert <merge-commit>` if a hotfix is needed; re-run from Phase B.
- Pre-merge tags (`pre-merge/main`, `pre-merge/multi-sport`) are FROZEN per Phase 1
  acceptance — DO NOT move them as part of any Phase 6 rollback.

---

## §G — Hand-off

After Phase E exits green:

- **Plan 06-04 (deploy execute)** has completed its autonomous work — the executor was
  walking this runbook in lock-step with the user.
- **Plan 06-05 (manual validation)** owns the remaining work — the executor at that point
  reads `06-VALIDATION.md` and prompts the user step-by-step through:
  - The AFL game flow (lineup → live → quarter-break → summary card → share link via the
    sample `/run/<token>` URL captured in Phase E).
  - The netball game flow (lineup → live → quarter-break → stats dashboard → summary
    card).
- **Phase 6 closes** when both 06-04 (deploy) and 06-05 (validation) record PASS in their
  respective SUMMARYs.

---

## Cross-plan reference index

- `06-DEPLOY-CHECKLIST.md` — Plan 06-01 hygiene checklist (env-var matrix authority +
  migration enumeration). Referenced by §C (env vars) + §B (migration list).
- `scripts/verify-prod-clone.mjs` — Plan 06-03 acceptance probe. Invoked at end of §B and
  in §E.
- `06-VALIDATION.md` — Plan 06-05 manual validation deliverable. §G hand-off pointer.
