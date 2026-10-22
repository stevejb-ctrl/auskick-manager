// ─── Touch football: a U11 mixed game, end to end ──────────────
// Four-sports plan, track B. A touch U11 mixed team (TFA rule 5.4: at
// most 3 boys, at least 1 boy and 1 girl) plays a game on its phone:
//
//   1. The lineup asks who counts as a girl or a boy for the one kid with
//      no group, and won't start until it knows.
//   2. Six on (3 boys and 3 girls, in lanes 2-2-2), a bench of 5 boys and
//      1 girl.
//   3. The sub falls due: the banner says to make the change next time
//      you have the ball, and every suggested sub is girl for girl, boy
//      for boy.
//   4. A girl is hurt: only the girl on the bench can replace her.
//   5. Another girl is hurt with no girl left: the field shrinks to 5
//      ("You can field 5: 3 boys and 2 girls"), recorded as roster_shrink.
//   6. The break plans the second half on five; a try each way (a try is
//      1 in touch, whoever scores); full time; every event carries the
//      team's sport; the game page reports by group.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { startFromBreak } from "../helpers/break";

test.describe.configure({ mode: "serial" });

interface TouchLineupMeta {
  lines: { middle: string[]; link: string[]; wing: string[]; field: string[] };
  bench: string[];
}

async function ownerIdOf() {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  return { admin, ownerId: su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id };
}

