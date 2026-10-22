// ─── Basketball full-game playthrough ───────────────────────────
// Basketball plan, phase 2: a U12 game (Guards and forwards ★, fouls
// tracked) plays end to end, and a quarters team under All five
// positions starts its game.
//
// Flow (U12):
//   1. Pre-tip-off: the picker draws five on court, two guards and three
//      forwards, and three on the bench.
//   2. Start H1 (two-step: the picker, then the start modal).
//   3. A 2 for us from the player's dock, a 3 for them from the
//      scorebug.
//   4. Five fouls on one kid: the fifth fouls them out, and the coach
//      picks who comes on (an injury with reason "fouled_out", and the
//      sub, the fouled-out kid on the bench for good).
//   5. A sit-out from the player's actions: off for 5 minutes, someone on.
//   6. End H1. The break plans H2; the fouled-out kid stays on the bench.
//   7. Start H2, end it, finish: game_finalised, the game completed, and
//      the share text marks the foul-out.
//   8. Every event basketball's actions write carries the team's sport.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { startFromBreak } from "../helpers/break";

test.describe.configure({ mode: "serial" });

interface BasketballLineupMeta {
  lines: { guard: string[]; forward: string[]; court: string[] };
  bench: string[];
  slots?: Record<string, string>;
}

async function ownerIdOf() {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  return { admin, ownerId: su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id };
}

