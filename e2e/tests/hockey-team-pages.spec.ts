// ─── Hockey: a coach makes a team, every page opens, halves save ──
// Four-sports plan, track A. The setup wizard offers Junior Hockey,
// open to every coach; a U13 team starts
// with hockey's own How we play (named keepers, FIH's laws, no MiniRoos)
// in 4 × 15 quarters; none of the team's pages stops for hockey; and a
// team switched to halves (teams.period_count, VIC's 2 × 30) plays them
// from the lineup on.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makePlayers } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";

test("hockey: the wizard makes a U13 team in quarters, every page opens, and the team switches to halves", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  const admin = createAdminClient();

  await gotoStable(page, "/teams/new");
  await waitForHydration(page);
  const pill = page.getByRole("button", { name: "Junior Hockey" });
  // Every sport left beta with the ten-sport homepage.
  await expect(pill).not.toContainText("Beta");
  await pill.click();
  const teamName = `HOC-WIZ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.getByLabel(/team name/i).fill(teamName);
  await page.getByLabel(/age group/i).selectOption("U13");
  await expect(page.getByText("11 a side with a keeper, 4 × 15-min quarters.")).toBeVisible();
  await expect(page.getByLabel(/quarter length/i)).toHaveValue("15");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 15_000 });
  const teamId = page.url().match(/\/teams\/([0-9a-f-]+)/)![1];

  // U13 keeps score; quarters are the age group's own (nothing stored).
  await expect
    .poll(async () => (await admin.from("teams").select("sport, age_group, track_scoring, period_count").eq("id", teamId).single()).data)
    .toMatchObject({ sport: "hockey", age_group: "U13", track_scoring: true, period_count: null });

  // Wizard step 2: How we play, with hockey's strategies, laws and words.
  await gotoStable(page, `/teams/${teamId}/setup?step=config`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "How we play" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Keepers").first()).toBeVisible();
  await expect(page.getByText(/except during a penalty corner/i)).toBeVisible();
  await expect(
    page.getByText(/^11 a side with a keeper; everyone rotates through the defenders, the midfield and the strikers/i),
  ).toBeVisible();
  await expect(page.getByText(/miniroos/i)).toHaveCount(0);

  // Every team page opens for hockey.
  for (const path of ["", "/games", "/squad", "/settings", "/stats"]) {
    const res = await gotoStable(page, `/teams/${teamId}${path}`);
    expect(res?.status() ?? 200, path || "/").toBeLessThan(400);
    await waitForHydration(page);
    await expect(page.getByText(/isn't built yet|something went wrong/i)).toHaveCount(0);
  }
  await expect(page.getByText(/no completed games yet/i)).toBeVisible();

  // Settings: the team plays halves (VIC's 2 × 30).
  await gotoStable(page, `/teams/${teamId}/settings`);
  await waitForHydration(page);
  const format = page.getByRole("radiogroup", { name: "Halves or quarters" });
  await expect(format.getByRole("radio", { name: /quarters/i })).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
  await expect(format.getByRole("radio", { name: /halves/i })).toContainText("2 × 30 min");
  await format.getByRole("radio", { name: /halves/i }).click();
  await expect
    .poll(async () => (await admin.from("teams").select("period_count").eq("id", teamId).single()).data?.period_count)
    .toBe(2);
  await expect(format.getByRole("radio", { name: /halves/i })).toHaveAttribute("aria-checked", "true");

  // A new game plays halves: the lineup starts H1, not Q1.
  await gotoStable(page, `/teams/${teamId}/games`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /create manually/i }).click({ timeout: 15_000 });
  await page.getByLabel(/opponent/i).fill("Hawthorn Herons");
  await page.getByLabel(/date.*time/i).fill(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: /^create game$/i }).click();
  await page.waitForURL(/\/teams\/.+\/games\/.+/, { timeout: 15_000 });
  const gameId = page.url().match(/\/games\/([0-9a-f-]+)/)![1];
  await expect
    .poll(async () => (await admin.from("games").select("on_field_size").eq("id", gameId).single()).data?.on_field_size)
    .toBe(11);

  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const players = await makePlayers(admin, { teamId, ownerId, count: 13 });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: gameId, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await gotoStable(page, `/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 13 starting lineup/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^start h1$/i })).toBeVisible();
  await page.getByRole("button", { name: /^start h1$/i }).click();
  await expect(page.getByRole("button", { name: /^start h1 now$/i })).toBeVisible({ timeout: 10_000 });

  expect(errors).toEqual([]);
});