/** Select a kid on the field and open their actions from the dock. */
async function openActions(page: Page, playerId: string) {
  await page.getByTestId(`player-tile-${playerId}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /player actions/i }).click({ timeout: 5_000 });
}

/** The player ids of the tiles in a region, in the order drawn. */
const tileIds = (where: Locator) =>
  where
    .locator("[data-testid^='player-tile-']")
    .evaluateAll((els) => els.map((e) => (e.getAttribute("data-testid") ?? "").slice("player-tile-".length)));

const onField = (lu: TouchLineupMeta) => [...lu.lines.middle, ...lu.lines.link, ...lu.lines.wing, ...lu.lines.field];

test("touch U11 mixed: the Girl/Boy prompt, the cap kept through subs, a girl hurt twice and the field shrinks", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  const { admin, ownerId } = await ownerIdOf();
  const team = await makeTeam(admin, {
    ownerId,
    sport: "touch",
    ageGroup: "U11",
    name: `TCH-MIX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin
    .from("teams")
    .update({ track_scoring: true, mixed_max_boys: 3, mixed_min_girls: 1, mixed_min_boys: 1 })
    .eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  // Alicia, Camille, Elena and Gemma are girls; the other eight boys.
  // Gemma has no group yet: the lineup asks.
  const GIRLS = new Set(["Alicia", "Camille", "Elena", "Gemma"]);
  const groupOf = new Map(players.map((p) => [p.id, GIRLS.has(p.full_name) ? "girl" : "boy"]));
  for (const p of players) {
    if (p.full_name === "Gemma") continue;
    await admin.from("players").update({ mixed_group: groupOf.get(p.id) }).eq("id", p.id);
  }
  const gemma = players.find((p) => p.full_name === "Gemma")!;
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Merewether Mariners" });
  expect(game.on_field_size).toBe(6);
  // A sub every game minute, on a 4× clock: due every 15 seconds, and the
  // 20-minute half lasts five real minutes.
  await admin.from("games").update({ sub_interval_seconds: 60, clock_multiplier: 4 }).eq("id", game.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );

  const lineup = async (): Promise<TouchLineupMeta> => {
    const { data } = await admin
      .from("game_events")
      .select("metadata, created_at")
      .eq("game_id", game.id)
      .eq("type", "lineup_set")
      .order("created_at", { ascending: false })
      .limit(1);
    return (data?.[0]?.metadata as { lineup: TouchLineupMeta }).lineup;
  };
  const count = async (type: string) =>
    ((await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", type)).data ?? []).length;
  /** Who's on the field now, from the last lineup and the swaps since. */
  const fieldNow = async (): Promise<Set<string>> => {
    const { data } = await admin
      .from("game_events")
      .select("type, player_id, metadata, created_at")
      .eq("game_id", game.id)
      .in("type", ["lineup_set", "swap", "injury"])
      .order("created_at");
    let on = new Set<string>();
    for (const e of data ?? []) {
      const m = e.metadata as { lineup?: TouchLineupMeta; off_player_id?: string | null; on_player_id?: string; injured?: boolean };
      if (e.type === "lineup_set" && m.lineup) on = new Set(onField(m.lineup));
      if (e.type === "swap") {
        if (m.off_player_id) on.delete(m.off_player_id);
        if (m.on_player_id) on.add(m.on_player_id);
      }
      if (e.type === "injury" && m.injured !== false && e.player_id) on.delete(e.player_id);
    }
    return on;
  };
  const boysOf = (ids: Iterable<string>) => Array.from(ids).filter((id) => groupOf.get(id) === "boy").length;
  const girlsOf = (ids: Iterable<string>) => Array.from(ids).filter((id) => groupOf.get(id) === "girl").length;

  // ─── 1. The lineup asks for Gemma's group ─────────────────────
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 11 starting side/i })).toBeVisible({ timeout: 15_000 });
  const prompt = page.getByTestId("touch-mixed-prompt");
  await expect(prompt).toContainText("Gemma");
  await expect(prompt).not.toContainText("Alicia");
  await prompt.getByRole("radiogroup", { name: "Gemma counts as" }).getByRole("radio", { name: "Girl" }).click();
  await expect
    .poll(async () => (await admin.from("players").select("mixed_group").eq("id", gemma.id).single()).data?.mixed_group)
    .toBe("girl");
  await expect(prompt).toHaveCount(0, { timeout: 10_000 });

  // ─── 2. Six on in lanes, a bench of six ───────────────────────
  const field = page.getByRole("region", { name: "On field" });
  await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(6);
  for (const lane of ["Middles", "Links", "Wings"]) {
    await expect(field.getByRole("group", { name: lane }).locator("[data-testid^='player-tile-']")).toHaveCount(2);
  }
  const bench = page.getByRole("group", { name: "Bench" });
  await expect(bench.locator("[data-testid^='player-tile-']")).toHaveCount(6);
  await expect(page.getByText("Boys and girls are evened separately under the mixed rule.").first()).toBeVisible();

  // The rule check, as AFL's lineup has (audit 23 Oct, P1): all kept; a
  // swap that puts a fourth boy on shows at once, and Start refuses it;
  // Suggest again clears the stale error with the side.
  const ruleCheck = page.getByTestId("rule-check-summary");
  await expect(ruleCheck).toHaveText("All rules kept");
  const girlOnField = (await tileIds(field)).find((id) => groupOf.get(id) === "girl")!;
  const boyOnBench = (await tileIds(bench)).find((id) => groupOf.get(id) === "boy")!;
  await page.getByTestId(`player-tile-${girlOnField}`).click();
  await page.getByTestId(`player-tile-${boyOnBench}`).click();
  await expect(ruleCheck).toHaveText("Too many boys on the field (4); the mixed rule allows 3.");
  await page.getByRole("button", { name: /^start h1$/i }).click();
  const startError = page.getByRole("alert").filter({ hasText: /too many boys/i });
  await expect(startError).toBeVisible();
  await page.getByRole("button", { name: /game settings/i }).click();
  await page.getByRole("button", { name: "Suggest again" }).click();
  await expect(startError).toHaveCount(0);
  await expect(ruleCheck).toHaveText("All rules kept");

  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });

  const h1 = await lineup();
  expect(onField(h1)).toHaveLength(6);
  expect(boysOf(onField(h1))).toBe(3);
  expect(girlsOf(onField(h1))).toBe(3);
  expect(boysOf(h1.bench)).toBe(5);
  expect(girlsOf(h1.bench)).toBe(1);
  // Nobody was short, so the field kept its size.
  expect(await count("roster_shrink")).toBe(0);

  // ─── 3. Sub due: the card says touch's own words, and the cap kept ─
  // The sub card is the alert (one voice, in every sport).
  await expect(page.getByRole("alert").filter({ hasText: /sub due/i })).toContainText(
    /make the change next time you have the ball/i,
    { timeout: 30_000 },
  );
  // Every swap in the batch lands before anything is read back.
  const applyAll = page.getByRole("button", { name: /^make (all \d+ swaps|this swap)$/i });
  const batch = Number(((await applyAll.textContent({ timeout: 10_000 })) ?? "").match(/all (\d+)/)?.[1] ?? 1);
  await applyAll.click();
  await expect.poll(() => count("swap"), { timeout: 15_000 }).toBe(batch);
  const { data: swaps } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap");
  for (const s of swaps ?? []) {
    const m = s.metadata as { off_player_id: string; on_player_id: string };
    expect(groupOf.get(m.on_player_id), "a sub comes on for their own group").toBe(groupOf.get(m.off_player_id));
  }
  const afterSubs = await fieldNow();
  expect(boysOf(afterSubs)).toBeLessThanOrEqual(3);
  expect(afterSubs.size).toBe(6);

  // ─── 4. A girl is hurt: only the bench girl can replace her ───
  const girlsOn = Array.from(afterSubs).filter((id) => groupOf.get(id) === "girl");
  const benchGirl = players.find((p) => groupOf.get(p.id) === "girl" && !afterSubs.has(p.id))!;
  const hurt1 = girlsOn[0];
  const swapsBefore = await count("swap");
  await openActions(page, hurt1);
  await page.getByRole("button", { name: /mark injured/i }).click({ timeout: 5_000 });
  const replace = page.getByRole("dialog");
  await expect(replace).toContainText(benchGirl.full_name, { timeout: 10_000 });
  for (const p of players.filter((q) => groupOf.get(q.id) === "boy" && !afterSubs.has(q.id))) {
    await expect(replace.getByRole("button", { name: new RegExp(p.full_name) })).toHaveCount(0);
  }
  await replace.getByRole("button").filter({ hasText: /suggested/i }).click();
  await expect.poll(() => count("swap"), { timeout: 15_000 }).toBe(swapsBefore + 1);
  const { data: lastSwap } = await admin
    .from("game_events")
    .select("metadata")
    .eq("game_id", game.id)
    .eq("type", "swap")
    .order("created_at", { ascending: false })
    .limit(1);
  expect((lastSwap?.[0]?.metadata as { on_player_id: string }).on_player_id).toBe(benchGirl.id);

  // The field shows her on before the next tap (the phone acts on what it shows).
  await expect(field.getByTestId(`player-tile-${benchGirl.id}`)).toBeVisible({ timeout: 15_000 });

  // ─── 5. Another girl hurt, none left: the field shrinks to five ─
  const nowOn = await fieldNow();
  const hurt2 = Array.from(nowOn).find((id) => groupOf.get(id) === "girl" && id !== hurt1)!;
  await openActions(page, hurt2);
  await page.getByRole("button", { name: /mark injured/i }).click({ timeout: 5_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => count("injury"), { timeout: 15_000 }).toBe(2);
  await expect.poll(() => count("roster_shrink"), { timeout: 15_000 }).toBe(1);
  const { data: shrink } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "roster_shrink").single();
  expect((shrink?.metadata as { on_field_size: number; sport: string })).toMatchObject({ on_field_size: 5, sport: "touch" });
  await expect(page.getByTestId("touch-field-size-banner")).toContainText("You can field 5: 3 boys and 2 girls", { timeout: 15_000 });
  await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(5);

  // ─── 6. The break plans five; a try each way; full time ────────
  await page.getByRole("button", { name: /^clock — h1/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  // Half-time is the shared break screen.
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  await startFromBreak(page, /^start 2nd half/i);
  await expect(page.getByRole("button", { name: /^clock — h2/i })).toBeVisible({ timeout: 15_000 });
  const h2 = await lineup();
  expect(onField(h2)).toHaveLength(5);
  expect(boysOf(onField(h2))).toBe(3);
  expect(girlsOf(onField(h2))).toBe(2);
  expect(h2.bench).toEqual(expect.arrayContaining([hurt1, hurt2]));

  // A try by a girl is 1 in touch (no girl's try).
  const scorer = onField(h2).find((id) => groupOf.get(id) === "girl")!;
  await page.getByTestId(`player-tile-${scorer}`).click({ timeout: 10_000 });
  await page.getByTestId("touch-dock-try").click({ timeout: 5_000 });
  await expect.poll(() => count("try")).toBe(1);
  expect(await count("girls_try")).toBe(0);
  await page.getByRole("button", { name: "Add a try, Merewether Mariners" }).click({ timeout: 5_000 });
  await expect.poll(() => count("opponent_try")).toBe(1);

  await page.getByRole("button", { name: /^clock — h2/i }).click();
  await page.getByRole("button", { name: /^end h2 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*2$/i }).click();
  await page.getByRole("button", { name: /finish game/i }).click({ timeout: 10_000 });
  await expect.poll(() => count("game_finalised")).toBe(1);
  await expect
    .poll(async () => (await admin.from("games").select("status").eq("id", game.id).single()).data?.status)
    .toBe("completed");
  const summary = page.locator("#touch-game-summary-text");
  await expect(summary).toContainText("Merewether Mariners", { timeout: 15_000 });
  await expect(summary).not.toContainText(/girl|boy/i);

  // Every event touch's actions write carries the team's sport.
  const { data: events } = await admin
    .from("game_events")
    .select("type, metadata")
    .eq("game_id", game.id)
    .in("type", ["lineup_set", "quarter_start", "quarter_end", "swap", "try", "opponent_try", "roster_shrink", "game_finalised"]);
  expect(events?.length).toBeGreaterThan(0);
  for (const e of events ?? []) expect((e.metadata as { sport?: string }).sport, e.type as string).toBe("touch");

  // The finished game's page: try scorers in touch's words, and the
  // report's floor compared within each group.
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await waitForHydration(page);
  await expect(page.getByText("Who got it down")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/boys and girls are evened separately under the mixed rule/i).first()).toBeVisible();

  expect(errors).toEqual([]);
});
