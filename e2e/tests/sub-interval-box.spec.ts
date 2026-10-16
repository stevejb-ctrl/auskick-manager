// The lineup's sub interval box says what the game will use (Stagehand
// sideline-chaos-union, 16 Oct 2026). Subs run 1 to 10 minutes apart; a
// coach typed 15, the box kept saying 15 while Game settings and the
// live timer used 10. Leaving the box now shows the 10 it'll use — in
// AFL's lineup and in league and union's.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

async function preGame(sport: "afl" | "rugby_union", ageGroup: string, count: number) {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `SUB-BOX ${sport} ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  return `/teams/${team.id}/games/${game.id}/live`;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "league-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
});

test("AFL: 15 minutes in the sub box becomes the 10 the game uses", async ({ page }) => {
  await page.goto(await preGame("afl", "U12", 15));
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /game settings/i }).click();
  const box = page.locator("#sub-minutes");
  await box.fill("15");
  await box.blur();
  await expect(box).toHaveValue("10");
  await expect(page.getByText(/Sub every 10m/)).toBeVisible();
});

test("union: 15 minutes in the sub box becomes the 10 the game uses", async ({ page }) => {
  await page.goto(await preGame("rugby_union", "U10", 15));
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start h1$/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /game settings/i }).click();
  const box = page.locator("#sub-interval");
  await box.fill("15");
  await box.blur();
  await expect(box).toHaveValue("10");
  await expect(page.getByText(/10\.0 min subs/)).toBeVisible();
});
