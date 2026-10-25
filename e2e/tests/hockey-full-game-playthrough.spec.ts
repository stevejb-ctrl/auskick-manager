// ─── Hockey full-game playthroughs ───────────────────────────────
// Four-sports plan, track A: hockey on the soccer family's engine, in
// hockey's own words and on a hockey pitch, with keepers changed only at
// a break (keeper kit takes minutes to put on).
//
//   1. U9, 7 a side in halves, keeper turns: no mid-half "Replace
//      keeper" and no tap-swap into goal; two minutes before half-time
//      the next keeper hears to kit up, and the break puts them in goal,
//      named first.
//   2. U13, 11 a side in 4 × 15 quarters, named keepers: they rotate
//      quarter by quarter ("Keeper kit: A → B"), the breaks are called
//      as AFL's are, and an injury still replaces the keeper mid-quarter.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { pickBreakStrategy, startFromBreak } from "../helpers/break";

test.describe.configure({ mode: "serial" });

interface HockeyLineupMeta {
  keeper: string | null;
  lines: { def: string[]; mid: string[]; att: string[]; field: string[] };
  bench: string[];
}

async function superAdminId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

function helpers(admin: SupabaseClient, gameId: string) {
  return {
    lineup: async (): Promise<HockeyLineupMeta> => {
      const { data } = await admin
        .from("game_events")
        .select("metadata, created_at")
        .eq("game_id", gameId)
        .eq("type", "lineup_set")
        .order("created_at", { ascending: false })
        .limit(1);
      return (data?.[0]?.metadata as { lineup: HockeyLineupMeta }).lineup;
    },
    count: async (type: string) =>
      ((await admin.from("game_events").select("id").eq("game_id", gameId).eq("type", type)).data ?? []).length,
  };
}

/** End the period in play from the clock menu ("End Q1 now", then confirm). */
async function endPeriod(page: Page, tag: string) {
  await page.getByRole("button", { name: new RegExp(`^clock — ${tag}, running$`, "i") }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: new RegExp(`^end ${tag} now$`, "i") }).click();
  await page.getByRole("button", { name: new RegExp(`^end\\s*${tag[0]}\\s*${tag.slice(1)}$`, "i") }).click();
}

/** Start the next period from the shared break screen ("Start 2nd half" or "Start Q2", then its sheet). */
async function startPeriod(page: Page, tag: string) {
  const name = tag === "H2" ? "2nd half" : tag;
  await expect(page.getByRole("heading", { name: new RegExp(`^${name} lineup$`, "i") })).toBeVisible({ timeout: 15_000 });
  await startFromBreak(page, new RegExp(`^start ${name}`, "i"));
  await expect(page.getByRole("button", { name: new RegExp(`^clock — ${tag}, running$`, "i") })).toBeVisible({
    timeout: 15_000,
  });
}

