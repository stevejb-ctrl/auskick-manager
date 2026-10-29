// ─── Football (soccer) sideline combos ──────────────────────────
// The keeper and the half-time plan, on a seeded U8 (7 a side) game:
//   - the keeper is hurt mid-half and a bench kid goes in goal;
//   - "Swap keeper" puts a field player in goal (they trade places);
//   - a kid who turns up at half-time, after the coach has edited the
//     plan, still plays the second half (the kept plan used to drop
//     them from the game at Start).
// And the live chrome AFL's screen has, which the UX audit of 23 Oct
// 2026 found soccer's family lacked ("Drift from AFL"):
//   - the scorer sheet asks "Who scored?", attack first, and a stray
//     tap on its backdrop doesn't lose the goal;
//   - a tap-tap sub asks first and toasts; the undo strip says what was
//     recorded; a goal, an undo and a sub show before the server saves;
//   - the long-press sheet knows an on-field kid's line and the season's
//     lent minutes; Game settings (the sub interval) sits in the row.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import type { GameEvent } from "../../src/lib/types";
import { closeGameSettings, openGameSettings, startFromBreak } from "../helpers/break";

interface Seeded {
  team: { id: string };
  game: { id: string };
  players: { id: string; full_name: string }[];
}

/**
 * A soccer U8 game with a kick-off lineup (keeper p0; 2-3-1 from p1–p6;
 * p7 on the bench), H1 started `startedMinutesAgo` ago, and H1 ended
 * when `ended`. `available` kids are marked here; the rest aren't.
 */
async function soccerGame(
  admin: SupabaseClient,
  opts: {
    count: number;
    available: number;
    name: string;
    ended?: boolean;
    startedMinutesAgo?: number;
    /** Track scores (MiniRoos keeps none by default). */
    scoring?: boolean;
    opponent?: string;
    /** An earlier, finished game where these kids were lent (index → minutes). */
    lentBefore?: Record<number, number>;
  },
): Promise<Seeded> {
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    sport: "soccer",
    ageGroup: "U8",
    name: `${opts.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  if (opts.scoring) await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count });
  if (opts.lentBefore) {
    const before = await makeGame(admin, { teamId: team.id, ownerId, scheduledAt: new Date(Date.now() - 7 * 86400_000).toISOString() });
    const at = (s: number) => new Date(Date.now() - 7 * 86400_000 + s * 1000).toISOString();
    const lent = Object.entries(opts.lentBefore).flatMap(([i, mins], k) => [
      { type: "player_loan", player_id: players[Number(i)].id, metadata: { loaned: true, quarter: 1, elapsed_ms: 0, sport: "soccer" }, created_at: at(10 + k) },
      { type: "player_loan", player_id: players[Number(i)].id, metadata: { loaned: false, quarter: 1, elapsed_ms: mins * 60_000, sport: "soccer" }, created_at: at(100 + k) },
    ]);
    const { error } = await admin.from("game_events").insert(
      [
        { type: "quarter_start", metadata: { quarter: 1, sport: "soccer" }, created_at: at(1) },
        ...lent,
        { type: "game_finalised", metadata: { quarter: 2, elapsed_ms: 1_200_000, sport: "soccer" }, created_at: at(200) },
      ].map((e) => ({ ...e, game_id: before.id, created_by: ownerId })),
    );
    if (error) throw new Error(`seed earlier game: ${error.message}`);
    await admin.from("games").update({ status: "completed" }).eq("id", before.id);
  }
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: opts.opponent });
  await admin.from("game_availability").insert(
    players.slice(0, opts.available).map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );
  const ids = players.map((p) => p.id);
  const lineup = {
    keeper: ids[0],
    lines: { def: [ids[1], ids[2]], mid: [ids[3], ids[4], ids[5]], att: [ids[6]], field: [] },
    bench: ids.slice(7, opts.available),
  };
  const ago = (opts.startedMinutesAgo ?? 3) * 60_000;
  const at = (offsetMs: number) => new Date(Date.now() - ago + offsetMs).toISOString();
  const evs: Record<string, unknown>[] = [
    { type: "lineup_set", metadata: { lineup, sport: "soccer" }, created_at: at(-2000) },
    { type: "quarter_start", metadata: { quarter: 1, sport: "soccer" }, created_at: at(-1000) },
  ];
  if (opts.ended) {
    evs.push({ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 1_200_000, sport: "soccer" }, created_at: at(0) });
  }
  const { error } = await admin
    .from("game_events")
    .insert(evs.map((e) => ({ ...e, game_id: game.id, created_by: ownerId })));
  if (error) throw new Error(`seed events: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { team, game, players };
}

