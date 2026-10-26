// Steve 2026-10-21: "I'd like to show a chip in basketball to simply show
// how many fouls a player has." Every tile (on court and on the bench)
// carries an nF chip while the foul tally is on and the kid has a foul:
// muted early, amber two short of fouling out, solid amber one short.
// (UX audit 23 Oct 2026: a "0F" on every tile was clutter, so a kid
// with no fouls has no chip.) The dock steps fouls up
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
  await expect(chip(k[1])).toHaveText("3F", { timeout: 15_000 });
  await expect(chip(k[0])).toHaveCount(0);
  await expect(chip(k[2])).toHaveText("4F");
  // On the bench too: fouls carry through the game.
  await expect(page.getByRole("group", { name: "Bench" }).getByTestId(`fouls-${k[5]}`)).toHaveText("2F");

  const bg = (pid: string) => chip(pid).evaluate((el) => getComputedStyle(el).backgroundColor);
  const amber = "rgb(168, 89, 15)";
  expect(await bg(k[2])).toBe(amber);
  expect(await bg(k[1])).not.toBe(amber);
  expect(await bg(k[1])).not.toBe(await bg(k[5]));
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
  await expect(chip(k[2])).toHaveCount(0, { timeout: 15_000 });
});

async function seedFoulGame(name: string) {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12", name: `${name}-${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true, track_fouls: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 8 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const k = players.map((p) => p.id);
  const lineup = { lines: { guard: k.slice(0, 2), forward: k.slice(2, 5), court: [] }, bench: k.slice(5) };
  const start = Date.now() - 60_000;
  const ev = (type: string, s: number, metadata: Record<string, unknown>, player_id: string | null = null) => ({
    game_id: game.id,
    type,
    player_id,
    metadata: { quarter: 1, elapsed_ms: s * 1000, ...metadata, sport: "basketball" },
    created_by: ownerId,
    created_at: new Date(start + s * 1000).toISOString(),
  });
  return { admin, ownerId, team, game, k, lineup, ev };
}

