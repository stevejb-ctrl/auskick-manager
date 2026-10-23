// ─── Oztag: two games on the touch family's engine ─────────────
// Four-sports plan, track B.
//
//   1. A U10 single-gender team under Rotate positions: eight on in
//      Oztag's lanes (2 middles, 4 links, 2 wings), no Girl/Boy anywhere,
//      and at half-time every kid who played a lane moves to another;
//      "Move to wings" moves a kid mid-half.
//   2. A U10 mixed team (ITF rule 3.3: at most 4 boys, at least 1 girl):
//      a try credited to a girl records a girl's try and scores 2, a boy's
//      scores 1; the opponent's chips are +T and +2 (girl), on one row
//      beside ours at 390 px; "Not sure who — a girl's try" counts 2
//      with no scorer, and undo takes it back.
// And AFL's live chrome (UX audit 23 Oct 2026, "Drift from AFL"): the
// long-press sheet knows a kid's lane and the season's lent minutes, in
// the lineup and in play; the scorer sheet asks "Who scored?" and keeps
// the try on a stray tap; the undo strip says what was scored; and a
// try, its undo and a sub show before a slow save lands.

import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
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

const laneOf = (lu: TouchLineupMeta, id: string) =>
  (["middle", "link", "wing", "field"] as const).find((l) => lu.lines[l].includes(id)) ?? null;

/** Last week's finished game, where each of these kids was lent for `mins` minutes. */
async function lentLastWeek(admin: SupabaseClient, opts: { teamId: string; ownerId: string; playerIds: string[]; mins: number }) {
  const before = await makeGame(admin, {
    teamId: opts.teamId,
    ownerId: opts.ownerId,
    scheduledAt: new Date(Date.now() - 7 * 86400_000).toISOString(),
  });
  const at = (s: number) => new Date(Date.now() - 7 * 86400_000 + s * 1000).toISOString();
  const lent = opts.playerIds.flatMap((id, k) => [
    { type: "player_loan", player_id: id, metadata: { loaned: true, quarter: 1, elapsed_ms: 0, sport: "oztag" }, created_at: at(10 + k) },
    {
      type: "player_loan",
      player_id: id,
      metadata: { loaned: false, quarter: 1, elapsed_ms: opts.mins * 60_000, sport: "oztag" },
      created_at: at(100 + k),
    },
  ]);
  const { error } = await admin.from("game_events").insert(
    [
      { type: "quarter_start", metadata: { quarter: 1, sport: "oztag" }, created_at: at(1) },
      ...lent,
      { type: "game_finalised", metadata: { quarter: 2, elapsed_ms: 900_000, sport: "oztag" }, created_at: at(200) },
    ].map((e) => ({ ...e, game_id: before.id, created_by: opts.ownerId })),
  );
  if (error) throw new Error(`seed earlier game: ${error.message}`);
  await admin.from("games").update({ status: "completed" }).eq("id", before.id);
}

/** A kid's long-press sheet knows they're on the field and their lent minutes; then it closes. */
async function expectLongPressSheet(page: Page, playerId: string, lentMins: number) {
  await page.getByTestId(`player-tile-${playerId}`).click({ delay: 600 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: /switch player/i })).toContainText(/swap places, or a bench player to sub off/i);
  await expect(sheet.getByRole("button", { name: /lend to opposition/i })).toContainText(`Season total: ${lentMins}m`);
  await sheet.getByRole("button", { name: /^cancel$/i }).click();
  await expect(sheet).toHaveCount(0);
}