async function eventsOf(admin: SupabaseClient, gameId: string): Promise<GameEvent[]> {
  const { data } = await admin.from("game_events").select("*").eq("game_id", gameId).order("created_at", { ascending: true });
  return (data ?? []) as GameEvent[];
}

test("soccer: the keeper is hurt mid-half and a bench kid goes in goal", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, players } = await soccerGame(admin, { count: 8, available: 8, name: "SOC-GKHURT" });
  const [keeper, , , , , , , benchKid] = players;
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const goal = page.getByRole("region", { name: "On field" }).getByRole("group", { name: "Keeper" });
  await expect(goal.getByTestId(`player-tile-${keeper.id}`)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId(`player-tile-${keeper.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /mark injured/i }).click();
  await page
    .getByRole("dialog", { name: /who comes on at/i })
    .getByRole("button", { name: new RegExp(benchKid.full_name, "i") })
    .click();

  await expect
    .poll(async () => {
      const evs = await eventsOf(admin, game.id);
      return evs.some(
        (e) =>
          e.type === "swap" &&
          (e.metadata as { on_player_id?: string; line?: string }).on_player_id === benchKid.id &&
          (e.metadata as { line?: string }).line === "gk",
      );
    })
    .toBe(true);
  await expect(goal.getByTestId(`player-tile-${benchKid.id}`)).toBeVisible({ timeout: 15_000 });
});

test("soccer: Swap keeper puts a field player in goal, and the keeper takes their place", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, players } = await soccerGame(admin, { count: 8, available: 8, name: "SOC-GKSWAP" });
  const [keeper, , , mid] = players;
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const field = page.getByRole("region", { name: "On field" });
  await expect(field.getByRole("group", { name: "Keeper" }).getByTestId(`player-tile-${keeper.id}`)).toBeVisible({
    timeout: 15_000,
  });

  await page.getByTestId(`player-tile-${keeper.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /replace keeper/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(mid.full_name, "i") }).click();

  await expect(field.getByRole("group", { name: "Keeper" }).getByTestId(`player-tile-${mid.id}`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(field.getByRole("group", { name: "Midfield" }).getByTestId(`player-tile-${keeper.id}`)).toBeVisible();
  // The screen shows the swap before it saves (optimistic): wait for the row.
  await expect
    .poll(async () => (await eventsOf(admin, game.id)).filter((e) => e.type === "field_zone_swap").length)
    .toBe(1);
});

test("soccer at half-time: a kid who turns up after the plan is edited still plays the second half", async ({ page }) => {
  const admin = createAdminClient();
  // 9 kids, 8 here; the 9th turns up at half-time.
  const { team, game, players } = await soccerGame(admin, {
    count: 9,
    available: 8,
    name: "SOC-HTLATE",
    ended: true,
    startedMinutesAgo: 25,
  });
  const late = players[8];
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });

  // Edit the plan: the bench kid and a defender trade places.
  const benchTile = page.getByRole("group", { name: "Bench" }).locator("[data-testid^='player-tile-']").first();
  const defTile = page.getByRole("group", { name: "Defence" }).locator("[data-testid^='player-tile-']").first();
  await benchTile.click();
  await defTile.click();

  // The late kid turns up, from the game settings sheet.
  await openGameSettings(page);
  await page.getByRole("button", { name: /add arrived player/i }).click();
  await page
    .getByRole("dialog", { name: /add arrived/i })
    .getByRole("button", { name: new RegExp(late.full_name, "i") })
    .click({ timeout: 5_000 });
  await expect
    .poll(async () => (await eventsOf(admin, game.id)).some((e) => e.type === "player_arrived" && e.player_id === late.id))
    .toBe(true);
  await closeGameSettings(page);
  await expect(page.getByRole("group", { name: "Bench" }).getByTestId(`player-tile-${late.id}`)).toBeVisible({
    timeout: 15_000,
  });

  await startFromBreak(page, /^start 2nd half/i);
  await expect(page.getByRole("button", { name: /^clock — h2, running$/i })).toBeVisible({ timeout: 15_000 });

  const evs = await eventsOf(admin, game.id);
  const h2 = [...evs].reverse().find((e) => e.type === "lineup_set")!.metadata as {
    lineup: { keeper: string; lines: Record<string, string[]>; bench: string[] };
  };
  const everyone = [h2.lineup.keeper, ...Object.values(h2.lineup.lines).flat(), ...h2.lineup.bench];
  expect(everyone).toContain(late.id);
  expect(new Set(everyone).size).toBe(9);
});

