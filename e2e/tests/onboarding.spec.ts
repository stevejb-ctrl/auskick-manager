// Covers the "first five minutes" flow for a brand-new coach:
// sign up → land on dashboard → create team → add first player.
//
// This spec is the app's reliability canary for new-user activation.
// If it breaks, nobody new can get started.

import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import type { SupabaseClient } from "@supabase/supabase-js";

async function superAdminId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

test.describe.configure({ mode: "parallel" });

test("new user signs up, creates team, adds first player", async ({
  browser,
}) => {
  // Use a clean context so we don't inherit the super-admin storageState.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  // Unique email per run keeps tests isolated even if a previous run
  // failed before cleanup.
  const stamp = Date.now();
  const email = `onboarder-${stamp}@siren.test`;
  const password = "onboard-test-pw-1234";
  const admin = createAdminClient();
  let userId: string | null = null;

  try {
    // --- Account creation + sign-in ---
    // The signup UI was collapsed into the unified email-first /login
    // flow, which sends a magic link — we can't click magic links in
    // headless Playwright. Instead we provision the user via the admin
    // SDK and sign in using the password fallback toggle on /login.
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
    // LoginForm's inputs are unlabelled at the DOM level (LoginField
    // wraps them but the label association isn't exposed to a11y), so
    // testids are the reliable hook.
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();

    // Sign-in lands on either /dashboard or /teams/new (no teams yet).
    await page.waitForURL(/\/(dashboard|teams\/new)/, { timeout: 15_000 });

    // --- Create team ---
    if (!page.url().includes("/teams/new")) {
      await page.goto("/teams/new");
    }
    const teamName = `Roos ${stamp}`;
    await page.getByLabel(/team name/i).fill(teamName);
    await page.getByLabel(/age group/i).selectOption("U10");
    await page.getByRole("button", { name: /continue/i }).click();

    // Setup flow lands on /teams/[id]/setup[?]step=config or similar.
    await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 });

    // --- Add first player ---
    // Navigate to squad. The setup flow may have a "Skip to squad"
    // affordance, but a direct goto is always reliable.
    const teamUrlMatch = page.url().match(/\/teams\/([0-9a-f-]+)/);
    expect(teamUrlMatch).not.toBeNull();
    const teamId = teamUrlMatch![1];

    await page.goto(`/teams/${teamId}/squad`);
    await page.getByLabel(/player name/i).fill("Sam Smith");
    await page.getByLabel(/jersey/i).fill("7");
    await page.getByRole("button", { name: /add player/i }).click();

    // Player should appear in the list.
    await expect(page.getByText("Sam Smith")).toBeVisible({ timeout: 5_000 });
  } finally {
    if (userId) await deleteTestUser(admin, userId);
    await context.close();
  }
});

// Regression (UX plan C2): createGame always redirected to game detail,
// so a coach who created a game inside the setup wizard was ejected and
// never reached "All set" (invite co-coach, share availability).
test("creating a game inside the wizard stays in the wizard and reaches All set", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });

  await page.goto(`/teams/${team.id}/setup?step=games`);
  await page.getByRole("button", { name: /create manually/i }).click();
  await page.getByLabel(/opponent/i).fill("Wizard Wombats");
  await page.getByLabel(/date & time/i).fill("2026-11-01T09:00");
  await page.getByRole("button", { name: /^create game$/i }).click();

  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/setup[?]step=games`), {
    timeout: 10_000,
  });
  await expect(page.getByText("vs Wizard Wombats")).toBeVisible();

  await page.getByRole("link", { name: /^continue$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/setup[?]step=done`));
});

// Regression (UX plan C3): the completed "Basics" pill linked to
// /teams/new, so going back to fix the team name created a second team.
test("the Basics step pill edits the existing team instead of creating another", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const original = `Basics ${Date.now()}`;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", name: original });

  await page.goto(`/teams/${team.id}/setup?step=config`);
  await page.getByRole("link", { name: /back to team basics/i }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/setup[?]step=basics`));

  const nameInput = page.getByLabel(/team name/i);
  await expect(nameInput).toHaveValue(original);
  await nameInput.fill(`${original} Renamed`);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/setup[?]step=config`), {
    timeout: 10_000,
  });

  const { data: rows } = await admin
    .from("teams")
    .select("id, name")
    .eq("created_by", ownerId)
    .like("name", `${original}%`);
  expect(rows).toEqual([{ id: team.id, name: `${original} Renamed` }]);
});

