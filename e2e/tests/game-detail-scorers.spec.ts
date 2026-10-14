// The game page's scorer card counts what stands, in each sport's
// words (cross-sport audit, 14 Oct 2026). It tallied raw goal / behind
// rows, so an undone goal kept its kicker on the card, and league's
// tries and kicks never showed at all.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx
//         scorers card (scorersFromEvents).

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function owner() {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  return { admin, ownerId: su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id };
}

test("AFL: an undone goal leaves the scorer card", async ({ page }) => {
  const { admin, ownerId } = await owner();
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", name: `Scorers AFL ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 3, ageGroup: "U12" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U12" });
  const at = (s: number) => new Date(Date.now() - 600_000 + s * 1000).toISOString();
  const { error } = await admin.from("game_events").insert([
    { type: "quarter_start", player_id: null, metadata: { quarter: 1 }, created_at: at(1) },
    { type: "goal", player_id: players[0].id, metadata: {}, created_at: at(2) },
    { type: "goal", player_id: players[1].id, metadata: {}, created_at: at(3) },
    { type: "score_undo", player_id: players[1].id, metadata: { original_type: "goal", quarter: 1 }, created_at: at(4) },
  ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })));
  if (error) throw new Error(error.message);

  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const heading = page.getByRole("heading", { name: /^who put it through$/i });
  await expect(heading).toBeVisible({ timeout: 10_000 });
  // The card: the heading's nearest ancestor holding the scorer list.
  const card = heading.locator("xpath=ancestor::*[.//ul][1]");
  await expect(card.getByText(/^1 scorer$/i)).toBeVisible();
  await expect(card.getByText(players[0].full_name, { exact: true })).toBeVisible();
  await expect(card.getByText(players[1].full_name, { exact: true })).toHaveCount(0);
});

test("league: tries and kicks make the scorer card, a missed kick doesn't", async ({ page }) => {
  const { admin, ownerId } = await owner();
  const team = await makeTeam(admin, { ownerId, ageGroup: "U11", sport: "rugby_league", name: `Scorers RL ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 3, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  const at = (s: number) => new Date(Date.now() - 600_000 + s * 1000).toISOString();
  const { error } = await admin.from("game_events").insert([
    { type: "quarter_start", player_id: null, metadata: { quarter: 1, sport: "rugby_league" }, created_at: at(1) },
    { type: "try", player_id: players[0].id, metadata: { sport: "rugby_league" }, created_at: at(2) },
    { type: "conversion_attempt", player_id: players[1].id, metadata: { made: true, sport: "rugby_league" }, created_at: at(3) },
    { type: "conversion_attempt", player_id: players[2].id, metadata: { made: false, sport: "rugby_league" }, created_at: at(4) },
  ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })));
  if (error) throw new Error(error.message);

  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const heading = page.getByRole("heading", { name: /^who put points on the board$/i });
  await expect(heading).toBeVisible({ timeout: 10_000 });
  const card = heading.locator("xpath=ancestor::*[.//ul][1]");
  await expect(card.getByText(/^2 scorers$/i)).toBeVisible();
  const tryRow = card.getByRole("listitem").filter({ hasText: players[0].full_name });
  await expect(tryRow).toContainText("1T");
  await expect(tryRow).toContainText("4");
  await expect(card.getByRole("listitem").filter({ hasText: players[1].full_name })).toContainText("1C");
  await expect(card.getByText(players[2].full_name, { exact: true })).toHaveCount(0);
});
