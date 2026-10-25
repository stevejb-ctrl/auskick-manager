// ─── Futsal: a coach makes a team and every page opens ──────────
// Four-sports plan, track A. The setup wizard offers Junior Futsal,
// open to every coach; a U10 team starts
// with the scoreboard on and futsal's own How we play (keeper turns,
// FIFA's flying subs), never soccer's MiniRoos rules; and none of the
// team's pages stops for futsal or borrows another sport's screen.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { gotoStable, waitForHydration } from "../helpers/navigation";

test("futsal: the wizard makes a U10 team with futsal's rules, and every team page opens", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  const admin = createAdminClient();

  await gotoStable(page, "/teams/new");
  await waitForHydration(page);
  const pill = page.getByRole("radio", { name: "Junior Futsal" });
  // Every sport left beta with the ten-sport homepage.
  await expect(pill).not.toContainText("Beta");
  await pill.click();
  const teamName = `FUT-WIZ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.getByLabel(/team name/i).fill(teamName);
  await page.getByLabel(/age group/i).selectOption("U10");
  // Futsal's own format, not soccer's U10 (9 a side, 2 × 25).
  await expect(page.getByText("5 a side with a keeper, 2 × 20-min halves.")).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 15_000 });
  const teamId = page.url().match(/\/teams\/([0-9a-f-]+)/)![1];

  // Futsal keeps score from U10 (soccer's MiniRoos U10 keeps none).
  await expect
    .poll(async () => (await admin.from("teams").select("sport, age_group, track_scoring").eq("id", teamId).single()).data)
    .toMatchObject({ sport: "futsal", age_group: "U10", track_scoring: true });

  // Wizard step 2: How we play, with futsal's strategies, laws and words.
  await gotoStable(page, `/teams/${teamId}/setup?step=config`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "How we play" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Everyone has a turn in goal").first()).toBeVisible();
  await expect(page.getByText(/subs fly on and off at any time through the sub zone/i)).toBeVisible();
  await expect(page.getByText(/a sub can swap with the keeper at any time/i)).toBeVisible();
  await expect(page.getByText(/^5 a side with a keeper; everyone rotates through the back, the wings and the front/i)).toBeVisible();
  await expect(page.getByText(/junior futsal keeps score from about under 10/i)).toBeVisible();
  // No MiniRoos here.
  await expect(page.getByText(/miniroos/i)).toHaveCount(0);

  // Every team page opens for futsal.
  for (const path of ["", "/games", "/squad", "/settings", "/stats"]) {
    const res = await gotoStable(page, `/teams/${teamId}${path}`);
    expect(res?.status() ?? 200, path || "/").toBeLessThan(400);
    await waitForHydration(page);
    await expect(page.getByText(/isn't built yet|something went wrong/i)).toHaveCount(0);
  }
  await expect(page.getByText(/no completed games yet/i)).toBeVisible();

  // A new game is futsal's: 5 on the court, a sub every 4 minutes.
  await gotoStable(page, `/teams/${teamId}/games`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /create manually/i }).click({ timeout: 15_000 });
  await page.getByLabel(/opponent/i).fill("Tuggeranong Tigers");
  await page.getByLabel(/date.*time/i).fill(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: /^create game$/i }).click();
  await page.waitForURL(/\/teams\/.+\/games\/.+/, { timeout: 15_000 });
  await expect
    .poll(async () => (await admin.from("games").select("sub_interval_seconds, on_field_size").eq("team_id", teamId)).data)
    .toEqual([{ sub_interval_seconds: 240, on_field_size: 5 }]);

  expect(errors).toEqual([]);
});
