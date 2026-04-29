// SCHEMA-03 — Schema-migration spec (Phase 02 deliverable, expected RED on this branch).
//
// This spec is committed on `claude/vibrant-banzai-a73b2f` per CONTEXT.md D-12 but
// runs green only AFTER Phase 3's merge brings the netball UI components and the
// new migrations into the trunk. Reasons it's red here:
//   1. <SportPill name="Netball"> doesn't exist on this branch (TeamBasicsForm
//      hasn't been sport-extended yet).
//   2. <QuarterLengthInput> doesn't exist on this branch (lives only on
//      multi-sport at src/components/team/QuarterLengthInput.tsx).
//   3. teams.sport and teams.quarter_length_seconds columns don't exist in this
//      branch's local Supabase (migrations 0024_multi_sport.sql / 0026 / 0027 are
//      multi-sport-only).
//
// Phase 3's verification flips this spec green. See:
//   - .planning/phases/02-schema-reconciliation/02-CONTEXT.md (D-12, D-13, D-14)
//   - .planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md §5 (spec design)
//   - .planning/phases/02-schema-reconciliation/02-RESEARCH.md §6 (landmines L4-L9)
//
// Locked surfaces (D-14 / D-15):
//   - AFL setup wizard       (this spec)
//   - Netball setup wizard   (this spec)
//   - Team-settings UI for teams.quarter_length_seconds round-trip (this spec)
//   - Per-game quarter length override (games table)    — OUT (D-15)
//   - track_scoring=false live-screen / summary suppression — OUT (D-15 — Phase 4)

import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("AFL setup wizard creates team with sport='afl' and default track_scoring", async ({
  browser,
}) => {
  // Clean context: the wizard exercises a fresh-coach flow; do not inherit the
  // super-admin storageState (pattern from onboarding.spec.ts:14-17).
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  const stamp = Date.now();
  const email = `wizard-afl-${stamp}@siren.test`;
  const password = "wizard-test-pw-1234";
  const admin = createAdminClient();
  let userId: string | null = null;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser(
      {
        email,
        password,
        email_confirm: true,
      },
    );
    if (createErr) throw createErr;
    userId = created.user?.id ?? null;
    expect(userId).not.toBeNull();

    // Sign in via the email/password flow (testids per onboarding.spec.ts).
    await page.goto("/login");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/(dashboard|teams\/new)/, { timeout: 15_000 });

    if (!page.url().includes("/teams/new")) {
      await page.goto("/teams/new");
    }

    // Brand defaults AFL on localhost per RESEARCH §3 / L9 — clicking the AFL
    // pill is optional but explicit. Either uncomment the click or rely on
    // default; both are documented as valid for the AFL case.
    // await page.getByRole("button", { name: "AFL / Auskick" }).click();

    const teamName = `Roos ${stamp}`;
    await page.getByLabel(/team name/i).fill(teamName);
    await page.getByLabel(/age group/i).selectOption("U10");
    await page.getByRole("button", { name: /continue/i }).click();

    // L5 — wait for the redirect into the setup flow; protects against the
    // RLS race on freshly-created teams (setup/page.tsx uses service-role
    // client as a documented workaround for the AFTER INSERT trigger timing).
    await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 });

    const teamUrlMatch = page.url().match(/\/teams\/([0-9a-f-]+)/);
    expect(teamUrlMatch).not.toBeNull();
    const teamId = teamUrlMatch![1];

    // L4 — track_scoring stays false (the wizard does NOT auto-flip based on
    // the age-group hint; the column ships NOT NULL DEFAULT false from
    // 0003_live_game.sql and remains false until the coach toggles).
    await expect.poll(
      async () => {
        const { data } = await admin
          .from("teams")
          .select("sport, track_scoring")
          .eq("id", teamId)
          .single();
        return data;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    ).toMatchObject({ sport: "afl", track_scoring: false });

    // L7 negative-presence — QuarterLengthInput renders only for netball teams.
    // Confirms the sport === 'netball' conditional-render gate is respected for AFL.
    await page.goto(`/teams/${teamId}/settings`);
    await expect(page.getByLabel(/quarter length/i)).not.toBeVisible();
  } finally {
    if (userId) await deleteTestUser(admin, userId);
    await context.close();
  }
});

