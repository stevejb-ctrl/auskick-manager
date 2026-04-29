# Testing Patterns

**Analysis Date:** 2026-04-29

## Test Framework & Setup

**Unit Tests (Pure Functions):**
- Framework: **Vitest** v4.1.4
- Config: `vitest.config.ts`
- Environment: Node (no DOM)
- Run command: `npm test` → executes `vitest run`

**E2E Tests (Full App):**
- Framework: **Playwright** v1.59.1 (`@playwright/test`)
- Config: `playwright.config.ts`
- Browser: Pixel 7 (mobile viewport)
- Run commands:
  ```bash
  npm run e2e          # run all e2e specs
  npm run e2e:ui       # interactive Playwright inspector
  npm run e2e -- path/to.spec.ts   # single spec
  ```

## Test File Organization

**Unit Tests:**
- Location: `src/**/__tests__/**/*.test.ts`
- Vitest config: `include: ["src/**/__tests__/**/*.test.ts"]`
- Examples:
  - `src/lib/__tests__/playerUtils.test.ts` — utility functions
  - `src/lib/__tests__/ageGroupFlow.test.ts` — domain logic (AFL rules)
  - `src/lib/__tests__/applyInjurySwap.test.ts` — store actions
  - `src/lib/dashboard/__tests__/aggregators.test.ts` — data aggregation

**E2E Tests:**
- Location: `e2e/tests/`
- Naming: `*.spec.ts` (one file per journey/feature)
- Examples:
  - `e2e/tests/auth.setup.ts` — runs once before any spec (seeds super-admin, saves auth state)
  - `e2e/tests/availability.spec.ts` — covers setAvailability action, add/remove fill-in flow
  - `e2e/tests/game-create.spec.ts` — regression test for on_field_size inheritance from age group
  - `e2e/tests/game-edit.spec.ts` — game editing flows
  - `e2e/tests/injury-replacement.spec.ts` — injury swap mechanics
  - `e2e/tests/lineup.spec.ts` — lineup picking and field position logic

## Test Structure & Organization

**Unit Test Pattern (Vitest):**
```typescript
// src/lib/__tests__/playerUtils.test.ts
import { describe, expect, it } from "vitest";
import { jerseyLabel } from "@/lib/playerUtils";

describe("jerseyLabel", () => {
  it("returns '#N' for a numeric jersey", () => {
    expect(jerseyLabel(7)).toBe("#7");
  });

  it("returns '' for null", () => {
    expect(jerseyLabel(null)).toBe("");
  });
});
```

**E2E Test Pattern (Playwright):**
```typescript
// e2e/tests/my-feature.spec.ts
import { test, expect } from "@playwright/test";
import { createAdminClient, createTestUser, deleteTestUser } from "../fixtures/supabase";
import { makeTeam, makePlayers } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("my feature does the thing", async ({ page }) => {
  const admin = createAdminClient();
  const user = await createTestUser(admin, {
    email: `myfeature-${Date.now()}@siren.test`,
    password: "pw-test-12345",
  });
  try {
    const team = await makeTeam(admin, { ownerId: user.id, ageGroup: "U10" });
    await makePlayers(admin, { teamId: team.id, ownerId: user.id });

    // ... click through UI, assert outcome ...

  } finally {
    await deleteTestUser(admin, user.id);
  }
});
```

## Test Fixtures & Factories

**Location:** `e2e/fixtures/`

**`e2e/fixtures/supabase.ts`:**
- `createAdminClient()` — constructs service-role Supabase client from env vars
- `createTestUser(admin, opts)` — creates auth user + profile via admin API (confirms email immediately)
- `ensureTestUser(admin, opts)` — creates user if not present, idempotent
- `deleteTestUser(admin, userId)` — deletes user + cascades (teams, memberships, etc.)
- All helpers take admin client as first arg and return typed data
- Populated by `scripts/e2e-setup.mjs` which loads `.env.test` before Playwright runs

**`e2e/fixtures/factories.ts`:**
- `makeTeam(admin, opts)` — creates test team with optional ageGroup override
  - Returns `{ id, name, ageGroup }`
  - Two-step insert/select (see note on AFTER INSERT triggers below)
- `makePlayers(admin, opts)` — creates player records for a team
  - Returns array of `{ id, full_name, jersey_number }`
  - Default count: `AGE_GROUPS[ageGroup].defaultOnFieldSize + 4`
  - Uses single-word names (e.g., "Alicia", "Brendan") so `getByText(player.full_name)` works without PlayerTile abbreviation logic
- `makeGame(admin, opts)` — creates a game record ready to populate with availability/lineup

**Design Principle:**
- Factories are for _setup_, not for exercising the feature under test
- If a spec covers `createGame`, click through the form; don't call `makeGame()`
- Use factories to fast-forward past prerequisites, spend test budget on the feature itself

## Database State & Reset

**Setup Sequence:**
1. `scripts/e2e-setup.mjs` loads `.env.test` (Supabase connection, super-admin email/password)
2. Playwright starts Next.js server (dev or production build)
3. `e2e/tests/auth.setup.ts` runs ONCE:
   - Creates deterministic super-admin via admin API
   - Signs in via login form (UI-driven, not cookie injection)
   - Saves auth state to `playwright/.auth/super-admin.json`
4. All subsequent specs inherit that `storageState` (Playwright project config)
5. Each spec creates its own test data via factories; no shared state between tests

**DB Reset Between Test Runs:**
- Run `npm run db:reset` locally to wipe the local Supabase container
- CI environments deploy a fresh container per job
- Each test creates/deletes its own users and data within the test's try/finally block

**Auth State Reuse:**
- `playwright.config.ts` defines two projects: `setup` and `chromium`
- Setup runs once, chromium specs reuse its `storageState`
- Saves ~2s per spec (no sign-in round-trip)
- Super-admin session is deterministic and stable

