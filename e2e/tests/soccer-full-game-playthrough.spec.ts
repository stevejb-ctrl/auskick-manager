// ─── Football (soccer) full-game playthrough ────────────────────
// Soccer plan, phase 2: a 7-a-side game (MiniRoos U8) plays end to end,
// with a keeper change at half-time.
//
// Flow:
//   1. Pre-kickoff: the picker draws seven on the pitch, a keeper in
//      goal and three on the bench, and names who starts in goal.
//   2. Start H1 (two-step: the picker, then the whistle modal).
//   3. A goal for us from the player's dock, one for them from the
//      scorebug, and a rolling sub (bench tap, then field tap).
//   4. End H1. Half-time plans H2: under "Everyone has a turn" the
//      keeper top changes hands and last half's keeper plays out.
//   5. Start H2, end it, finish: game_finalised, the game completed,
//      and the share text gives each kid's time in goal.
//   6. Every event soccer's actions write carries the team's sport.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "serial" });

interface SoccerLineupMeta {
  keeper: string | null;
  lines: { def: string[]; mid: string[]; att: string[]; field: string[] };
  bench: string[];
}

test("soccer U8: 7 a side, a goal each way, a rolling sub, the keeper top changes at half-time, finish", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;

  const team = await makeTeam(admin, {
    ownerId,
    sport: "soccer",
    ageGroup: "U8",
    name: `SOC-PT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // MiniRoos keeps no score by default; this spec scores to test goals.
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Coogee Crabs" });
  expect(game.on_field_size).toBe(7);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const nameOf = (id: string) => players.find((p) => p.id === id)!.full_name;

  const lineup = async (): Promise<SoccerLineupMeta> => {
    const { data } = await admin
      .from("game_events")
      .select("metadata, created_at")
      .eq("game_id", game.id)
      .eq("type", "lineup_set")
      .order("created_at", { ascending: false })
      .limit(1);
    return (data?.[0]?.metadata as { lineup: SoccerLineupMeta }).lineup;
  };
  const count = async (type: string) =>
    ((await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", type)).data ?? []).length;

  // ─── 1. Pre-kickoff: seven on the pitch, a keeper, three on the bench ─
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 8 starting lineup/i })).toBeVisible({ timeout: 15_000 });
  const field = page.getByRole("region", { name: "On field" });
  await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(7);
  await expect(field.getByRole("group", { name: "Keeper" }).locator("[data-testid^='player-tile-']")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Bench" }).locator("[data-testid^='player-tile-']")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Keeper" })).toContainText(/starts in goal/i);

  // ─── 2. Start H1 ───────────────────────────────────────────────
  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });

  const h1 = await lineup();
  expect(h1.keeper).toBeTruthy();
  const outfield = [...h1.lines.def, ...h1.lines.mid, ...h1.lines.att];
  expect(outfield).toHaveLength(6);
  expect(h1.bench).toHaveLength(3);
  const h1Keeper = h1.keeper!;

  // ─── 3. Goals both ways, and a rolling sub ────────────────────
  const scorer = h1.lines.att[0] ?? outfield[0];
  await page.getByTestId(`player-tile-${scorer}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^\+\s*goal$/i }).click({ timeout: 5_000 });
  await expect.poll(() => count("goal")).toBe(1);
  const { data: goal } = await admin.from("game_events").select("player_id").eq("game_id", game.id).eq("type", "goal").single();
  expect(goal?.player_id).toBe(scorer);
  await page.getByRole("button", { name: "Add goal, Coogee Crabs" }).click({ timeout: 5_000 });
  await expect.poll(() => count("opponent_goal")).toBe(1);

  const [benchKid] = h1.bench;
  const offKid = h1.lines.def[0];
  await page.getByTestId(`player-tile-${benchKid}`).click({ timeout: 10_000 });
  await page.getByTestId(`player-tile-${offKid}`).click({ timeout: 10_000 });
  await expect.poll(() => count("swap")).toBe(1);
  const { data: swap } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap").single();
  expect(swap?.metadata).toMatchObject({ off_player_id: offKid, on_player_id: benchKid });
  // The bench kid took the defender's place: the field still reads seven.
  await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(7);

  // ─── 4. End H1; half-time hands the keeper top on ─────────────
  await page.getByRole("button", { name: /^clock — h1, running$/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  const keeperCard = page.getByRole("region", { name: "Keeper" });
  await expect(keeperCard).toContainText(/keeper top:/i, { timeout: 15_000 });
  await expect(keeperCard).toContainText(nameOf(h1Keeper).split(" ")[0]);

  // ─── 5. Start H2 with the plan, end it, finish ────────────────
  await page.getByRole("button", { name: /^start h2$/i }).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^start h2 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h2, running$/i })).toBeVisible({ timeout: 15_000 });
  const h2 = await lineup();
  // Everyone has a turn: a new keeper, and last half's keeper plays out.
  expect(h2.keeper).toBeTruthy();
  expect(h2.keeper).not.toBe(h1Keeper);
  expect([...h2.lines.def, ...h2.lines.mid, ...h2.lines.att]).toContain(h1Keeper);

  await page.getByRole("button", { name: /^clock — h2, running$/i }).click();
  await page.getByRole("button", { name: /^end h2 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*2$/i }).click();
  await page.getByRole("button", { name: /finish game/i }).click({ timeout: 10_000 });
  await expect.poll(() => count("game_finalised")).toBe(1);
  await expect
    .poll(async () => (await admin.from("games").select("status").eq("id", game.id).single()).data?.status)
    .toBe("completed");
  const summary = page.locator("#soccer-game-summary-text");
  await expect(summary).toContainText("Coogee Crabs", { timeout: 15_000 });
  await expect(summary).toContainText(/in goal/);

  // ─── 6. Soccer's events carry the team's sport ────────────────
  const { data: events } = await admin
    .from("game_events")
    .select("type, metadata")
    .eq("game_id", game.id)
    .in("type", ["lineup_set", "quarter_start", "quarter_end", "swap", "goal", "opponent_goal", "game_finalised"]);
  expect(events?.length).toBeGreaterThan(0);
  for (const e of events ?? []) {
    expect((e.metadata as { sport?: string }).sport, e.type as string).toBe("soccer");
  }

  // The finished game's page opens (its How-we-played report is phase 3)
  // and lists the scorer in soccer's words.
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await waitForHydration(page);
  await expect(page.getByText("Who found the net")).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
});

// The way in before kick-off: the game's page (its game-plan preview is
// phase 3, so it mustn't stop the page) and the runner link, which opens
// soccer's lineup picker, never another sport's.
test("soccer: the game page and the runner link open before kick-off", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    sport: "soccer",
    ageGroup: "U10",
    name: `SOC-WAY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );

  const response = await page.goto(`/teams/${team.id}/games/${game.id}`);
  expect(response?.status()).toBeLessThan(400);
  await waitForHydration(page);
  await expect(page.getByText(/9 on field/i)).toBeVisible({ timeout: 15_000 });

  await page.goto(`/run/${game.share_token}`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 10 starting lineup/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "On field" }).locator("[data-testid^='player-tile-']")).toHaveCount(9);

  expect(errors).toEqual([]);
});
