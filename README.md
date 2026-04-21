# Siren

**Junior Australian Rules Football Game Manager.**

A PWA for managing junior Aussie rules teams — rotations, scoring, availability, and a live on-field view for game day.

## Local dev

```bash
npm install
cp .env.local.example .env.local   # then fill in the Supabase values
npm run dev
```

Typecheck: `npx tsc --noEmit`.

## Supabase auth providers setup

Siren supports three sign-in paths:

1. **Email + password** — works out of the box.
2. **Google OAuth** — requires one-time setup in the Supabase + Google Cloud dashboards.
3. **Magic link (email OTP)** — uses Supabase's default email templates; no provider setup needed.

### Google OAuth (one-time)

1. In **Google Cloud Console** → APIs & Services → Credentials, create an OAuth 2.0 Client ID of type "Web application".
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
2. In **Supabase dashboard** → Authentication → Providers → Google:
   - Enable the provider.
   - Paste the Client ID and Client Secret from step 1.
3. In **Supabase dashboard** → Authentication → URL Configuration:
   - Set **Site URL** to the production URL (e.g. `https://siren.app`).
   - Add any preview/staging URLs (and `http://localhost:3000` for local dev) to the **Redirect URLs** allowlist.

### Magic link / password reset emails (optional customisation)

Supabase ships usable defaults. To rebrand the emails:

- **Supabase dashboard** → Authentication → Email Templates
- Customise the **Magic Link** and **Reset Password** templates with the Siren name and colours.

### How the callback works

Both Google and magic-link flows redirect the browser back to `/auth/callback?code=…&next=…`.
The server route in `src/app/auth/callback/route.ts` exchanges the code for a session cookie and redirects to `next` (same-origin only; falls back to `/dashboard`).

## Environment variables

See `.env.local.example`. Notable:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase config, safe in the browser.
- `SUPABASE_SERVICE_ROLE_KEY` — required for `/admin` (super-admin dashboard) and `/run/[token]` (public live-game) flows. **Never expose to the browser.**

## Running tests

Unit tests (Vitest, pure functions, no DB):

```bash
npm test
```

End-to-end tests (Playwright + local Supabase) drive real browser flows against a full stack: Next.js + Supabase Auth + Postgres. They're the UAT safety net — every write path has a spec.

**Prerequisites** (one-time):

1. **Docker Desktop** running — Supabase CLI uses it to spin up Postgres + Auth locally.
2. **Supabase CLI** installed — see <https://supabase.com/docs/guides/cli>.
3. **Test env file**:

   ```bash
   cp .env.test.example .env.test
   ```

   The defaults are the Supabase CLI's deterministic local keys — safe to commit to the example, safe on every dev machine. No secrets needed.

**Run the suite**:

```bash
npm run e2e              # headless, the default
npm run e2e:ui           # Playwright inspector UI — best for debugging
npm run e2e:headed       # watch the browser drive itself
npm run e2e -- path/to.spec.ts   # single spec
```

`npm run e2e` wraps `scripts/e2e-setup.mjs`, which:

1. Loads `.env.test` into the environment.
2. Starts local Supabase if not already running (`supabase status` → `supabase start`).
3. Resets the DB (`supabase db reset --no-confirm`) so every run starts from a clean, migrated schema.
4. Hands off to `playwright test`.

**How to ship a change**:

- New feature or bug fix → add/update the relevant spec in `e2e/tests/*.spec.ts` **in the same PR**.
- `npm run e2e` must be green before merging.
- CI runs the full suite on every PR — see `.github/workflows/ci.yml`.

See `e2e/README.md` for conventions and the "when to add a test" checklist.
