---
phase: 06-preview-deploy-and-manual-validation
artifact: hygiene-checklist
generated: 2026-04-30
inputs:
  - vercel.json
  - next.config.mjs
  - .env.local.example
  - package.json
  - supabase/migrations/ (27 files)
  - src/ (process.env reads — grep verified at execute time)
---

# Phase 6 — Pre-deploy hygiene checklist

Read this BEFORE running the deploy runbook (`06-DEPLOY-RUNBOOK.md`). Every item below is
something the human operator confirms in the Vercel dashboard or a local shell. The runbook
references this document by section number — do not duplicate the env-var matrix elsewhere.

Sections: §1 Env Var Matrix · §2 vercel.json audit · §3 next.config.mjs audit · §4 Build
sanity · §5 Migration set · §6 Ready-to-deploy boolean criteria.

---

## §1 Env Var Matrix

Authority: `grep -rE "process\.env\.[A-Z_]+" src/` against the merged-trunk source at HEAD
`90364ee` (Phase 5 close). Every row in the table corresponds to a verified `process.env.*`
read in `src/`. Re-run the grep at execute time before consuming this matrix to pick up any
env reads added since the checklist was authored.

| Var | Required for Phase 6 preview? | Source | Sensitivity | Where to set in Vercel | Notes |
|-----|-------------------------------|--------|-------------|------------------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | YES — required | User-supplied (Supabase prod-clone project URL) | Public (NEXT_PUBLIC_*) | Project Settings → Environment Variables → Preview scope | Per CONTEXT D-CONTEXT-cred-blocker — user provisions the prod clone. Read by browser + middleware + server + admin clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | YES — required | Supabase prod-clone anon JWT | Public | Project Settings → Environment Variables → Preview scope | Read by browser + middleware + server clients (NOT admin — admin uses service role). |
| `SUPABASE_SERVICE_ROLE_KEY` | YES — required | Supabase prod-clone service-role JWT | **SECRET** — never log, never commit | Project Settings → Environment Variables → Preview scope (mark as Sensitive) | Required by `src/lib/supabase/admin.ts` for super-admin paths. |
| `CRON_SECRET` | OPTIONAL on preview | Auto-injected on Vercel prod; preview gets undefined unless explicitly set | Secret | Vercel auto-injects on production; do NOT manually set on preview unless cron testing is in scope | Per `src/app/api/cron/sync-playhq/route.ts` — cron only fires on prod, not preview, by Vercel's default behaviour. Also read by `src/app/api/admin/seed-demo/route.ts`. |
| `VERCEL_ENV` | AUTO | Vercel-injected — `production` / `preview` / `development` | N/A — read-only | Auto-injected by Vercel | Used by `src/app/layout.tsx` to gate Speed Insights to prod-only (`IS_PROD_DEPLOY = process.env.VERCEL_ENV === "production"`). |
| `NEXT_PUBLIC_DEFAULT_BRAND` | OPTIONAL | User decision (defaults via `??` if unset) | Public | Optional | Brand multi-tenancy hint in `src/lib/supabase/middleware.ts`; safe to leave unset for Phase 6. |
| `RESEND_API_KEY` | OPTIONAL | Resend dashboard | Secret | Skip on preview unless contact-form testing is in scope | `notifySignup` + ContactForm no-op if unset (per `src/lib/resend.ts`); Phase 6 manual validation does NOT exercise the contact form. |
| `RESEND_FROM_EMAIL` | OPTIONAL | User decision | Public-ish | Skip on preview | Defaults to `Siren Footy <hello@sirenfooty.com.au>` if unset. |
| `RESEND_TO_EMAIL` | OPTIONAL | User decision | Public-ish | Skip on preview | Defaults to `hello@sirenfooty.com.au` if unset. |
| `TELEGRAM_BOT_TOKEN` | OPTIONAL | Telegram + user account | Secret | Skip on preview | Sign-up notifier no-ops if unset (per `src/lib/notifications/telegram.ts`); Phase 6 doesn't exercise sign-ups beyond the existing super-admin. |
| `TELEGRAM_CHAT_ID` | OPTIONAL | Telegram + user account | Secret | Skip on preview | Paired with `TELEGRAM_BOT_TOKEN` — both no-op together. |

### The Phase-6-CRITICAL three