test("oztag U10 single-gender: lanes 2-4-2, no Girl/Boy, lanes rotate at half-time, a lane move", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  const { admin, ownerId } = await ownerIdOf();
  const team = await makeTeam(admin, {
    ownerId,
    sport: "oztag",
    ageGroup: "U10",
    name: `OZT-LANES-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // Oztag's ★ is Minutes only; this team rotates through touch's lanes.
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "rotate-positions" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  // Every kid was lent for 6 minutes last week: the long-press sheets say so.
  await lentLastWeek(admin, { teamId: team.id, ownerId, playerIds: players.map((p) => p.id), mins: 6 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Lake Macquarie Lightning" });
  expect(game.on_field_size).toBe(8);
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

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 10 starting side/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("touch-mixed-prompt")).toHaveCount(0);
  const field = page.getByRole("region", { name: "On field" });
  await expect(field.getByRole("group", { name: "Middles" }).locator("[data-testid^='player-tile-']")).toHaveCount(2);
  await expect(field.getByRole("group", { name: "Links" }).locator("[data-testid^='player-tile-']")).toHaveCount(4);
  await expect(field.getByRole("group", { name: "Wings" }).locator("[data-testid^='player-tile-']")).toHaveCount(2);
  await expect(page.getByRole("group", { name: "Bench" }).locator("[data-testid^='player-tile-']")).toHaveCount(4);
  await expect(page.getByText(/evened separately/i)).toHaveCount(0);
  // The lineup's long-press sheet, as in play: the kid's lane, the season's lent minutes.
  const wingTile = field.getByRole("group", { name: "Wings" }).locator("[data-testid^='player-tile-']").first();
  const wingId = ((await wingTile.getAttribute("data-testid")) ?? "").slice("player-tile-".length);
  await expectLongPressSheet(page, wingId, 6);

  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  // The start waits for Oztag's own cue, as its break does.
  await expect(page.getByRole("dialog").filter({ hasText: /when the whistle goes/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
  const h1 = await lineup();
  expect({ m: h1.lines.middle.length, l: h1.lines.link.length, w: h1.lines.wing.length, f: h1.lines.field.length }).toEqual({
    m: 2,
    l: 4,
    w: 2,
    f: 0,
  });

  // The half ends (it credits the whole 15 minutes); the break moves
  // every kid who played a lane to another.
  await page.getByRole("button", { name: /^clock — h1/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  // Half-time is the shared break screen: tiles say which lane each kid came from.
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/From (Middle|Link|Wing)/).first()).toBeVisible();
  await startFromBreak(page, /^start 2nd half/i);
  await expect(page.getByRole("button", { name: /^clock — h2, running$/i })).toBeVisible({ timeout: 15_000 });
  const h2 = await lineup();
  // The bench's four start the second half, with four who played.
  for (const id of h1.bench) expect(laneOf(h2, id), "a kid who sat starts").not.toBeNull();
  const again = [...h2.lines.middle, ...h2.lines.link, ...h2.lines.wing].filter((id) => laneOf(h1, id) !== null);
  expect(again.length).toBeGreaterThan(0);
  for (const id of again) expect(laneOf(h2, id), "a new lane for the second half").not.toBe(laneOf(h1, id));

  // Mid-half: a middle moves to the wings. First, their long-press sheet.
  const middle = h2.lines.middle[0];
  await expectLongPressSheet(page, middle, 6);
  await page.getByTestId(`player-tile-${middle}`).click({ timeout: 10_000 });
  await page.getByRole("button", { name: /player actions/i }).click({ timeout: 5_000 });
  await page.getByTestId("touch-move-wing").click({ timeout: 5_000 });
  await expect.poll(() => count("field_zone_swap")).toBe(1);
  const { data: move } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "field_zone_swap").single();
  expect(move?.metadata).toMatchObject({ player_a_id: middle, zone_a: "middle", zone_b: "wing", sport: "oztag" });
  await expect(field.getByRole("group", { name: "Wings" }).getByTestId(`player-tile-${middle}`)).toBeVisible({ timeout: 10_000 });

  // A single-gender team asks nobody's group, anywhere.
  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  await expect(page.getByText(/counts as/i)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("oztag U10 mixed: a girl's try scores 2, a boy's 1, the opponent's +T and +2 (girl) on one row, undo", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  // This coach has seen the one-time long-press hint: on an iPhone-width
  // screen it sits over the scorebug's chips (in every sport) until
  // "Got it", and this test taps them.
  await page.addInitScript(() => window.localStorage.setItem("siren-longpress-seen-v1", "true"));

  const { admin, ownerId } = await ownerIdOf();
  const teamName = `OZT-MIX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const team = await makeTeam(admin, { ownerId, sport: "oztag", ageGroup: "U10", name: teamName });
  await admin
    .from("teams")
    .update({ track_scoring: true, mixed_max_boys: 4, mixed_min_girls: 1, mixed_min_boys: 0 })
    .eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  // Alternate: Alicia a girl, Brendan a boy, …
  const groupOf = new Map(players.map((p, i) => [p.id, i % 2 === 0 ? "girl" : "boy"]));
  for (const p of players) await admin.from("players").update({ mixed_group: groupOf.get(p.id) }).eq("id", p.id);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Charlestown Chargers" });
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

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 10 starting side/i })).toBeVisible({ timeout: 15_000 });
  // The pre-game rule check: four boys is Oztag's cap, kept.
  await expect(page.getByTestId("rule-check-summary")).toHaveText("All rules kept");
  await page.getByTestId("rule-check-summary").click();
  await expect(page.getByTestId("rule-check")).toContainText("Mixed rule kept: 4 of 4 boys, 4 girls");
  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
  const h1 = await lineup();
  const on = [...h1.lines.middle, ...h1.lines.link, ...h1.lines.wing, ...h1.lines.field];
  expect(on).toHaveLength(8);
  expect(on.filter((id) => groupOf.get(id) === "boy")).toHaveLength(4);

  // A girl's try: 2 points, its own event.
  const girl = on.find((id) => groupOf.get(id) === "girl")!;
  await page.getByTestId(`player-tile-${girl}`).click({ timeout: 10_000 });
  await page.getByTestId("touch-dock-try").click({ timeout: 5_000 });
  // The undo strip says what was recorded: a girl's try, and whose.
  const girlName = players.find((p) => p.id === girl)!.full_name;
  await expect(page.getByTestId("undo-strip")).toContainText(`${teamName} girl's try — ${girlName}`);
  await expect.poll(() => count("girls_try")).toBe(1);
  const { data: gt } = await admin.from("game_events").select("player_id, metadata").eq("game_id", game.id).eq("type", "girls_try").single();
  expect(gt?.player_id).toBe(girl);
  expect((gt?.metadata as { sport?: string }).sport).toBe("oztag");
  // A boy's: 1.
  const boy = on.find((id) => groupOf.get(id) === "boy")!;
  await page.getByTestId(`player-tile-${boy}`).click({ timeout: 10_000 });
  await page.getByTestId("touch-dock-try").click({ timeout: 5_000 });
  await expect.poll(() => count("try")).toBe(1);

  // The opponent: a try, "+T" as ours reads, and a girl's try, "+2"
  // marked girl, one row a side on an iPhone (audit 23 Oct, P2: "+1" and
  // "+2 (girl)" stacked into a column at 390 px and the bar covered
  // about 30% of the screen, Finish game included).
  await page.setViewportSize({ width: 390, height: 844 });
  const ourTry = page.getByRole("button", { name: `Add a try, ${teamName}` });
  const theirTry = page.getByRole("button", { name: "Add a try, Charlestown Chargers" });
  const theirGirls = page.getByRole("button", { name: "Add a girl's try, 2 points, Charlestown Chargers" });
  await expect(ourTry).toHaveText("+T");
  await expect(theirTry).toHaveText("+T");
  await expect(theirGirls).toContainText("+2");
  const bottomOf = async (chip: Locator) => {
    const box = (await chip.boundingBox())!;
    return box.y + box.height;
  };
  expect(Math.abs((await bottomOf(theirTry)) - (await bottomOf(theirGirls))), "the opponent's chips share a row").toBeLessThan(4);
  expect(Math.abs((await bottomOf(ourTry)) - (await bottomOf(theirTry))), "one row of chips a side").toBeLessThan(4);
  await theirTry.click({ timeout: 5_000 });
  await expect.poll(() => count("opponent_try")).toBe(1);
  await theirGirls.click({ timeout: 5_000 });
  await expect.poll(() => count("opponent_girls_try")).toBe(1);

  // Not sure who scored, but it was a girl: 2 with no scorer. The sheet
  // asks "Who scored?" under what was scored, and a stray tap on its
  // backdrop doesn't lose the try.
  await page.getByRole("button", { name: `Add a try, ${teamName}` }).click({ timeout: 5_000 });
  const sheet = page.getByRole("dialog", { name: "Who scored?" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(/^Try/);
  await page.mouse.click(8, 8);
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /not sure who — a girl's try/i }).click({ timeout: 5_000 });
  await expect.poll(() => count("girls_try")).toBe(2);
  const { data: unnamed } = await admin
    .from("game_events")
    .select("player_id")
    .eq("game_id", game.id)
    .eq("type", "girls_try")
    .order("created_at", { ascending: false })
    .limit(1);
  expect(unnamed?.[0]?.player_id).toBeNull();

  // 2 + 1 + 2 = 5 for us, 1 + 2 = 3 for them; undo takes back the last.
  // Each side's total is the line under its name on the scorebug.
  const ours = page.getByTestId("scorebug-team-name").first().locator("xpath=following-sibling::p[1]");
  const theirs = page.getByTestId("scorebug-team-name").last().locator("xpath=following-sibling::p[1]");
  await expect(ours).toHaveText("5", { timeout: 10_000 });
  await expect(theirs).toHaveText("3", { timeout: 10_000 });
  await page.getByRole("button", { name: /^undo$/i }).first().click({ timeout: 5_000 });
  await expect.poll(() => count("score_undo")).toBe(1);
  await expect(ours).toHaveText("3", { timeout: 10_000 });

  // The results agree: us 3, them 3.
  await page.getByRole("button", { name: /^clock — h1/i }).click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();
  await page.getByRole("button", { name: /^end\s*h\s*1$/i }).click();
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /review and update scores/i }).click({ timeout: 5_000 });
  // The break's editor offers the same chips.
  await expect(page.getByRole("button", { name: "Add a try, Charlestown Chargers" })).toHaveText("+T");
  await expect(page.getByRole("button", { name: "Add a girl's try, 2 points, Charlestown Chargers" })).toBeVisible();

  expect(errors).toEqual([]);
});

