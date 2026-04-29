# External Integrations

**Analysis Date:** 2026-04-29

## APIs & External Services

**PlayHQ:**
- Service: Australian youth sports league fixtures and team management system
- What it's used for: Syncing game fixtures to teams (one-way read-only)
  - SDK/Client: Custom minimal GraphQL client in `src/lib/playhq.ts`
  - Authentication: Public GraphQL API (no API key required — anonymous with User-Agent headers)
  - Scheduled sync: Daily cron job at 03:00 UTC (`vercel.json` defines schedule)
  - Sync endpoint: `src/app/api/cron/sync-playhq/route.ts` (Vercel Crons)

**Google OAuth:**
- Service: Google authentication provider
- What it's used for: Sign-up and login flow
  - SDK/Client: @supabase/supabase-js built-in OAuth
  - Provider config: Supabase console (Google OAuth app credentials)
  - Implementation: `src/components/auth/GoogleSignInButton.tsx`
  - Callback: `src/app/auth/callback/route.ts` (exchangeCodeForSession)

**Resend:**
- Service: Transactional email delivery
- What it's used for: Contact form emails
  - SDK/Client: resend 6.12.2
  - Auth: `RESEND_API_KEY` env var
  - Implementation: `src/lib/resend.ts` (singleton pattern, lazy initialization)
  - Usage: `src/app/contact/actions.ts` (sendContactMessage server action)
  - Domain: sirenfooty.com.au (verified in Resend account)
  - Fallback: During setup, use `onboarding@resend.dev` (pre-verified but account-limited)
  - Optional override env vars: `RESEND_FROM_EMAIL`, `RESEND_TO_EMAIL` (defaults to hello@sirenfooty.com.au)

**Telegram:**
- Service: Push notifications for app events
- What it's used for: Owner notifications on new user signups and team creation
  - SDK/Client: Direct HTTPS API calls (no SDK)
  - Auth: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` env vars
  - Implementation: `src/lib/notifications/telegram.ts`
    - Formatting functions: `formatSignupMessage()`, `formatTeamMessage()`
    - Send function: `sendTelegramNotification()` (handles missing credentials gracefully)
  - Notification triggers: Called from Supabase AFTER INSERT triggers on auth.users and teams table
  - Setup: Documented in `docs/telegram-notifications.md` (three-step process)

## Data Storage

**Databases:**
- Supabase PostgreSQL
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, RLS enforced)
  - Service role: `SUPABASE_SERVICE_ROLE_KEY` (server-side only, bypasses RLS)
  - Client: @supabase/supabase-js 2.45.4

**File Storage:**
- Not detected — no image/file storage integration visible in codebase

**Caching:**
- Not detected — no Redis or Memcached integration

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (native)
  - Implementation: `src/lib/supabase/server.ts` (server client with cookie management)
  - Browser client: `src/lib/supabase/client.ts` (browser client via SSR)
  - Middleware: `src/lib/supabase/middleware.ts` (session refresh, route protection)
  - OAuth provider: Google (configured in Supabase console)
  - Magic link: Supabase auth.signInWithOtp (not yet visible in codebase, likely future)
  - User caching: React.cache() deduplicates auth.getUser() calls within single render pass (`src/lib/supabase/server.ts:13`)

## Monitoring & Observability

**Error Tracking:**
- Not detected — no Sentry, Rollbar, or similar integration

**Logs:**
- console.error() and console.log() statements throughout
- Examples:
  - `src/lib/notifications/telegram.ts:34` - Telegram send failures
  - `src/app/api/cron/sync-playhq/route.ts:52` - Cron job totals
  - `src/app/contact/actions.ts:96,105` - Email send failures

**Performance Analytics:**
- Vercel Speed Insights integration
  - Package: @vercel/speed-insights 1
  - Implementation: `src/app/layout.tsx` (SpeedInsights component)
  - Behavior: Only fires on production deploy (never dev/preview)
  - Purpose: Web Core Vitals collection (LCP, FID, CLS, etc.)

## CI/CD & Deployment

**Hosting:**
- Vercel (primary)
  - Automatic deployments from Git
  - Environment variables configured in Vercel project settings
  - Production domain: sirenfooty.com.au (or *.vercel.app for previews)

**Scheduled Jobs:**
- Vercel Crons (`vercel.json`)
  - PlayHQ sync: `/api/cron/sync-playhq` at `0 3 * * *` (daily 03:00 UTC)
  - Authentication: Authorization header with `CRON_SECRET`

**CI Pipeline:**
- GitHub Actions (inferred from playwright.config.ts CI branch detection)
  - Runs Playwright e2e tests with 2 workers
  - Forbids `.only` on tests
  - Retries flaky tests twice
  - Builds production artifact and runs against production build in CI

## Environment Configuration

**Required env vars (production):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role (server-side only)

**Optional but recommended:**
- `CRON_SECRET` - Authorization secret for `/api/cron/sync-playhq`
- `RESEND_API_KEY` - Email delivery (contact form optional)
- `TELEGRAM_BOT_TOKEN` - Owner notifications (optional)
- `TELEGRAM_CHAT_ID` - Owner notifications (optional)

**Local development (.env.local):**
- Copy `.env.local.example` and fill in Supabase credentials
- For email testing: set `RESEND_FROM_EMAIL` to `onboarding@resend.dev` if domain not yet verified

**Test environment (.env.test):**
- Auto-generated by Supabase CLI
- Contains: local Supabase keys (not secrets), test user credentials, CRON_SECRET
- Resend and Telegram intentionally unset (tests don't send real emails/messages)

**Secrets location:**
- Vercel: Environment variables tab in project settings
- Local: `.env.local` (in .gitignore, never committed)
- Test: `.env.test` (generated from `supabase status -o env`, safe to commit)

## Webhooks & Callbacks

**Incoming:**
- `/auth/callback` - OAuth callback from Supabase (Google redirect target)
  - Implementation: `src/app/auth/callback/route.ts`
  - Parameters: code (OAuth code), next (post-login redirect)
  - Validation: safeNext() blocks absolute URLs and `//` redirects

**Outgoing:**
- PlayHQ: One-way read-only polling (no webhooks)
- Telegram: Push notifications triggered by Supabase AFTER INSERT triggers
  - Not HTTP webhooks — called from `src/lib/notifications/telegram.ts` via server actions
- Resend: Email sent via server action, no callbacks expected

---

*Integration audit: 2026-04-29*
