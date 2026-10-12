// Covers the team "Today" tab (UX plan 1.4): the game-day hero, the
// last result, the season snapshot and the coach's to-dos.
//
// Covers: src/app/(app)/teams/[teamId]/page.tsx, src/lib/results.ts

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import type { SupabaseClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "parallel" });

async function superAdminId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

test("Today shows the last result and the season record", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    opponent: "Lastweek Lions",
    scheduledAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
  });
  await admin.from("game_events").insert([
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
    { game_id: game.id, type: "goal", player_id: players[0].id, metadata: {}, created_by: ownerId },
    { game_id: game.id, type: "goal", player_id: players[1].id, metadata: {}, created_by: ownerId },
    { game_id: game.id, type: "opponent_goal", metadata: {}, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}`);

  await expect(page.getByRole("link", { name: /^today$/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const last = page.getByRole("region", { name: /last result/i });
  await expect(last).toContainText("Lastweek Lions", { timeout: 10_000 });
  await expect(last).toContainText("W");
  await expect(last).toContainText("12–6");
  await expect(page.getByRole("region", { name: /season/i })).toContainText("1 played");
  await expect(page.getByRole("region", { name: /season/i })).toContainText("1 won");
});

test("on game day the hero starts game day straight into the lineup screen", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });

  await page.goto(`/teams/${team.id}`);
  const start = page.getByRole("link", { name: /^start game day$/i });
  await expect(start).toBeVisible({ timeout: 10_000 });
  await expect(start).toHaveAttribute("href", `/teams/${team.id}/games/${game.id}/live`);
});

test("a coach on their own sees an invite-a-manager to-do", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  await makeGame(admin, { teamId: team.id, ownerId });

  await page.goto(`/teams/${team.id}`);
  const todos = page.getByRole("region", { name: /to-do/i });
  await expect(todos.getByRole("link", { name: /invite a manager/i })).toBeVisible({
    timeout: 10_000,
  });
});
