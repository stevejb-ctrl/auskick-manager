// ─── Rugby union full-game playthrough ──────────────────────────
// Sibling of rugby-league-full-game-playthrough.spec.ts (rugby union
// plan, phases 4 and 6). A U12 union side plays 15 a side in two
// 25-minute halves, kicks for goal (penalty and drop goals count) and
// keeps score by default, with none of league's junior laws: no vests,
// no kickoff or conversion rotation, no unbroken-period rule.
//
// Flow:
//   1. Pre-kickoff: the lineup picker draws all fifteen on union's
//      field (its 22 m line, not league's 20 m) with no vest card.
//   2. Start H1 from the picker.
//   3. A try (5) and its conversion (2) with no rotation, a penalty
//      goal (3) and a drop goal (3) for us, a drop goal for them.
//   4. The score bug reads union's points and words (13 to 3, DG).
//   5. End H1, start H2, end it, finish: game_finalised, completed.
//   6. Every event carries the team's sport; stats read union's words.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "serial" });

test("rugby union U12: 15 a side, try → conversion → penalty and drop goals → finish", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;

  const team = await makeTeam(admin, {
    ownerId,
    sport: "rugby_union",
    ageGroup: "U12",
    name: `RU-PT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 17 });
  // Sized from union U12: 15 on the field.
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  expect(game.on_field_size).toBe(15);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );

  await page.addInitScript(() => {
    try {
      localStorage.setItem("league-walkthrough-seen", "1");
    } catch {}
  });

  // ─── 1. Pre-kickoff: fifteen on union's field ─────────────────
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const field = page.getByRole("region", { name: "On field" });
  await expect(page.getByText("15 / 15").first()).toBeVisible({ timeout: 15_000 });
  await expect(field.locator("[data-testid^='league-player-tile-']")).toHaveCount(15);
  await expect(field.locator("[data-pitch-line='22m']")).toHaveCount(2);
  await expect(page.getByText(/First Receiver|Dummy Half/)).toHaveCount(0);

  // ─── 2. Start H1 ───────────────────────────────────────────────
  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start clock$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
  // No kickoff rotation in union.
  await expect(page.getByText(/kicking off this period/i)).toHaveCount(0);

  const lineup = async () => {
    const { data } = await admin
      .from("game_events")
      .select("metadata, created_at")
      .eq("game_id", game.id)
      .eq("type", "lineup_set")
      .order("created_at", { ascending: false })
      .limit(1);
    return (data?.[0]?.metadata as { lineup: { forwards: string[]; backs: string[] } }).lineup;
  };
  const onField = await lineup();
  expect(onField.forwards.length + onField.backs.length).toBe(15);
  // Union's 15: 8 forwards, 7 backs.
  expect(onField.forwards).toHaveLength(8);
  const [scorer, kicker, goalKicker] = [onField.forwards[0], onField.forwards[1], onField.backs[0]];

  const count = async (type: string) =>
    ((await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", type)).data ?? []).length;

  // ─── 3. A try and its conversion, no rotation ─────────────────
  await page.getByTestId(`league-player-tile-${scorer}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^\+\s*try$/i }).click({ timeout: 5_000 });
  await expect.poll(() => count("try")).toBe(1);
  const conversion = page.getByRole("dialog", { name: /record conversion/i });
  await expect(conversion).toBeVisible({ timeout: 5_000 });
  await expect(conversion).not.toContainText(/rotation/i);
  const kickerName = players.find((p) => p.id === kicker)!.full_name;
  await conversion.locator("div.rounded-lg").filter({ hasText: kickerName }).getByRole("button", { name: /^made$/i }).click();
  await expect.poll(() => count("conversion_attempt")).toBe(1);

  // A penalty goal and a drop goal for us, from the player's dock.
  await page.getByTestId(`league-player-tile-${goalKicker}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^\+\s*penalty goal$/i }).click({ timeout: 5_000 });
  await expect.poll(() => count("penalty_goal")).toBe(1);
  await page.getByTestId(`league-player-tile-${goalKicker}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^\+\s*drop goal$/i }).click({ timeout: 5_000 });
  await expect.poll(() => count("field_goal")).toBe(1);
  // A drop goal for them, from the score bug.
  await page.getByRole("button", { name: "Record opponent drop goal" }).click({ timeout: 5_000 });
  await expect.poll(() => count("opponent_field_goal")).toBe(1);

  // ─── 4. Union's points and words ──────────────────────────────
  // 5 + 2 + 3 + 3 = 13 to 3.
  await expect(page.getByTestId("league-points-team")).toHaveText("13");
  await expect(page.getByTestId("league-points-opponent")).toHaveText("3");
  await expect(page.getByTestId("league-score-line-team")).toHaveText("1T·1C·1PG·1DG");
  await expect(page.getByTestId("league-score-line-opponent")).toHaveText("0T·0C·1DG");

  // ─── 5. End H1, H2, finish ────────────────────────────────────
  await page.getByRole("button", { name: /^clock — h1, running$/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  await page.getByRole("button", { name: /^start clock$/i }).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^clock — h2, running$/i }).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^end h2 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*2$/i }).click();
  await page.getByRole("button", { name: /finish game/i }).click({ timeout: 10_000 });
  await expect.poll(() => count("game_finalised")).toBe(1);
  await expect
    .poll(async () => (await admin.from("games").select("status").eq("id", game.id).single()).data?.status)
    .toBe("completed");

  // ─── 6. The team's sport on the rugby events; stats in union's words ─
  const { data: events } = await admin.from("game_events").select("type, metadata").eq("game_id", game.id);
  expect(events?.length).toBeGreaterThan(0);
  for (const e of events ?? []) {
    expect((e.metadata as { sport?: string }).sport, e.type as string).toBe("rugby_union");
  }

  // Finishing the game navigates the live page; on WebKit that can still
  // be landing, and a plain goto is interrupted by it.
  await gotoStable(page, `/teams/${team.id}/stats`);
  await waitForHydration(page);
  await expect(page.getByRole("group", { name: "Tries" })).toContainText("13 pts", { timeout: 15_000 });
  await expect(page.getByRole("group", { name: "Drop goals" })).toContainText("1");
  const table = page.getByRole("table", { name: "Player stats" });
  await expect(table.getByRole("columnheader")).toHaveText(["Player", "GP", "Tries", "Conv (M/A)", "PG", "DG"]);

  expect(errors).toEqual([]);
});
