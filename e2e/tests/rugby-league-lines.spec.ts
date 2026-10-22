// ─── Rugby league: each kid in their own line ────────────────
// UX audit, 23 Oct 2026 (league P1s):
//
//   - The field drew kids in the wrong line. With both vests on
//     forwards, a U10 side (5 forwards, 6 backs) drew two backs in the
//     forward rows: the formation kept five plain forward spots whoever
//     wore the vests. The field now lays its spots out from the
//     lineup's own lines.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function skipWalkthroughs(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
}

const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();

test("league U10: with both vests on forwards, every back stands in the backs", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league", ageGroup: "U10", name: `RL-LINES ${Date.now()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  // No rotation prompt over the field: the longest interval the table takes.
  const { error } = await admin.from("games").update({ sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = players.map((p) => p.id);
  const forwards = ids.slice(0, 5);
  const backs = ids.slice(5, 11);
  const lineup = { forwards, backs, bench: ids.slice(11) };
  const { error: evErr } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "rugby_league" }, created_at: at(30) },
      // Both vests on forwards (the audit's Lachlan and Mia).
      { type: "vest_assigned", player_id: forwards[0], metadata: { vest: "fr", period: 1, replacement: false, sport: "rugby_league" }, created_at: at(29) },
      { type: "vest_assigned", player_id: forwards[1], metadata: { vest: "dh", period: 1, replacement: false, sport: "rugby_league" }, created_at: at(28) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" }, created_at: at(27) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (evErr) throw new Error(evErr.message);

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const field = page.getByRole("region", { name: "On field" });
  await expect(field.locator("[data-testid^='league-player-tile-']")).toHaveCount(11, { timeout: 15_000 });

  const inLine = (line: "forwards" | "backs", pid: string) =>
    field.locator(`[data-line="${line}"]`).getByTestId(`league-player-tile-${pid}`);
  for (const pid of backs) await expect(inLine("backs", pid), `back ${pid}`).toHaveCount(1);
  // The three forwards without a vest stand with the forwards.
  for (const pid of forwards.slice(2)) await expect(inLine("forwards", pid), `forward ${pid}`).toHaveCount(1);
});

