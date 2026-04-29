<!-- refreshed: 2026-04-29 -->
# Architecture

**Analysis Date:** 2026-04-29

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                     Next.js 14 App Router (Client)                   │
├──────────┬────────────────┬──────────────┬───────────────┬──────────┤
│   Auth   │   Dashboard    │     Team     │  Live Game    │   Admin  │
│ Routes   │   `/dashboard` │ Management   │  Scoreboard   │  /admin  │
└────┬─────┴────────┬───────┴──────────────┴───────────────┴──────────┘
     │              │
     │              ▼
     │    ┌──────────────────────────────────────────────────┐
     │    │   React Components & Client State                │
     │    │   - `src/components/` (121 .tsx files)           │
     │    │   - Zustand store (`liveGameStore.ts`)           │
     │    │   - Zone fairness UI (swaps, rotations)          │
     └────┼──────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Server Actions & Server Components                       │
│  - `src/app/**/actions.ts` (10 files — auth, team, game, squad)      │
│  - Auth: Supabase JWT via cookies                                    │
│  - Server: React.cache + @supabase/ssr for request dedup             │
└────┬─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────────────┐
│           Supabase (Auth + Postgres Database)                         │
├──────────┬──────────────────┬──────────────────┬────────────────────┤
│  Auth    │  Core Tables     │  Live Game Event │ Admin/CRM Tables  │
│  (JWT)   │  teams, players  │ stream & scoring │ profiles, tags    │
│          │  games, squads   │ zone-minutes     │ contact_prefs     │
│          │  availability    │ team score       │                   │
│          │  membership      │ opponent score   │                   │
└──────────┴──────────────────┴──────────────────┴────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Auth Layer** | Supabase JWT + magic-link / email-password / Google OAuth | `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts` |
| **App Shell** | Layout, header, role guard (admin, game_manager, parent) | `src/app/(app)/layout.tsx` |
| **Dashboard** | Team list, quick-stats (attendance, seasonal fairness) | `src/app/(app)/dashboard/page.tsx` |
| **Team Setup** | Onboarding wizard for team config, player roster import | `src/app/(app)/teams/[teamId]/setup/page.tsx` |
| **Live Game UI** | Real-time field/bench view, quarter timers, scoring, swaps | `src/components/live/LiveGame.tsx`, `src/components/live/Field.tsx` |
| **Fairness Engine** | Zone-minutes tracking, rotation suggestions, swap logic | `src/lib/fairness.ts` |
| **Live State** | Single-device in-memory state (Zustand) | `src/lib/stores/liveGameStore.ts` |
| **PlayHQ Integration** | Squad roster sync from PlayHQ API | `src/lib/playhq.ts`, `src/app/.../playhq-actions.ts` |
| **Admin CRM** | Super-admin contact mgmt, tags, unsubscribe tracking | `src/app/(app)/admin/`, `src/components/admin/` |

## Pattern Overview

**Overall:** Next.js App Router with server-driven auth, Zustand for live-game state, Supabase RLS for data isolation, pure fairness engine.

**Key Characteristics:**
- **Server Components by default** — fetch auth + RLS-protected data server-side, stream to client
- **Server Actions for mutations** — type-safe calls to actions.ts files; no fetch() client-side
- **Zustand for client-only state** — live-game clock, zone tracking (lost on reload, except clock)
- **Role-based access** — team_memberships.role gating; admin client for public runner token flow
- **Event sourcing** — game_events table captures all actions (swap, goal, injury, quarter start/end); replayed to rebuild UI state on load
- **Pure fairness logic** — no side effects, testable rules for rotation suggestion and zone-cap calculation

## Layers

**Route Layer:**
- Purpose: HTTP handlers mapping URL to page/API
- Location: `src/app/(app)/`, `src/app/(auth)/`, `src/app/api/`
- Contains: page.tsx (Server Component), route.ts (API), actions.ts (Server Action)
- Depends on: Supabase clients, fairness engine, components
- Used by: Browser navigation, form submissions

**Server Action Layer:**
- Purpose: Mutation handlers; validate auth, then write to DB via Supabase
- Location: `src/app/**/actions.ts` (10 files)
- Contains: Async functions marked `"use server"`, return ActionResult
- Depends on: createClient() (RLS) or createAdminClient() (service-role)
- Used by: Client components calling async functions, form submissions

**Component Layer:**
- Purpose: Render UI; query server components for async data, use client components for interactivity
- Location: `src/components/`
- Contains: .tsx files, mostly Client Components marked `"use client"`
- Depends on: UI library (Geist), hooks, local state, server actions
- Used by: Routes, other components

