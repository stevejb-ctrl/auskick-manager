// ─── Football (soccer) at its smallest and largest sizes ────────
// - U6 (MiniRoos 4 a side): no keeper, no lines (decided 17 Oct 2026),
//   and no scoreboard by default.
// - U14 (11 a side): the whole side and the bench fit a 375 px phone
//   without the page scrolling sideways, before and after kick-off.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

async function soccerTeam(ageGroup: string, count: number, name: string) {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    sport: "soccer",
    ageGroup,
    name: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  return { admin, team, game };
}

test("soccer U6: 4 a side with no keeper and no lines, and no scoreboard", async ({ page }) => {
  const { admin, team, game } = await soccerTeam("U6", 6, "SOC-U6");
  expect(game.on_field_size).toBe(4);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);

  const field = page.getByRole("region", { name: "On field" });
  await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(4, { timeout: 15_000 });
  await expect(field.getByRole("group", { name: "Field" }).locator("[data-testid^='player-tile-']")).toHaveCount(4);
  await expect(field.getByRole("group", { name: "Keeper" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Keeper" })).toHaveCount(0);

  await page.getByRole("button", { name: /^start h1$/i }).click();
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
  // MiniRoos keeps no score: no +G for either side.
  await expect(page.getByRole("button", { name: /^add goal/i })).toHaveCount(0);

  const { data } = await admin
    .from("game_events")
    .select("metadata")
    .eq("game_id", game.id)
    .eq("type", "lineup_set")
    .single();
  const lineup = (data?.metadata as { lineup: { keeper: string | null; lines: Record<string, string[]> } }).lineup;
  expect(lineup.keeper).toBeNull();
  expect(lineup.lines.field).toHaveLength(4);
  expect([...lineup.lines.def, ...lineup.lines.mid, ...lineup.lines.att]).toHaveLength(0);
});

test.describe("on a 375 px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("soccer U14: all eleven and the bench fit without scrolling sideways", async ({ page }) => {
    const { team, game } = await soccerTeam("U14", 14, "SOC-U14");
    expect(game.on_field_size).toBe(11);
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    const field = page.getByRole("region", { name: "On field" });
    await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(11, { timeout: 15_000 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: /^start h1$/i }).click();
    await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
    await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(11);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
