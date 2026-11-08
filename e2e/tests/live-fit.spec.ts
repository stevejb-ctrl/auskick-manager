// ─── The live screen fits the phone (live v3, Phase 5) ──────────
// AFL's live screen is one column the phone's height (LiveShell): the
// top bar, the score header, the field, the bench and the bar. The page
// itself never scrolls; the field is the one part that does. At large
// text (the reader's own font size, set over CDP as a phone's setting
// would) the header, the bench and the bar stay put and only the field
// scrolls, so the score and + GOAL are always a glance and a thumb away.
//
// Covers: src/components/live/LiveShell.tsx, LiveGame.tsx's shell, and
// NetballLiveGame.tsx's (Phase 7).

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { coachId } from "../helpers/people";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

/** AFL U10: 12 on and a bench of 6, a minute into Q1, scoring on. */
async function twelvePlusSix() {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `Fit ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 18, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup }, created_at: at(90) },
      { type: "quarter_start", metadata: { quarter: 1 }, created_at: at(60) },
      { type: "goal", player_id: ids[8], metadata: { quarter: 1, elapsed_ms: 30_000 }, created_at: at(30) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress", sub_interval_seconds: 600 }).eq("id", game.id);
  return { team, game, ids };
}

async function open(page: Page, teamId: string, gameId: string) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — q1, running/i })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

/** How far the page, the shell and the field each scroll. */
async function scrolls(page: Page) {
  return page.evaluate(() => {
    const el = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const shell = el("live-shell");
    const field = el("live-field");
    return {
      page: document.documentElement.scrollHeight - window.innerHeight,
      pageX: document.documentElement.scrollWidth - window.innerWidth,
      shell: shell.scrollHeight - shell.clientHeight,
      field: field.scrollHeight - field.clientHeight,
      fieldHeight: field.clientHeight,
    };
  });
}

/** Wholly on screen. */
async function onScreen(page: Page, name: string, box: { x: number; y: number; width: number; height: number } | null) {
  const vp = page.viewportSize()!;
  expect(box, name).not.toBeNull();
  expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(vp.height + 1);
  expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(vp.width + 1);
}

test("AFL 12 + 6 at 390×844: the page doesn't scroll, and the score, bench and bar are on screen", async ({ page }) => {
  const { team, game, ids } = await twelvePlusSix();
  await open(page, team.id, game.id);
  const s = await scrolls(page);
  expect(s.page, "the page scrolls").toBeLessThanOrEqual(0);
  expect(s.pageX, "the page scrolls sideways").toBeLessThanOrEqual(0);
  expect(s.shell, "the shell scrolls").toBeLessThanOrEqual(1);

  await onScreen(page, "clock", await page.getByRole("button", { name: /^clock — /i }).boundingBox());
  await onScreen(page, "+ GOAL", await page.getByRole("button", { name: /^add goal, fit/i }).boundingBox());
  await onScreen(page, "their +B", await page.getByRole("button", { name: "Add behind, Kookas" }).boundingBox());
  for (const id of ids.slice(12)) {
    await onScreen(page, `bench ${id}`, await page.getByRole("group", { name: "Bench", exact: true }).getByTestId(`player-tile-${id}`).boundingBox());
  }

  // Scrolling the field doesn't move the page.
  await page.getByTestId("live-field").evaluate((el) => el.scrollBy(0, 400));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("at 200% text only the field scrolls: the header, bench and bar stay pinned", async ({ browser, browserName }) => {
  // The reader's font size is set over CDP, which only Chromium has.
  test.skip(browserName !== "chromium", "CDP Page.setFontSizes is Chromium-only");
  const { team, game } = await twelvePlusSix();
  const context = await browser.newContext({ storageState: "playwright/.auth/super-admin.json", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
    await open(page, team.id, game.id);

    const s = await scrolls(page);
    expect(s.page, "the page scrolls").toBeLessThanOrEqual(0);
    expect(s.pageX, "the page scrolls sideways").toBeLessThanOrEqual(0);
    expect(s.shell, "the shell scrolls").toBeLessThanOrEqual(1);
    expect(s.field, "the field is the part that scrolls").toBeGreaterThan(0);
    expect(s.fieldHeight, "the field keeps some room").toBeGreaterThanOrEqual(100);

    const clock = page.getByRole("button", { name: /^clock — /i });
    const goal = page.getByRole("button", { name: /^add goal, fit/i });
    const bench = page.getByRole("group", { name: "Bench", exact: true });
    const before = { clock: await clock.boundingBox(), goal: await goal.boundingBox(), bench: await bench.boundingBox() };
    await onScreen(page, "clock", before.clock);
    await onScreen(page, "+ GOAL", before.goal);

    // Scroll the field: the rest doesn't move.
    await page.getByTestId("live-field").evaluate((el) => el.scrollBy(0, 300));
    await page.waitForTimeout(100);
    expect((await clock.boundingBox())!.y).toBeCloseTo(before.clock!.y, 0);
    expect((await goal.boundingBox())!.y).toBeCloseTo(before.goal!.y, 0);
    expect((await bench.boundingBox())!.y).toBeCloseTo(before.bench!.y, 0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  } finally {
    await context.close();
  }
});

/** Netball "go": 7 on court and 3 on the bench, a minute into Q1, scoring on (live v3, Phase 7). */
async function netballSevenPlusThree() {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "go", name: `NbFit ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  await admin.from("game_availability").insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const })));
  const ids = players.map((p) => p.id);
  const keys = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
  const lineup = { positions: Object.fromEntries(keys.map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) };
  const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "netball" }, created_at: at(90) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "netball" }, created_at: at(60) },
      { type: "goal", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 30_000 }, created_at: at(30) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { team, game, ids };
}