**Business Logic Layer:**
- Purpose: Pure functions for game logic, no Supabase or React
- Location: `src/lib/fairness.ts`, `src/lib/ageGroups.ts`, `src/lib/playerUtils.ts`
- Contains: Zone-minutes calc, swap suggestions, position model translation
- Depends on: types only
- Used by: Live game UI, tests

**Supabase Client Layer:**
- Purpose: DB connection abstraction; Auth + RLS or service-role access
- Location: `src/lib/supabase/` (server.ts, admin.ts, middleware.ts, client.ts)
- Contains: createClient(), createAdminClient(), getUser()
- Depends on: @supabase/ssr, @supabase/supabase-js, Next.js cookies
- Used by: Server Components, Server Actions, middleware

**Store Layer:**
- Purpose: In-memory UI state for live-game (clock, selected player, zone tracking)
- Location: `src/lib/stores/liveGameStore.ts`
- Contains: Zustand store, actions (selectField, applySwap, recordGoal)
- Depends on: zustand, types
- Used by: LiveGame.tsx, Field.tsx, Bench.tsx

## Data Flow

### Primary Request Path — Live Game Scoring

1. **Page Load** (`src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx`):
   - Server: auth guard (game_manager or admin role)
   - Fetch game, players, prior events, season stats via Supabase
   - Call replayGame() to rebuild scoresheet and zone-minutes from events
   - Render LineupPicker (if starting) or LiveGame (if running)

2. **Lineup Selection** (`src/components/live/LineupPicker.tsx`):
   - Client picks starting 5 zones via UI
   - Calls startQuarter() server action with lineup
   - Action inserts game_event (type: "quarter_start", payload: lineup)
   - Revalidates path; page re-renders with LiveGame

3. **Live Scoring** (`src/components/live/LiveGame.tsx`):
   - Client: Zustand store initialized from quarter_start_at (wall-clock timestamp)
   - UI: Select player on field, tap goal/behind buttons
   - Calls recordGoal() / recordBehind() / recordFieldZoneSwap() server action
   - Action: Insert game_event to DB
   - Zustand: Update local playerScores, teamScore, accumulatedMs
   - Field/Bench re-render; zone-minutes stay in-sync with clock

4. **Quarter End** (`src/components/live/QuarterEndModal.tsx`):
   - Admin taps "End Quarter" button
   - Client calls endQuarter() action with final playerScores, injuredIds, loanedIds
   - Action: Insert quarter_end event; AFTER INSERT trigger computes zone-minutes, writes to game_zone_minutes
   - Zustand: Resets lineup, sets quarterEnded=true
   - Page shows QuarterBreak (rotation suggestions) or GameSummary (if final quarter)

5. **Quarter Break Rotation** (`src/components/live/QuarterBreak.tsx`):
   - Client: Calls suggestSwaps() pure function (no DB)
   - Displays ranked swap suggestions (fairness, zone caps, locked players)
   - Admin accepts swap → calls recordSwap() action
   - Action: Insert game_event (type: "swap"); server validates rotation rules
   - Zustand: applySwap() updates basePlayedZoneMs, stintStartMs, lineup
   - Next quarter: clock restarts from new quarter_start_at

**State Management:**
- **Persisted (DB):** game_events, game_zone_minutes, game (team_score, opponent_score)
- **In-Memory (Zustand):** selected player, injuredIds, lockedIds, pauses (lost on reload)
- **Recovered (Wall-Clock):** accumulatedMs rebuilt as Date.now() - quarter_start_at on page load

### Secondary Flow — Dashboard Attendance

1. Page load fetches team's games, then game_attendances for each
2. Displays summary: on-field minutes per player, fairness audit
3. Calls aggregateAttendance() pure function to compute equity scores
4. Admin views: most-played, least-played, at-risk (near fairness threshold)

### Public Runner Flow (Share Token)

1. Game created with share_token (UUID)
2. Link shared as `/run/[token]` → checks token in game_events writes
3. resolveWriter() validates token against games.share_token
4. Uses createAdminClient() (service-role) so public user can write without auth membership
5. Same scoring actions (recordGoal, recordSwap) work; just auth is token-based

## Key Abstractions

**Lineup:**
- Purpose: On-field player IDs at each zone (back, hback, mid, hfwd, fwd)
- Examples: `{ back: ["p1", "p2"], mid: ["p3", "p4", "p5"], ... }`
- Pattern: Record<Zone, string[]>; created by picker or rotation engine

**GameEvent:**
- Purpose: Immutable action log (event sourcing)
- Examples: quarter_start, goal, swap, injury, quarter_end
- Pattern: Insert-only; type + player_id + metadata; no updates

