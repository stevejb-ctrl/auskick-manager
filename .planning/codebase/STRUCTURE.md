# Codebase Structure

**Analysis Date:** 2026-04-29

## Directory Layout

```
siren-footy/
├── .github/                    # CI/CD workflows
│   └── workflows/ci.yml        # GitHub Actions (lint, typecheck, e2e, build)
├── .planning/                  # GSD planner output
│   └── codebase/               # Architecture & structure docs
├── docs/                       # User docs / help content
│   └── telegram-notifications.md
├── e2e/                        # Playwright end-to-end test suite
│   ├── fixtures/               # Test factories + Supabase helpers
│   ├── tests/                  # .spec.ts test files
│   └── README.md               # Testing conventions
├── public/                     # Static assets (favicon, manifest, song files)
├── scripts/                    # Build/setup helpers (Node scripts)
├── src/
│   ├── app/                    # Next.js App Router routes & pages
│   ├── components/             # React Client/Server Components
│   ├── lib/                    # Utilities, business logic, stores
│   └── middleware.ts           # Auth middleware (Supabase session refresh)
├── supabase/                   # Database migrations & seed
│   ├── migrations/             # SQL files (0001_*.sql)
│   ├── config.toml             # Supabase CLI config (local dev)
│   └── seed.sql                # Initial demo data
├── package.json                # Dependencies
├── next.config.mjs             # Next.js config
├── tsconfig.json               # TypeScript config
├── tailwind.config.ts          # Tailwind CSS config
├── playwright.config.ts        # Playwright test runner config
├── vitest.config.ts            # Vitest (unit test) config
├── CLAUDE.md                   # Project conventions (testing, commit style)
└── README.md                   # Getting started
```

## Directory Purposes

**`src/app/`** — App Router routes and pages
- **Purpose:** HTTP route handlers + Server Components
- **Structure:** Nested by URL segment (e.g. `teams/[teamId]/games/[gameId]/live/page.tsx` → `/teams/:teamId/games/:gameId/live`)
- **Key routes:**
  - `(auth)/` — Public auth pages: login, signup, forgot-password, reset
  - `(app)/` — Authenticated app layout with header + nav
    - `dashboard/` — Team list + quick stats
    - `teams/[teamId]/` — Team detail + nested routes:
      - `setup/` — Onboarding wizard
      - `squad/` — Roster management
      - `games/[gameId]/` — Game detail + live:
        - `live/` — **Live game scoreboard** (central feature)
      - `settings/` — Team config + member management
      - `stats/` — Season fairness report
    - `admin/` — Super-admin only (users, teams, tags, games)
    - `welcome/` — Post-signup intro
  - `api/` — Server-side routes (webhooks, cron)
    - `api/admin/seed-demo/` — Initialize demo team
    - `api/cron/sync-playhq/` — Periodic roster sync
    - `auth/callback/` — OAuth callback handler
- **Files:** page.tsx (render), layout.tsx (wrapper), actions.ts (mutations), loading.tsx (loading state), route.ts (API)

**`src/components/`** — React Client/Server Components (121 .tsx files)
- **Purpose:** Reusable UI building blocks
- **Subdirectories (by feature domain):**
  - `admin/` — Super-admin CRM: DataTable, TagManager, TagChip, NotesList, etc.
  - `auth/` — Auth forms: LoginForm, SignupForm, GoogleSignInButton, ForgotPasswordForm, etc.
  - `brand/` — Logo/branding: PulseMark, SirenWordmark, PulseRing
  - `dashboard/` — Team list UI: DashboardShell, AttendanceTable, HeadToHead, MinutesEquity, etc.
  - `games/` — Game management: GameCard, GameInfoHeader, ResetGameButton, GameList, etc.
  - `help/` — Help pages: HelpPageSection, etc.
  - `live/` — **Live game UI:** LiveGame, Field, Bench, QuarterBreak, Modals (StartQuarterModal, QuarterEndModal, SubDueModal, LockModal, InjuryReplacementModal), LineupPicker, SwapCard, SwapConfirmDialog, etc.
  - `marketing/` — Homepage/login branding
  - `setup/` — Setup wizard: SetupStep, ConfigForm, RosterForm, etc.
  - `sf/` — Shared foundational: nav, buttons, dialogs, etc.
  - `squad/` — Roster UI: SquadTable, PlayerForm, AvailabilityToggles, etc.
  - `team/` — Team detail UI: TeamCard, TeamHeader, MemberList, etc.
  - `ui/` — Design system: Button, Modal, Input, Label, Tabs, Card, etc. (headless patterns)
