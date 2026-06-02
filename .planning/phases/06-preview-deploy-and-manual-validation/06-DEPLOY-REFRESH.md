---
phase: 06-preview-deploy-and-manual-validation
doc: deploy-refresh
supersedes:
  - 06-DEPLOY-RUNBOOK.md (§A migration assumptions, §B migration set, §E verify expectations)
  - 06-DEPLOY-CHECKLIST.md (§2 vercel.json, §3 next.config.mjs, §5 migration set, §6 criteria #1–#3)
baseline_frozen: 2026-04-30 @ 90364ee (Phase-5 baseline, merge/multi-sport-trunk)
refreshed: 2026-06-02 @ f0a1481 (current main HEAD)
drift: 726 commits, +20 migrations (27 → 47), 3 hygiene-invariant config files changed, +2 env-var families
---

# Phase 6 Deploy Refresh — main @ f0a1481

The original runbook/checklist were frozen on **2026-04-30** against the
Phase-5 baseline `90364ee`. We are now deploying current `main` HEAD
`f0a1481` — **726 commits later**. This addendum re-derives every deploy
input that drifted and is **authoritative** wherever it conflicts with the
frozen docs. The frozen docs remain valid for their *procedure* (the
Path A/B/C/D/E *shape*); only the concrete assumptions below changed.

The deploy itself is unchanged in *intent*: clone prod → apply pending
migrations → set Vercel **Preview** env vars → deploy `main` to preview →
smoke → hand to 06-05 manual validation. Human-operated; executor drives
the runbook and records evidence (D-CONTEXT-cred-blocker locked).

---

## 1. Env-var matrix (re-derived from `src/`)

Source of truth: `grep -rEo "process\.env\.[A-Z_]+" src/` on `f0a1481`
(NAMES only — no values ever read/logged/persisted).

### Phase-6-CRITICAL — MANDATORY (preview won't boot / auth fails without these)
Set on Vercel scope **Preview**. UNCHANGED from frozen baseline.

| Var | Used by |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase/{client,server,middleware,admin}.ts`, `sendPushNotification.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `supabase/{client,server,middleware}.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase/admin.ts`, `sendPushNotification.ts` — **mark Sensitive** |

> These three remain the ONLY hard requirement for the coach app + share
> links to function on the preview. The deploy gate is unchanged here.

### Optional / feature-gated — degrade gracefully if unset (safe to skip for preview)

| Var | Used by | Behaviour if unset on preview |
|-----|---------|-------------------------------|
| `NEXT_PUBLIC_PUBLIC_ORIGIN` | `platform.ts:68` **(NEW)** | Web ignores it (uses `window.location.origin`); only the native shell reads it. **Skip for web preview.** |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_TO_EMAIL` | `resend.ts`, `member-actions.ts` | Team-invite + feedback emails won't send. Coach flows otherwise fine. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | `notifications/telegram.ts` | Feedback→Telegram relay no-ops. |
| `NEXT_PUBLIC_DEFAULT_BRAND` | `supabase/middleware.ts:21` | Falls back to default brand. |
| `CRON_SECRET` | `cron/sync-playhq`, `admin/seed-demo` | Crons run on **production only**, never preview — inert here. |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | `api/decap/{auth,callback}` **(NEW)** | Decap CMS `/admin` returns 500 if hit. Not part of the coach app; **skip for preview.** |

### Auto-injected by Vercel — DO NOT set manually
`VERCEL_ENV` (`layout.tsx:22`), `NODE_ENV` (build-time).

**Net change vs frozen checklist §1:** two NEW env-var families surfaced
(`NEXT_PUBLIC_PUBLIC_ORIGIN`, `GITHUB_OAUTH_*`) — **both optional for a web
preview**. The mandatory set is identical to the original three. No new
*required* secret was introduced by 726 commits of work.

---

## 2. Migration set — 47 files (was 27)

`supabase/migrations/` now holds **47** files: `0001_initial_schema.sql`
… `0047_track_zone_time.sql`. Frozen checklist §5 / runbook §A–§B assumed
27 (0001–0023 applied, 0024–0027 pending). **That is stale.**

**Refreshed Phase B rule:** apply *whatever the clone reports pending* —
do NOT hardcode a range.

```bash
supabase migration list --linked   # authoritative pending set on the clone
supabase db push                   # applies all pending
supabase migration list --linked   # re-confirm: 0 pending, 47 applied
```

- If prod is at 0023 → 0024–0047 apply (24 migrations).
- If the clone is fresh-from-prod and prod is further along → fewer apply.
- **Prod DB state is unverified by decision — verify empirically on the
  clone** (D-CONTEXT "Not sure — verify on the clone"). The `migration list`
  output IS the ground truth; whatever shows pending is what we push.

After push, `schema_migrations` should hold **47** rows.

---

## 3. `verify-prod-clone.mjs` — Q1 expected count patched 27 → 47

`scripts/verify-prod-clone.mjs` is the Phase B / Phase E automated
acceptance probe (read-only; zero writes). Its Q1 check hardcoded
`count === 27`, which would **falsely FAIL** a correctly-migrated clone
(47 rows) on the rare path where `supabase_migrations.schema_migrations`
is PostgREST-exposed. **Patched to `=== 47` this refresh.**

- Normal path (schema not exposed → PostgREST error) still → **WARN**, and
  the operator's manual `supabase migration list --linked` is authoritative.
- Q3/Q4/Q5 (teams.sport non-null, distinct includes `afl`, share_tokens
  sample) are schema-stable and **unchanged** — still the right gates.

Acceptance unchanged: exit 0 = pass; exit 1 = data-shape FAIL; exit 2 = env
misconfig.

---

## 4. Config files changed since baseline — all BUILD-SAFE on Vercel

Frozen checklist §2/§3/§6(#1–#3) asserted these were unchanged. They have
changed; **none blocks the Vercel build.** Audited this refresh:

### `vercel.json` (frozen §2 stale)
```json
{ "regions": ["syd1"],
  "crons": [ {"path":"/api/cron/sync-playhq","schedule":"0 3 * * *"},
             {"path":"/api/admin/seed-demo","schedule":"30 3 * * *"} ] }
```
Crons run on **production deployments only** — inert on a preview deploy.
`CRON_SECRET` guards both routes. `syd1` region is correct for AU. No
deploy blocker.

### `next.config.mjs` (frozen §3 stale — was empty)
Now wraps config in `@ducanh2912/next-pwa`:
- **PWA disabled in dev**, **ENABLED on Vercel** (`NODE_ENV=production`) →
  generates service worker + precache at build.
- `fallbacks.document: "/offline"` → route **exists** at
  `src/app/offline/page.tsx` ✓ (verified) — build won't fail on a missing
  fallback.
- Runtime caching is deploy-safe: **NetworkFirst** for navigations + RSC
  (`_next/data`), **CacheFirst** only for immutable hashed
  `_next/static/*`; `skipWaiting`+`clientsClaim`+`cleanupOutdatedCaches`
  is the recommended frequent-deploy combo (avoids stale-shell footgun).
- This is production-tested config. **No deploy blocker.**

### `package.json` build hooks (NEW since baseline) — both no-op safely on Vercel
- `postinstall: node scripts/copy-capacitor-bridge.mjs` — copies
  `@capacitor/core/dist/capacitor.js` → `public/capacitor.js`. If the
  source is missing it warns + `exit 0`. **Never breaks `npm ci`.**
- `prepare: node scripts/install-git-hooks.mjs` — **first line**
  `if (process.env.CI) silentlyExit()`; Vercel sets `CI`, so it no-ops
  immediately. Even off-CI, git/config failures are non-fatal. **Never
  breaks the build.**

**Refreshed checklist §6 criteria #1–#3** ("config files unchanged") are
obsolete — replace with: *"config files changed but audited build-safe
(this §4)."* Criteria #4–#10 stand.

---

## 5. Quality baselines (for Phase D gates)

Captured on `f0a1481` this refresh:

| Gate | Baseline |
|------|----------|
| `npm run lint` | 0 errors; **4 known warnings** — `LiveGame.tsx:1257`, `QuarterBreak.tsx:493`, `FeatureSection.tsx:77`, `NetballQuarterBreak.tsx:412` (all pre-existing exhaustive-deps / no-img). Deploy gate = **no NEW** warnings/errors. |
| `npx tsc --noEmit` | Expected exit 0 (Phase 13 close confirmed; re-run as pre-flight). |
| `npm test` (Vitest) | 889/889 at Phase 13 close. |
| local `npm run build` | Recommended pre-flight given config churn (needs `.env.local`). Confirms the PWA + hooks build clean before touching the clone. |

---

## 6. Refreshed execution order (deltas only — frozen §A–§G shape stands)

1. **Pre-flight (no creds):** `npx tsc --noEmit`, `npm run lint` (expect §5
   baseline), optional `npm run build` with `.env.local`.
2. **§A provision clone (USER):** new prod clone (Path A1 recommended) or
   restored staging. `supabase link --project-ref <ref>`.
3. **§B migrations:** `supabase migration list --linked` → `supabase db
   push` → re-list (0 pending / 47 applied). Then
   `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node
   scripts/verify-prod-clone.mjs` → **exit 0** (Q1 now expects 47; WARN on
   the manual-fallback path is acceptable).
4. **§C Vercel env (Preview scope):** set the **three** Phase-6-CRITICAL
   vars (`vercel env add <NAME> preview`); mark `SUPABASE_SERVICE_ROLE_KEY`
   Sensitive. Optional vars from §1 only if the corresponding feature is
   being validated. Skip `NEXT_PUBLIC_PUBLIC_ORIGIN` + `GITHUB_OAUTH_*`.
5. **§D deploy main:** `git push` (preview) or `vercel deploy --target
   preview`. Acceptance: status Ready, `curl -fsS <url>/` → 200.
6. **§E smoke:** `curl` `/` + `/login` (200); re-run `verify-prod-clone.mjs`
   against the clone; capture a sample `/run/<token>` for 06-05.
7. Write **06-04-SUMMARY.md** (preview URL, clone ref, migration-list
   before/after, verify-script output, Phase A–E outcomes).
8. **§G hand-off → Plan 06-05** manual validation (AFL + netball + share
   link → 06-VALIDATION.md).

---

## 7. Open items resolved by this refresh

- ✅ Env-var matrix re-derived — mandatory set unchanged; 2 new optional families documented.
- ✅ Migration count corrected 27 → 47; Phase B made empirical (`migration list` authoritative).
- ✅ `verify-prod-clone.mjs` Q1 patched 27 → 47.
- ✅ Build-hook safety (postinstall/prepare) audited — both no-op on Vercel.
- ✅ PWA + vercel.json audited — build-safe; `/offline` route confirmed present.
- ✅ Lint baseline recaptured (0 err / 4 known warns).
- ⏳ Prod DB migration state — deferred to empirical `migration list` on the clone (per locked decision).