// Every write but a try used to wait for its save, then refresh the
// page: on a ground's patchy signal a sub took seconds to show (UX audit
// 23 Oct 2026, "Drift from AFL"). Touch now writes as soccer's family does.
test("oztag: a try, its undo and a sub show before the server saves; Game settings sits in the row", async ({ page }) => {
  test.setTimeout(120_000);
  const { admin, ownerId } = await ownerIdOf();
  const team = await makeTeam(admin, {
    ownerId,
    sport: "oztag",
    ageGroup: "U10",
    name: `OZT-OPTIM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Charlestown Chargers" });
  const ids = players.map((p) => p.id);
  const { error } = await admin.from("games").update({ sub_interval_seconds: 600, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const lineup = { lines: { middle: ids.slice(0, 2), link: ids.slice(2, 6), wing: ids.slice(6, 8), field: [] }, bench: ids.slice(8) };
  await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "oztag" } },
      { type: "quarter_start", metadata: { quarter: 1, sport: "oztag" } },
    ].map((e, i) => ({ ...e, game_id: game.id, created_by: ownerId, created_at: new Date(Date.now() - (10 - i) * 1000).toISOString() })),
  );
  await page.addInitScript(() => window.localStorage.setItem("siren-longpress-seen-v1", "true"));
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });

  // Every save takes 4 s.
  await page.route(`**/games/${game.id}/live`, async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });

  const theirs = page.getByTestId("scorebug-team-name").last().locator("xpath=following-sibling::p[1]");
  await page.getByRole("button", { name: "Add a try, Charlestown Chargers" }).click();
  await expect(theirs).toHaveText("1", { timeout: 1_500 });
  const strip = page.getByTestId("undo-strip");
  await expect(strip).toContainText("Charlestown Chargers try", { timeout: 1_500 });
  await strip.getByRole("button", { name: "Undo" }).click();
  await expect(theirs).toHaveText("0", { timeout: 1_500 });

  // A bench kid on for a wing: AFL's confirm, then it shows at once.
  const [benchKid, wing] = [players[8], players[6]];
  await page.getByTestId(`player-tile-${benchKid.id}`).click();
  await page.getByTestId(`player-tile-${wing.id}`).click();
  const confirm = page.getByRole("dialog", { name: /manually sub/i });
  await expect(confirm).toContainText(`${benchKid.full_name} (Bench) for ${wing.full_name} (Wings)`);
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("swap-toast")).toContainText(`${wing.full_name} → ${benchKid.full_name}`, { timeout: 1_500 });
  const wings = page.getByRole("region", { name: "On field" }).getByRole("group", { name: "Wings" });
  await expect(wings.getByTestId(`player-tile-${benchKid.id}`)).toBeVisible({ timeout: 1_500 });

  // All three save, in the coach's order, and the screen still agrees.
  await expect
    .poll(
      async () => {
        const { data } = await admin.from("game_events").select("type").eq("game_id", game.id).order("created_at");
        return (data ?? []).map((e) => e.type as string).filter((t) => ["opponent_try", "score_undo", "swap"].includes(t));
      },
      { timeout: 30_000 },
    )
    .toEqual(["opponent_try", "score_undo", "swap"]);
  await page.unroute(`**/games/${game.id}/live`);
  await page.reload();
  await waitForHydration(page);
  await expect(wings.getByTestId(`player-tile-${benchKid.id}`)).toBeVisible({ timeout: 15_000 });
  await expect(theirs).toHaveText("0");

  // Game settings: the sub interval mid-game, as AFL's.
  await page.getByRole("button", { name: "Game settings", exact: true }).click();
  const settings = page.getByRole("dialog").filter({ hasText: "Sub interval" });
  await expect(settings).toBeVisible();
  await settings.getByLabel("Sub interval").fill("5");
  await settings.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(async () => (await admin.from("games").select("sub_interval_seconds").eq("id", game.id).single()).data?.sub_interval_seconds)
    .toBe(300);
});
