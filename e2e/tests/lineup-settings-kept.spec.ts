// Game settings survive a Who's here change (UX round 2, 24 Oct 2026).
// Basketball game 2: the coach set the sub interval from 4 to 3 minutes,
// then marked a late kid In, and the game started on 4: every sport's
// lineup picker is remounted when who's here changes, and its settings
// were local state. Usually the coach sets the game up first and a late
// kid turns up after, so the order matters.
//
// Covers: src/components/lineup/useKeptSetting.ts in the basketball and
// AFL pickers (soccer, touch and league use the same hook).

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeGame, makePlayers, makeTeam } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function ownerId(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/** A team's game with everyone In but the last kid, who's Out. */
async function gameWithOneOut(sport: "basketball" | "afl", ageGroup: string, count: number) {
  const by = await ownerId();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId: by, sport, ageGroup, name: `R2 kept ${sport} ${Date.now()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId: by, count });
  const game = await makeGame(admin, { teamId: team.id, ownerId: by });
  const late = players[players.length - 1];
  const { error } = await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: p.id === late.id ? ("unavailable" as const) : ("available" as const),
      updated_by: by,
    })),
  );
  if (error) throw new Error(error.message);
  return { admin, team, game, late };
}

/**
 * Mark a kid In from the lineup's Who's here, and wait for the lineup to
 * take them: the picker has remounted, its Game settings card closed.
 */
async function markIn(page: Page, name: string, id: string) {
  await page.getByRole("button", { name: /who's here/i }).click();
  await page.getByRole("radiogroup", { name: `${name} availability` }).getByRole("radio", { name: /^in$/i }).click();
  await expect(page.getByTestId(`player-tile-${id}`).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /game settings/i }).click();
}

test("basketball: the sub interval set before a late kid is marked In is the one the game starts on", async ({ page }) => {
  const { admin, team, game, late } = await gameWithOneOut("basketball", "U12", 10);
  expect(game.sub_interval_seconds).not.toBe(180);

  await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start h1$/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /game settings/i }).click();
  const interval = page.locator("#basketball-sub-interval");
  await interval.fill("3");
  await interval.blur();

  await markIn(page, late.full_name, late.id);

  // Still 3 after the lineup rebuilt with the late kid.
  await expect(page.locator("#basketball-sub-interval")).toHaveValue("3");
  await page.getByRole("button", { name: /^start h1$/i }).click();
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect
    .poll(async () => (await admin.from("games").select("sub_interval_seconds").eq("id", game.id).single()).data, {
      timeout: 15_000,
    })
    .toEqual({ sub_interval_seconds: 180 });
});

test("AFL: players on the field and the sub interval survive a late kid marked In", async ({ page }) => {
  const { team, game, late } = await gameWithOneOut("afl", "U10", 15);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /game settings/i }).click();
  await page.locator("#on-field-size").selectOption("11");
  await page.locator("#sub-minutes").fill("5");
  await page.locator("#sub-minutes").blur();

  await markIn(page, late.full_name, late.id);

  await expect(page.locator("#on-field-size")).toHaveValue("11");
  await expect(page.locator("#sub-minutes")).toHaveValue("5");
  // The rebuilt lineup is at the coach's size: 11 of the 15 on, 4 resting.
  const bench = page.getByRole("group", { name: "Bench", exact: true });
  await expect(bench.locator('[data-testid^="player-tile-"]')).toHaveCount(4);
});