/** Select a kid on court and open their actions from the dock. */
async function openActions(page: Page, playerId: string) {
  await page.getByTestId(`player-tile-${playerId}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /player actions/i }).click({ timeout: 5_000 });
}

test("basketball U12: guards and forwards, baskets each way, a foul-out, a sit-out, the break, finish", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  const { admin, ownerId } = await ownerIdOf();
  const team = await makeTeam(admin, {
    ownerId,
    sport: "basketball",
    ageGroup: "U12",
    name: `BBL-PT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // createTeam stores the age's scoring default (on at U12); the factory
  // leaves the column's, so say it here.
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 8 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Dandenong Rangers" });
  expect(game.on_field_size).toBe(5);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );

  const lineup = async (): Promise<BasketballLineupMeta> => {
    const { data } = await admin
      .from("game_events")
      .select("metadata, created_at")
      .eq("game_id", game.id)
      .eq("type", "lineup_set")
      .order("created_at", { ascending: false })
      .limit(1);
    return (data?.[0]?.metadata as { lineup: BasketballLineupMeta }).lineup;
  };
  const count = async (type: string) =>
    ((await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", type)).data ?? []).length;

  // ─── 1. Pre-tip-off: two guards, three forwards, three on the bench ─
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 12 starting five/i })).toBeVisible({ timeout: 15_000 });
  const court = page.getByRole("region", { name: "On court" });
  await expect(court.locator("[data-testid^='player-tile-']")).toHaveCount(5);
  await expect(court.getByRole("group", { name: "Guards" }).locator("[data-testid^='player-tile-']")).toHaveCount(2);
  await expect(court.getByRole("group", { name: "Forwards" }).locator("[data-testid^='player-tile-']")).toHaveCount(3);
  await expect(page.getByRole("group", { name: "Bench" }).locator("[data-testid^='player-tile-']")).toHaveCount(3);

  // ─── 2. Start H1 ───────────────────────────────────────────────
  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });

  const h1 = await lineup();
  expect(h1.lines.guard).toHaveLength(2);
  expect(h1.lines.forward).toHaveLength(3);
  expect(h1.lines.court).toEqual([]);
  expect(h1.bench).toHaveLength(3);

  // ─── 3. A 2 for us from the dock, a 3 for them from the scorebug ──
  const scorer = h1.lines.forward[0];
  await page.getByTestId(`player-tile-${scorer}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^\+2$/ }).first().click({ timeout: 5_000 });
  await expect.poll(() => count("two_pointer")).toBe(1);
  const { data: two } = await admin.from("game_events").select("player_id").eq("game_id", game.id).eq("type", "two_pointer").single();
  expect(two?.player_id).toBe(scorer);
  await page.getByRole("button", { name: "Add 3 points, Dandenong Rangers" }).click({ timeout: 5_000 });
  await expect.poll(() => count("opponent_three_pointer")).toBe(1);

  // ─── 4. Five fouls: the fifth fouls the kid out ────────────────
  const fouler = h1.lines.guard[0];
  for (let i = 1; i <= 5; i++) {
    await page.getByTestId(`player-tile-${fouler}`).click({ timeout: 10_000 });
    await page.getByTestId("basketball-foul").click({ timeout: 5_000 });
    await expect.poll(() => count("foul")).toBe(i);
    if (i < 5) await expect(page.getByTestId(`fouls-${fouler}`)).toHaveText(`${i}F`, { timeout: 10_000 });
  }
  const outModal = page.getByRole("dialog");
  await expect(outModal).toContainText(/has fouled out/i, { timeout: 10_000 });
  await outModal.getByRole("button").filter({ hasText: /suggested/i }).click();
  await expect.poll(() => count("swap")).toBe(1);
  const { data: foulOut } = await admin
    .from("game_events")
    .select("player_id, metadata")
    .eq("game_id", game.id)
    .eq("type", "injury")
    .single();
  expect(foulOut?.player_id).toBe(fouler);
  expect(foulOut?.metadata).toMatchObject({ injured: true, reason: "fouled_out" });
  await expect(page.getByTestId(`player-tile-${fouler}`)).toContainText(/foul out/i);
  await expect(court.locator("[data-testid^='player-tile-']")).toHaveCount(5);

  // ─── 5. A sit-out: off for 5 minutes, someone on ───────────────
  const { data: swapRow } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap").single();
  const cameOn = (swapRow?.metadata as { on_player_id: string }).on_player_id;
  const sitter = h1.lines.forward[1];
  await openActions(page, sitter);
  await page.getByTestId("basketball-sit-out").click({ timeout: 5_000 });
  const sitModal = page.getByRole("dialog");
  await expect(sitModal).toContainText(/sits out/i, { timeout: 10_000 });
  await sitModal.getByRole("button").filter({ hasText: /suggested/i }).click();
  await expect.poll(() => count("sit_out")).toBe(1);
  await expect.poll(() => count("swap")).toBe(2);
  const { data: sitOut } = await admin.from("game_events").select("player_id, metadata").eq("game_id", game.id).eq("type", "sit_out").single();
  expect(sitOut?.player_id).toBe(sitter);
  expect((sitOut?.metadata as { duration_ms: number }).duration_ms).toBe(5 * 60_000);
  await expect(page.getByTestId(`player-tile-${sitter}`)).toContainText(/sit/i);
  expect(cameOn).not.toBe(fouler);

  // ─── 6. End H1; the break plans H2, the fouled-out kid benched ──
  await page.getByRole("button", { name: /^clock — h1, running$/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });

  // ─── 7. Start H2 with the plan, end it, finish ────────────────
  await startFromBreak(page, /^start 2nd half/i);
  await expect(page.getByRole("button", { name: /^clock — h2, running$/i })).toBeVisible({ timeout: 15_000 });
  const h2 = await lineup();
  const onCourt = [...h2.lines.guard, ...h2.lines.forward];
  expect(onCourt).not.toContain(fouler);
  expect(h2.bench).toContain(fouler);
  expect(onCourt).toHaveLength(5);

  await page.getByRole("button", { name: /^clock — h2, running$/i }).click();
  await page.getByRole("button", { name: /^end h2 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*2$/i }).click();
  await page.getByRole("button", { name: /finish game/i }).click({ timeout: 10_000 });
  await expect.poll(() => count("game_finalised")).toBe(1);
  await expect
    .poll(async () => (await admin.from("games").select("status").eq("id", game.id).single()).data?.status)
    .toBe("completed");
  const summary = page.locator("#basketball-game-summary-text");
  await expect(summary).toContainText("Dandenong Rangers", { timeout: 15_000 });
  await expect(summary).toContainText(/fouled out/);

  // ─── 8. Basketball's events carry the team's sport ─────────────
  const { data: events } = await admin
    .from("game_events")
    .select("type, metadata")
    .eq("game_id", game.id)
    .in("type", ["lineup_set", "quarter_start", "quarter_end", "swap", "two_pointer", "opponent_three_pointer", "foul", "sit_out", "game_finalised"]);
  expect(events?.length).toBeGreaterThan(0);
  for (const e of events ?? []) {
    expect((e.metadata as { sport?: string }).sport, e.type as string).toBe("basketball");
  }

  // The finished game's page opens and lists the scorer in basketball's words.
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await waitForHydration(page);
  await expect(page.getByText("Who put points on the board")).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
});

test("basketball quarters under All five positions: 1 to 5 on court, Q1 starts, the runner link opens", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  const { admin, ownerId } = await ownerIdOf();
  const team = await makeTeam(admin, {
    ownerId,
    sport: "basketball",
    ageGroup: "U14",
    name: `BBL-Q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // The team plays quarters, and rotates through the five positions.
  await admin.from("teams").update({ period_count: 4 }).eq("id", team.id);
  await admin.from("team_playbooks").upsert({ team_id: team.id, strategy: "position-by-position" }, { onConflict: "team_id" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 7 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );

  // The game page opens before tip-off (no game-plan preview for basketball).
  const response = await page.goto(`/teams/${team.id}/games/${game.id}`);
  expect(response?.status()).toBeLessThan(400);
  await waitForHydration(page);

  // The runner link opens basketball's picker, never another sport's.
  await page.goto(`/run/${game.share_token}`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 14 starting five/i })).toBeVisible({ timeout: 15_000 });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const court = page.getByRole("region", { name: "On court" });
  await expect(court.locator("[data-testid^='player-tile-']")).toHaveCount(5);
  for (const label of ["PG", "SG", "SF", "PF", "C"]) {
    await expect(court.getByText(label, { exact: true })).toHaveCount(1);
  }

  await page.getByRole("button", { name: /^start q1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start q1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — q1, running$/i })).toBeVisible({ timeout: 15_000 });
  const { data } = await admin
    .from("game_events")
    .select("metadata")
    .eq("game_id", game.id)
    .eq("type", "lineup_set")
    .single();
  const slots = (data?.metadata as { lineup: BasketballLineupMeta }).lineup.slots ?? {};
  expect(Object.values(slots).sort()).toEqual(["c", "pf", "pg", "sf", "sg"]);

  // Q1 ends into quarter time, and the break plans Q2.
  await page.getByRole("button", { name: /^clock — q1, running$/i }).click();
  await page.getByRole("button", { name: /^end q1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*q\s*1$/i }).click();
  await expect(page.getByRole("button", { name: /^start q2$/i })).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
});
