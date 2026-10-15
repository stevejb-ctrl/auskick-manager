// ─── Regression: the staged break lineup survives leaving the live screen (netball) ───
//
// Stagehand round 5 (reload-mid-game-netball): the coach made two swaps
// at the break, went to the team page and came back with "Back to live
// game". Both swaps were gone and the auto-suggestion was back: the
// break draft lived only in the break screen's state.
//
// Pre-fix this FAILS: back on the break, the court is the fresh
// suggestion (and the mode is back to Suggested).
//
// Covers:
//   - src/components/netball/NetballQuarterBreak.tsx (restores the draft)
//   - src/lib/live/breakDraft.ts + the live store's `breakDraft` slice

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

const NETBALL_LINEUP_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;


/**
 * The coach's way out and back, all in the app: Exit to the game page,
 * the Today tab (the team page), then "Back to live game".
 */
async function viaTeamPage(page: Page, teamId: string): Promise<void> {
  await page.getByRole("button", { name: "Exit live game" }).click();
  await page
    .getByRole("navigation", { name: "Team sections" })
    .getByRole("link", { name: "Today" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/teams/${teamId}$`), { timeout: 15_000 });
  await page.getByRole("link", { name: /back to live game/i }).click();
}

async function suppressWalkthrough(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });
}

test("netball: two swaps staged at the break are still there after the team page and back, and start Q2", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-BRK-KEPT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const teamQS = 480; // 8-min quarter so the auto-hooter fires on load.
  await admin
    .from("teams")
    .update({ track_scoring: false, quarter_length_seconds: teamQS })
    .eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" })),
  );
  const positions: Record<string, string[]> = Object.fromEntries(
    NETBALL_LINEUP_KEYS.map((k, i) => [k, [players[i].id]]),
  );
  const lineup = { positions, bench: [players[7].id, players[8].id, players[9].id] };
  const startedAt = new Date(Date.now() - (teamQS + 60) * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: startedAt },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: startedAt },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  const [gs, , wa, c] = players;
  const comingOn = players[7];
  const token = (position: string, name: string) =>
    page.getByRole("button", { name: new RegExp(`^${position},\\s*${name}`, "i") });
  const startQ2 = page.getByRole("button", { name: /^start q2$/i });
  const settings = page.getByRole("button", { name: /game settings/i });
  const openSettings = async () => {
    if ((await settings.getAttribute("aria-expanded")) !== "true") await settings.click();
  };

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  // The hooter fires on load; the break follows its quarter_end.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("metadata")
          .eq("game_id", game.id)
          .eq("type", "quarter_end");
        return (data ?? []).some((e) => (e.metadata as { quarter?: number } | null)?.quarter === 1);
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  await expect(startQ2).toBeVisible({ timeout: 10_000 });

  // Keep last quarter's court, then make two swaps: a bench kid on at
  // GS, and the WA and C trade places.
  await openSettings();
  await page.getByRole("radio", { name: /keep last quarter/i }).click();
  await page.getByRole("button", { name: new RegExp(`^B ${comingOn.full_name}`) }).first().click();
  await token("Goal Shooter", gs.full_name).click();
  await token("Wing Attack", wa.full_name).click();
  await token("Centre", c.full_name).click();
  const expectStaged = async () => {
    await expect(token("Goal Shooter", comingOn.full_name)).toBeVisible({ timeout: 10_000 });
    await expect(token("Wing Attack", c.full_name)).toBeVisible();
    await expect(token("Centre", wa.full_name)).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`,\\s*${gs.full_name}`, "i") })).toHaveCount(0);
  };
  await expectStaged();

  // Off to the team page, then back to the live game.
  await viaTeamPage(page, team.id);
  await expect(startQ2).toBeVisible({ timeout: 15_000 });

  // Both swaps are still staged, in the mode the coach picked.
  await expectStaged();
  await openSettings();
  await expect(page.getByRole("radio", { name: /keep last quarter/i })).toBeChecked();

  // Start Q2: the committed lineup is the staged one.
  await startQ2.click();
  await page.getByRole("button", { name: /^start clock$/i }).click();
  let q2: { positions: Record<string, string[]>; bench: string[] } | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("metadata")
          .eq("game_id", game.id)
          .eq("type", "period_break_swap");
        const ev = (data ?? []).find((e) => (e.metadata as { quarter?: number }).quarter === 2);
        q2 = ev ? (ev.metadata as { lineup: typeof q2 }).lineup : null;
        return q2 !== null;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  expect(q2!.positions.gs).toEqual([comingOn.id]);
  expect(q2!.positions.wa).toEqual([c.id]);
  expect(q2!.positions.c).toEqual([wa.id]);
  expect(q2!.bench).toContain(gs.id);
});
