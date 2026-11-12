// ─── The ⋯ game menu (live v3, Phase 5) ───────────────────────
// AFL's live screen keeps everything that isn't scoring or subbing in
// one menu, opened from ⋯ in the top bar: late arrival, Game settings,
// Scores and fixes, the walkthrough, feedback, and for a team admin the
// game-day link and Restart (the utility row under the field and the
// top bar's "?" and feedback icons are gone).
//
//   - A team admin sees Game-day link and Restart; a game manager and the
//     game-day link's runner don't (and the runner, signed out, gets no
//     Send feedback either).
//   - Before kickoff, Edit lineup goes back to the picker with the lineup
//     as it was set (the picker's Ready no longer starts Q1, so there's a
//     way back until the first siren), and it's gone once Q1 starts.
//
// Covers: src/components/live/LiveGameMenu.tsx, LiveGame.tsx's shell,
// and reopenLineup in live/actions.ts.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { anonPhone, coachId, newPerson, signedInPhone } from "../helpers/people";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { readyAfl, startQ1 } from "../helpers/kickoff";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;

/** AFL U10, 15 kids in, and (unless `preKickoff`) Q1 a minute in. */
async function aflGame(admin: Admin, opts: { kickedOff?: boolean } = {}) {
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `Menu ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew Comets" });
  await admin
    .from("game_availability")
    .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));
  if (opts.kickedOff) {
    const ids = players.map((p) => p.id);
    const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
    const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
    const { error } = await admin.from("game_events").insert(
      [
        { type: "lineup_set", metadata: { lineup }, created_at: at(90) },
        { type: "quarter_start", metadata: { quarter: 1 }, created_at: at(60) },
      ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
    );
    if (error) throw new Error(`seed: ${error.message}`);
    await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  }
  return { ownerId, team, players, game };
}

async function noTours(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Game menu" }).click({ timeout: 15_000 });
  const menu = page.getByRole("dialog", { name: "Game menu" });
  await expect(menu).toBeVisible();
  return menu;
}

const item = (menu: ReturnType<Page["getByRole"]>, name: string | RegExp) => menu.getByRole("button", { name });

test("a team admin's ⋯ has the game-day link and Restart, and the old icons are gone", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game } = await aflGame(admin, { kickedOff: true });
  await noTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);

  // The top bar: Exit and ⋯, no "?" or feedback icon of its own.
  await expect(page.getByRole("button", { name: "Exit live game" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Open walkthrough" })).toHaveCount(0);
  await expect(page.getByTestId("feedback-header-button")).toHaveCount(0);
  // No utility row under the field.
  await expect(page.getByRole("button", { name: /^restart game$/i })).toHaveCount(0);

  const menu = await openMenu(page);
  for (const name of ["Game settings", "Scores and fixes", "How the live screen works", "Send feedback", "Game-day link", "Restart game"]) {
    await expect(item(menu, name), name).toBeVisible();
  }
  // Every row is a thumb's worth.
  for (const row of await menu.getByRole("button").all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(item(menu, "Edit lineup")).toHaveCount(0);

  // The game-day link opens here, with this game's token in it.
  await item(menu, "Game-day link").click();
  const link = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Game-day link" }) });
  await expect(link).toBeVisible();
  await expect(link.getByRole("textbox", { name: "Game-day link" })).toHaveValue(new RegExp(`/run/${game.share_token}$`));
  await link.getByRole("button", { name: "Done" }).click();

  // The walkthrough is in the menu now.
  await item(await openMenu(page), "How the live screen works").click();
  await expect(page.getByRole("dialog").filter({ hasText: "Starting the game" })).toBeVisible({ timeout: 10_000 });
});

test("a game manager's ⋯ has no game-day link or Restart", async ({ browser }) => {
  const admin = createAdminClient();
  const { team, game } = await aflGame(admin, { kickedOff: true });
  const manager = await newPerson(admin, "menu-gm", "Gina Manager");
  const { error } = await admin.from("team_memberships").insert({ team_id: team.id, user_id: manager.id, role: "game_manager" });
  if (error) throw new Error(`membership: ${error.message}`);

  const { context, page } = await signedInPhone(browser, manager);
  try {
    await noTours(page);
    await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    const menu = await openMenu(page);
    for (const name of ["Game settings", "Scores and fixes", "How the live screen works", "Send feedback"]) {
      await expect(item(menu, name), name).toBeVisible();
    }
    await expect(item(menu, "Game-day link")).toHaveCount(0);
    await expect(item(menu, "Restart game")).toHaveCount(0);
    await expect(menu).toContainText("for team admins");
  } finally {
    await context.close();
  }
});

test("the game-day link's ⋯ has no game-day link, Restart or feedback", async ({ browser }) => {
  const admin = createAdminClient();
  const { game } = await aflGame(admin, { kickedOff: true });
  const { context, page } = await anonPhone(browser);
  try {
    await noTours(page);
    await page.goto(`/run/${game.share_token}`);
    await waitForHydration(page);
    const menu = await openMenu(page);
    for (const name of ["Game settings", "Scores and fixes", "How the live screen works"]) {
      await expect(item(menu, name), name).toBeVisible();
    }
    for (const name of ["Game-day link", "Restart game", "Send feedback"]) {
      await expect(item(menu, name), name).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

test("before kickoff, Edit lineup goes back to the picker with the lineup as set", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game } = await aflGame(admin);
  await noTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);

  // A lineup that isn't the suggestion: the first field kid swaps with
  // the first on the bench.
  const lineup = page.getByRole("region", { name: /starting lineup/i });
  await expect(lineup.locator('[data-testid^="player-tile-"]')).toHaveCount(15, { timeout: 15_000 });
  // Live v3: the picker's bench is a KidBench, a named group (was a "Bench (3)" card).
  const benchGroup = lineup.getByRole("group", { name: "Bench", exact: true });
  const benchTile = benchGroup.locator('[data-testid^="player-tile-"]').first();
  const benchId = (await benchTile.getAttribute("data-testid"))!.replace("player-tile-", "");
  const fieldTile = lineup.locator('[data-testid^="player-tile-"]').first();
  const fieldId = (await fieldTile.getAttribute("data-testid"))!.replace("player-tile-", "");
  await fieldTile.click();
  await benchTile.click();
  await expect(benchGroup.getByTestId(`player-tile-${fieldId}`)).toBeVisible();

  // Ready sets it: the live screen before the first siren, Q1 at 12:00.
  await readyAfl(page);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^clock — q1, not started$/i })).toContainText("12:00");

  // ⋯ → Edit lineup: the picker again, with that lineup, and nothing kicked off.
  await item(await openMenu(page), "Edit lineup").click();
  await expect(page.getByRole("button", { name: /^ready$/i })).toBeVisible({ timeout: 15_000 });
  const again = page.getByRole("region", { name: /starting lineup/i });
  const benchAgain = again.getByRole("group", { name: "Bench", exact: true });
  await expect(benchAgain.getByTestId(`player-tile-${fieldId}`)).toBeVisible();
  await expect(benchAgain.getByTestId(`player-tile-${benchId}`)).toHaveCount(0);
  const { data: kicked } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "lineup_set");
  expect(kicked ?? []).toHaveLength(0);
  const { data: row } = await admin.from("games").select("status").eq("id", game.id).single();
  expect(row?.status).toBe("upcoming");

  // Ready again, and Start Q1: once the quarter's on, there's no way back.
  await readyAfl(page);
  await startQ1(page);
  await expect(page.getByRole("button", { name: /^clock — q1, running$/i })).toBeVisible({ timeout: 15_000 });
  await expect(item(await openMenu(page), "Edit lineup")).toHaveCount(0);
  await expect
    .poll(async () => ((await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "quarter_start")).data ?? []).length, {
      timeout: 15_000,
    })
    .toBe(1);
});