// ─── The live chrome, as AFL's (UX audit 23 Oct 2026) ───────────

async function teamNameOf(admin: SupabaseClient, teamId: string): Promise<string> {
  const { data } = await admin.from("teams").select("name").eq("id", teamId).single();
  return data!.name as string;
}

async function openLive(page: Page, teamId: string, gameId: string) {
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
}

/** Every save takes 4 s, as on a ground's patchy signal. */
async function slowSaves(page: Page, gameId: string) {
  await page.route(`**/games/${gameId}/live`, async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
}

test("soccer: the scorer sheet asks who scored, attack first, and a stray tap doesn't lose the goal", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, players } = await soccerGame(admin, {
    count: 8,
    available: 8,
    name: "SOC-SCORER",
    scoring: true,
    opponent: "Coogee Crabs",
  });
  const [keeper, , , , , , striker] = players;
  const teamName = await teamNameOf(admin, team.id);
  await openLive(page, team.id, game.id);

  await page.getByRole("button", { name: `Add goal, ${teamName}` }).click();
  const sheet = page.getByRole("dialog", { name: "Who scored?" });
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toContainText(/slot/i);
  // The striker heads the list; the keeper comes after every outfielder.
  const rows = sheet.getByRole("listitem");
  await expect(rows.first()).toContainText(striker.full_name);
  const order = await rows.allTextContents();
  const at = (name: string) => order.findIndex((t) => t.includes(name));
  for (const p of players.slice(1, 7)) expect(at(keeper.full_name), p.full_name).toBeGreaterThan(at(p.full_name));

  // A stray tap on the dimmed backdrop: the sheet (and the goal) stay.
  await page.mouse.click(8, 8);
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: new RegExp(`^${striker.full_name}\\b`) }).click();
  await expect(page.getByTestId("undo-strip")).toContainText(`${teamName} goal — ${striker.full_name}`);
  await expect
    .poll(async () => (await eventsOf(admin, game.id)).filter((e) => e.type === "goal").map((e) => e.player_id))
    .toEqual([striker.id]);
});