- **Naming:** PascalCase .tsx files (e.g. LiveGame.tsx, QuarterBreak.tsx)

**`src/lib/`** — Business logic, utilities, stores
- **Supabase clients:**
  - `supabase/server.ts` — Anon client for Server Components (RLS active)
  - `supabase/admin.ts` — Service-role client (bypasses RLS, token-validated only)
  - `supabase/middleware.ts` — Session refresh + cookie management
  - `supabase/client.ts` — Browser client (no auth needed, only used in client-side contexts)
- **Game logic:**
  - `fairness.ts` — Pure: zone-minutes calc, swap suggestions, position model translation (~900 lines)
  - `ageGroups.ts` — Age group metadata: zone count (3 vs 5), positions, hard caps
  - `playerUtils.ts` — Player name/jersey helpers
- **Stores:**
  - `stores/liveGameStore.ts` — Zustand: in-memory state for one game session (lineup, scores, clock, selected player)
- **Other:**
  - `types.ts` — TypeScript interfaces (Profile, Team, Game, GameEvent, etc.)
  - `roles.ts` — Role constants (admin, game_manager, parent)
  - `playhq.ts` — PlayHQ API client (roster fetch)
  - `notifications/telegram.ts` — Telegram bot integration (team creation alerts)
  - `dashboard/aggregators.ts` — Pure: attendance stats, fairness audit
  - `dashboard/eventReplay.ts` — Replay game_events to rebuild state
  - `admin/queries.ts` — Admin dashboard queries
  - `auth/requireSuperAdmin.ts` — Super-admin guard (used in admin routes)
  - `help/pages.ts` — Help page metadata
  - `resend.ts` — Resend email API (unused in primary app, available for later)
  - `seo.ts` — SEO metadata helpers
  - `songUrl.ts` — YouTube URL parsing for goal song
- **Tests:** `__tests__/` subdirectories with .test.ts files (fairness, playerUtils, aggregators, etc.)

**`e2e/`** — Playwright test suite
- **Purpose:** Full-stack browser tests (no mocks, real Supabase DB)
- **Fixtures:**
  - `fixtures/supabase.ts` — Service-role client, createTestUser(), deleteTestUser(), ensureTestUser()
  - `fixtures/factories.ts` — makeTeam(), makePlayers(), makeGame() — fast DB setup
- **Tests:**
  - `auth.setup.ts` — One-time setup: seed super-admin, save storageState (JWT cookie)
  - `smoke.spec.ts` — Health check (app renders)
  - `*.spec.ts` — Journey tests (auth, team-invite, roster, lineup, live-quarters, live-scoring, live-swaps, injury-replacement, availability, runner-token, onboarding, settings, game-create, game-edit, super-admin, playhq-import)
- **Conventions:**
  - Isolation: each test creates its own team/players
  - Parallel by default: `test.describe.configure({ mode: 'parallel' })`
  - Factories for setup, UI for the feature under test
  - Queries: getByRole > getByText > getByTestId (avoid brittle selectors)
  - Assertions: toBeVisible() / toHaveText() (resilient to layout changes)

