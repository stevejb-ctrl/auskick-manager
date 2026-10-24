// A live page on a bad network (UX round 3, 24 Oct 2026):
//   - Coming back online used to reload the page (next-pwa's
//     reloadOnOnline). The reload could render before the queued taps
//     saved, so AFL showed the lineup from before the offline taps for
//     over a minute, and every open sheet was wiped. Now the page stays
//     put: its taps stay on screen, save, and LiveSync brings the rest.
//   - A page showing the pre-kickoff screen for a game that has started
//     (a stale copy from the cache, or another phone kicked off) gives
//     way to the live game: LiveSync checks as soon as the page mounts,
//     and when it comes back online.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { aflPositionModel, getAgeGroupConfig } from "../../src/lib/sports";
import type { Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

const OPPONENT = "Kew Kestrels";
type Admin = ReturnType<typeof createAdminClient>;

async function aflGame(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl", name: `R1-RECON-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: OPPONENT });
  await admin
    .from("game_availability")
    .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const })));
  const caps = zoneCapsFor(game.on_field_size, aflPositionModel(getAgeGroupConfig("afl", "U10")));
  const lineup: Lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  let cursor = 0;
  for (const z of ALL_ZONES) for (let i = 0; i < caps[z]; i++) lineup[z].push(players[cursor++].id);
  lineup.bench = players.slice(cursor).map((p) => p.id);
  const kickOff = async () => {
    await admin.from("game_events").insert([
      { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId },
      { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
    ]);
    await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  };
  return { team, game, kickOff };
}

async function openLive(page: Page, teamId: string, gameId: string) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
}

const opponentTally = (page: Page) =>
  page.getByTestId("scorebug-team-name").nth(1).locator("xpath=following-sibling::p[1]");

async function count(admin: Admin, gameId: string, type: string) {
  const { count } = await admin.from("game_events").select("id", { count: "exact", head: true }).eq("game_id", gameId).eq("type", type);
  return count ?? 0;
}

test("AFL: coming back online keeps the page: a tap made offline stays on screen and saves", async ({ page, context }) => {
  const admin = createAdminClient();
  const { team, game, kickOff } = await aflGame(admin);
  await kickOff();
  await openLive(page, team.id, game.id);
  await expect(opponentTally(page)).toContainText("0·0", { timeout: 15_000 });
  // A marker a reload would wipe.
  await page.evaluate(() => ((window as unknown as { __r1Marker?: number }).__r1Marker = 1));

  await context.setOffline(true);
  await page.getByRole("button", { name: `Add goal, ${OPPONENT}` }).click();
  await expect(opponentTally(page)).toContainText("1·0");
  await page.waitForTimeout(1_500);
  await context.setOffline(false);

  await expect.poll(() => count(admin, game.id, "opponent_goal"), { timeout: 20_000 }).toBe(1);
  // No reload, and the goal is still on screen once the page has caught up.
  expect(await page.evaluate(() => (window as unknown as { __r1Marker?: number }).__r1Marker)).toBe(1);
  await page.waitForTimeout(4_000);
  await expect(opponentTally(page)).toContainText("1·0");
});

test("AFL: the pre-kickoff screen gives way to the live game once it has started", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, kickOff } = await aflGame(admin);
  await openLive(page, team.id, game.id);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });

  // Another phone kicks off (or this page is a stale copy).
  await kickOff();
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: `Add goal, ${OPPONENT}` })).toBeVisible({ timeout: 15_000 });
});