test("hockey U9: 7 a side in halves, keepers change only at the break, with a kit-up heads-up", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);

  const team = await makeTeam(admin, {
    ownerId,
    sport: "hockey",
    ageGroup: "U9",
    name: `HOC-U9-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Waratah Wombats" });
  expect(game.on_field_size).toBe(7);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const firstName = (id: string) => players.find((p) => p.id === id)!.full_name.split(" ")[0];
  const { lineup, count } = helpers(admin, game.id);

  // ─── Pre-kickoff: seven on a hockey pitch, in hockey's words ──
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 9 starting lineup/i })).toBeVisible({ timeout: 15_000 });
  const field = page.getByRole("region", { name: "On field" });
  await expect(field).toHaveAttribute("data-surface", "hockey");
  await expect(field.getByTestId("hockey-pitch-markings")).toBeAttached();
  await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(7);
  await expect(field.getByRole("group", { name: "Keeper" }).locator("[data-testid^='player-tile-']")).toHaveCount(1);
  // 2-2-2: defenders, midfield, strikers.
  for (const line of ["Defenders", "Midfield", "Strikers"]) {
    await expect(field.getByRole("group", { name: line }).locator("[data-testid^='player-tile-']")).toHaveCount(2);
  }
  await expect(field.getByRole("group", { name: "Strikers" })).toContainText("STR");
  await expect(page.getByRole("group", { name: "Bench" }).locator("[data-testid^='player-tile-']")).toHaveCount(2);

  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
  const h1 = await lineup();
  const h1Keeper = h1.keeper!;
  expect(h1Keeper).toBeTruthy();

  // ─── No mid-half keeper change ─────────────────────────────────
  // The keeper's actions offer no "Replace keeper"…
  await page.getByTestId(`player-tile-${h1Keeper}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^player actions/i }).click({ timeout: 5_000 });
  const actions = page.getByRole("dialog");
  await expect(actions.getByRole("button", { name: /mark injured/i })).toBeVisible();
  await expect(actions.getByRole("button", { name: /replace keeper/i })).toHaveCount(0);
  await actions.getByRole("button", { name: /^(close|cancel)$/i }).first().click();
  await expect(actions).toHaveCount(0);
  // …and a tap-swap with the keeper is refused, with the reason.
  await page.getByTestId(`player-tile-${h1Keeper}`).click({ timeout: 10_000 });
  await page.getByTestId(`player-tile-${h1.bench[0]}`).click({ timeout: 10_000 });
  await expect(page.getByText(/the keeper changes at the break: kit takes a few minutes to put on/i)).toBeVisible();
  expect(await count("swap")).toBe(0);
  expect((await lineup()).keeper).toBe(h1Keeper);

  // ─── The live chrome, as AFL's ─────────────────────────────────
  // An outfielder's actions know they're on the field (not "bring them on")…
  const outfielder = [...h1.lines.def, ...h1.lines.mid, ...h1.lines.att][0];
  await page.getByTestId(`player-tile-${outfielder}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^player actions/i }).click({ timeout: 5_000 });
  await expect(actions.getByRole("button", { name: /switch player/i })).toContainText(/bench player to sub off/i);
  await actions.getByRole("button", { name: /^(close|cancel)$/i }).first().click();
  await expect(actions).toHaveCount(0);
  // …and Game settings (the sub interval) sits in the row.
  await expect(page.getByRole("button", { name: "Game settings", exact: true })).toBeVisible();

  // ─── Two minutes before half-time: the next keeper kits up ────
  // Wind the half on to 18:30 of 20:00 (every event so far moves back).
  const { data: sofar } = await admin.from("game_events").select("id, created_at").eq("game_id", game.id);
  const back = (20 * 60 - 90) * 1000;
  for (const e of sofar ?? []) {
    await admin
      .from("game_events")
      .update({ created_at: new Date(Date.parse(e.created_at as string) - back).toISOString() })
      .eq("id", e.id);
  }
  await page.reload();
  await waitForHydration(page);
  const kitUp = page.getByTestId("keeper-kit-up");
  await expect(kitUp).toContainText(/'s in goal next half: start kitting up\./i, { timeout: 15_000 });
  const announced = (await kitUp.textContent())!.split("'s in goal")[0].trim();
  expect(announced).not.toBe(firstName(h1Keeper));

  // ─── Half-time: the announced kid goes in goal ────────────────
  // The shared break screen's Keeper zone holds them (they've been
  // kitting up); last half's keeper's tile reads where they came from.
  await endPeriod(page, "H1");
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("group", { name: "Keeper" })).toContainText(announced, { timeout: 15_000 });
  await expect(page.getByTestId(`player-tile-${h1Keeper}`)).toContainText(/from keeper/i);
  // Every plan keeps them there (audit, 23 Oct 2026: Repeat put last
  // half's keeper back in goal). Manual starts empty.
  for (const plan of ["Repeat", "Rotate", "Suggested"] as const) {
    await pickBreakStrategy(page, plan);
    await expect(page.getByRole("group", { name: "Keeper" })).toContainText(announced);
    await expect(page.getByRole("group", { name: "Keeper" }).getByTestId(`player-tile-${h1Keeper}`)).toHaveCount(0);
  }

  await startPeriod(page, "H2");
  const h2 = await lineup();
  expect(firstName(h2.keeper!)).toBe(announced);
  // Everyone has a turn: last half's keeper plays out in the field.
  expect([...h2.lines.def, ...h2.lines.mid, ...h2.lines.att]).toContain(h1Keeper);

  await endPeriod(page, "H2");
  await page.getByRole("button", { name: /finish game/i }).click({ timeout: 10_000 });
  await expect.poll(() => count("game_finalised")).toBe(1);
  // U9 keeps no score; the share text is hockey's.
  const summary = page.locator("#soccer-game-summary-text");
  await expect(summary).toContainText("🏑 Full time — ", { timeout: 15_000 });
  await expect(summary).toContainText(/in goal/);

  const { data: events } = await admin.from("game_events").select("type, metadata").eq("game_id", game.id);
  for (const e of (events ?? []).filter((x) => ["lineup_set", "quarter_start", "quarter_end", "game_finalised"].includes(x.type as string))) {
    expect((e.metadata as { sport?: string }).sport, e.type as string).toBe("hockey");
  }

  expect(errors).toEqual([]);
});

test("hockey U13: 4 × 15 quarters, named keepers rotate at the breaks, an injury still replaces the keeper", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);

  const teamName = `HOC-U13-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const team = await makeTeam(admin, {
    ownerId,
    sport: "hockey",
    ageGroup: "U13",
    name: teamName,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  // Two named keepers (How we play: home Keeper), in rotation order.
  const [keeperA, keeperB] = [players[5], players[9]];
  await admin.from("player_position_prefs").insert([
    { team_id: team.id, player_id: keeperA.id, line: "gk", kind: "home", rank: 0 },
    { team_id: team.id, player_id: keeperB.id, line: "gk", kind: "home", rank: 1 },
  ]);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kingston Kites" });
  expect(game.on_field_size).toBe(11);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const firstName = (id: string) => players.find((p) => p.id === id)!.full_name.split(" ")[0];
  const { lineup, count } = helpers(admin, game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 13 starting lineup/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "On field" }).locator("[data-testid^='player-tile-']")).toHaveCount(11);
  // The first named keeper starts.
  const startCard = page.getByRole("region", { name: "Keeper" });
  await expect(startCard).toContainText(`${firstName(keeperA.id)} starts in goal.`);

  await page.getByRole("button", { name: /^start q1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start q1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — q1, running$/i })).toBeVisible({ timeout: 15_000 });
  expect((await lineup()).keeper).toBe(keeperA.id);

  // ─── Quarter time: the keeper kit goes to the other named keeper ─
  await endPeriod(page, "Q1");
  await expect(page.getByRole("heading", { name: /^q2 lineup$/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("group", { name: "Keeper" })).toContainText(firstName(keeperB.id));
  await startPeriod(page, "Q2");
  expect((await lineup()).keeper).toBe(keeperB.id);

  // ─── An injury still replaces the keeper mid-quarter ──────────
  const benchKid = (await lineup()).bench[0];
  await page.getByTestId(`player-tile-${keeperB.id}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /^player actions/i }).click({ timeout: 5_000 });
  await page.getByRole("dialog").getByRole("button", { name: /mark injured/i }).click({ timeout: 5_000 });
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(firstName(benchKid)) }).first().click({ timeout: 10_000 });
  await expect.poll(() => count("swap")).toBe(1);
  const { data: swap } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap").single();
  expect(swap?.metadata).toMatchObject({ off_player_id: keeperB.id, on_player_id: benchKid, line: "gk" });
  await expect(
    page.getByRole("region", { name: "On field" }).getByRole("group", { name: "Keeper" }).getByTestId(`player-tile-${benchKid}`),
  ).toBeVisible({ timeout: 15_000 });

  // ─── A goal: the scorer sheet survives a stray tap (UX audit P1) ─
  await page.getByRole("button", { name: `Add goal, ${teamName}` }).click({ timeout: 5_000 });
  const scorerSheet = page.getByRole("dialog", { name: "Who scored?" });
  await expect(scorerSheet).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(scorerSheet).toBeVisible();
  await scorerSheet.getByRole("button", { name: /not sure who/i }).click();
  await expect(page.getByTestId("undo-strip")).toContainText(`${teamName} goal`);
  await expect.poll(() => count("goal")).toBe(1);

  // ─── Half time (after Q2), then three-quarter time ────────────
  await endPeriod(page, "Q2");
  await expect(page.getByRole("heading", { name: /^q3 lineup$/i })).toBeVisible({ timeout: 15_000 });
  // The hurt keeper is out: the other named keeper goes back in.
  await expect(page.getByRole("group", { name: "Keeper" })).toContainText(firstName(keeperA.id));
  await startPeriod(page, "Q3");
  expect((await lineup()).keeper).toBe(keeperA.id);
  await endPeriod(page, "Q3");
  await startPeriod(page, "Q4");
  await endPeriod(page, "Q4");

  // Full time: the score by quarter, then finish. No live chips or undo
  // strip; the review's buttons name their team and are thumb-sized.
  await expect(page.getByRole("columnheader", { name: "Quarter" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("undo-strip")).toHaveCount(0);
  for (const side of [teamName, "Kingston Kites"]) {
    const add = page.getByRole("button", { name: `Add goal, ${side}` });
    await expect(add).toHaveCount(1);
    expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: /finish game/i }).click({ timeout: 10_000 });
  await expect.poll(() => count("game_finalised")).toBe(1);
  await expect(page.locator("#soccer-game-summary-text")).toContainText("🏑 Full time", { timeout: 15_000 });
  const { data: ends } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "quarter_end");
  expect((ends ?? []).map((e) => (e.metadata as { quarter: number }).quarter).sort()).toEqual([1, 2, 3, 4]);

  // The game's report and the season stats read in hockey's words.
  await gotoStable(page, `/teams/${team.id}/stats`);
  await waitForHydration(page);
  await expect(page.getByText(/isn't built yet|something went wrong/i)).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Str" }).first()).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
});