test("netball setup wizard creates team with sport='netball' and netball-default track_scoring", async ({
  browser,
}) => {
  // Clean context: wizard cases exercise a fresh-coach flow.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  const stamp = Date.now();
  const email = `wizard-netball-${stamp}@siren.test`;
  const password = "wizard-test-pw-1234";
  const admin = createAdminClient();
  let userId: string | null = null;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser(
      {
        email,
        password,
        email_confirm: true,
      },
    );
    if (createErr) throw createErr;
    userId = created.user?.id ?? null;
    expect(userId).not.toBeNull();

    await page.goto("/login");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/(dashboard|teams\/new)/, { timeout: 15_000 });

    if (!page.url().includes("/teams/new")) {
      await page.goto("/teams/new");
    }

    // L9 — brand defaults AFL on localhost; the netball case MUST click the
    // Netball sport pill explicitly BEFORE filling team name. Pill name verified
    // at ../multi-sport/src/components/setup/TeamBasicsForm.tsx (SportPill renders
    // role="button" with verbatim title "Netball").
    await page.getByRole("button", { name: "Netball" }).click();

    const teamName = `Hawks ${stamp}`;
    await page.getByLabel(/team name/i).fill(teamName);
    // Default age group switches to "go" when sport is netball
    // (TeamBasicsForm.tsx:33-34: defaultAgeFor(s) === "go" for netball). The
    // selectOption call is idempotent if the form already prefilled "go".
    await page.getByLabel(/age group/i).selectOption("go");
    await page.getByRole("button", { name: /continue/i }).click();

    // L5 — waitForURL after wizard submission (RLS race on freshly-created teams).
    await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 });

    const teamUrlMatch = page.url().match(/\/teams\/([0-9a-f-]+)/);
    expect(teamUrlMatch).not.toBeNull();
    const teamId = teamUrlMatch![1];

    // Assert sport persisted as 'netball'. track_scoring stays false per L4
    // (the wizard does NOT auto-flip for netball either — the ScoringStep shows
    // the age-group default as a hint in the UI but doesn't write to the column).
    await expect.poll(
      async () => {
        const { data } = await admin
          .from("teams")
          .select("sport, track_scoring")
          .eq("id", teamId)
          .single();
        return data;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    ).toMatchObject({ sport: "netball", track_scoring: false });
  } finally {
    if (userId) await deleteTestUser(admin, userId);
    await context.close();
  }
});

test("team settings round-trips quarter_length_seconds for a netball team", async ({
  page,
}) => {
  // Inherits super-admin storageState (chromium project default). Create a
  // netball team via the extended factory (Plan 02), then drive the
  // QuarterLengthInput UI in team settings — this UI is the feature under test.
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  // L7 — QuarterLengthInput renders ONLY when sport === 'netball'. The factory
  // call MUST pass sport: "netball" or the input won't be in the DOM and the
  // test fails with a locator timeout.
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go", // netball age group; factory ageGroup widened to string in Plan 02 (L3)
    name: `QL-${Date.now()}`,
    sport: "netball",
  });

  try {
    await page.goto(`/teams/${team.id}/settings`);

    // QuarterLengthInput renders as a <div> wrapper (not <section>
    // like TeamNameSettings), and its label is unique on the settings
    // page — no other input is labelled "Quarter length". Locate the
    // input directly, then walk up to the card root (which has the
    // shared `rounded-lg` shell class) and find the Save button inside
    // it. This avoids matching the Team name Save button or the
    // "Save song" button elsewhere on the page.
    const qlInput = page.getByLabel(/quarter length/i);
    const qlCard = qlInput.locator(
      "xpath=ancestor::div[contains(@class, 'rounded-lg')][1]",
    );

    await qlInput.clear();
    await qlInput.fill("8"); // 8 min = 480 sec
    await qlCard.getByRole("button", { name: /^save$/i }).click();

    // expect.poll DB-write round-trip (settings.spec.ts:39-51 pattern).
    // 8 minutes × 60 seconds = 480.
    await expect.poll(
      async () => {
        const { data: reloaded } = await admin
          .from("teams")
          .select("quarter_length_seconds")
          .eq("id", team.id)
          .single();
        return reloaded?.quarter_length_seconds;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    ).toBe(480);

    // Reload and confirm UI reflects the persisted value. qlInput is
    // a lazy locator — it re-resolves against the post-reload DOM.
    await page.reload();
    await expect(qlInput).toHaveValue("8");
  } finally {
    await admin.from("teams").delete().eq("id", team.id);
  }
});
