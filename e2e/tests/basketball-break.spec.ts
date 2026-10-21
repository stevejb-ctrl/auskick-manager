// Steve 2026-10-21: "The half time breaks in basketball look different to
// the other sports. It should be consistent." Basketball's break was a
// green card ("H1 done. Score … Start H2") above the court, with the live
// scorebug still pinned below. It now has AFL's and netball's shape: the
// orientation strip, the Score row (per-period breakdown and late
// baskets), the court with where each kid is heading, and the shared
// Start bar in place of the scorebug.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test("basketball's half-time break has the other sports' shape", async ({ page }) => {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12", name: `BBL-BRK-${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 7 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rivals" });
  const k = players.map((p) => p.id);
  const lineup = { lines: { guard: k.slice(0, 2), forward: k.slice(2, 5), court: [] }, bench: k.slice(5) };
  const start = Date.now() - 25 * 60_000;
  const at = (s: number) => new Date(start + s * 1000).toISOString();
  const ev = (type: string, s: number, metadata: Record<string, unknown>, player_id: string | null = null) => ({
    game_id: game.id,
    type,
    player_id,
    metadata: { ...metadata, sport: "basketball" },
    created_by: ownerId,
    created_at: at(s),
  });
  await admin.from("game_events").insert([
    ev("lineup_set", 0, { lineup }),
    ev("quarter_start", 1, { quarter: 1 }),
    ev("two_pointer", 60, { quarter: 1, elapsed_ms: 60_000 }, k[0]),
    ev("opponent_three_pointer", 90, { quarter: 1, elapsed_ms: 90_000 }),
    ev("quarter_end", 1200, { quarter: 1, elapsed_ms: 1_200_000 }),
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByText("Lineup for H2")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Half time", { exact: true })).toBeVisible();
  // No green "H1 done" card, and no live scorebug or clock at the break.
  await expect(page.getByText(/H1 done/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^clock — /i })).toHaveCount(0);

  // The Score row opens to the per-half breakdown.
  const score = page.getByRole("button", { name: "Review and update scores" });
  await expect(score).toContainText("2–3");
  await score.click();
  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /^H1/ })).toContainText("2");
  await expect(table.getByRole("row", { name: /^H2/ })).toBeVisible();

  // Start H2 sits in the shared bottom bar, as AFL's Start Q2 does.
  await page.getByRole("button", { name: /^start h2$/i }).click();
  await expect(page.getByRole("button", { name: /^start h2 now$/i })).toBeVisible();
});