test("netball 7 + 3 at 390×844: the page doesn't scroll, and the court, bench and bar are all on screen", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
    } catch {}
  });
  const { team, game, ids } = await netballSevenPlusThree();
  await open(page, team.id, game.id);
  const s = await scrolls(page);
  expect(s.page, "the page scrolls").toBeLessThanOrEqual(0);
  expect(s.pageX, "the page scrolls sideways").toBeLessThanOrEqual(0);
  expect(s.shell, "the shell scrolls").toBeLessThanOrEqual(1);
  // Seven fit without the court scrolling, as AFL's twelve do.
  expect(s.field, "the court scrolls").toBeLessThanOrEqual(1);

  await onScreen(page, "clock", await page.getByRole("button", { name: /^clock — /i }).boundingBox());
  await onScreen(page, "+ GOAL", await page.getByRole("button", { name: /^add goal, nbfit/i }).boundingBox());
  await onScreen(page, "their +G", await page.getByRole("button", { name: "Add goal, Kookas" }).boundingBox());
  for (const id of ids.slice(0, 7)) await onScreen(page, `court ${id}`, await page.getByTestId(`player-tile-${id}`).boundingBox());
  for (const id of ids.slice(7)) {
    await onScreen(page, `bench ${id}`, await page.getByRole("group", { name: "Bench", exact: true }).getByTestId(`player-tile-${id}`).boundingBox());
  }
  // The thirds are the court's lines, attack at the top.
  const attack = await page.getByRole("group", { name: "Attack third", exact: true }).boundingBox();
  const defence = await page.getByRole("group", { name: "Defence third", exact: true }).boundingBox();
  expect(attack!.y).toBeLessThan(defence!.y);
});

// ─── Rugby's big sides (live v3, Phase 8) ────────────────────────
// League's 13 and union's 15 on the same shell: the field's tiles go
// dense, the formation's rows are the lines' rows, and the score bar is
// the two-row one (+T +C +PG +DG a side). Still no page scroll at
// 390×844, with the bench and both rows of the bar on screen.

