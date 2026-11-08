// ─── Rugby's 50% floor on the live screen (live v3, Phase 8) ──
// League and union hold every kid to half the game (How we play's floor,
// which the sub suggester already keeps). The live screen now says who's
// at risk of missing it: "Needs N′ more" in sun under the kid, the sun
// edge on their tile, "1 under 50%" in the info line, and "% of game ·
// min 50%" in their kid bar. At risk means by full time, from the time
// left (plan default 5), so nobody is flagged at the kickoff.
//
// The union side here has its whole field held on (keep on), so the
// planned sub has no pairs and the bench kids' words are theirs alone.
// Ava has sat since kickoff, 8 minutes into a 40-minute game with 15-minute
// subs: she needs 20 of the 32 left, so she can't wait out another
// interval. Ben turned up at 7:00, so he's held to half of the 33 minutes
// he could play, and has time.

import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();

/** Union U10 (12 a side, 2 × 20 min), 15-minute subs, `minutesIn` into H1. */
async function unionSide(admin: SupabaseClient, name: string, minutesIn: number, keepFieldOn: boolean) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_union", ageGroup: "U10", name: `${name} ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14, ageGroup: "U10" });
  const ids = players.map((p) => p.id);
  const [ava, ben] = [players[12], players[13]];
  const field = ids.slice(0, 12);
  if (keepFieldOn) {
    const { error } = await admin
      .from("player_position_prefs")
      .insert(field.map((pid) => ({ team_id: team.id, player_id: pid, kind: "keep_on" })));
    if (error) throw new Error(error.message);
  }
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  const { error } = await admin
    .from("games")
    .update({ on_field_size: 12, sub_interval_seconds: 900, status: "in_progress" })
    .eq("id", game.id);
  if (error) throw new Error(error.message);
  const lineup = { forwards: field.slice(0, 6), backs: field.slice(6), bench: [ava.id] };
  const start = minutesIn * 60 + 5;
  const { error: evErr } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", player_id: null, metadata: { lineup, sport: "rugby_union" }, created_at: at(start + 5) },
      { type: "quarter_start", player_id: null, metadata: { quarter: 1, sport: "rugby_union" }, created_at: at(start) },
      // Ben turns up 7 minutes in, onto the bench.
      ...(minutesIn >= 7
        ? [{ type: "player_arrived", player_id: ben.id, metadata: { quarter: 1, elapsed_ms: 7 * 60_000, sport: "rugby_union" }, created_at: at(start - 7 * 60) }]
        : []),
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (evErr) throw new Error(evErr.message);
  return { team, game, ids, ava, ben };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
});

test("union: a bench kid who can't reach 50% unless they come on soon says Needs 20′ more", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { team, game, ava, ben } = await unionSide(admin, "RU-MIN-TIME", 8, true);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running/i })).toBeVisible({ timeout: 15_000 });

  const bench = page.getByRole("group", { name: "Bench", exact: true });
  const avaTile = bench.getByTestId(`league-player-tile-${ava.id}`);
  // In sun, once, under her name; the tile says it to a screen reader.
  await expect(avaTile).toContainText("Needs 20′ more");
  await expect(avaTile).toHaveAttribute("aria-label", /Needs 20′ more/);
  await expect(avaTile).toHaveAttribute("aria-label", /under 50% of the game/);
  // Ben arrived late: half of what he could play is in reach.
  const benTile = bench.getByTestId(`league-player-tile-${ben.id}`);
  await expect(benTile).toBeVisible();
  await expect(benTile).not.toContainText("Needs");
  // The field's kids have played since kickoff: none of them.
  await expect(page.getByRole("region", { name: "On field" }).getByText(/Needs \d+′ more/)).toHaveCount(0);
  // The info line counts her.
  await expect(page.getByTestId("info-line")).toContainText("1 under 50%");

  // Her kid bar: where she is, her minutes, and the floor.
  await avaTile.click();
  const bar = page.getByTestId("kid-bar");
  await expect(bar).toContainText("Bench · 0′ this game · 0% of game · min 50%");
});

test("union: nobody is flagged at the kickoff, the bench included", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { team, game } = await unionSide(admin, "RU-MIN-KICKOFF", 0, false);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running/i })).toBeVisible({ timeout: 15_000 });
  // The kids' words are up (the bench kid is in the next sub).
  await expect(page.getByText(/^On next/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Needs \d+′ more/)).toHaveCount(0);
  await expect(page.getByTestId("info-line")).not.toContainText("under 50%");
});