Three vars without which the preview deploy will fail at runtime (every page that touches
Supabase goes through `getSupabaseClient()` / `getSupabaseAdminClient()` which dereference
these with non-null assertions `!`):

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `SUPABASE_SERVICE_ROLE_KEY`

If any of these is unset on the Preview environment scope, the first Supabase round-trip
crashes the page. Verify all three are configured before triggering Phase D in the runbook.

### Vercel-injected (do NOT set manually)

- `VERCEL_ENV` — Vercel sets this on every deploy. Read-only from the operator's perspective.
- `CRON_SECRET` — Vercel injects this on Production deploys only. Preview deploys do NOT
  receive it by default (and Phase 6 doesn't need it — preview deploys do not run crons).

### Where Vercel stores per-environment vars

Vercel dashboard → Project → Settings → Environment Variables. When adding a new variable,
check the "Preview" environment scope (and only that scope for Phase 6 — leave Production
untouched, that's Phase 7's job).

CLI alternative: `vercel env add <NAME> preview` — paste value when prompted.

---

## §2 vercel.json audit

Current `vercel.json` (verbatim, byte-for-byte at Phase 5 close):

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-playhq",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Implications:

- Only the PlayHQ daily cron is configured. No build-step override, no per-environment
  overrides, no rewrites, no headers.
- Vercel preview deployments inherit defaults: `npm install && npm run build` is the build
  command (= `next build`).
- Preview deployments do NOT run crons (Vercel runs crons on Production deployments only by
  default — confirmed via Vercel docs; the cron above will fire only against the Production
  deploy of `main`, not against any Phase 6 preview).
- **No changes required to `vercel.json` for Phase 6.** Leave the file untouched.
- If a future phase needs preview crons or per-environment build commands, this is where
  they would land. Out of Phase 6 scope.

---

## §3 next.config.mjs audit

Current `next.config.mjs` (verbatim, byte-for-byte at Phase 5 close):

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

Implications:

- Empty config object. No experimental flags, no rewrites, no headers, no asset-prefix
  overrides, no env-passthrough, no image-domain configuration.
- Next.js 14.2.29 stock behaviour applies (per `package.json:dependencies`).
- **No changes required for Phase 6.** Leave the file untouched.

---

## §4 Build sanity

What Vercel runs on the preview deploy:

- Default install: `npm install`
- Default build: `npm run build` → `next build` (per `package.json:scripts.build`)
- Default output: `.next/` standalone build, served via Vercel's Next.js runtime

What Phase 5 already validated:

- Phase 5's gauntlet (`tsc + lint + vitest + e2e`) ran cleanly at HEAD `90364ee`.
- The e2e runner (`scripts/e2e-setup.mjs`) invokes `next start` on port 3000, which requires
  a successful prior `next build` — so Phase 5's e2e green-bar is implicit evidence that
  `next build` succeeds against the merged trunk.

Local pre-flight (RECOMMENDED but OPTIONAL):

- Copy `.env.local.example` to `.env.local` and fill the three Phase-6-CRITICAL vars with
  your local Supabase CLI's values (NOT the prod-clone values — keep prod creds out of
  `.env.local` unless you've decided to run the script tooling against the clone locally).
- Run `npm run build`.
- Expected: build completes with zero errors. Warnings will match the 3 pre-existing lint
  warnings noted in Phase 5 §1 (LiveGame.tsx exhaustive-deps, FeatureSection.tsx no-img-element,
  NetballLiveGame.tsx exhaustive-deps).

If `npm run build` succeeds locally with `.env.local` values, it WILL succeed on Vercel
preview with the equivalent prod-clone values configured in the dashboard. The runbook
(Plan 06-02 Phase D) names `npm run build` as the pre-deploy local sanity step.

---

## §5 Migration set

`ls supabase/migrations/` returns 27 files at Phase 5 close. The full enumeration follows.

### Shared / pre-fork migrations (carried unchanged from prod) — 23 files

These are already applied on the prod database, and therefore already applied on any clone
created via Supabase backup-restore. They are NO-OPs against the prod clone.

```
0001_initial_schema.sql
0002_games_availability.sql
0003_live_game.sql
0004_sub_interval.sql
0005_injury.sql
0006_share_token.sql
0007_on_field_size.sql
0008_age_group.sql
0009_playhq_external_id.sql
0010_team_playhq_url.sql
0011_team_song.sql
0012_song_duration.sql
0013_score_undo_and_field_zone_swap.sql
0014_game_fill_ins.sql
0015_squad_size.sql
0016_song_enabled.sql
0017_team_invites.sql
0018_crm_foundation.sql
0019_player_loan.sql
0020_jersey_number_nullable.sql
0021_demo.sql
0022_parent_mark_availability.sql
0023_perf_indexes.sql
```

### Multi-sport / Phase 3 net-new migrations — 4 files

These are the ONLY migrations the operator must apply on top of the prod-clone snapshot.
They are the migrations the prod clone will see for the first time during Phase 6.

```
0024_multi_sport.sql              — sport + track_scoring + age_group constraint relax + period_break_swap event widen
0025_super_admin.sql              — super-admin role, renumbered from main:0024 per Phase 2 §1 hash equivalence
0026_team_quarter_seconds.sql     — per-team quarter override
0027_game_quarter_seconds.sql     — per-game quarter override
```

### Seed file — NOT applied to the prod clone

`supabase/seed.sql` (Plan 05-01's Kotara Koalas seed) is **local-dev only**. Per
06-CONTEXT.md and Phase 5 hand-off, the prod clone receives real production data via
Supabase backup-restore. The runbook MUST NOT reference `npm run db:reset` against the prod
clone — that would wipe the restored data.

### Phase 2 §6 acceptance carry-forward

After applying 0024..0027 to the prod clone, all five Phase 2 §6 acceptance queries must
pass. Plan 06-03 (`scripts/verify-prod-clone.mjs`) automates queries 1, 3, 4, and 5
(existence/queryability half); query 2 and the `/run/[token]` resolution half of query 5
are manual (Plan 06-05 owns).

---

## §6 Ready-to-deploy boolean criteria

The operator can verify these one-by-one before triggering Phase D in the runbook. All MUST
be true; if any is false, do NOT proceed.

| # | Criterion | How to verify | Pass? |
|---|-----------|---------------|-------|
| 1 | `vercel.json` is unchanged from Phase 5 close | `git diff 90364ee..HEAD -- vercel.json` returns no output | ☐ |
| 2 | `next.config.mjs` is unchanged from Phase 5 close | `git diff 90364ee..HEAD -- next.config.mjs` returns no output | ☐ |
| 3 | `package.json` is unchanged from Phase 5 close | `git diff 90364ee..HEAD -- package.json` returns no output | ☐ |
| 4 | Phase-6-CRITICAL three (Supabase URL + anon key + service-role) are set on the Vercel "Preview" environment scope | `vercel env ls preview` lists all three | ☐ |
| 5 | Supabase prod clone is provisioned and reachable from Vercel preview | clone URL resolves; service-role key authenticates a `select` against `teams` | ☐ |
| 6 | All 27 migrations are applied on the clone | `supabase migration list --linked` shows 0001..0027 applied; or `node scripts/verify-prod-clone.mjs` exits 0 (Q1 PASS) | ☐ |
| 7 | `teams.sport` is non-null for every row on the clone | `node scripts/verify-prod-clone.mjs` Q3 returns count=0 | ☐ |
| 8 | `teams.sport` distinct values include `'afl'` on the clone | `node scripts/verify-prod-clone.mjs` Q4 PASS | ☐ |
| 9 | `share_tokens` table has at least one historical AFL token (for manual `/run/[token]` smoke) | `node scripts/verify-prod-clone.mjs` Q5 PASS — emits a sample token URL | ☐ |
| 10 | Local `npm run build` succeeds with `.env.local` populated (RECOMMENDED, optional) | exit code 0; build summary shows all routes compiled | ☐ |

When every box above is checked, proceed to Phase D of the runbook (`06-DEPLOY-RUNBOOK.md`).

---

## Hand-off

- Plan 06-02 (`06-DEPLOY-RUNBOOK.md`) consumes §1 (env-var matrix) and §5 (migration set)
  directly. Do not re-derive those tables in the runbook — link to this checklist.
- Plan 06-03 (`scripts/verify-prod-clone.mjs`) consumes §5 + Phase 2 §6 acceptance criteria.
  The script automates the boolean criteria 6, 7, 8, and 9 above.
- Plan 06-04 (deploy execute, BLOCKED on creds) walks the runbook with the user; this
  checklist is the operator's sanity-check before the executor advances past Phase C.
- Plan 06-05 (manual validation, BLOCKED on creds) reads §6 #9's emitted sample token to
  open `/run/<token>` on the live preview as part of DEPLOY-02 manual validation.
