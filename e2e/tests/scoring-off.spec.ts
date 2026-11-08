// With scoring off, the live score bar says so (Stagehand usability
// run: every game-day agent hunted for a way to record goals, because
// the score just sat at 0 or "—"). Coaches can turn it on right there
// (it was a link to team settings, which left the game: usability pass,
// 26 Oct 2026); runners on a share link just get the note. Netball's
// case is in netball-live-flow.spec.ts (NETBALL-04).
//
// AFL's live v3 shell (Phase 5) says it in the score header ("No score
// kept", where the score would be), and a team admin turns it on from
// the ⋯ menu, still in the game.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { openGameMenu } from "../helpers/liveShell";

test.describe.configure({ mode: "parallel" });

async function superAdminId(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

test("AFL: scoring off is said in the live score header, and turns on from ⋯ without leaving the game", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  await admin.from("teams").update({ track_scoring: false }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByTestId("scores-not-kept")).toHaveText("No score kept", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^add goal, /i })).toHaveCount(0);
  const live = page.url();

  // A runner on the share link sees the note, not the switch.
  const { data: g } = await admin.from("games").select("share_token").eq("id", game.id).single();
  await page.goto(`/run/${g!.share_token}`);
  await expect(page.getByTestId("scores-not-kept")).toBeVisible({ timeout: 15_000 });
  const runnerMenu = await openGameMenu(page);
  await expect(runnerMenu.getByRole("button", { name: "How the live screen works" })).toBeVisible();
  await expect(runnerMenu.getByRole("button", { name: "Turn scoring on" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The coach turns it on, and stays in the game.
  await page.goto(live);
  await (await openGameMenu(page)).getByRole("button", { name: "Turn scoring on" }).click();
  await expect(page.getByTestId("scores-not-kept")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^add goal, /i }).first()).toBeVisible();
  expect(page.url()).toBe(live);
  const { data: t } = await admin.from("teams").select("track_scoring").eq("id", team.id).single();
  expect(t?.track_scoring).toBe(true);
});

// League is on the v3 shell too (Phase 8): the header says it.
test("league: scoring off is said in the live score header", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U9", sport: "rugby_league" });
  await admin.from("teams").update({ track_scoring: false }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10, ageGroup: "U9" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  await admin.from("games").update({ on_field_size: 8, status: "in_progress" }).eq("id", game.id);
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup: { forwards: ids.slice(0, 4), backs: ids.slice(4, 8), bench: ids.slice(8) }, sport: "rugby_league" },
      created_by: ownerId,
    },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
    } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByTestId("scores-not-kept")).toHaveText("No score kept", { timeout: 15_000 });
  // No score chips in the bar; a team admin turns it on from ⋯.
  await expect(page.getByRole("button", { name: "Record a try for our team" })).toHaveCount(0);
  await expect((await openGameMenu(page)).getByRole("button", { name: "Turn scoring on" })).toBeVisible();
});