**ZoneCaps:**
- Purpose: Max players per zone (depends on age group + on-field size)
- Examples: U10 on-field 15 → {back: 3, mid: 4, fwd: 3} (zones3) or {back: 2, hback: 2, mid: 4, hfwd: 2, fwd: 3} (positions5)
- Pattern: zoneCapsFor(onFieldSize, ageGroup) pure function

**PlayerZoneMinutes:**
- Purpose: Accumulated elapsed time per player at each zone (season or game)
- Pattern: Record<playerId, Record<zone, ms>>; computed by replaying game_events

**LiveGameState (Zustand):**
- Purpose: Single-page in-memory state during live game
- Contains: lineup, score, zone minutes, selected player, injured/loaned/locked lists
- Survives reload: only clock (wall-clock timestamp), not pauses or manual locks

## Entry Points

**`src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx`:**
- Location: Route handler
- Triggers: Navigation to `/teams/123/games/456/live`
- Responsibilities: Auth guard, fetch game + events, render LineupPicker or LiveGame

**`src/components/live/LiveGame.tsx`:**
- Location: Client Component
- Triggers: LineupPicker submission or page re-render with running game
- Responsibilities: Initialize Zustand store from quarter_start_at, render Field/Bench/modals, dispatch scoring actions

**`src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts`:**
- Location: Server Action file (10+ exported functions)
- Triggers: recordGoal(), recordSwap(), startQuarter(), endQuarter(), etc. called from LiveGame
- Responsibilities: Validate auth (RLS or token), insert game_event, revalidate cache

**`src/app/(app)/dashboard/actions.ts`:**
- Location: Server Action file
- Triggers: createTeam(), inviteTeamMember() called from forms
- Responsibilities: Validate auth, insert team/membership, revalidate paths

**`src/app/(app)/teams/[teamId]/squad/actions.ts`:**
- Location: Server Action file
- Triggers: addPlayer(), updatePlayer(), removePlayer() called from forms
- Responsibilities: Validate membership, insert/update/delete players

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js + browser). Zustand store is single-device only — no cross-tab sync.
- **Global state:** Zustand store (liveGameStore) is module-level singleton; accessed by all Live* components during one game session. Destroyed on route change.
- **Circular imports:** None enforced at architecture level; component tree is acyclic (Field/Bench don't import LiveGame, only the reverse).
- **Clock recovery:** Wall-clock timestamps in quarter_start event allow reload to pick up mid-quarter. Pauses (ms of time clock was stopped) are not persisted, so page reload loses pause time.
- **Event sourcing:** game_events table is append-only; all reads replay events from start. No mutable aggregate snapshots except game_zone_minutes (computed per quarter by DB trigger).
- **RLS isolation:** Queries use Supabase RLS policies keyed on auth user + team membership. Admin actions use createAdminClient() to bypass RLS (after token/user validation).

## Anti-Patterns

### Circular Logic in Fairness Calc

**What happens:** suggestSwaps() calls itself recursively on hypothetical lineups.
**Why it's wrong:** Hard to trace execution flow; test coverage weak on deep recursion paths.
**Do this instead:** Flatten swap ranking to iterative scoring: compute all 2-player swaps, rank by fairness delta, return top-N. See `src/lib/fairness.ts:suggestSwaps()` for current approach.

### Zustand State Mutation Outside Actions

**What happens:** Some modals directly call store.selectField() without persisting to DB.
**Why it's wrong:** UI state and event log diverge; reload loses player selection.
**Do this instead:** Only call Zustand actions from within server action callbacks (after DB insert succeeds). Never mutate store state in click handlers alone.

## Error Handling

**Strategy:** ActionResult union type (success | error). Server actions return `{ success: boolean, error?: string }`. Client checks .success and displays toast or error boundary.

**Patterns:**
- **Auth errors:** resolveWriter() validates membership + token; returns error message if auth fails
- **Validation errors:** Server action checks RLS + input shape; returns error message
- **DB errors:** Catch Supabase error; log to console (server-side only); return generic "Something went wrong" to UI
- **Network errors:** Catch fetch error; treat as transient; let caller retry (usually via form resubmit)

## Cross-Cutting Concerns

**Logging:** Console.log + error logging; no external service (local dev only). Production uses Vercel Speed Insights + browser error tracking.

**Validation:** Zod for API routes (none used currently); manual checks in server actions (team membership, role, token).

**Authentication:** Supabase Auth (JWT in cookie set by middleware). Middleware validates session on every route; expired JWT triggers refresh or redirect to /login. Super-admin check on every (app) layout load (cheap single-row query cached via React.cache).

---

*Architecture analysis: 2026-04-29*
