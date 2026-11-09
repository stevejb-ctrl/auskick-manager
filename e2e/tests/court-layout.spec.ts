// How the kids stand on the court (Steve, 10 Nov 2026, from the
// screenshot round):
//  - Netball: a bib a row, zigzagging down the court as the old court
//    did: GS centre, GA right; WA left, C centre, WD right; GD left,
//    GK centre. The shooting circles are drawn plainly, GS and GK in them.
//  - Oztag: the eight on the one "Field" line used to sit in a tight
//    block of fours in the middle; they now stand in rows of three and
//    two down the whole field.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.use({ viewport: { width: 390, height: 844 } });

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function skipTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["nb-walkthrough-seen", "touch-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

async function seedInPlay(admin: SupabaseClient, ownerId: string, gameId: string, sport: string, lineup: unknown, ids: string[]) {
  await admin
    .from("game_availability")
    .insert(ids.map((id) => ({ game_id: gameId, player_id: id, status: "available" as const, updated_by: ownerId })));
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
  const { error } = await admin.from("game_events").insert([
    { game_id: gameId, type: "lineup_set", metadata: { lineup, sport }, created_by: ownerId, created_at: at(62_000) },
    { game_id: gameId, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(60_000) },
  ]);
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", gameId);
}

const box = async (page: Page, id: string) => (await page.getByTestId(`player-tile-${id}`).boundingBox())!;

test("netball: a bib a row, zigzagging down the court; GS and GK in plain shooting circles", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "go", sport: "netball", name: `NB-COURT-${Date.now() % 1e6}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const BIBS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;
  await seedInPlay(
    admin,
    ownerId,
    game.id,
    "netball",
    { positions: Object.fromEntries(BIBS.map((b, i) => [b, [ids[i]]])), bench: ids.slice(BIBS.length) },
    ids,
  );
  const [gs, ga, wa, c, wd, gd, gk] = ids;

  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByTestId(`player-tile-${gs}`)).toBeVisible({ timeout: 15_000 });

  const b = Object.fromEntries(await Promise.all(Object.entries({ gs, ga, wa, c, wd, gd, gk }).map(async ([k, id]) => [k, await box(page, id)])));
  // A bib a row, down the court: GS, GA, WA, C, WD, GD, GK.
  const order = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
  for (let i = 1; i < order.length; i++) {
    expect(b[order[i - 1]].y + b[order[i - 1]].height).toBeLessThanOrEqual(b[order[i]].y + 1);
  }
  // Zigzagging across it, as the old court did: GS, C and GK centre;
  // GA and WD right; WA and GD left.
  const mid = (k: string) => b[k].x + b[k].width / 2;
  for (const k of ["c", "gk"]) expect(Math.abs(mid(k) - mid("gs"))).toBeLessThan(4);
  for (const k of ["ga", "wd"]) expect(mid(k)).toBeGreaterThan(mid("gs") + 40);
  for (const k of ["wa", "gd"]) expect(mid(k)).toBeLessThan(mid("gs") - 40);

  // The two shooting circles are drawn, and plain to see; GS stands in
  // the top one, GK in the bottom one.
  const circles = page.getByTestId("shooting-circle");
  await expect(circles).toHaveCount(2);
  const top = (await circles.nth(0).boundingBox())!;
  const bottom = (await circles.nth(1).boundingBox())!;
  const courtTop = top.y + top.height / 2; // the circle is centred on the baseline
  const courtBottom = bottom.y + bottom.height / 2;
  expect(b.gs.y + b.gs.height / 2).toBeLessThan(courtTop + top.height / 2);
  expect(b.gk.y + b.gk.height / 2).toBeGreaterThan(courtBottom - bottom.height / 2);
  const opacity = await circles.nth(0).evaluate((el) => {
    const m = getComputedStyle(el).borderTopColor.match(/rgba?\(([^)]+)\)/);
    const parts = m ? m[1].split(",").map((s) => Number(s.trim())) : [];
    return parts.length === 4 ? parts[3] : 1;
  });
  expect(opacity).toBeGreaterThanOrEqual(0.2);
});

test("oztag: the eight on the field stand in rows of three and two, down the field", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "oztag", name: `OZ-FIELD-${Date.now() % 1e6}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 11 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  await seedInPlay(
    admin,
    ownerId,
    game.id,
    "oztag",
    { lines: { middle: [], link: [], wing: [], field: ids.slice(0, 8) }, bench: ids.slice(8) },
    ids,
  );

  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByTestId(`player-tile-${ids[0]}`)).toBeVisible({ timeout: 15_000 });

  const boxes = await Promise.all(ids.slice(0, 8).map((id) => box(page, id)));
  const rows = Array.from(new Set(boxes.map((bx) => Math.round(bx.y)))).sort((a, b) => a - b);
  // 3, 2, 3: three rows, none more than three across.
  expect(rows.length).toBe(3);
  for (const y of rows) expect(boxes.filter((bx) => Math.round(bx.y) === y).length).toBeLessThanOrEqual(3);
  // Spread down the field: the rows are well apart, not stacked tight.
  const field = (await page.getByRole("group", { name: "Field" }).boundingBox())!;
  expect(rows[rows.length - 1] - rows[0]).toBeGreaterThan(field.height * 0.4);
});

// Rugby (Steve, 10 Nov 2026): "make it look more field like, goal posts
// at the end, line markings". League and union draw the in-goals, try
// lines, halfway and their own lines, with posts at each end clear of
// every kid.
for (const c of [
  { sport: "rugby_league", ageGroup: "U10", count: 15, onField: 11, fwd: 5 },
  { sport: "rugby_union", ageGroup: "U12", count: 18, onField: 15, fwd: 8 },
] as const) {
  test(`${c.sport}: a field with try lines, halfway and posts at both ends, no kid on the posts`, async ({ page }) => {
    const admin = createAdminClient();
    const ownerId = await ownerOf(admin);
    const team = await makeTeam(admin, { ownerId, ageGroup: c.ageGroup, sport: c.sport, name: `RUGBY-FIELD-${Date.now() % 1e6}` });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: c.count });
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    await admin.from("games").update({ on_field_size: c.onField }).eq("id", game.id);
    const ids = players.map((p) => p.id);
    await seedInPlay(
      admin,
      ownerId,
      game.id,
      c.sport,
      { forwards: ids.slice(0, c.fwd), backs: ids.slice(c.fwd, c.onField), bench: ids.slice(c.onField) },
      ids,
    );
    await page.addInitScript(() => {
      try {
        for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
        localStorage.setItem("siren-longpress-seen-v1", "true");
      } catch {}
    });
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    await expect(page.getByTestId(`league-player-tile-${ids[0]}`)).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("rugby-markings")).toHaveCount(1);
    await expect(page.getByTestId("rugby-try-line")).toHaveCount(2);
    const posts = page.getByTestId("rugby-posts");
    await expect(posts).toHaveCount(2);
    const postBoxes = [(await posts.nth(0).boundingBox())!, (await posts.nth(1).boundingBox())!];
    const tiles = await Promise.all(ids.slice(0, c.onField).map(async (id) => (await page.getByTestId(`league-player-tile-${id}`).boundingBox())!));
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const p of postBoxes) for (const t of tiles) expect(overlaps(p, t)).toBe(false);
    // One set of posts above every kid, one below.
    const top = Math.min(...tiles.map((t) => t.y));
    const bottom = Math.max(...tiles.map((t) => t.y + t.height));
    expect(postBoxes[0].y + postBoxes[0].height).toBeLessThanOrEqual(top);
    expect(postBoxes[1].y).toBeGreaterThanOrEqual(bottom);
  });
}
