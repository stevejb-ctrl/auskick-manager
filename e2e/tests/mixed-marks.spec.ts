// ─── A mixed team's G and B, and the boys' count ─────────────
// Stagehand round 9 (9 Nov 2026): on touch and Oztag mixed teams parents
// couldn't follow the boys' cap themselves; only the warning helped, and
// only once the rule was broken. Steve decided to show the marks.
//
// On a mixed team, in the coach's view: a small G or B on each kid whose
// Girl/Boy is set (field, bench, the lineup picker and the break), and
// the count beside the rule ("Boys on 4 of 4 max"). Never on a team
// without a mixed rule, and never on the game-day link a parent runs the
// game from (the privacy line).

import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/**
 * Oztag U10, 8 a side, a minute into H1 (or at half time). Mixed (at
 * most 4 boys, at least 1 girl) unless `mixed: false`. Twelve kids: six
 * boys, five girls and one with no group; on the field four boys and four
 * girls, on the bench two boys, a girl and the kid with no group.
 */
async function oztag(opts: { mixed?: boolean; atBreak?: boolean } = {}) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "oztag", ageGroup: "U10", name: `MIXED ${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}` });
  if (opts.mixed !== false) await admin.from("teams").update({ mixed_max_boys: 4, mixed_min_girls: 1, mixed_min_boys: 0 }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const ids = players.map((p) => p.id);
  const boys = ids.slice(0, 6);
  const girls = ids.slice(6, 11);
  const nobody = ids[11];
  for (const pid of [...boys, ...girls]) await admin.from("players").update({ mixed_group: boys.includes(pid) ? "boy" : "girl" }).eq("id", pid);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Chargers" });
  await admin.from("games").update({ status: "in_progress", on_field_size: 8, sub_interval_seconds: 600 }).eq("id", game.id);
  await admin.from("game_availability").insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));
  const lineup = { lines: { middle: [], link: [], wing: [], field: [...boys.slice(0, 4), ...girls.slice(0, 4)] }, bench: [boys[4], boys[5], girls[4], nobody] };
  const start = Date.now() - (opts.atBreak ? 20 * 60_000 : 60_000);
  const at = (s: number) => new Date(start + s * 1000).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup } },
      { type: "quarter_start", metadata: { quarter: 1 } },
      ...(opts.atBreak ? [{ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 15 * 60_000 } }] : []),
    ].map((e, i) => ({ ...e, metadata: { ...e.metadata, sport: "oztag" }, game_id: game.id, created_by: ownerId, created_at: at(i) })),
  );
  if (error) throw new Error(error.message);
  return { team, game, boys, girls, nobody };
}

async function hush(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("touch-walkthrough-seen", "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

async function openLive(page: Page, teamId: string, gameId: string) {
  await hush(page);
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1/i })).toBeVisible({ timeout: 15_000 });
}

const mark = (page: Page, pid: string) => page.getByTestId(`player-tile-${pid}`).getByTestId("mixed-mark");

test("mixed Oztag: G and B on the field and bench, and the boys' count follows a swap", async ({ page }) => {
  test.setTimeout(90_000);
  const { team, game, boys, girls, nobody } = await oztag();
  await openLive(page, team.id, game.id);

  const field = page.getByRole("region", { name: "On field" });
  const bench = page.getByRole("group", { name: "Bench", exact: true });
  await expect(field.getByTestId(`player-tile-${boys[0]}`).getByTestId("mixed-mark")).toHaveText("B");
  await expect(field.getByTestId(`player-tile-${girls[0]}`).getByTestId("mixed-mark")).toHaveText("G");
  await expect(bench.getByTestId(`player-tile-${girls[4]}`).getByTestId("mixed-mark")).toHaveText("G");
  await expect(bench.getByTestId(`player-tile-${boys[4]}`).getByTestId("mixed-mark")).toHaveText("B");
  // Not colour alone: the tile says it too.
  await expect(field.getByTestId(`player-tile-${girls[0]}`)).toHaveAccessibleName(/\bgirl\b/);
  // A kid with no Girl/Boy set has no mark.
  await expect(mark(page, nobody)).toHaveCount(0);

  const count = page.getByTestId("touch-mixed-count");
  await expect(count).toContainText("Boys on 4 of 4 max");
  await expect(count).toContainText("Girls on 4");

  // A boy off, the bench girl on: the count follows.
  await page.getByTestId(`player-tile-${boys[0]}`).click();
  await page.getByTestId(`player-tile-${girls[4]}`).click();
  await expect(count).toContainText("Boys on 3 of 4 max", { timeout: 10_000 });
  await expect(count).toContainText("Girls on 5");
  await expect(bench.getByTestId(`player-tile-${boys[0]}`).getByTestId("mixed-mark")).toHaveText("B");
});

test("mixed Oztag: the half-time break shows the marks and the count", async ({ page }) => {
  test.setTimeout(90_000);
  const { team, game, boys, girls } = await oztag({ atBreak: true });
  await hush(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByTestId("period-over")).toBeVisible({ timeout: 15_000 });
  await expect(mark(page, boys[0])).toHaveText("B");
  await expect(mark(page, girls[0])).toHaveText("G");
  await expect(page.getByTestId("touch-mixed-count")).toContainText(/Boys on \d of 4 max/);
});

test("mixed Oztag: the lineup picker shows the marks and the count before kickoff", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "oztag", ageGroup: "U10", name: `MIXED-PICK ${Date.now() % 100000}` });
  await admin.from("teams").update({ mixed_max_boys: 4, mixed_min_girls: 1, mixed_min_boys: 0 }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10 });
  for (let i = 0; i < players.length; i++) await admin.from("players").update({ mixed_group: i < 5 ? "boy" : "girl" }).eq("id", players[i].id);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Chargers" });
  await admin.from("game_availability").insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));
  await hush(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^ready$/i })).toBeVisible({ timeout: 15_000 });
  await expect(mark(page, players[0].id)).toHaveText("B");
  await expect(mark(page, players[9].id)).toHaveText("G");
  await expect(page.getByTestId("touch-mixed-count")).toContainText(/Boys on \d of 4 max/);
});

test("Oztag without a mixed rule: no G or B, and no count", async ({ page }) => {
  const { team, game, boys, girls } = await oztag({ mixed: false });
  await openLive(page, team.id, game.id);
  await expect(page.getByTestId(`player-tile-${boys[0]}`)).toBeVisible();
  await expect(page.getByTestId(`player-tile-${girls[0]}`)).toBeVisible();
  await expect(page.getByTestId("mixed-mark")).toHaveCount(0);
  await expect(page.getByTestId("touch-mixed-count")).toHaveCount(0);
});

async function parentPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await hush(page);
  return page;
}

test("mixed Oztag: the game-day link a parent runs the game from shows no G or B", async ({ browser }) => {
  test.setTimeout(90_000);
  const { game, boys, girls } = await oztag();
  const runner = await parentPhone(browser);
  await runner.goto(`/run/${game.share_token}`);
  await waitForHydration(runner);
  await expect(runner.getByRole("button", { name: /^clock — h1/i })).toBeVisible({ timeout: 15_000 });
  await expect(runner.getByTestId(`player-tile-${boys[0]}`)).toBeVisible();
  await expect(runner.getByTestId(`player-tile-${girls[0]}`)).not.toHaveAccessibleName(/\bgirl\b/);
  await expect(runner.getByTestId("mixed-mark")).toHaveCount(0);
  await expect(runner.getByTestId("touch-mixed-count")).toHaveCount(0);
  await runner.context().close();
});
