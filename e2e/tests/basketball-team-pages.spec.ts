// ─── Basketball: a coach makes a team, every page opens, settings save ──
// Basketball plan, phase 3. The setup wizard offers Junior Basketball,
// marked Beta; a U12 team starts with the scoreboard on and basketball's
// own How we play (Guards and forwards ★, positions optional); none of
// the team's pages stops for basketball or borrows another sport's
// screen; and the team's halves/quarters and foul tally (migration
// 0069) save from Settings and reach the next game.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { gotoStable, waitForHydration } from "../helpers/navigation";

test("basketball: the wizard makes a U12 team, every page opens, quarters and the foul tally save", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  const admin = createAdminClient();

  await gotoStable(page, "/teams/new");
  await waitForHydration(page);
  const pill = page.getByRole("radio", { name: "Junior Basketball" });
  await expect(pill).toContainText("Beta");
  await pill.click();
  const teamName = `BBL-WIZ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.getByLabel(/team name/i).fill(teamName);
  await page.getByLabel(/age group/i).selectOption("U12");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 15_000 });
  const teamId = page.url().match(/\/teams\/([0-9a-f-]+)/)![1];

  // U12 keeps score; halves and the age's foul tally until the coach says.
  await expect
    .poll(async () => (await admin.from("teams").select("sport, track_scoring, period_count, track_fouls").eq("id", teamId).single()).data)
    .toMatchObject({ sport: "basketball", track_scoring: true, period_count: null, track_fouls: null });

  // Wizard step 2: How we play, with basketball's rotations and laws.
  await gotoStable(page, `/teams/${teamId}/setup?step=config`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "How we play" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Guards and forwards").first()).toBeVisible();
  await expect(page.getByText(/no zone defence/i).first()).toBeVisible();

  // Every team page opens for basketball.
  for (const path of ["", "/games", "/squad", "/settings", "/stats"]) {
    const res = await gotoStable(page, `/teams/${teamId}${path}`);
    expect(res?.status() ?? 200, path || "/").toBeLessThan(400);
    await waitForHydration(page);
    await expect(page.getByText(/isn't built yet|something went wrong/i)).toHaveCount(0);
  }
  await expect(page.getByText(/no completed games yet/i)).toBeVisible();

  // Settings: quarters (0069's period_count) and the foul tally (track_fouls).
  await gotoStable(page, `/teams/${teamId}/settings`);
  await waitForHydration(page);
  await page.getByRole("radio", { name: /quarters/i }).click({ timeout: 15_000 });
  await expect
    .poll(async () => (await admin.from("teams").select("period_count").eq("id", teamId).single()).data?.period_count)
    .toBe(4);
  await expect(page.getByRole("radio", { name: /quarters/i })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Track fouls" }).click();
  await expect
    .poll(async () => (await admin.from("teams").select("track_fouls").eq("id", teamId).single()).data?.track_fouls)
    .toBe(false);

  // A new game for a quarters team takes a quarter's sub interval (4 × 10:
  // a change every 5 minutes).
  await gotoStable(page, `/teams/${teamId}/games`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /create manually/i }).click({ timeout: 15_000 });
  await page.getByLabel(/opponent/i).fill("Kilsyth Cobras");
  await page.getByLabel(/date.*time/i).fill(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: /^create game$/i }).click();
  await page.waitForURL(/\/teams\/.+\/games\/.+/, { timeout: 15_000 });
  await expect
    .poll(async () => (await admin.from("games").select("sub_interval_seconds, on_field_size").eq("team_id", teamId)).data)
    .toEqual([{ sub_interval_seconds: 300, on_field_size: 5 }]);

  expect(errors).toEqual([]);
});