/** A rugby side mid-H1, scoring on, the whistle's kick-off already picked. */
async function rugbySide(sport: "rugby_league" | "rugby_union", ageGroup: string, onField: number, forwards: number, bench: number) {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `Fit ${sport === "rugby_union" ? "RU" : "RL"} ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: onField + bench, ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  await admin.from("games").update({ on_field_size: onField, status: "in_progress", sub_interval_seconds: 600 }).eq("id", game.id);
  const ids = players.map((p) => p.id);
  const lineup = { forwards: ids.slice(0, forwards), backs: ids.slice(forwards, onField), bench: ids.slice(onField) };
  const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport }, created_at: at(90) },
      { type: "quarter_start", metadata: { quarter: 1, sport }, created_at: at(60) },
      // League's kick-off pick, so its prompt isn't up (union has none).
      ...(sport === "rugby_league" ? [{ type: "kickoff_taken", player_id: ids[0], metadata: { quarter: 1, period: 1, sport }, created_at: at(59) }] : []),
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed: ${error.message}`);
  return { team, game, ids, lineup };
}

for (const side of [
  { name: "league U13, 13 + 4", sport: "rugby_league" as const, age: "U13", onField: 13, forwards: 6, bench: 4 },
  { name: "union U16, 15 + 6", sport: "rugby_union" as const, age: "U16", onField: 15, forwards: 8, bench: 6 },
]) {
  test(`${side.name} at 390×844: no page scroll; every kid, the bench and both bar rows on screen`, async ({ page }) => {
    const { team, game, ids, lineup } = await rugbySide(side.sport, side.age, side.onField, side.forwards, side.bench);
    await page.addInitScript(() => {
      try {
        localStorage.setItem("league-walkthrough-seen", "1");
        localStorage.setItem("siren-longpress-seen-v1", "true");
      } catch {}
    });
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    await expect(page.getByRole("button", { name: /^clock — h1, running/i })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400);

    const s = await scrolls(page);
    expect(s.page, "the page scrolls").toBeLessThanOrEqual(0);
    expect(s.pageX, "the page scrolls sideways").toBeLessThanOrEqual(0);
    expect(s.shell, "the shell scrolls").toBeLessThanOrEqual(1);
    expect(s.field, "the field scrolls").toBeLessThanOrEqual(1);

    // Every kid on the field, in their line, on screen.
    const field = page.getByRole("region", { name: "On field" });
    await expect(field.getByRole("group", { name: "Forwards" }).locator("[data-testid^='league-player-tile-']")).toHaveCount(lineup.forwards.length);
    await expect(field.getByRole("group", { name: "Backs" }).locator("[data-testid^='league-player-tile-']")).toHaveCount(lineup.backs.length);
    for (const id of [...lineup.forwards, ...lineup.backs]) {
      const box = await field.getByTestId(`league-player-tile-${id}`).boundingBox();
      await onScreen(page, `field ${id}`, box);
      expect(box!.height, "a tap target").toBeGreaterThanOrEqual(44);
    }
    for (const id of ids.slice(side.onField)) {
      await onScreen(page, `bench ${id}`, await page.getByRole("group", { name: "Bench", exact: true }).getByTestId(`league-player-tile-${id}`).boundingBox());
    }
    // The two-row bar: our four and theirs, each a row.
    const ours = await page.getByRole("button", { name: "Record a try for our team" }).boundingBox();
    const theirs = await page.getByRole("button", { name: "Record opponent try" }).boundingBox();
    await onScreen(page, "our +T", ours);
    await onScreen(page, "their +T", theirs);
    expect(theirs!.y, "theirs under ours").toBeGreaterThan(ours!.y + ours!.height - 1);
    for (const name of [/^record a penalty goal for our team$/i, /^record opponent (drop|field) goal$/i]) {
      await onScreen(page, String(name), await page.getByRole("button", { name }).boundingBox());
    }
  });
}

// ─── The soccer family (live v3, Phase 9) ──────────────────────────
// Football's eleven (keeper and 4-3-3) with a bench of five, and
// futsal's five with three on the bench, on the same shell: no page
// scroll at 390×844, every kid and the bench on screen at a thumb's
// size, attack at the top and the keeper at the foot, + GOAL and their
// +G in reach.

