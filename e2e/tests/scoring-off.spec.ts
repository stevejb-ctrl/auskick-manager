// With scoring off, the live score bar says so (Stagehand usability
// run: every game-day agent hunted for a way to record goals, because
// the score just sat at 0 or "—"). Coaches can turn it on right there
// (it was a link to team settings, which left the game: usability pass,
// 26 Oct 2026); runners on a share link just get the note. Netball's
// case is in netball-live-flow.spec.ts (NETBALL-04).

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function superAdminId(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

test("AFL: scoring off is said on the live score bar, and turns on without leaving the game", async ({ page }) => {
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
  await expect(page.getByText("Scoring is off")).toBeVisible({ timeout: 15_000 });
  const live = page.url();

  // A runner on the share link sees the note, not the button.
  const { data: g } = await admin.from("games").select("share_token").eq("id", game.id).single();
  await page.goto(`/run/${g!.share_token}`);
  await expect(page.getByText("Scoring is off")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Turn it on" })).toHaveCount(0);

  // The coach turns it on, and stays in the game.
  await page.goto(live);
  await page.getByRole("button", { name: "Turn it on" }).click({ timeout: 15_000 });
  await expect(page.getByText("Scoring is off")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^add goal, /i }).first()).toBeVisible();
  expect(page.url()).toBe(live);
  const { data: t } = await admin.from("teams").select("track_scoring").eq("id", team.id).single();
  expect(t?.track_scoring).toBe(true);
});

test("league: scoring off is said on the live score bar", async ({ page }) => {
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
  await expect(page.getByText("Scoring is off")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Turn it on" })).toBeVisible();
});
