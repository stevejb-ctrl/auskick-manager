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
import { startFromBreak } from "../helpers/break";

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
  // From a scrolled live view: the break still opens at the top (audit,
  // 23 Oct 2026: it kept the live view's offset, the score off-screen).
  await page.setViewportSize({ width: 412, height: 640 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("button", { name: /^clock — h1, running$/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  // Half-time is the shared break screen: the plan puts someone else in
  // goal, and last half's keeper's tile reads where they came from.
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  const keeperZone = page.getByRole("group", { name: "Keeper" });
  await expect(keeperZone.locator("[data-testid^='player-tile-']")).toHaveCount(1);
  await expect(keeperZone.getByTestId(`player-tile-${h1Keeper}`)).toHaveCount(0);
  await expect(page.getByTestId(`player-tile-${h1Keeper}`)).toContainText(/from keeper/i);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("radiogroup", { name: "How the next lineup is built" })).toBeInViewport();

  // The score sheet speaks halves and the team's name: Half · team ·
  // opponent, H1 and H2 only, Fix scores under H1, a missed score added
  // to a half (audit, 23 Oct 2026: QUARTER, H1–H4, "Us", Q1–Q4).
  await page.getByRole("button", { name: /review and update scores/i }).click();
  const scoreSheet = page.getByRole("dialog", { name: "Score" });
  const table = scoreSheet.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Half", team.name, "Coogee Crabs", "Margin"]);
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row").nth(1)).toContainText("H1");
  await expect(table.getByRole("row").nth(2)).toContainText("H2");
  // Fix scores lists the two goals under H1, never Q1.
  await expect(scoreSheet.getByRole("listitem")).toHaveCount(2, { timeout: 15_000 });
  await expect(scoreSheet.getByText("Q1", { exact: true })).toHaveCount(0);
  await expect(scoreSheet.getByText("H1", { exact: true })).toHaveCount(2);
  await scoreSheet.getByRole("button", { name: /add a missed score/i }).click();
  await expect(scoreSheet.getByLabel("Half").locator("option")).toHaveText(["H1", "H2"]);
  await scoreSheet.getByRole("button", { name: /^cancel$/i }).click();
  await scoreSheet.getByRole("button", { name: "Done" }).click();
  await expect(scoreSheet).toHaveCount(0);

  // ─── 5. Start H2 with the plan, end it, finish ────────────────
  await startFromBreak(page, /^start 2nd half/i);
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

// Two swaps fall due together; the coach makes one. The other stays due
// and the sub clock waits for it (audit, 23 Oct 2026: the clock
// restarted on the first, and the second dropped to "Suggested").
test("soccer: one of two due swaps leaves the other due, and the clock waits for it", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    sport: "soccer",
    ageGroup: "U9",
    name: `SOC-BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  // Subs every 30 s (the least); 40 s into the half, so they're due.
  await admin.from("games").update({ sub_interval_seconds: 30, status: "in_progress" }).eq("id", game.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = players.map((p) => p.id);
  const lineup = { keeper: ids[0], lines: { def: ids.slice(1, 3), mid: ids.slice(3, 6), att: ids.slice(6, 7), field: [] }, bench: ids.slice(7) };
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "soccer" }, created_at: t(41) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "soccer" }, created_at: t(40) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  const swaps = async () =>
    ((await admin.from("game_events").select("metadata, created_at").eq("game_id", game.id).eq("type", "swap").order("created_at")).data ??
      []) as { metadata: { batch_left?: number } }[];

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  // Both bench kids are due on.
  await expect(page.getByText(/^sub due — 2 swaps$/i)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("soccer-swap-pair-0").getByRole("button", { name: "Make swap" }).click();
  await expect.poll(async () => (await swaps()).length).toBe(1);
  // The swap says one of its batch is still to make…
  expect((await swaps())[0].metadata.batch_left).toBe(1);
  // …and the other stays due: the clock didn't restart.
  await expect(page.getByText(/^sub due — 1 swap$/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^suggested — 1 swap$/i)).toHaveCount(0);

  // The last of the batch restarts the clock.
  await page.getByText(/^sub due — 1 swap$/i).click();
  await page.getByTestId("soccer-swap-pair-0").getByRole("button", { name: "Make swap" }).click();
  await expect.poll(async () => (await swaps()).length).toBe(2);
  expect((await swaps())[1].metadata.batch_left).toBeUndefined();
  await expect(page.getByText(/^sub due —/i)).toHaveCount(0, { timeout: 15_000 });

  expect(errors).toEqual([]);
});
