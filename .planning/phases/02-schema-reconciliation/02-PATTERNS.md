# Phase 2: Schema Reconciliation - Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 4 (3 source/test files + 1 planning doc)
**Analogs found:** 3 / 3 source files (planning doc uses Phase 1 structural model)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `e2e/tests/multi-sport-schema.spec.ts` | test (e2e spec) | request-response + DB poll | `e2e/tests/settings.spec.ts` (round-trip case) + `e2e/tests/onboarding.spec.ts` (wizard cases) | exact (same framework, same fixture chain, same `expect.poll` idiom) |
| `e2e/fixtures/factories.ts` | test fixture | CRUD (service-role admin insert) | `e2e/fixtures/factories.ts` current file (self-analog — extend in place) | self |
| `package.json` | config | n/a | `../multi-sport/package.json` scripts block | exact (same project, same CLI tooling) |
| `.planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md` | planning doc | n/a | `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` | structural model |

---

## Pattern Assignments

### `e2e/tests/multi-sport-schema.spec.ts` (test, request-response + DB poll)

This spec has three test cases that each use a different subset of patterns. The two primary analogs are read in full above.

---

#### Test case 1 + 2: Wizard cases (AFL + netball)

**Analog:** `e2e/tests/onboarding.spec.ts`

**Imports pattern** (lines 1-9):
```typescript
import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
```
The wizard cases provision their own user via `createTestUser` and tear down via `deleteTestUser` in `finally`. They do NOT use `makeTeam` — they drive the wizard through the UI.

**Clean-context + user-provisioning pattern** (lines 14-50):
```typescript
test("AFL setup wizard creates team with sport='afl' and default track_scoring", async ({
  browser,
}) => {
  // Clean context so we don't inherit the super-admin storageState.
  // Wizard cases exercise a fresh-coach flow.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  const stamp = Date.now();
  const email = `wizard-afl-${stamp}@siren.test`;
  const password = "wizard-test-pw-1234";
  const admin = createAdminClient();
  let userId: string | null = null;

  try {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr) throw createErr;
    userId = created.user?.id ?? null;
    expect(userId).not.toBeNull();

    await page.goto("/login");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/(dashboard|teams\/new)/, { timeout: 15_000 });
    // ... wizard interactions ...
  } finally {
    if (userId) await deleteTestUser(admin, userId);
    await context.close();
  }
});
```
Source: `e2e/tests/onboarding.spec.ts` lines 14-85.

**Wizard navigation pattern** (lines 56-65 in onboarding.spec.ts):
```typescript
if (!page.url().includes("/teams/new")) {
  await page.goto("/teams/new");
}
const teamName = `Roos ${stamp}`;
await page.getByLabel(/team name/i).fill(teamName);
await page.getByLabel(/age group/i).selectOption("U10");
// NEW for multi-sport: click the sport pill BEFORE filling the name.
// AFL case: sport pill is "AFL / Auskick" (default — optional click to be explicit).
// Netball case: click the "Netball" pill.
// pill locator: page.getByRole("button", { name: "Netball" })
await page.getByRole("button", { name: /continue/i }).click();

// Wait for redirect into the setup flow.
await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 });
```

**Post-wizard DB assertion pattern** (new — adapts `expect.poll` from settings.spec.ts):
```typescript
// After team creation, find the team id from the URL.
const teamUrlMatch = page.url().match(/\/teams\/([0-9a-f-]+)/);
expect(teamUrlMatch).not.toBeNull();
const teamId = teamUrlMatch![1];

// Assert sport column persisted correctly.
await expect
  .poll(
    async () => {
      const { data } = await admin
        .from("teams")
        .select("sport, track_scoring")
        .eq("id", teamId)
        .single();
      return data;
    },
    { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
  )
  .toMatchObject({ sport: "afl", track_scoring: false });
```
The `expect.poll` shape is copied verbatim from `e2e/tests/settings.spec.ts` lines 39-51; only the `.select()` columns and `.toMatchObject` target change.

---

#### Test case 3: Team-settings quarter-length round-trip

**Analog:** `e2e/tests/settings.spec.ts`

**Imports pattern** (lines 10-12 in settings.spec.ts):
```typescript
import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
```
Inherits the super-admin storageState (chromium project default). No `deleteTestUser` needed — the test creates a team owned by the already-authenticated super-admin and destroys it in `finally` via a direct admin delete.

**ownerId lookup pattern** (lines 17-21 in settings.spec.ts):
```typescript
const admin = createAdminClient();
const { data: superAdmin } = await admin.auth.admin.listUsers();
const ownerId = superAdmin.users.find(
  (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
)!.id;
```
Copy verbatim. The super-admin email is loaded from `.env.test` via `e2e-setup.mjs`.

