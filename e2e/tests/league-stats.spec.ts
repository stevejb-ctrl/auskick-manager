// ─── Rugby league season stats ──────────────────────────────────
// U13 and up play international laws: penalty goals (2) and field
// goals (1) score, and none of the junior laws apply (no FR/DH vests,
// no kickoff rotation, no §6 unbroken periods). The season stats
// page counts the goals per kicker and in the team totals, and drops
// the junior-law columns and the §6 shortfall panel. Junior grades
// keep those and never show goal columns (Law 17 forbids both kicks).
//
// Setup: seed a finalised league game straight into the event log
// (lineup_set, two halves, scoring events, game_finalised), then
// read /teams/:id/stats.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function seedFinalisedLeagueGame(age: "U10" | "U13") {
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
    name: `RL-Stats-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: size + 2,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    scheduledAt: new Date(Date.now() - 86400_000).toISOString(),
  });
  await admin.from("games").update({ on_field_size: size }).eq("id", game.id);

  const [scorer, kicker, fieldGoalKicker] = players;
  const lineup = {
    forwards: players.slice(0, forwards).map((p) => p.id),
    backs: players.slice(forwards, size).map((p) => p.id),
    bench: players.slice(size).map((p) => p.id),
  };
  // Backdate so created_at orders the log; the replay sorts on it.
  const base = Date.now() - 60 * 60 * 1000;
  const ts = (min: number) => new Date(base + min * 60_000).toISOString();
  const goals =
    age === "U13"
      ? [
          { type: "penalty_goal", player_id: kicker.id, metadata: { quarter: 1 }, created_at: ts(8) },
          { type: "field_goal", player_id: fieldGoalKicker.id, metadata: { quarter: 1 }, created_at: ts(9) },
          { type: "opponent_penalty_goal", metadata: { quarter: 1 }, created_at: ts(10) },
          { type: "penalty_goal", player_id: kicker.id, metadata: { quarter: 2 }, created_at: ts(31) },
        ]
      : [];
  const events = [
    { type: "lineup_set", metadata: { lineup }, created_at: ts(0) },
    { type: "quarter_start", metadata: { quarter: 1 }, created_at: ts(1) },
    { type: "try", player_id: scorer.id, metadata: { quarter: 1 }, created_at: ts(5) },
    { type: "conversion_attempt", player_id: kicker.id, metadata: { quarter: 1, made: true }, created_at: ts(6) },
    { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 1_500_000 }, created_at: ts(26) },
    { type: "quarter_start", metadata: { quarter: 2 }, created_at: ts(30) },
    { type: "quarter_end", metadata: { quarter: 2, elapsed_ms: 1_500_000 }, created_at: ts(56) },
    { type: "game_finalised", metadata: {}, created_at: ts(57) },
    ...goals,
  ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId }));
  const { error } = await admin.from("game_events").insert(events);
  if (error) throw new Error(`seedFinalisedLeagueGame events: ${error.message}`);
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);

  return { team, game, players, lineup, ts, ownerId, admin, scorer, kicker, fieldGoalKicker };
}

function statsTable(page: Page) {
  return page.getByRole("table", { name: "Player stats" });
}

function playerRow(page: Page, name: string) {
  return statsTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name, exact: true }) });
}

test("U13 stats count penalty and field goals and drop the junior-law columns", async ({
  page,
}) => {
  const { team, scorer, kicker, fieldGoalKicker } = await seedFinalisedLeagueGame("U13");
  await page.goto(`/teams/${team.id}/stats`);

  // Team totals: 4 (try) + 2 (conv) + 2 × 2 (PG) + 1 (FG) = 11.
  await expect(page.getByRole("group", { name: "Pen. goals" })).toContainText("2");
  await expect(page.getByRole("group", { name: "Field goals" })).toContainText("1");
  await expect(page.getByRole("group", { name: "Tries" })).toContainText("11 pts");
  await expect(page.getByRole("group", { name: "Conceded" })).toContainText("2");
  // One kick: "1 attempt", not "1 attempts".
  await expect(
    page.getByRole("group", { name: "Conv. made" }).getByText("1 attempt", { exact: true }),
  ).toBeVisible();

  // Player, GP, Tries, Conv (M/A), PG, FG.
  await expect(statsTable(page).getByRole("columnheader")).toHaveText([
    "Player",
    "GP",
    "Tries",
    "Conv (M/A)",
    "PG",
    "FG",
  ]);
  await expect(playerRow(page, kicker.full_name).getByRole("cell")).toHaveText([
    kicker.full_name,
    "1",
    "—",
    "1/1",
    "2",
    "—",
  ]);
  await expect(
    playerRow(page, fieldGoalKicker.full_name).getByRole("cell"),
  ).toHaveText([fieldGoalKicker.full_name, "1", "—", "—", "—", "1"]);
  await expect(playerRow(page, scorer.full_name).getByRole("cell")).toHaveText([
    scorer.full_name,
    "1",
    "1",
    "—",
    "—",
    "—",
  ]);

  // No junior laws on U13+: no vests, kickoff rotation or §6.
  for (const junior of ["FR", "DH", "Kickoffs", "Unbroken"]) {
    await expect(statsTable(page).getByRole("columnheader", { name: junior, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: /unbroken-period/i })).toHaveCount(0);
});

test("U10 stats keep the junior-law columns and show no goal columns", async ({ page }) => {
  const { team, kicker } = await seedFinalisedLeagueGame("U10");
  await page.goto(`/teams/${team.id}/stats`);

  await expect(statsTable(page).getByRole("columnheader")).toHaveText([
    "Player",
    "GP",
    "Tries",
    "Conv (M/A)",
    "FR",
    "DH",
    "Kickoffs",
    "Unbroken",
  ]);
  await expect(playerRow(page, kicker.full_name)).toBeVisible();
  await expect(page.getByRole("group", { name: "Pen. goals" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Field goals" })).toHaveCount(0);
});

// Sideline combo: a kid hurt in the first half, replaced from the bench,
// then marked recovered while sitting on the bench never went back on,
// so the half is broken for them and they don't start the second. The
// recovery used to count as a return to the field: credited both halves.
test("a kid replaced while hurt and recovered on the bench isn't credited an unbroken period", async ({
  page,
}) => {
  const { team, game, players, lineup, ts, ownerId, admin } = await seedFinalisedLeagueGame("U10");
  const hurt = players.find((p) => p.id === lineup.forwards[2])!;
  const replacement = players.find((p) => p.id === lineup.bench[0])!;
  const { error } = await admin.from("game_events").insert(
    [
      { type: "injury", player_id: hurt.id, metadata: { injured: true, quarter: 1, elapsed_ms: 300_000 }, created_at: ts(10) },
      {
        type: "swap",
        metadata: { off_player_id: hurt.id, on_player_id: replacement.id, quarter: 1, elapsed_ms: 300_000 },
        created_at: ts(10.1),
      },
      { type: "injury", player_id: hurt.id, metadata: { injured: false, quarter: 1, elapsed_ms: 360_000 }, created_at: ts(11) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(error.message);

  await page.goto(`/teams/${team.id}/stats`);
  // Unbroken = games meeting the U10 requirement (1 unbroken half) / games.
  await expect(playerRow(page, hurt.full_name).getByRole("cell").last()).toHaveText("0/1");
  await expect(playerRow(page, replacement.full_name).getByRole("cell").last()).toHaveText("1/1");
});
