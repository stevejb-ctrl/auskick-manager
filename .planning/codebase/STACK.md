# Technology Stack

**Analysis Date:** 2026-04-29

## Languages

**Primary:**
- TypeScript 5 - All source code, configuration, tests
- JavaScript - Build and config files (postcss.config.js)
- SQL - Supabase migrations and seed data

**Secondary:**
- HTML/CSS - Via JSX/TSX components and Tailwind

## Runtime

**Environment:**
- Node.js (version specified via `.nvmrc` or inferred from Next.js 14)

**Package Manager:**
- npm (package-lock.json present — lockfile format)

## Frameworks

**Core:**
- Next.js 14.2.29 - React SSR framework, API routes, server actions
- React 18 - UI component library
- Zustand 5.0.2 - Client-side state management

**Styling:**
- Tailwind CSS 3 - Utility-first CSS
- PostCSS 8 - CSS transformation (via `postcss.config.js`)
- Autoprefixer 10.5.0 - Vendor prefix handling

**Testing:**
- Vitest 4.1.4 - Unit test runner (Node environment)
- Playwright 1.59.1 - End-to-end browser automation
- @playwright/test 1.59.1 - Playwright testing framework

**Build/Dev:**
- TypeScript 5 - Type checking
- ESLint 8 - Linting (extends `next/core-web-vitals`)
- Next.js built-in dev server and build pipeline

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.45.4 - Supabase client for browser/Node
- @supabase/ssr 0.5.2 - Server-side cookie management for auth
- Resend 6.12.2 - Email delivery service (contact form)

**Infrastructure:**
- @vercel/speed-insights 1 - Performance monitoring on Vercel
- @next/third-parties 14.2.29 - Third-party script optimization
- Geist 1.7.0 - Font system (Vercel's Geist family)

## Configuration

**Environment:**
- `.env.local` - Development environment variables
- `.env.test` - Test environment variables (Supabase local JWT, test user credentials)
- Environment variables prefixed with `NEXT_PUBLIC_` are exposed to the browser
- Critical env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- Optional env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_TO_EMAIL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET`

**TypeScript:**
- `tsconfig.json` - Target: `esnext`, module resolution: `bundler`, path aliases: `@/*` → `./src/*`
- Strict mode enabled, no emit (`noEmit: true` for type-checking only)

**Build:**
- `next.config.mjs` - Minimal configuration (empty object — uses Next.js defaults)
- `tsconfig.json` includes: next-env.d.ts, all .ts/.tsx files, excludes e2e and node_modules

## Test Configuration

**Vitest (`vitest.config.ts`):**
- Environment: Node
- Test pattern: `src/**/__tests__/**/*.test.ts`
- Path alias: `@` → `./src`

**Playwright (`playwright.config.ts`):**
- Base URL: `http://localhost:3000` (or `PLAYWRIGHT_BASE_URL` env var)
- Test directory: `./e2e/tests`
- Device: Pixel 7 (mobile viewport for PWA testing)
- Parallel workers: unlimited locally, 2 in CI
- Retries: 0 locally, 2 in CI
- Trace/screenshot/video: capture on failure only
- Setup project: `auth.setup.ts` (creates super-admin session, reused via `storageState`)
- WebServer: `npm run dev` (reuse existing) or `npm run start` (CI only)

**Linting (`eslintrc.json`):**
- Extends: `next/core-web-vitals`

## Platform Requirements

**Development:**
- Node.js (with npm)
- Local Supabase (via Supabase CLI for e2e testing)
- `npm install` to get dependencies

**Production:**
- Vercel (primary deployment platform — see `vercel.json` for cron config)
- Supabase (cloud or self-hosted — accessed via environment variables)
- Optional: Resend (for email), Telegram API (for notifications)

---

*Stack analysis: 2026-04-29*
