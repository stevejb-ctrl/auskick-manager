// ─── Futsal full-game playthrough ────────────────────────────────
// Four-sports plan, track A: a U10 futsal game (5 a side, 2 × 20) plays
// end to end on the soccer family's engine, in futsal's own words, with
// keeper turns and a mid-half keeper swap.
//
// Flow:
//   1. Pre-kickoff: the picker draws five on the court (a keeper, two at
//      the back and two up front: 2-2), in futsal's words, and three on
//      the bench.
//   2. Start H1 (two-step: the picker, then the whistle modal).
//   3. A goal each way.
//   4. A mid-half keeper swap (FIFA Law 3 allows one any time): the
//      keeper's actions → Replace keeper → a bench kid goes in goal.
//   5. End H1. Half-time plans H2: under "Everyone has a turn" the keeper
//      top changes hands.
//   6. Start H2, end it, finish: the share text gives time in goal.
//   7. Every event carries the team's sport (futsal, not soccer), and the
//      game page and stats read in futsal's words.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { startFromBreak } from "../helpers/break";

test.describe.configure({ mode: "serial" });

interface FutsalLineupMeta {
  keeper: string | null;
  lines: { def: string[]; mid: string[]; att: string[]; field: string[] };
  bench: string[];
}

test("futsal U10: 5 a side on a court, a goal each way, a mid-half keeper swap, keeper turns at half-time, finish", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;

  const team = await makeTeam(admin, {
    ownerId,
    sport: "futsal",
    ageGroup: "U10",
    name: `FUT-PT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // Futsal keeps score from U10 (createTeam starts it on; the factory doesn't).
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 8 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Belconnen Bolts" });
  // 5 a side, a sub every 4 minutes of a 20-minute half.
  expect(game.on_field_size).toBe(5);
  expect(game.sub_interval_seconds).toBe(240);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const nameOf = (id: string) => players.find((p) => p.id === id)!.full_name;

  const lineup = async (): Promise<FutsalLineupMeta> => {
    const { data } = await admin
      .from("game_events")
      .select("metadata, created_at")
      .eq("game_id", game.id)
      .eq("type", "lineup_set")
      .order("created_at", { ascending: false })
      .limit(1);
    return (data?.[0]?.metadata as { lineup: FutsalLineupMeta }).lineup;
  };
  const count = async (type: string) =>
    ((await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", type)).data ?? []).length;

  // ─── 1. Pre-kickoff: five on the court in futsal's words ──────
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 10 starting lineup/i })).toBeVisible({ timeout: 15_000 });
  const court = page.getByRole("region", { name: "On court" });
  await expect(court).toHaveAttribute("data-surface", "court");
  await expect(court.getByTestId("futsal-court-markings")).toBeAttached();
  await expect(court.locator("[data-testid^='player-tile-']")).toHaveCount(5);
  await expect(court.getByRole("group", { name: "Keeper" }).locator("[data-testid^='player-tile-']")).toHaveCount(1);
  // 2-2: two at the back, two up front, no wings.
  await expect(court.getByRole("group", { name: "Back" }).locator("[data-testid^='player-tile-']")).toHaveCount(2);
  await expect(court.getByRole("group", { name: "Front" }).locator("[data-testid^='player-tile-']")).toHaveCount(2);
  await expect(court.getByRole("group", { name: "Wings" })).toHaveCount(0);
  await expect(court.getByRole("group", { name: "Back" })).toContainText("BACK");
  await expect(court.getByRole("group", { name: "Front" })).toContainText("FRONT");
  await expect(page.getByRole("group", { name: "Bench" }).locator("[data-testid^='player-tile-']")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Keeper" })).toContainText(/starts in goal/i);

  // ─── 2. Start H1 ───────────────────────────────────────────────
  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });

  const h1 = await lineup();
  expect(h1.keeper).toBeTruthy();
  expect(h1.lines.def).toHaveLength(2);
  expect(h1.lines.att).toHaveLength(2);
  expect(h1.lines.mid).toHaveLength(0);
  expect(h1.bench).toHaveLength(3);
  const h1Keeper = h1.keeper!;

  // ─── 3. A goal each way ────────────────────────────────────────
  const scorer = h1.lines.att[0];
  await page.getByTestId(`player-tile-${scorer}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^\+\s*goal$/i }).click({ timeout: 5_000 });
  await expect.poll(() => count("goal")).toBe(1);
  await page.getByRole("button", { name: "Add goal, Belconnen Bolts" }).click({ timeout: 5_000 });
  await expect.poll(() => count("opponent_goal")).toBe(1);

  // ─── 4. A mid-half keeper swap: a bench kid goes in goal ──────
  const newKeeper = h1.bench[0];
  await page.getByTestId(`player-tile-${h1Keeper}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^player actions/i }).click({ timeout: 5_000 });
  await page.getByRole("dialog").getByRole("button", { name: /replace keeper/i }).click({ timeout: 5_000 });
  // The sheet lists the outfield and the bench; the bench kid comes on in goal.
  await page
    .getByRole("dialog", { name: /who goes in as/i })
    .getByRole("button", { name: new RegExp(`^${nameOf(newKeeper)} Bench$`) })
    .click({ timeout: 5_000 });
  await expect.poll(() => count("swap")).toBe(1);
  const { data: swap } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap").single();
  expect(swap?.metadata).toMatchObject({ off_player_id: h1Keeper, on_player_id: newKeeper, line: "gk" });
  await expect(court.getByRole("group", { name: "Keeper" }).getByTestId(`player-tile-${newKeeper}`)).toBeVisible({ timeout: 15_000 });
  await expect(court.locator("[data-testid^='player-tile-']")).toHaveCount(5);

  // ─── 5. End H1; half-time hands the keeper top on ─────────────
  await page.getByRole("button", { name: /^clock — h1, running$/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  // Half-time is the shared break screen: the plan puts a new kid in
  // goal, not the one who went in mid-half.
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  const keeperZone = page.getByRole("group", { name: "Keeper" });
  await expect(keeperZone.locator("[data-testid^='player-tile-']")).toHaveCount(1);
  await expect(keeperZone.getByTestId(`player-tile-${newKeeper}`)).toHaveCount(0);

  // ─── 6. Start H2 with the plan, end it, finish ────────────────
  await startFromBreak(page, /^start 2nd half/i);
  await expect(page.getByRole("button", { name: /^clock — h2, running$/i })).toBeVisible({ timeout: 15_000 });
  const h2 = await lineup();
  // Everyone has a turn: neither first-half keeper goes back in.
  expect(h2.keeper).toBeTruthy();
  expect([h1Keeper, newKeeper]).not.toContain(h2.keeper);

  await page.getByRole("button", { name: /^clock — h2, running$/i }).click();
  await page.getByRole("button", { name: /^end h2 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*2$/i }).click();
  await page.getByRole("button", { name: /finish game/i }).click({ timeout: 10_000 });
  await expect.poll(() => count("game_finalised")).toBe(1);
  await expect
    .poll(async () => (await admin.from("games").select("status").eq("id", game.id).single()).data?.status)
    .toBe("completed");
  const summary = page.locator("#soccer-game-summary-text");
  await expect(summary).toContainText("⚽ Full time", { timeout: 15_000 });
  await expect(summary).toContainText("Belconnen Bolts");
  await expect(summary).toContainText(/in goal/);

  // ─── 7. Futsal's events carry futsal, not soccer ──────────────
  const { data: events } = await admin
    .from("game_events")
    .select("type, metadata")
    .eq("game_id", game.id)
    .in("type", ["lineup_set", "quarter_start", "quarter_end", "swap", "goal", "opponent_goal", "game_finalised"]);
  expect(events?.length).toBeGreaterThan(0);
  for (const e of events ?? []) {
    expect((e.metadata as { sport?: string }).sport, e.type as string).toBe("futsal");
  }

  // The finished game's page lists the scorer; stats read in futsal's
  // words (the season grid's lines: Front, Wing, Back).
  await gotoStable(page, `/teams/${team.id}/games/${game.id}`);
  await waitForHydration(page);
  await expect(page.getByText("Who found the net")).toBeVisible({ timeout: 15_000 });
  await gotoStable(page, `/teams/${team.id}/stats`);
  await waitForHydration(page);
  await expect(page.getByText(/isn't built yet|something went wrong/i)).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Front" }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("columnheader", { name: "Back" }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