/** A soccer-family side mid-H1, scoring on. */
async function soccerSide(sport: "soccer" | "futsal", ageGroup: string, lines: { def: number; mid: number; att: number }, bench: number) {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `Fit ${sport} ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const onField = 1 + lines.def + lines.mid + lines.att;
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: onField + bench });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  await admin.from("games").update({ on_field_size: onField, status: "in_progress", sub_interval_seconds: 600 }).eq("id", game.id);
  const ids = players.map((p) => p.id);
  let i = 1;
  const take = (n: number) => ids.slice(i, (i += n));
  const lineup = { keeper: ids[0], lines: { def: take(lines.def), mid: take(lines.mid), att: take(lines.att), field: [] }, bench: ids.slice(onField) };
  const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport }, created_at: at(90) },
      { type: "quarter_start", metadata: { quarter: 1, sport }, created_at: at(60) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed: ${error.message}`);
  return { team, game, ids, onField };
}

for (const side of [
  { name: "football U14, 11 + 5", sport: "soccer" as const, age: "U14", lines: { def: 4, mid: 3, att: 3 }, bench: 5, surface: "On field", top: "Attack" },
  { name: "futsal U10, 5 + 3", sport: "futsal" as const, age: "U10", lines: { def: 2, mid: 0, att: 2 }, bench: 3, surface: "On court", top: "Front" },
]) {
  test(`${side.name} at 390×844: no page scroll; every kid, the bench and the bar on screen`, async ({ page }) => {
    const { team, game, ids, onField } = await soccerSide(side.sport, side.age, side.lines, side.bench);
    await page.addInitScript(() => {
      try {
        localStorage.setItem("soccer-walkthrough-seen", "1");
        localStorage.setItem("siren-longpress-seen-v1", "true");
      } catch {}
    });
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    await expect(page.getByRole("button", { name: /^clock — h1, running/i })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400);

    const s = await scrolls(page);
    expect(s.page, "the page scrolls").toBeLessThanOrEqual(0);
    expect(s.pageX, "the page scrolls sideways").toBeLessThanOrEqual(0);
    expect(s.shell, "the shell scrolls").toBeLessThanOrEqual(1);
    expect(s.field, "the field scrolls").toBeLessThanOrEqual(1);

    const field = page.getByRole("region", { name: side.surface });
    await expect(field.locator("[data-testid^='player-tile-']")).toHaveCount(onField);
    for (const id of ids.slice(0, onField)) {
      const box = await field.getByTestId(`player-tile-${id}`).boundingBox();
      await onScreen(page, `field ${id}`, box);
      expect(box!.height, "a tap target").toBeGreaterThanOrEqual(44);
      expect(box!.width, "a tap target").toBeGreaterThanOrEqual(44);
    }
    // The keeper wears the GK flag, in the Keeper line at the foot.
    await expect(field.getByRole("group", { name: "Keeper" }).getByTestId(`player-tile-${ids[0]}`).getByTestId("kid-flag")).toHaveText("GK");
    const top = await field.getByRole("group", { name: side.top, exact: true }).boundingBox();
    const keeper = await field.getByRole("group", { name: "Keeper", exact: true }).boundingBox();
    expect(top!.y, "attack at the top").toBeLessThan(keeper!.y);
    for (const id of ids.slice(onField)) {
      const box = await page.getByRole("group", { name: "Bench", exact: true }).getByTestId(`player-tile-${id}`).boundingBox();
      await onScreen(page, `bench ${id}`, box);
      expect(box!.height, "a tap target").toBeGreaterThanOrEqual(44);
    }
    await onScreen(page, "clock", await page.getByRole("button", { name: /^clock — /i }).boundingBox());
    const goal = await page.getByRole("button", { name: /^add goal, fit/i }).boundingBox();
    await onScreen(page, "+ GOAL", goal);
    expect(goal!.height).toBeGreaterThanOrEqual(44);
    const theirs = await page.getByRole("button", { name: "Add goal, Kookas" }).boundingBox();
    await onScreen(page, "their +G", theirs);
    expect(theirs!.height).toBeGreaterThanOrEqual(44);
  });
}