## The "Regression Test First" Rule

**From CLAUDE.md:**
> Bug fixes must land with a regression test that fails against the pre-fix code.

**Pattern:**
1. Write the test first, watch it fail (red)
2. Fix the bug
3. Watch the test pass (green)
4. Commit test + fix together

**Why:**
- Without the regression test, the same bug will ship again
- Ensures the fix actually addresses the root cause
- Prevents silent regressions in future refactors

**Example:** `e2e/tests/game-create.spec.ts` is a regression guard for the U8/U10/U13 `on_field_size` fix shipped 2026-04-21 — it verifies newly-created games inherit the correct size from team age-group config, not a hard-coded default.

## "When to Add a Test" Guidance

From `e2e/README.md`, use this table to decide scope:

| You're doing... | You must... |
|---|---|
| Adding a server action | Extend (or add) a spec that asserts its success path *and* its auth-failure path. |
| Adding a route | At minimum a render-smoke test. If it mutates state, a write-path test too. |
| Adding a UI affordance on an existing route | Extend that route's spec — don't create a new one unless the journey is genuinely separate. |
| Fixing a bug | Add a regression test *in the same PR*, written to fail against the pre-fix code. |
| Running a schema migration | Add (or extend) a spec that exercises the new column/table through the UI, not just the DB layer. |
| Removing a feature | Delete the matching spec(s) in the same commit — dead tests are worse than no tests. |

**Key principle:** Treat updating the test suite as part of the definition of done for every PR (per CLAUDE.md).

## Mocking Strategy

**Unit Tests:**
- Rarely mock — test pure functions directly with real inputs
- Use Zustand store methods directly (see `applyInjurySwap.test.ts`: `useLiveGame.setState()`, `useLiveGame.getState()`)
- No database mocks; test assumes DB availability

**E2E Tests:**
- **NO database mocks** — a cardinal rule
- If a test passes here, the feature works end-to-end
- Tests drive a real browser against the real Next.js app, backed by real Supabase
- Auth is real (super-admin session via UI-driven login)
- Data creation is real (factories write via admin client)
- See auto-memory note: "never chain .select() to .insert() when an AFTER INSERT trigger creates rows the SELECT policy depends on"

**Playwright Trace & Screenshot Artifacts:**
- Traces recorded on first retry only (expensive)
- Screenshots and videos retained on failure only
- CI uploads these as artifacts for post-mortem debugging

## Test Patterns & Examples

**Assertion Style (E2E):**
- Prefer semantic queries: `getByRole("button", { name: /create/i })`, `getByText()`, `getByLabel()`
- Avoid `getByTestId` unless semantic queries can't disambiguate (e.g., multiple numbers on live screen)
- Assertions: `toBeVisible()`, `toHaveText()`, resilient to layout tweaks
- Avoid asserting on raw DOM structure; assert on user-facing behavior

**Async Waiting (E2E):**
- Use `expect.poll()` for eventual consistency (e.g., waiting for DB write to propagate)
  ```typescript
  await expect.poll(async () => {
    const { data } = await admin
      .from("game_availability")
      .select("status")
      .eq("game_id", game.id);
    return data?.length ?? 0;
  }).toBe(12);
  ```
- Don't lengthen timeouts to paper over flakiness — a test needing a long timeout is waiting on the wrong signal

**Isolation:**
- Each test creates its own team/players/games via factories
- Don't rely on state from sibling tests
- Use `test.describe.configure({ mode: 'parallel' })` when tests in the same file don't share mutable state

**Example: Availability Toggle (E2E):**
See `e2e/tests/availability.spec.ts` — covers the setAvailability action + add/remove fill-in flow. Key pattern:
- Creates test user and team via fixtures
- Navigates to game detail page via URL
- Clicks availability toggle button twice to go unknown → available → unavailable
- Waits for round-trip before second click (prevents racing on stale state)
- Polls the database to verify the status flipped

## Coverage

**Requirements:**
- No explicit coverage targets enforced (not specified in config)
- E2E specs focus on critical paths: create → start → modify → score
- Unit tests cover pure logic (age group rules, zone math, fairness algorithms)

**View Coverage (Local):**
```bash
npm run e2e:ui    # Playwright inspector, step through interactively
```
- HTML report with screenshots, videos, traces: `playwright-report/index.html`

## Local Debugging

**Run All Tests:**
```bash
npm test                    # vitest unit tests
npm run e2e                 # Playwright e2e specs
npx tsc --noEmit           # type check
npm run lint               # linting
```

**Debug a Failing Test:**
1. `npm run e2e:ui` — step frame-by-frame through the failing test in Playwright inspector
2. Open `playwright-report/index.html` — screenshots, videos, traces from last run
3. Check CI artifacts — same report uploaded when CI job fails

**E2E Setup Issues:**
- Verify `.env.test` is populated with `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TEST_SUPER_ADMIN_EMAIL`, `TEST_SUPER_ADMIN_PASSWORD`
- Run `npm run db:reset` to wipe local Supabase
- Run `npm run dev` in one terminal, `npm run e2e` in another (Playwright reuses the dev server)

## Test Maintenance

**Prune Cadence:**
- Monthly-ish: prune brittle or redundant specs
- If suite takes > 5 minutes locally, tighten or split (people stop running it otherwise)
- Dead specs are worse than no specs — delete removed features' specs in the same commit

**Parallel Execution:**
- `fullyParallel: true` in `playwright.config.ts` — each spec gets its own worker
- Supabase + Next.js handle the parallelism locally
- CI capped at 2 workers (default runner has 2 cores)

---

*Testing analysis: 2026-04-29*