test("soccer: a tap-tap sub asks first and toasts; a goal, its undo and the sub show before the server saves", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { team, game, players } = await soccerGame(admin, {
    count: 8,
    available: 8,
    name: "SOC-OPTIM",
    scoring: true,
    opponent: "Coogee Crabs",
  });
  const [, def1, , , , , , benchKid] = players;
  await openLive(page, team.id, game.id);
  await slowSaves(page, game.id);

  const theirs = page.getByTestId("scorebug-team-name").last().locator("xpath=..");
  await page.getByRole("button", { name: "Add goal, Coogee Crabs" }).click();
  await expect(theirs).toContainText("1", { timeout: 1500 });
  const strip = page.getByTestId("undo-strip");
  await expect(strip).toContainText("Coogee Crabs goal", { timeout: 1500 });
  await strip.getByRole("button", { name: "Undo" }).click();
  await expect(theirs).not.toContainText("1", { timeout: 1500 });

  // Bench kid, then a defender: the same confirm AFL asks.
  await page.getByTestId(`player-tile-${benchKid.id}`).click();
  await page.getByTestId(`player-tile-${def1.id}`).click();
  const confirm = page.getByRole("dialog", { name: /manually sub/i });
  await expect(confirm).toContainText(`${benchKid.full_name} (Bench) for ${def1.full_name} (Defence)`);
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("swap-toast")).toContainText(`${def1.full_name} → ${benchKid.full_name}`, { timeout: 1500 });
  await expect(page.getByRole("group", { name: "Defence" }).getByTestId(`player-tile-${benchKid.id}`)).toBeVisible({
    timeout: 1500,
  });

  // All three save, in the coach's order, and the screen still agrees.
  await expect
    .poll(
      async () =>
        (await eventsOf(admin, game.id)).map((e) => e.type).filter((t) => ["opponent_goal", "score_undo", "swap"].includes(t)),
      { timeout: 30_000 },
    )
    .toEqual(["opponent_goal", "score_undo", "swap"]);
  await page.unroute(`**/games/${game.id}/live`);
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByRole("group", { name: "Defence" }).getByTestId(`player-tile-${benchKid.id}`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(theirs).toContainText("0");
});

test("soccer: long-press knows an on-field kid's line and lent minutes; Game settings sits in the row", async ({ page }) => {
  const admin = createAdminClient();
  // p3 (midfield) was lent for 6 minutes in last week's game.
  const { team, game, players } = await soccerGame(admin, { count: 8, available: 8, name: "SOC-LONGP", lentBefore: { 3: 6 } });
  const mid = players[3];
  await openLive(page, team.id, game.id);

  await page.getByTestId(`player-tile-${mid.id}`).click({ delay: 600 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: /switch player/i })).toContainText(/bench player to sub off/i);
  await expect(sheet.getByRole("button", { name: /lend to opposition/i })).toContainText("Season total: 6m");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);

  // Game settings: the sub interval, mid-game, as AFL's.
  await page.getByRole("button", { name: "Game settings", exact: true }).click();
  const settings = page.getByRole("dialog").filter({ hasText: "Sub interval" });
  await expect(settings).toBeVisible();
  await expect(settings.getByText(/players on field/i)).toHaveCount(0);
  await settings.getByLabel("Sub interval").fill("5");
  await settings.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(async () => (await admin.from("games").select("sub_interval_seconds").eq("id", game.id).single()).data?.sub_interval_seconds)
    .toBe(300);
});

// Usability pass, 26 Oct 2026: the scorer sheet had only the kids and
// "Not sure who". An own goal (theirs, into their own net) counts for
// us, credits nobody, and the game page lists it apart.
test("soccer: an own goal counts for us and credits nobody", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game } = await soccerGame(admin, {
    count: 8,
    available: 8,
    name: "SOC-OG",
    scoring: true,
    opponent: "Bondi Barnacles",
  });
  const teamName = await teamNameOf(admin, team.id);
  await openLive(page, team.id, game.id);

  await page.getByRole("button", { name: `Add goal, ${teamName}` }).click();
  const sheet = page.getByRole("dialog", { name: "Who scored?" });
  await sheet.getByRole("button", { name: /^Own goal \(theirs\)/ }).click();
  await expect(page.getByTestId("undo-strip")).toContainText(`${teamName} goal (own goal)`);
  await expect
    .poll(async () =>
      (await eventsOf(admin, game.id))
        .filter((e) => e.type === "goal")
        .map((e) => ({ player: e.player_id, own: (e.metadata as { own_goal?: boolean }).own_goal })),
    )
    .toEqual([{ player: null, own: true }]);

  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await expect(page.getByTestId("own-goal-row")).toContainText("Own goals (theirs)", { timeout: 15_000 });
  await expect(page.getByTestId("own-goal-row")).toContainText("1 goal");
  await expect(page.getByTestId("no-scorer-row")).toHaveCount(0);
});