**Factory fast-forward + settings navigation pattern** (lines 23-29 in settings.spec.ts):
```typescript
const team = await makeTeam(admin, {
  ownerId,
  ageGroup: "go",        // netball age group — requires factory extension (see factories.ts below)
  name: `QL-${Date.now()}`,
  sport: "netball",      // requires factory extension (see factories.ts below)
});

await page.goto(`/teams/${team.id}/settings`);
```
The `QuarterLengthInput` is only rendered when `team.sport === 'netball'` (verified at `../multi-sport/src/app/(app)/teams/[teamId]/settings/page.tsx:110-125`). A team created without `sport: "netball"` will NOT render the input and the test will fail.

**Section-scoped locator pattern** (line 35 in settings.spec.ts):
```typescript
// QuarterLengthInput is inside the settings page alongside other sections.
// Scope to the section that contains "Quarter length" heading to avoid
// accidentally matching other numeric inputs on the page.
const qlCard = page.locator("section").filter({ hasText: /quarter length/i });
await qlCard.getByLabel(/quarter length/i).clear();
await qlCard.getByLabel(/quarter length/i).fill("8");  // 8 minutes = 480 seconds
await qlCard.getByRole("button", { name: /save/i }).click();
```
Source: pattern from `e2e/tests/settings.spec.ts` line 35 (`page.locator("section").filter({ hasText: "Team name" })`).

**`expect.poll` DB-write round-trip pattern** (lines 39-51 in settings.spec.ts — copy verbatim, change columns):
```typescript
await expect
  .poll(
    async () => {
      const { data: reloaded } = await admin
        .from("teams")
        .select("quarter_length_seconds")
        .eq("id", team.id)
        .single();
      return reloaded?.quarter_length_seconds;
    },
    { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
  )
  .toBe(480);  // 8 min × 60 = 480 seconds

// Reload and confirm UI reflects the persisted value.
await page.reload();
await expect(qlCard.getByLabel(/quarter length/i)).toHaveValue("8");
```

**Negative-presence assertion (AFL team, L7 pattern):**
```typescript
// In the AFL wizard test case, after team creation navigate to settings
// and assert QuarterLengthInput is NOT rendered.
await page.goto(`/teams/${teamId}/settings`);
await expect(page.getByLabel(/quarter length/i)).not.toBeVisible();
```
This validates the `sport === 'netball'` conditional-render gate without needing a separate test case.

---

### `e2e/fixtures/factories.ts` (test fixture, CRUD)

**Analog:** the file itself at its current state (self-extension). Read the current file at `e2e/fixtures/factories.ts` lines 1-47 before modifying.

**Current `makeTeam` signature** (lines 15-47, full):
```typescript
import type { AgeGroup } from "../../src/lib/types";

export interface MakeTeamOpts {
  name?: string;
  ageGroup?: AgeGroup;  // NARROW: must widen to `string`
  ownerId: string;
}

export async function makeTeam(
  admin: SupabaseClient,
  opts: MakeTeamOpts
): Promise<{ id: string; name: string; ageGroup: AgeGroup }> {
  const ageGroup = opts.ageGroup ?? "U10";
  const name = opts.name ?? `Test Team ${Math.random().toString(36).slice(2, 7)}`;

  const { error: insertError } = await admin.from("teams").insert({
    name,
    age_group: ageGroup,
    created_by: opts.ownerId,
    // No `sport` column — DB default `'afl'` applies to existing rows.
  });
  if (insertError) throw new Error(`makeTeam insert: ${insertError.message}`);

  const { data, error } = await admin
    .from("teams")
    .select("id, name, age_group")
    .eq("name", name)
    .eq("created_by", opts.ownerId)
    .single();
  if (error || !data) throw new Error(`makeTeam fetch: ${error?.message}`);

  return { id: data.id as string, name: data.name as string, ageGroup };
}
```

**Required diff shape** (what changes):

1. `MakeTeamOpts.ageGroup` widens from `AgeGroup` (narrow AFL enum) to `string`. This avoids a TypeScript error when the spec passes `"go"` or `"11u"` (netball age groups not in the current enum). Documented as "post-merge type alignment, lands ahead of D-06 widening."

