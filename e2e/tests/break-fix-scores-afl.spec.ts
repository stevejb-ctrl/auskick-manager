// ─── Regression: Fix scores at the AFL break moves the scorer's badge ───
//
// The AFL quarter break had its own copy of the Fix-scores panel. Deleting
// a goal there took it off the scoreline but not off the kicker's tile —
// the live store's per-player tally only moves with an explicit
// undoPlayerScore, and the store doesn't re-hydrate on router.refresh().
// The break now uses the shared ScoreReviewPanel (as netball's already
// did), which keeps both in step.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test("AFL break: deleting a goal in Fix scores clears the kicker's badge", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const kicker = players[0];

  const at = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  await admin.from("game_events").insert(
    [
      {
        type: "lineup_set",
        metadata: {
          lineup: {
            back: ids.slice(0, 4),
            hback: [],
            mid: ids.slice(4, 8),
            hfwd: [],
            fwd: ids.slice(8, 12),
            bench: ids.slice(12),
          },
        },
        created_at: at(14),
      },
      { type: "quarter_start", metadata: { quarter: 1 }, created_at: at(13) },
      { type: "goal", player_id: kicker.id, metadata: { quarter: 1 }, created_at: at(10) },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 12 * 60_000 }, created_at: at(1) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const selectTeam = page.getByRole("button", { name: /select team for q2/i });
  if (await selectTeam.isVisible().catch(() => false)) await selectTeam.click();
  await expect(page.getByRole("button", { name: /^start q2$/i })).toBeVisible({
    timeout: 15_000,
  });

  const badge = page
    .getByTestId(`player-tile-${kicker.id}`)
    .getByLabel("1 goals, 0 behinds");
  await expect(badge).toBeVisible();

  await page.getByRole("button", { name: /review and update scores/i }).click();
  const row = page.getByRole("listitem").filter({ hasText: kicker.full_name });
  await row.getByRole("button", { name: /^delete (goal|behind)/i }).click();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_events")
        .select("id")
        .eq("game_id", game.id)
        .eq("type", "score_undo");
      return data?.length ?? 0;
    })
    .toBe(1);

  await expect(badge).toHaveCount(0);
});

// A rushed behind has no kicker: Fix scores says so, never "Player"
// (audit, 23 Oct 2026).
test("AFL break: a rushed behind reads Rushed in Fix scores", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const at = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  await admin.from("game_events").insert(
    [
      {
        type: "lineup_set",
        metadata: {
          lineup: { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) },
        },
        created_at: at(14),
      },
      { type: "quarter_start", metadata: { quarter: 1 }, created_at: at(13) },
      { type: "goal", player_id: ids[8], metadata: { quarter: 1 }, created_at: at(11) },
      { type: "behind", player_id: null, metadata: { quarter: 1, rushed: true }, created_at: at(10) },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 12 * 60_000 }, created_at: at(1) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const selectTeam = page.getByRole("button", { name: /select team for q2/i });
  const startQ2 = page.getByRole("button", { name: /^start q2$/i });
  await expect(selectTeam.or(startQ2).first()).toBeVisible({ timeout: 15_000 });
  if (await selectTeam.isVisible()) await selectTeam.click();
  await expect(startQ2).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /review and update scores/i }).click();
  const rows = page.getByRole("dialog", { name: "Score" }).getByRole("listitem");
  await expect(rows).toHaveCount(2, { timeout: 15_000 });
  await expect(rows.filter({ hasText: "Rushed" })).toHaveCount(1);
  await expect(rows.filter({ hasText: players[8].full_name })).toHaveCount(1);
  await expect(rows.filter({ hasText: /\bPlayer\b/ })).toHaveCount(0);
});
