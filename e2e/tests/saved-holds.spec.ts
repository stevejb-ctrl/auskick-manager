// Saved holds (UX plan §6 Live, 5.5): "keep-on and fixed are saved,
// not browser-only". A coach's Keep on field (AFL) or Keep in GS
// (netball) is a player_lock event, so another phone — a co-manager,
// or the same coach after clearing the browser — sees the same hold.
//
// "Another phone" here is the same signed-in page with its browser
// storage wiped before the reload: AFL holds used to live only there,
// and netball holds only in page state.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function superAdminId(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function suppressWalkthroughs(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });
}

/** Wipe this browser's copy of the game, as a second phone would have none. */
async function reloadAsAnotherPhone(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
}

async function locksFor(admin: ReturnType<typeof createAdminClient>, gameId: string) {
  const { data } = await admin
    .from("game_events")
    .select("player_id, metadata")
    .eq("game_id", gameId)
    .eq("type", "player_lock")
    .order("created_at");
  return (data ?? []).map((e) => ({ player_id: e.player_id, lock: (e.metadata as { lock: unknown }).lock }));
}

test("AFL: Keep on field is saved and shows on another phone", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const onField = players.slice(0, game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const lineup = {
    back: onField.slice(0, third).map((p) => p.id),
    hback: [],
    mid: onField.slice(third, third * 2).map((p) => p.id),
    hfwd: [],
    fwd: onField.slice(third * 2).map((p) => p.id),
    bench: players.slice(game.on_field_size).map((p) => p.id),
  };
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  await suppressWalkthroughs(page);

  const kid = onField[0];
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const tile = page.getByTestId(`player-tile-${kid.id}`);
  await expect(tile).toBeVisible({ timeout: 15_000 });
  await tile.click({ delay: 600 });
  await page.getByRole("button", { name: /^Keep on field/ }).click();
  await expect(tile.getByLabel("Field locked")).toBeVisible();
  await expect.poll(() => locksFor(admin, game.id)).toEqual([{ player_id: kid.id, lock: { kind: "field" } }]);

  await reloadAsAnotherPhone(page);
  await expect(page.getByTestId(`player-tile-${kid.id}`).getByLabel("Field locked")).toBeVisible({ timeout: 15_000 });

  // Letting them rotate again is saved too.
  await page.getByTestId(`player-tile-${kid.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: "Let them rotate again" }).click();
  await expect.poll(async () => (await locksFor(admin, game.id)).at(-1)?.lock).toBeNull();
  await reloadAsAnotherPhone(page);
  await expect(page.getByTestId(`player-tile-${kid.id}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`player-tile-${kid.id}`).getByLabel("Field locked")).toHaveCount(0);
});

test("netball: Keep in GS is saved and shows on another phone", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "go", sport: "netball" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const keys = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
  const lineup = {
    positions: Object.fromEntries(keys.map((k, i) => [k, [players[i].id]])),
    bench: players.slice(keys.length).map((p) => p.id),
  };
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const })),
  );
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: startedAt },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: startedAt },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  await suppressWalkthroughs(page);

  const shooter = players[0];
  const gsToken = () =>
    page.getByRole("button", { name: new RegExp(`^Goal Shooter,\\s*${shooter.full_name}`, "i") });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await gsToken().click({ delay: 600, timeout: 15_000 });
  await page.getByRole("button", { name: /keep in .* next break/i }).click();
  await expect(gsToken().getByLabel("Locked at this position for the next quarter break")).toBeVisible();
  await expect
    .poll(() => locksFor(admin, game.id))
    .toEqual([{ player_id: shooter.id, lock: { kind: "position", position: "gs" } }]);

  await reloadAsAnotherPhone(page);
  await expect(gsToken().getByLabel("Locked at this position for the next quarter break")).toBeVisible({
    timeout: 15_000,
  });

  // Letting them rotate again is saved too.
  await gsToken().click({ delay: 600 });
  await page.getByRole("button", { name: /let rotate next break/i }).click();
  await expect.poll(async () => (await locksFor(admin, game.id)).at(-1)?.lock).toBeNull();
  await reloadAsAnotherPhone(page);
  await expect(gsToken()).toBeVisible({ timeout: 15_000 });
  await expect(gsToken().getByLabel("Locked at this position for the next quarter break")).toHaveCount(0);
});
