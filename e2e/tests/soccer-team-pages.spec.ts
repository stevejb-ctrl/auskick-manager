// ─── Football (soccer): a coach makes a team and every page opens ──
// Soccer plan, phase 3. The setup wizard offers Football (soccer),
// marked Beta (open to every coach, Steve 17 Oct 2026); a U9 team
// starts with MiniRoos' rules (no scoreboard) and soccer's own How we
// play ("Everyone has a turn in goal"); and none of the team's pages
// stops for soccer or borrows another sport's screen.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { gotoStable, waitForHydration } from "../helpers/navigation";

test("soccer: the wizard makes a U9 team with MiniRoos rules, and every team page opens", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  const admin = createAdminClient();

  await gotoStable(page, "/teams/new");
  await waitForHydration(page);
  const pill = page.getByRole("button", { name: "Junior Football (soccer)" });
  await expect(pill).toContainText("Beta");
  await pill.click();
  const teamName = `SOC-WIZ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.getByLabel(/team name/i).fill(teamName);
  await page.getByLabel(/age group/i).selectOption("U9");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 15_000 });
  const teamId = page.url().match(/\/teams\/([0-9a-f-]+)/)![1];

  // MiniRoos keeps no score; the team's How we play is soccer's own.
  await expect
    .poll(async () => (await admin.from("teams").select("sport, track_scoring").eq("id", teamId).single()).data)
    .toMatchObject({ sport: "soccer", track_scoring: false });

  // Wizard step 2: How we play, with soccer's strategies and laws.
  await gotoStable(page, `/teams/${teamId}/setup?step=config`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "How we play" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Everyone has a turn in goal").first()).toBeVisible();
  await expect(page.getByText(/no scores or ladders are kept/i)).toBeVisible();
  await expect(page.getByText(/MiniRoos keeps no scores or ladders/i)).toBeVisible();

  // Every team page opens for soccer.
  for (const path of ["", "/games", "/squad", "/settings", "/stats"]) {
    const res = await gotoStable(page, `/teams/${teamId}${path}`);
    expect(res?.status() ?? 200, path || "/").toBeLessThan(400);
    await waitForHydration(page);
    await expect(page.getByText(/isn't built yet|something went wrong/i)).toHaveCount(0);
  }
  await expect(page.getByText(/no completed games yet/i)).toBeVisible();

  expect(errors).toEqual([]);
});
