// ─── Rugby league scoring rules ─────────────────────────────────
// Stagehand round 2 (2026-10): a league game held a made conversion
// and no try. The scorebug's +C opened the kicker picker at any time
// and the server took the kick. A conversion now needs a try still
// waiting for one; Force (the laws §15 fouled-try-scorer extra kick)
// is the only way past that.
//
// The same run found league Undo did nothing: the write queue appends
// its idempotency key as the last argument, which landed in
// undoLeagueScore's optional `kind` filter, so the server looked for
// a score of type "<uuid>" and gave up.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { pickBreakStrategy, startFromBreak } from "../helpers/break";

test.describe.configure({ mode: "serial" });

// Writes go through the game's write queue; on a loaded dev server one
// can take several seconds, so poll for them generously.
const expectWrite = expect.configure({ timeout: 15_000 });

/** U10 (junior laws, 11 a side) by default; U13 plays international laws (13 a side). */
async function seedLeagueGame(age: "U10" | "U13" = "U10") {
  const size = age === "U13" ? 13 : 11;
  const forwards = age === "U13" ? 6 : 5;
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: age,
    sport: "rugby_league",
    name: `RL-Score-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: size + 2,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ on_field_size: size }).eq("id", game.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: ownerId,
    })),
  );
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: {
        lineup: {
          forwards: players.slice(0, forwards).map((p) => p.id),
          backs: players.slice(forwards, size).map((p) => p.id),
          bench: players.slice(size).map((p) => p.id),
        },
        sport: "rugby_league",
      },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1, sport: "rugby_league" },
      created_by: ownerId,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, team, players, game };
}

async function eventsOfType(
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
  type: string,
) {
  const { data } = await admin
    .from("game_events")
    .select("id, player_id, metadata")
    .eq("game_id", gameId)
    .eq("type", type)
    .order("created_at", { ascending: true });
  return data ?? [];
}

function kickerRow(page: Page, name: string) {
  return page
    .getByRole("dialog", { name: /record conversion/i })
    .locator("div.rounded-lg")
    .filter({ hasText: name });
}

test("a conversion needs a try to convert, and Undo takes back the latest score", async ({ page }) => {
  test.setTimeout(120_000);
  const { admin, team, players, game } = await seedLeagueGame();
  const kicker = players[1];

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByText(/half\s*1/i).first()).toBeVisible({ timeout: 15_000 });
  // That text is server-rendered; a tap before hydration does nothing (WebKit).
  await waitForHydration(page);

  // Junior laws (U6–U12): no penalty or field goals to record.
  await expect(page.getByRole("button", { name: "Record a penalty goal for our team" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record opponent field goal" })).toHaveCount(0);

  // No try yet: +C still opens the picker (Force needs a way in), but
  // it says why it can't record a kick, and Made / Missed are off.
  await page.getByRole("button", { name: "Record a conversion for our team" }).click();
  const dialog = page.getByRole("dialog", { name: /record conversion/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/no try to convert/i)).toBeVisible();
  await expect(kickerRow(page, kicker.full_name).getByRole("button", { name: /^made$/i })).toBeDisabled();
  // Force is the fouled-try-scorer carve-out: it opens the rows up.
  await dialog.getByRole("checkbox").check();
  await expect(kickerRow(page, kicker.full_name).getByRole("button", { name: /^made$/i })).toBeEnabled();
  await dialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(dialog).toBeHidden();

  // A try opens the picker with its try named on the kick.
  await page.getByTestId(`league-player-tile-${players[0].id}`).click();
  await page.getByRole("button", { name: /^\+\s*try$/i }).click();
  await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "try")).length).toBe(1);
  const [tryEvent] = await eventsOfType(admin, game.id, "try");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/no try to convert/i)).toBeHidden();
  await kickerRow(page, kicker.full_name).getByRole("button", { name: /^made$/i }).click();
  await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "conversion_attempt")).length).toBe(1);
  const [conversion] = await eventsOfType(admin, game.id, "conversion_attempt");
  expect((conversion.metadata as { try_event_id?: string }).try_event_id).toBe(tryEvent.id);

  // The try is converted now, so a second +C is back to Force only.
  await page.getByRole("button", { name: "Record a conversion for our team" }).click();
  await expect(dialog.getByText(/no try to convert/i)).toBeVisible();
  await dialog.getByRole("button", { name: /^cancel$/i }).click();

  // Undo takes back the conversion (the latest score), not nothing.
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "score_undo")).length).toBe(1);
  const [undo] = await eventsOfType(admin, game.id, "score_undo");
  expect((undo.metadata as { target_event_id?: string }).target_event_id).toBe(conversion.id);

  // With the kick undone, the try is waiting for its conversion again.
  await page.reload();
  await waitForHydration(page);
  await page.getByRole("button", { name: "Record a conversion for our team" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/no try to convert/i)).toBeHidden();
  await expect(kickerRow(page, kicker.full_name).getByRole("button", { name: /^made$/i })).toBeEnabled();
});

test("U13 plays international laws: anyone may kick, and there's no kickoff rotation", async ({ page }) => {
  // The junior goal-kick (§15) and kickoff (§16) rotations are 6-12
  // laws. From U13 the team's goal-kicker takes every kick.
  test.setTimeout(120_000);
  const { admin, team, players, game } = await seedLeagueGame("U13");
  const kicker = players[1];
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByText(/half\s*1/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /^kickoff$/i })).toHaveCount(0);

  const dialog = page.getByRole("dialog", { name: /record conversion/i });
  for (let n = 1; n <= 2; n++) {
    await page.getByTestId(`league-player-tile-${players[0].id}`).click();
    await page.getByRole("button", { name: /^\+\s*try$/i }).click();
    await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "try")).length).toBe(n);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Pick the kicker.")).toBeVisible();
    // No rotation, so no Force carve-out either.
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await kickerRow(page, kicker.full_name).getByRole("button", { name: /^made$/i }).click();
    await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "conversion_attempt")).length).toBe(n);
    await expect(dialog).toBeHidden();
  }
  const kicks = await eventsOfType(admin, game.id, "conversion_attempt");
  expect(kicks.map((k) => k.player_id)).toEqual([kicker.id, kicker.id]);
});

test("U13 records penalty and field goals for both sides, and Undo takes one back", async ({ page }) => {
  // International laws: penalty goal 2, field goal 1.
  test.setTimeout(120_000);
  const { admin, team, players, game } = await seedLeagueGame("U13");
  await page.addInitScript(() => {
    try {
      localStorage.setItem("rl-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByText(/half\s*1/i).first()).toBeVisible({ timeout: 15_000 });

  // Ours from the scorebug: +PG asks who kicked it.
  await page.getByRole("button", { name: "Record a penalty goal for our team" }).click();
  const picker = page.getByRole("dialog", { name: /who kicked the penalty goal/i });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: new RegExp(players[1].full_name) }).click();
  await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "penalty_goal")).length).toBe(1);
  expect((await eventsOfType(admin, game.id, "penalty_goal"))[0].player_id).toBe(players[1].id);

  // Ours from the player dock: the kicker is the selected player.
  await page.getByTestId(`league-player-tile-${players[2].id}`).click();
  await page.getByRole("button", { name: /^\+ field goal$/i }).click();
  await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "field_goal")).length).toBe(1);
  expect((await eventsOfType(admin, game.id, "field_goal"))[0].player_id).toBe(players[2].id);

  // Theirs straight from the scorebug.
  await page.getByRole("button", { name: "Record opponent penalty goal" }).click();
  await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "opponent_penalty_goal")).length).toBe(1);
  await page.getByRole("button", { name: "Record opponent field goal" }).click();
  await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "opponent_field_goal")).length).toBe(1);

  const us = page.getByTestId("league-score-line-team");
  const them = page.getByTestId("league-score-line-opponent");
  await expect(us).toHaveText("0T·0C·1PG·1FG");
  await expect(them).toHaveText("0T·0C·1PG·1FG");
  await expect(page.getByTestId("league-points-team")).toHaveText("3");

  // Undo takes back the latest score: their field goal.
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expectWrite.poll(async () => (await eventsOfType(admin, game.id, "score_undo")).length).toBe(1);
  const [undo] = await eventsOfType(admin, game.id, "score_undo");
  const [theirFieldGoal] = await eventsOfType(admin, game.id, "opponent_field_goal");
  expect((undo.metadata as { target_event_id?: string }).target_event_id).toBe(theirFieldGoal.id);
  await expect(them).toHaveText("0T·0C·1PG");
  await expect(page.getByTestId("league-points-opponent")).toHaveText("2");

  // Full time: the review shows the goals and offers them as fixes too.
  for (const half of [1, 2]) {
    await page.getByRole("button", { name: new RegExp(`^clock — h${half}, running$`, "i") }).click();
    await page.getByRole("button", { name: new RegExp(`^end h${half} now$`, "i") }).click();
    await page.getByRole("button", { name: new RegExp(`^end\\s*[qh]\\s*${half}$`, "i") }).click();
    // Half-time is the shared break screen: Repeat keeps H1's lineup (so
    // the two bench kids still never get on), then Start the 2nd half.
    if (half === 1) {
      await pickBreakStrategy(page, "Repeat");
      await startFromBreak(page, /^start 2nd half/i);
    }
  }
  await expect(page.getByRole("button", { name: /finish game/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("0T · 0C · 1PG · 1FG").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^\+ PG$/ })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^\+ FG$/ })).toHaveCount(2);

  // The share text carries the goals and who kicked them. It appears once
  // Finish game has saved (the review's table shows the same score line,
  // so wait for the share text itself).
  await page.getByRole("button", { name: /finish game/i }).click();
  const kicker = (p: { full_name: string }) => p.full_name.split(" ")[0];
  await expect(page.getByText(new RegExp(`🎯 Goals: .*${kicker(players[1])}.*1 PG`)).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/3 \(0T · 0C · 1PG · 1FG\)/).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`🎯 Goals: .*${kicker(players[2])}.*1 FG`)).first()).toBeVisible();
  // The two bench kids never got on: still in the game-time list.
  for (const p of [players[13], players[14]]) {
    await expect(page.getByText(new RegExp(`${kicker(p)} — 0:00 \\(didn't get on\\)`)).first()).toBeVisible();
  }
});
