// The runner link's /lineup page is AFL's lineup picker. Netball and
// league pick their lineup on /run/[token] itself.
//
// Cross-sport audit (14 Oct 2026): only netball was sent back, so a
// league share link + /lineup showed AFL's picker with AFL U10 settings
// (12 a side, quarters, AFL zones), and its kickoff saved an AFL-shaped
// lineup into the league game. Sports are independent: anything that
// isn't AFL goes back to its own page.

import { test, expect, type Browser } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

async function runnerPage(browser: Browser) {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
  return { context, page };
}

for (const sport of ["rugby_league", "rugby_union", "netball"] as const) {
  test(`${sport}: the runner's /lineup goes back to the sport's own page, not AFL's picker`, async ({ browser }) => {
    const admin = createAdminClient();
    const { data: su } = await admin.auth.admin.listUsers();
    const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
    const team = await makeTeam(admin, {
      ownerId,
      ageGroup: sport === "netball" ? "11u" : "U11",
      sport,
      name: `Runner lineup ${sport} ${Date.now() % 100000}`,
    });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    await admin.from("game_availability").insert(
      players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
    );

    const { context, page } = await runnerPage(browser);
    await page.goto(`/run/${game.share_token}/lineup`);
    await expect(page).toHaveURL(new RegExp(`/run/${game.share_token}$`));
    // AFL's picker kicks off with "Start Q1"; league U11 and union U11
    // play halves.
    if (sport !== "netball") {
      await expect(page.getByRole("button", { name: /^start h1$/i })).toBeVisible({ timeout: 15_000 });
    }
    await context.close();
  });
}
