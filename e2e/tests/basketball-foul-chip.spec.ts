// Steve 2026-10-21: "I'd like to show a chip in basketball to simply show
// how many fouls a player has." Every tile (on court and on the bench)
// carries an nF chip while the foul tally is on: muted early, amber two
// short of fouling out, solid amber one short. The dock steps fouls up
// and down; the long-press menu adds, takes back, or clears them.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test("basketball tiles show each kid's fouls, coloured by how close they are to fouling out", async ({ page }) => {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12", name: `BBL-FOUL-${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true, track_fouls: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 7 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const k = players.map((p) => p.id);
  const lineup = { lines: { guard: k.slice(0, 2), forward: k.slice(2, 5), court: [] }, bench: k.slice(5) };
  const start = Date.now() - 60_000;
  const at = (s: number) => new Date(start + s * 1000).toISOString();
  const foul = (pid: string, s: number) => ({
    game_id: game.id,
    type: "foul",
    player_id: pid,
    metadata: { kind: "personal", quarter: 1, elapsed_ms: s * 1000, sport: "basketball" },
    created_by: ownerId,
    created_at: at(s),
  });
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup, sport: "basketball" }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport: "basketball" }, created_by: ownerId, created_at: at(0) },
    ...[1, 2, 3].map((s) => foul(k[1], s)),
    ...[4, 5, 6, 7].map((s) => foul(k[2], s)),
    ...[8, 9].map((s) => foul(k[5], s)),
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const chip = (pid: string) => page.getByTestId(`fouls-${pid}`);
  await expect(chip(k[0])).toHaveText("0F", { timeout: 15_000 });
  await expect(chip(k[1])).toHaveText("3F");
  await expect(chip(k[2])).toHaveText("4F");
  // On the bench too: fouls carry through the game.
  await expect(page.getByRole("group", { name: "Bench" }).getByTestId(`fouls-${k[5]}`)).toHaveText("2F");

  const bg = (pid: string) => chip(pid).evaluate((el) => getComputedStyle(el).backgroundColor);
  const amber = "rgb(168, 89, 15)";
  expect(await bg(k[2])).toBe(amber);
  expect(await bg(k[1])).not.toBe(amber);
  expect(await bg(k[1])).not.toBe(await bg(k[0]));
  await expect(chip(k[1])).toHaveCSS("color", amber);

  // Long-press: add a foul.
  await page.getByTestId(`player-tile-${k[0]}`).click({ delay: 600 });
  await page.getByTestId("basketball-add-foul").click({ timeout: 5_000 });
  await expect(chip(k[0])).toHaveText("1F", { timeout: 10_000 });

  // Steve 2026-10-22: "Need to be able to undo fouls in basketball."
  // The dock steps a kid's fouls back down.
  await page.getByTestId(`player-tile-${k[1]}`).click();
  await page.getByTestId("basketball-unfoul").click();
  await expect(chip(k[1])).toHaveText("2F", { timeout: 10_000 });
  // Nothing to take back at 0F.
  await page.getByTestId(`player-tile-${k[3]}`).click();
  await expect(page.getByTestId("basketball-unfoul")).toBeDisabled();
  await page.getByRole("button", { name: /^cancel$/i }).first().click();
  // The long-press menu clears them all.
  await page.getByTestId(`player-tile-${k[2]}`).click({ delay: 600 });
  await page.getByTestId("basketball-clear-fouls").click({ timeout: 5_000 });
  await expect(chip(k[2])).toHaveText("0F", { timeout: 15_000 });
});
