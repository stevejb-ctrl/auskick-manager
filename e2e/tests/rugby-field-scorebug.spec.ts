// UI polish round 2 (Steve approved 23 Oct 2026): rugby's live field and
// scorebug were the last on their own designs. The field drew pill tokens
// at formation spots on a pitch ("Alicia B · #1 · 1:44"); every other
// sport uses the 68px card tile. The scorebug cut long team names off,
// had its own clock pill with "OF 2 HALVES" under it, and stacked the
// chips in two columns. Now rugby uses the shared pieces.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.use({ viewport: { width: 375, height: 812 } });

test("rugby league: card tiles in Forwards and Backs, and the shared scorebug", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const k of ["rl-walkthrough-seen", "league-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league", ageGroup: "U10", name: `Northcote Kangaroos ${Date.now() % 1000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Brunswick Magpies" });
  await admin.from("games").update({ on_field_size: 11, status: "in_progress" }).eq("id", game.id);
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, 5), backs: ids.slice(5, 11), bench: ids.slice(11) };
  const at = new Date(Date.now() - 60_000).toISOString();
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" } },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" } },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId, created_at: at })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const field = page.getByRole("region", { name: "On field" });
  await expect(field.getByRole("group", { name: "Forwards" }).locator("[data-testid^='league-player-tile-']")).toHaveCount(5, { timeout: 15_000 });
  await expect(field.getByRole("group", { name: "Backs" }).locator("[data-testid^='league-player-tile-']")).toHaveCount(6);
  // The shared card: 68px tall, the line in row 1.
  const first = field.getByTestId(`league-player-tile-${ids[0]}`);
  expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(68);
  await expect(first).toContainText("FWD");

  // The scorebug: names whole, no "of 2 halves", chips one row a side.
  const names = page.getByTestId("scorebug-team-name");
  await expect(names).toHaveCount(2);
  for (const n of await names.all()) {
    const fit = await n.evaluate((el) => el.scrollWidth - el.clientWidth <= 0 && el.scrollHeight - el.clientHeight <= 0);
    expect(fit).toBe(true);
  }
  await expect(page.getByText(/of 2 halves/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^clock — h1, /i })).toBeVisible();
  for (const side of [["Record a try for our team", "Record a conversion for our team"], ["Record opponent try", "Record opponent conversion"]]) {
    const [t, c] = await Promise.all(side.map((name) => page.getByRole("button", { name }).boundingBox()));
    expect(t!.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(t!.y - c!.y)).toBeLessThan(2);
  }
});