// Regression (UX plan C4): step 2 said "Default for Under 14: on" while
// createTeam only applied the age-group scoring default for rugby
// league, so older AFL / netball teams started with no scoreboard.
test("a new AFL U14 team starts with scoring on, matching the stated default", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const teamName = `Scoring ${Date.now()}`;

  await page.goto("/teams/new");
  await page.getByRole("button", { name: /junior afl/i }).click();
  await page.getByLabel(/team name/i).fill(teamName);
  await page.getByLabel(/age group/i).selectOption("U14");
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/teams\/[0-9a-f-]+\/setup[?]step=config/, { timeout: 10_000 });

  await expect(page.getByText("Default for Under 14: on")).toBeVisible();
  await expect(page.getByRole("switch", { name: /track scoring/i })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  const { data: row } = await admin
    .from("teams")
    .select("track_scoring")
    .eq("created_by", ownerId)
    .eq("name", teamName)
    .single();
  expect(row?.track_scoring).toBe(true);
});

test("a new team starts on the age group's suggested way to play", async ({ page }) => {
  // Usability run: for a new U15 team the wizard pre-selected Free
  // rotation while labelling Set positions "Suggested for Under 15".
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const teamName = `Suggested ${Date.now()}`;

  await page.goto("/teams/new");
  await page.getByRole("button", { name: /junior afl/i }).click();
  await page.getByLabel(/team name/i).fill(teamName);
  await page.getByLabel(/age group/i).selectOption("U15");
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/teams\/[0-9a-f-]+\/setup[?]step=config/, { timeout: 10_000 });

  const setPositions = page.getByRole("radiogroup", { name: "How kids rotate" }).getByRole("radio", { name: /Set positions/ });
  await expect(setPositions).toContainText("Suggested for Under 15");
  await expect(setPositions).toHaveAttribute("aria-checked", "true");
  const { data: team } = await admin.from("teams").select("id").eq("created_by", ownerId).eq("name", teamName).single();
  const { data: playbook } = await admin.from("team_playbooks").select("strategy").eq("team_id", team!.id).single();
  expect(playbook?.strategy).toBe("set-positions");
});

test("league scoring copy matches the grade's laws (junior vs international)", async ({ page }) => {
  // Stagehand round 3: an Under 14 coach was told the team "plays
  // modified tackle, so tries and conversions are tracked". U13+ plays
  // international laws, where penalty and field goals count too.
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const u14 = await makeTeam(admin, { ownerId, ageGroup: "U14", sport: "rugby_league" });
  await page.goto(`/teams/${u14.id}/setup?step=config`);
  await expect(page.getByText(/plays international laws/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/penalty goals \(2 points\) and field goals \(1 point\)/i)).toBeVisible();
  await expect(page.getByText(/modified tackle/i)).toHaveCount(0);

  const u10 = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "rugby_league" });
  await page.goto(`/teams/${u10.id}/setup?step=config`);
  await expect(page.getByText(/plays modified tackle/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/penalty goals/i)).toHaveCount(0);
});

// UX plan 2.1 / M2: on a phone the wizard ran inside full team chrome
// and its stepper truncated to "B…", "P…". It's now a focused shell: a
// readable "Step n of 5" stepper and no team switcher.
test.describe("setup wizard on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("shows a readable stepper and no team chrome", async ({ page }) => {
    const admin = createAdminClient();
    const ownerId = await superAdminId(admin);
    const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });

    await page.goto(`/teams/${team.id}/setup?step=squad`);
    await expect(page.getByText("Step 3 of 5 · Add the squad")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: /back to how we play/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /switch team/i })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: /team sections/i })).toHaveCount(0);

    await page.goto("/teams/new");
    await expect(page.getByRole("button", { name: /^junior afl$/i })).toBeVisible();
  });
});
