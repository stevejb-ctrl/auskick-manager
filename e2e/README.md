# End-to-end test suite

Plain Playwright specs that drive a real browser against the real
Next.js app, backed by a local Supabase container. No mocks, no stubs
at the DB layer — if a test passes here, the feature works.

## Directory layout

```
e2e/
├─ README.md            ← this file
├─ fixtures/
│  ├─ supabase.ts       ← service-role client, createTestUser, ensureTestUser
│  └─ factories.ts      ← makeTeam, makePlayers, makeGame
└─ tests/
   ├─ auth.setup.ts     ← runs once before any spec; seeds super-admin + saves storageState
   ├─ smoke.spec.ts     ← harness health check
   └─ *.spec.ts         ← one file per journey family
```

## Running

See the "Running tests" section in the root `README.md`. Short version:

```bash
npm run e2e          # the whole suite
npm run e2e:ui       # Playwright inspector — best for debugging
npm run e2e -- path/to.spec.ts    # single spec
```

## When to add a test

The tests earn their keep only if they evolve with the app. Treat
updating this suite as part of the definition of done for every PR.

| You're doing... | You must... |
|---|---|
| Adding a server action | Extend (or add) a spec that asserts its success path *and* its auth-failure path. |
| Adding a route | At minimum a render-smoke test. If it mutates state, a write-path test too. |
| Adding a UI affordance on an existing route | Extend that route's spec — don't create a new one unless the journey is genuinely separate. |
| Fixing a bug | Add a regression test *in the same PR*, written to fail against the pre-fix code. |
| Running a schema migration | Add (or extend) a spec that exercises the new column/table through the UI, not just the DB layer. |
| Removing a feature | Delete the matching spec(s) in the same commit — dead tests are worse than no tests. |

## Conventions

- **Isolation**: each test creates its own team/players/games via factories. Don't rely on state from sibling tests.
- **Parallel by default**: `test.describe.configure({ mode: 'parallel' })` at the top of a spec when tests in the same file don't share mutable state.
- **Factories for setup, UI for the feature under test**. If a spec covers "create game via form", click through the form. If a spec covers "a started game shows running zone minutes", use `makeGame()` to fast-forward setup and spend your test budget on the zone-minute assertions.
- **Queries**: prefer `getByRole` / `getByText` / `getByLabel` over `getByTestId`. Add `data-testid` only when semantic queries can't disambiguate (e.g. multiple "3" numbers visible simultaneously on the live screen).
- **Assertions**: `expect(locator).toBeVisible()` / `toHaveText()` — resilient to layout tweaks. Avoid asserting on raw DOM structure.
- **Timeouts**: don't lengthen timeouts to paper over flakiness. A test that needs a long timeout is a test that's waiting on the wrong signal.

## Adding a new spec — template

```ts
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

Note: specs running under the `chromium` project inherit the super-admin
`storageState`. For tests that should run as a freshly-created team
admin (not super-admin), either sign out + sign in within the test, or
define a new Playwright project with a different storageState.

## Debugging a failing test

1. `npm run e2e:ui` — run the suite in the inspector. Step frame-by-frame through the failing test.
2. `playwright-report/` — HTML report with screenshots, videos, and traces for the last run. Open `index.html`.
3. CI uploads the same artifact when a job fails — link is in the failed check's Summary page.

## Review cadence

Monthly-ish: prune specs that have become brittle or redundant. A
suite that takes longer than 5 minutes locally is drifting into
territory where people stop running it — tighten or split if that
happens.