**`supabase/`** — Database schema + seed
- **Purpose:** Postgres DB definition
- **Migrations:**
  - `0001_initial_schema.sql` — Teams, players, games, memberships, squad_size
  - `0002_games_availability.sql` — Player availability per game
  - `0003_live_game.sql` — game_events, game_zone_minutes (event sourcing)
  - `0004_sub_interval.sql` — Substitution timing rules
  - `0005_injury.sql` — Injury tracking
  - `0006_share_token.sql` — Public runner share link
  - `0007_on_field_size.sql` — Dynamic on-field player count
  - `0008_age_group.sql` — Teams.age_group (U8–U17)
  - `0009_playhq_external_id.sql` — PlayHQ roster sync
  - `0010_team_playhq_url.sql` — Teams.playhq_url
  - `0011_team_song.sql` — Goal song URL per team
  - `0012_song_duration.sql` — Song start offset
  - `0013_score_undo_and_field_zone_swap.sql` — Goal/behind undo + field zone swap
  - `0014_game_fill_ins.sql` — Game fill-in players
  - `0015_squad_size.sql` — Season squad size tracking
  - `0018_contact_tags.sql` — Admin CRM: contact tags + profiles table (service-role only)
- **seed.sql** — Demo team + players (for `/demo` page)
- **config.toml** — Supabase CLI config (ports, auth settings, email templates)

**`scripts/`** — Build helpers
- **Purpose:** One-off node utilities
- **Files:**
  - `e2e-setup.mjs` — Load .env.test, start Supabase, reset DB, run playwright test
  - `capture-marketing-screenshots.mjs` — Screenshot marketing pages for docs
  - `list-capture-candidates.mjs` — List pages available for screenshots

**`docs/`** — User documentation
- **Purpose:** Guides for team managers (not developers)
- **Content:** Telegram notifications, live-game workflow, rotation rules, etc.

**`public/`** — Static assets
- **Purpose:** Favicon, manifest, uploaded song files, etc.

## Key File Locations

**Entry Points:**
- `src/middleware.ts` — Every request passes through (auth + session refresh)
- `src/app/(app)/layout.tsx` — Main authenticated app shell
- `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` — **Live game page**
- `src/app/auth/callback/route.ts` — OAuth callback handler

**Configuration:**
- `next.config.mjs` — Next.js settings (minification, rewrites)
- `tsconfig.json` — TypeScript strict mode, path aliases (`@/` → `src/`)
- `tailwind.config.ts` — Design tokens (colors: brand, warn, ok, surface, ink)
- `playwright.config.ts` — Test runner, projects (chromium with storageState), baseURL
- `vitest.config.ts` — Unit test runner, globals

**Core Logic:**
- `src/lib/fairness.ts` — **Rotation engine:** zoneCapsFor(), seasonZoneMinutes(), suggestSwaps(), replayGame()
- `src/lib/stores/liveGameStore.ts` — **Live state:** Zustand store (lineup, scores, clock)
- `src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts` — **Live mutations:** recordGoal(), recordSwap(), startQuarter(), endQuarter()

**Testing:**
- `e2e/README.md` — Test conventions + when to add a test
- `e2e/tests/*.spec.ts` — Journey test files
- `src/lib/__tests__/` — Unit tests (fairness, playerUtils, aggregators)

## Naming Conventions

**Files:**
- Routes: `page.tsx` (Server Component), `layout.tsx` (layout), `actions.ts` (Server Actions), `loading.tsx` (loading UI), `route.ts` (API handler)
- Components: PascalCase.tsx (e.g., `LiveGame.tsx`, `QuarterBreak.tsx`)
- Tests: snake_case.test.ts or snake_case.spec.ts (e.g., `fairness.test.ts`, `live-scoring.spec.ts`)
- Utilities: camelCase.ts (e.g., `playerUtils.ts`, `fairness.ts`)

