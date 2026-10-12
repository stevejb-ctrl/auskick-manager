// Covers the parent experience (UX plan 2.4, decided: read only).
// Parents get Today, Games and Stats; Squad and Team are hidden; a live
// game opens a read-only scoreboard; they leave a team from Account.
//
// Covers: src/components/team/teamTabs.ts, ParentScoreboard,
//         squad/settings parent redirects, LeaveTeamButton.

import { test, expect, type Browser } from "@playwright/test";
import { createAdminClient, createTestUser, deleteTestUser } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function signInAs(browser: Browser, email: string, password: string) {
  const context = await browser.newContext({
    storageState: undefined,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByTestId("login-mode-toggle").click();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
  return { context, page };
}

test("a parent follows the team read-only, watches the live score, and can leave", async ({
  browser,
}) => {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Watched Wallabies" });
  await admin.from("game_events").insert([
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
    { game_id: game.id, type: "goal", player_id: players[0].id, metadata: {}, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  const password = "parent-pw-12345";
  const parent = await createTestUser(admin, {
    email: `parent-view-${Date.now()}@siren.test`,
    password,
    fullName: "Pat Parent",
  });
  try {
    await admin
      .from("team_memberships")
      .insert({ team_id: team.id, user_id: parent.id, role: "parent" });
    const { context, page } = await signInAs(browser, parent.email, password);

    await page.goto(`/teams/${team.id}`);
    const bar = page.getByRole("navigation", { name: /team sections/i });
    await expect(bar.getByRole("link")).toHaveText(["Today", "Games", "Stats"], { timeout: 10_000 });

    // Squad and Team bounce back to Today.
    await page.goto(`/teams/${team.id}/squad`);
    await expect(page).toHaveURL(new RegExp(`/teams/${team.id}$`));
    await page.goto(`/teams/${team.id}/settings`);
    await expect(page).toHaveURL(new RegExp(`/teams/${team.id}$`));

    // The live game is a read-only scoreboard.
    await page.getByRole("link", { name: /^watch live$/i }).click();
    await expect(page.getByText(/q1 in play/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Watched Wallabies")).toBeVisible();
    await expect(page.getByRole("button", { name: /^clock/i })).toHaveCount(0);

    // Leave from the account page.
    await page.goto("/account");
    await page.getByRole("button", { name: new RegExp(`^leave ${team.name}$`, "i") }).click();
    await page.getByRole("button", { name: /yes, leave the team/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|welcome)/, { timeout: 10_000 });
    const { data: rows } = await admin
      .from("team_memberships")
      .select("user_id")
      .eq("team_id", team.id)
      .eq("user_id", parent.id);
    expect(rows).toEqual([]);
    await context.close();
  } finally {
    await deleteTestUser(admin, parent.id);
  }
});
