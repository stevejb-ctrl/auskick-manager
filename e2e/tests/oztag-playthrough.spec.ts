// ─── Oztag: two games on the touch family's engine ─────────────
// Four-sports plan, track B.
//
//   1. A U10 single-gender team under Rotate positions: eight on in
//      Oztag's lanes (2 middles, 4 links, 2 wings), no Girl/Boy anywhere,
//      and at half-time every kid who played a lane moves to another;
//      "Move to wings" moves a kid mid-half.
//   2. A U10 mixed team (ITF rule 3.3: at most 4 boys, at least 1 girl):
//      a try credited to a girl records a girl's try and scores 2, a boy's
//      scores 1; the opponent's chips are +1 and +2 (girl); "Not sure who
//      — a girl's try" counts 2 with no scorer, and undo takes it back.

import { test, expect } from "@playwright/test";
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

  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
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

  // Mid-half: a middle moves to the wings.
  const middle = h2.lines.middle[0];
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

test("oztag U10 mixed: a girl's try scores 2, a boy's 1, the opponent's +1 and +2 (girl), undo", async ({ page }) => {
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
  await expect.poll(() => count("girls_try")).toBe(1);
  const { data: gt } = await admin.from("game_events").select("player_id, metadata").eq("game_id", game.id).eq("type", "girls_try").single();
  expect(gt?.player_id).toBe(girl);
  expect((gt?.metadata as { sport?: string }).sport).toBe("oztag");
  // A boy's: 1.
  const boy = on.find((id) => groupOf.get(id) === "boy")!;
  await page.getByTestId(`player-tile-${boy}`).click({ timeout: 10_000 });
  await page.getByTestId("touch-dock-try").click({ timeout: 5_000 });
  await expect.poll(() => count("try")).toBe(1);

  // The opponent: +1 and +2 (girl).
  await page.getByRole("button", { name: "Add a try, Charlestown Chargers" }).click({ timeout: 5_000 });
  await expect.poll(() => count("opponent_try")).toBe(1);
  await page.getByRole("button", { name: "Add a girl's try, 2 points, Charlestown Chargers" }).click({ timeout: 5_000 });
  await expect.poll(() => count("opponent_girls_try")).toBe(1);

  // Not sure who scored, but it was a girl: 2 with no scorer.
  await page.getByRole("button", { name: `Add a try, ${teamName}` }).click({ timeout: 5_000 });
  const sheet = page.getByRole("dialog");
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
  await expect(page.getByRole("button", { name: "Add a girl's try, Charlestown Chargers" })).toBeVisible();

  expect(errors).toEqual([]);
});