**Directories:**
- Feature domains: kebab-case (e.g., `live-game/` → `components/live/`, `game-events/` → `supabase/migrations/`)
- Dynamic segments: [camelCase] (e.g., `[teamId]`, `[gameId]`)
- Layout groups: (parentheses) for routing without URL (e.g., `(app)`, `(auth)`)

**Variables & Functions:**
- camelCase for variables, functions
- SCREAMING_SNAKE_CASE for constants (e.g., `QUARTER_MS = 12 * 60 * 1000`)
- PascalCase for types/interfaces (e.g., `LiveAuth`, `Team`, `Lineup`)

## Where to Add New Code

**New Feature:**
- **Primary code:** Add route in `src/app/(app)/teams/[teamId]/...` if team-scoped, or `src/app/(app)/admin/...` if super-admin
- **Components:** Add to matching subdirectory in `src/components/` (e.g., new live-game modal → `src/components/live/MyModal.tsx`)
- **Server actions:** Co-locate in route's `actions.ts` file (e.g., new game action → `src/app/(app)/teams/[teamId]/games/actions.ts`)
- **Tests:** Add .spec.ts in `e2e/tests/` for end-to-end; .test.ts in `src/lib/__tests__/` for pure logic
- **Database:** Add migration in `supabase/migrations/` (named `000X_feature_name.sql`)

**New Component/Module:**
- **Shared UI:** `src/components/ui/` (design-system primitives like Button, Modal, Input)
- **Feature-specific:** `src/components/{feature}/` (e.g., `src/components/live/NewModal.tsx`)
- **Server Component:** Place in route's directory if data-fetching (e.g., `src/app/(app)/admin/users/UsersList.tsx`)
- **Client Component:** Mark with `"use client"` if using hooks or event handlers

**Utilities:**
- **Pure business logic:** `src/lib/{domain}/` (e.g., `src/lib/fairness.ts`, `src/lib/dashboard/aggregators.ts`)
- **Supabase helpers:** `src/lib/supabase/` (already has server.ts, admin.ts, middleware.ts, client.ts)
- **API clients:** `src/lib/{service}.ts` (e.g., `src/lib/playhq.ts`, `src/lib/notifications/telegram.ts`)

**Tests:**
- **Unit tests (pure functions):** `src/lib/__tests__/{name}.test.ts`
- **Dashboard tests:** `src/lib/dashboard/__tests__/` (e.g., aggregators.test.ts)
- **E2E tests (journeys):** `e2e/tests/{feature}.spec.ts`; use factories to setup, UI to test

## Special Directories

**`src/app/(app)/`:**
- Purpose: Authenticated app routes (guarded by middleware)
- Generated: No
- Committed: Yes
- Note: Routes inside require auth + team membership for RLS

**`src/app/(auth)/`:**
- Purpose: Public auth routes (no auth required)
- Generated: No
- Committed: Yes
- Note: Login, signup, password reset — accessible to unauthenticated users

**`src/app/api/`:**
- Purpose: API routes (webhooks, cron, OAuth callback)
- Generated: No
- Committed: Yes
- Note: OAuth callback + admin seed endpoint; PlayHQ sync cron

**`supabase/migrations/`:**
- Purpose: Database schema version history
- Generated: No (manually written SQL)
- Committed: Yes
- Note: One file per feature; numbered sequentially; never edited after commit

**`.planning/codebase/`:**
- Purpose: Architecture docs (ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md)
- Generated: Yes (by gsd-map-codebase)
- Committed: Yes
- Note: Consumed by gsd-plan-phase to inform implementation plans

**`e2e/fixtures/`:**
- Purpose: Test factories + Supabase setup
- Generated: No
- Committed: Yes
- Note: makeTeam(), makePlayers(), makeGame() used to fast-forward test setup

**`public/`:**
- Purpose: Static assets (favicon, manifest, uploaded song files)
- Generated: Partially (uploaded files are generated at runtime)
- Committed: Partially (static assets yes, uploads no)

---

*Structure analysis: 2026-04-29*