2. `MakeTeamOpts` gains `sport?: "afl" | "netball"` (string literal type — no `Sport` import needed since that type doesn't exist on this branch; string literals satisfy the post-merge constraint too).

3. The `insert` block gains `...(opts.sport ? { sport: opts.sport } : {})` to pass `sport` through when provided. When `sport` is omitted, the DB default `'afl'` applies (backward-compatible for all existing specs).

4. The return type gains `sport?: string` or just stays as `{ id, name, ageGroup }` (the team id is what callers use to navigate, sport doesn't need to be returned).

5. The `AgeGroup` import from `../../src/lib/types` can be kept but the param type switches to `string`.

**Post-change signature** (target state):
```typescript
export interface MakeTeamOpts {
  name?: string;
  ageGroup?: string;                     // widened from AgeGroup
  sport?: "afl" | "netball";            // NEW — defaults to 'afl' via DB
  ownerId: string;
}

export async function makeTeam(
  admin: SupabaseClient,
  opts: MakeTeamOpts
): Promise<{ id: string; name: string; ageGroup: string }> {
  const ageGroup = opts.ageGroup ?? "U10";
  const name = opts.name ?? `Test Team ${Math.random().toString(36).slice(2, 7)}`;

  const { error: insertError } = await admin.from("teams").insert({
    name,
    age_group: ageGroup,
    created_by: opts.ownerId,
    ...(opts.sport ? { sport: opts.sport } : {}),
  });
  if (insertError) throw new Error(`makeTeam insert: ${insertError.message}`);

  const { data, error } = await admin
    .from("teams")
    .select("id, name, age_group")
    .eq("name", name)
    .eq("created_by", opts.ownerId)
    .single();
  if (error || !data) throw new Error(`makeTeam fetch: ${error?.message}`);

  return { id: data.id as string, name: data.name as string, ageGroup };
}
```

**Two-step insert/fetch invariant** — do NOT add `.select()` to the `.insert()` call. The `handle_new_team` AFTER INSERT trigger creates the membership row that the SELECT policy depends on. Chaining would produce an RLS violation. The existing two-step pattern (lines 31-46 in current file) MUST be preserved unchanged.

**Backward-compatibility check** — all 16 existing specs that call `makeTeam(admin, { ownerId, ageGroup: "U10" })` continue to work unchanged. The `sport` parameter is optional and the DB default covers AFL.

---

### `package.json` (config)

**Analog:** `../multi-sport/package.json` scripts block (lines 5-16).

**Current scripts block** on this branch (lines 5-11 in `package.json`):
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

**Target scripts block** — add four missing scripts from multi-sport, plus the `e2e` script neither branch has:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "e2e": "node scripts/e2e-setup.mjs",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset --no-confirm",
  "db:status": "supabase status"
}
```

**Source of each new script:**
- `"e2e": "node scripts/e2e-setup.mjs"` — neither branch has this. `scripts/e2e-setup.mjs` exists on this branch (verified). This gap is flagged as L1 in RESEARCH.md. Adding it here makes `npm run e2e` work as CLAUDE.md expects and avoids brittle `node scripts/e2e-setup.mjs` invocations in verification blocks. This is a non-conflicting addition since neither branch defines the key.
- `"db:start"`, `"db:stop"`, `"db:reset"`, `"db:status"` — copied verbatim from `../multi-sport/package.json` lines 12-15. Using the same values prevents a merge conflict on these keys in Phase 3.

**Merge-conflict safety:** this branch adds `"e2e"` (absent on both branches) and adds `"db:*"` scripts (absent on this branch, present on multi-sport with identical values). When Phase 3 merges, there will be no conflict on these keys.

---

### `.planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md` (planning doc)

**No source-tree analog.** Use `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md` as the structural model.

**Structural template notes from 01-MERGE-NOTES.md:**
- Top matter: generated date, phase, status, consumer list, one-paragraph summary.
- Sections numbered `§1`, `§2`, `§3`, etc. with H2 headings.
- Tables used for: branch/file/decision inventories. Each table row has a "Notes" or "Rationale" column.
- Verification commands quoted in fenced bash blocks.
- Decision log at the end (`§N Decision log`) with locked choices flagged explicitly.
- Ends with a `*Generated …*` italicised metadata line.

**Suggested section structure** (from CONTEXT.md §"Specific Ideas"):
- §1 Hash verification — re-run sha256 commands, record output, confirm D-10 safe.
- §2 File ops for Phase 3 — the exact rename/delete steps Phase 3's merge resolution must execute.
- §3 SCHEMA-02 audit — line-by-line review of `0024_multi_sport.sql:25-27`; confirm NOT NULL DEFAULT atomicity.
- §4 SCHEMA-04 audit — record grep outputs; confirm zero `DROP TABLE/COLUMN/POLICY/TRIGGER/FUNCTION`; document the two safe constraint drops.
- §5 SCHEMA-03 spec design — test names, locator targets, assertion values, "expected red on this branch" note.
- §6 Phase 6 handoff — prod-clone acceptance criteria (the five items from CONTEXT.md §"Phase 6 handoff acceptance criteria").

---

## Shared Patterns

### ownerId lookup
**Source:** `e2e/tests/settings.spec.ts` lines 17-21
**Apply to:** all three test cases in the new spec (wizard cases use their own provisioned user; round-trip case uses this pattern)
```typescript
const admin = createAdminClient();
const { data: superAdmin } = await admin.auth.admin.listUsers();
const ownerId = superAdmin.users.find(
  (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
)!.id;
```

### `expect.poll` DB round-trip assertion
**Source:** `e2e/tests/settings.spec.ts` lines 39-51
**Apply to:** all DB-write assertions in the new spec (sport, track_scoring, quarter_length_seconds)
```typescript
await expect
  .poll(
    async () => {
      const { data: reloaded } = await admin
        .from("teams")
        .select("<column>")
        .eq("id", team.id)
        .single();
      return reloaded?.<column>;
    },
    { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
  )
  .toBe(<expected>);
```

### try/finally cleanup (wizard cases)
**Source:** `e2e/tests/onboarding.spec.ts` lines 27 + 82-84
**Apply to:** wizard test cases that provision a fresh user
```typescript
try {
  // ... test body ...
} finally {
  if (userId) await deleteTestUser(admin, userId);
  await context.close();
}
```

### Two-step insert/fetch (factories only)
**Source:** `e2e/fixtures/factories.ts` lines 29-46
**Apply to:** any raw insert in spec bodies (if bypass of `makeTeam` is needed)
```typescript
// Step 1: insert (no .select() chained — AFTER INSERT trigger race)
const { error: insertError } = await admin.from("teams").insert({ ... });
if (insertError) throw new Error(`insert: ${insertError.message}`);

// Step 2: fetch separately
const { data, error } = await admin
  .from("teams")
  .select("id, ...")
  .eq("name", name)
  .eq("created_by", ownerId)
  .single();
```

### Section-scoped locator
**Source:** `e2e/tests/settings.spec.ts` line 35
**Apply to:** any page with multiple settings cards where generic role locators would be ambiguous
```typescript
const card = page.locator("section").filter({ hasText: /heading text/i });
await card.getByRole("textbox").fill("...");
await card.getByRole("button", { name: /save/i }).click();
```

---

## No Analog Found

No Phase 2 files are without analog — the three source files map cleanly to existing patterns.

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (none) | — | — | — |

---

## Key Landmines for Planner (from RESEARCH.md §6)

These must appear in `read_first` or `notes` blocks of the relevant plan tasks:

| # | File affected | Landmine |
|---|---|---|
| L1 | `package.json` | `npm run e2e` does NOT exist on this branch — Phase 2 adds it |
| L2 | `e2e/fixtures/factories.ts` | `makeTeam` has no `sport` param on either branch — factory extension is in scope |
| L3 | `e2e/fixtures/factories.ts` | `ageGroup` is typed as narrow `AgeGroup` enum — must widen to `string` for netball age groups |
| L4 | `e2e/tests/multi-sport-schema.spec.ts` | `track_scoring` defaults to `false` (NOT the age-group hint value) — assert `false` for both wizard cases |
| L5 | `e2e/tests/multi-sport-schema.spec.ts` | Use `waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 })` after wizard submission — RLS race on freshly-created teams |
| L6 | `e2e/fixtures/factories.ts` | Never chain `.select()` to `.insert()` — AFTER INSERT trigger race |
| L7 | `e2e/tests/multi-sport-schema.spec.ts` | `<QuarterLengthInput>` renders ONLY when `sport === 'netball'` — round-trip test MUST create a netball team |
| L8 | `e2e/tests/multi-sport-schema.spec.ts` | No separate `NetballSetupWizard` — wizard is `TeamBasicsForm` with `<SportPill>` toggle |
| L9 | `e2e/tests/multi-sport-schema.spec.ts` | Brand defaults AFL on localhost — AFL case can rely on default; netball case MUST click the "Netball" sport pill |

---

## Metadata

**Analog search scope:** `e2e/tests/`, `e2e/fixtures/`, `package.json` on current branch + `../multi-sport/package.json`
**Files read:** `e2e/tests/settings.spec.ts`, `e2e/tests/onboarding.spec.ts`, `e2e/fixtures/factories.ts`, `e2e/fixtures/supabase.ts`, `package.json` (this branch), `../multi-sport/package.json`, `scripts/e2e-setup.mjs`, `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md`, `02-CONTEXT.md`, `02-RESEARCH.md`
**Pattern extraction date:** 2026-04-29
