// Steve's basketball test session, 21 Oct 2026.
//
// "the score bug with the +1,2,3 isn't working": every basketball write
// held the whole screen's `pending` until the server confirmed (and
// through any retries), and the score waited for the refresh. A slow
// or retried write left the score chips dead and the score unchanged.
// His game has no opponent basket at all. Now a tap shows straight
// away and queues, as AFL and netball do.
//
// "I did one sub in basketball and now no more upcoming subs show": a
// sub only showed while it evened time now. His bench kids play Guards
// only and had more time than the guards who'd just come on, so for a
// minute and a half there was nothing to show. Now the card shows the
// subs due at the next sub time.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

async function ownerOf(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/** A U12 game in H1, started `elapsedSec` ago, with optional events after the tip-off. */
async function gameInH1(elapsedSec: number, extra: (ids: string[]) => { type: string; metadata: Record<string, unknown>; player_id?: string }[] = () => []) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12", name: `BBL-FIX-${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 7 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Fdggd" });
  const ids = players.map((p) => p.id);
  const lineup = { lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) };
  const start = Date.now() - elapsedSec * 1000;
  const at = (s: number) => new Date(start + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup, sport: "basketball" }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport: "basketball" }, created_by: ownerId, created_at: at(0) },
    ...extra(ids).map((e, i) => ({ game_id: game.id, ...e, metadata: { ...e.metadata, sport: "basketball" }, created_by: ownerId, created_at: at(1 + i) })),
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, ownerId, team, game, ids };
}

async function open(page: Page, teamId: string, gameId: string) {
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1/i })).toBeVisible({ timeout: 15_000 });
}

test("a score tap shows straight away, and the next tap isn't blocked by a slow save", async ({ page }) => {
  const { team, game } = await gameInH1(30);
  await open(page, team.id, game.id);
  // Every save takes 4 s, as on a gym's patchy signal.
  await page.route(`**/games/${game.id}/live`, async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  const opp = page.getByTestId("scorebug-team-name").last().locator("xpath=..");
  await page.getByRole("button", { name: "Add 2 points, Fdggd" }).click();
  await page.getByRole("button", { name: "Add 3 points, Fdggd" }).click({ timeout: 1000 });
  await expect(opp).toContainText("5", { timeout: 1500 });
});

test("after a sub, the next upcoming sub still shows when nothing evens time yet", async ({ page }) => {
  // Steve's game: the guards came off at 1:23 for two kids who play
  // Guards only; at 1:53 those two (on the bench, 1:23 played) can only
  // replace a guard, and both guards on court have played 0:30.
  const { admin, team, game, ids } = await gameInH1(113, (k) => [
    { type: "swap", metadata: { quarter: 1, elapsed_ms: 83_000, line: "guard", off_player_id: k[0], on_player_id: k[5] } },
    { type: "swap", metadata: { quarter: 1, elapsed_ms: 83_000, line: "guard", off_player_id: k[1], on_player_id: k[6] } },
  ]);
  await admin.from("player_position_prefs").insert(
    [ids[0], ids[1]].map((player_id) => ({ team_id: team.id, player_id, line: "forward", kind: "never" })),
  );
  await open(page, team.id, game.id);
  const bench = page.getByRole("group", { name: "Bench" });
  await expect(bench.getByLabel(/^Going on to Guards, pair 1/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^Suggested — /)).toBeVisible();
});