// UX audit 23 Oct 2026 (P1): a mistaken fifth foul couldn't be taken
// back — a fouled-out kid's actions said only "Fouled out … Close".
test("a mistaken fifth foul can be taken back, and the kid is back in the game", async ({ page }) => {
  const { admin, team, game, k, lineup, ev } = await seedFoulGame("BBL-UNFOUL");
  // k[5] on the bench: five fouls and fouled out, as the app writes it.
  await admin.from("game_events").insert([
    ev("lineup_set", 0, { lineup }),
    ev("quarter_start", 0, {}),
    ...[1, 2, 3, 4, 5].map((s) => ev("foul", s, { kind: "personal" }, k[5])),
    ev("injury", 6, { injured: true, reason: "fouled_out" }, k[5]),
    ev("two_pointer", 7, {}, k[5]),
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const tile = page.getByRole("group", { name: "Bench" }).getByTestId(`player-tile-${k[5]}`);
  // The bench tile's fouled-out badge fits inside the tile.
  const out = tile.getByLabel("Fouled out");
  await expect(out).toHaveText("OUT", { timeout: 15_000 });
  const [outBox, tileBox] = [await out.boundingBox(), await tile.boundingBox()];
  expect(outBox!.x + outBox!.width).toBeLessThanOrEqual(tileBox!.x + tileBox!.width - 4);

  await tile.click();
  const actions = page.getByRole("dialog");
  await expect(actions).toContainText(/fouled out/i);
  await actions.getByRole("button", { name: /take back the last foul/i }).click();

  // The foul is undone and the foul-out lifted: 4F, no OUT, back in play.
  await expect(page.getByTestId(`fouls-${k[5]}`)).toHaveText("4F", { timeout: 15_000 });
  await expect(tile.getByLabel("Fouled out")).toHaveCount(0);
  // The take-back is optimistic (live-chrome): the screen moves first and
  // the save lands a moment later, so wait for the lift to reach the DB.
  await expect
    .poll(
      async () => {
        const { data: lifts } = await admin
          .from("game_events")
          .select("metadata")
          .eq("game_id", game.id)
          .eq("type", "injury")
          .eq("player_id", k[5]);
        return (lifts ?? []).some((e) => (e.metadata as { injured?: boolean }).injured === false);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
});

// UX audit 23 Oct 2026: "Fouled out" from the long-press was one tap with
// no confirm. It asks first now.
test("marking a kid fouled out by hand asks first", async ({ page }) => {
  const { admin, team, game, k, lineup, ev } = await seedFoulGame("BBL-FOCONF");
  await admin.from("game_events").insert([ev("lineup_set", 0, { lineup }), ev("quarter_start", 0, {})]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const fouledOut = async () => {
    const { data } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "injury").eq("player_id", k[6]);
    return (data ?? []).length;
  };
  const bench = page.getByRole("group", { name: "Bench" });
  await bench.getByTestId(`player-tile-${k[6]}`).click({ delay: 600, timeout: 15_000 });
  await page.getByTestId("basketball-foul-out").click();
  // A confirm, not the deed.
  const confirm = page.getByRole("button", { name: /^yes, fouled out/i });
  await expect(confirm).toBeVisible();
  await page.waitForTimeout(500);
  expect(await fouledOut()).toBe(0);
  // Back: nothing happens.
  await page.getByRole("button", { name: /^back$/i }).click();
  await expect(page.getByTestId("basketball-foul-out")).toBeVisible();
  await page.getByTestId("basketball-foul-out").click();
  await confirm.click();
  await expect.poll(fouledOut, { timeout: 15_000 }).toBe(1);
});

// UX audit 23 Oct 2026: "2P" read like a position. Points say so.
test("a scorer's tile says points, not 2P", async ({ page }) => {
  const { admin, team, game, k, lineup, ev } = await seedFoulGame("BBL-PTS");
  // The scorer is on the bench now: a court tile marked to come off
  // shows OFF in place of the points.
  await admin.from("game_events").insert([ev("lineup_set", 0, { lineup }), ev("quarter_start", 0, {}), ev("two_pointer", 2, {}, k[6])]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByTestId(`player-tile-${k[6]}`).getByLabel("2 points")).toHaveText("2 PTS", { timeout: 15_000 });
});

// Usability pass, 26 Oct 2026: Cancel on the "who comes on" sheet a
// fifth foul opened kept the foul and left the kid on court with 5F, not
// out. A sixth foul then counted, and taking one back said "Back to 5 of
// 5". Cancel takes the fifth foul back now, and fouls stop at the limit.
test("cancelling the foul-out sheet takes the fifth foul back", async ({ page }) => {
  const { admin, team, game, k, lineup, ev } = await seedFoulGame("BBL-FOCANCEL");
  await admin.from("game_events").insert([
    ev("lineup_set", 0, { lineup }),
    ev("quarter_start", 0, {}),
    ...[1, 2, 3, 4].map((s) => ev("foul", s, { kind: "personal" }, k[0])),
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByTestId(`fouls-${k[0]}`)).toHaveText("4F", { timeout: 15_000 });
  await page.getByTestId(`player-tile-${k[0]}`).click();
  await page.getByTestId("basketball-foul").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(/has fouled out/i, { timeout: 10_000 });
  await sheet.getByRole("button", { name: /^cancel, and take back the foul$/i }).click();

  await expect(page.getByTestId(`fouls-${k[0]}`)).toHaveText("4F", { timeout: 10_000 });
  await expect(page.getByTestId(`player-tile-${k[0]}`).getByLabel("Fouled out")).toHaveCount(0);
  // Saved: the fifth foul and its take-back, and no foul-out.
  await expect
    .poll(
      async () => {
        const { data } = await admin.from("game_events").select("type, metadata").eq("game_id", game.id).eq("player_id", k[0]);
        const rows = (data ?? []) as { type: string; metadata: { undo?: boolean } }[];
        return {
          fouls: rows.filter((r) => r.type === "foul" && !r.metadata.undo).length,
          undone: rows.filter((r) => r.type === "foul" && r.metadata.undo).length,
          out: rows.filter((r) => r.type === "injury").length,
        };
      },
      { timeout: 15_000 },
    )
    .toEqual({ fouls: 5, undone: 1, out: 0 });
});

test("a kid on five fouls can't be given a sixth", async ({ page }) => {
  const { admin, team, game, k, lineup, ev } = await seedFoulGame("BBL-FOCAP");
  // Five fouls and still on court: what the old Cancel left behind.
  await admin.from("game_events").insert([
    ev("lineup_set", 0, { lineup }),
    ev("quarter_start", 0, {}),
    ...[1, 2, 3, 4, 5].map((s) => ev("foul", s, { kind: "personal" }, k[1])),
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByTestId(`fouls-${k[1]}`)).toHaveText("5F", { timeout: 15_000 });
  await page.getByTestId(`player-tile-${k[1]}`).click();
  await expect(page.getByTestId("basketball-foul")).toBeDisabled();
  await page.getByRole("button", { name: /^cancel$/i }).first().click();
  // The long-press menu doesn't offer one either.
  await page.getByTestId(`player-tile-${k[1]}`).click({ delay: 600 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("basketball-add-foul")).toHaveCount(0);
});
