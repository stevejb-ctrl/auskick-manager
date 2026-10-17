// Scorebug team names are read whole, never clipped (in-game re-skin,
// 17 Oct 2026). At 375 px with the canvas's 0.12em mono tracking a
// one-line truncate cut "BRUNSWICK MAGPIES" mid-word; the name now
// wraps to a second line instead.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

const OPPONENT = "Brunswick Magpies";

async function liveGame(sport: "afl" | "netball", ageGroup: string, count: number) {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `Northcote Kangaroos ${Date.now() % 1000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: OPPONENT });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  return { team, game };
}

async function kickOff(page: Page) {
  await page.getByRole("button", { name: /^start q1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start q1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — q1, running$/i })).toBeVisible({ timeout: 15_000 });
}

async function expectNamesWhole(page: Page) {
  const names = page.getByTestId("scorebug-team-name");
  await expect(names).toHaveCount(2, { timeout: 15_000 });
  await expect(names.last()).toHaveText(OPPONENT);
  for (const name of await names.all()) {
    const fit = await name.evaluate((el) => ({
      text: el.textContent,
      x: el.scrollWidth - el.clientWidth,
      y: el.scrollHeight - el.clientHeight,
    }));
    expect(fit.x, `"${fit.text}" overflows sideways`).toBeLessThanOrEqual(0);
    expect(fit.y, `"${fit.text}" overflows downward`).toBeLessThanOrEqual(0);
  }
}

test.use({ viewport: { width: 375, height: 740 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "league-walkthrough-seen", "rl-walkthrough-seen", "nb-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
});

test("AFL scorebug shows long team names whole at 375", async ({ page }) => {
  test.setTimeout(120_000);
  const { team, game } = await liveGame("afl", "U12", 14);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await kickOff(page);
  await expectNamesWhole(page);
});

test("netball scorebug shows long team names whole at 375", async ({ page }) => {
  test.setTimeout(120_000);
  const { team, game } = await liveGame("netball", "go", 9);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await kickOff(page);
  await expectNamesWhole(page);
});
