// Game day, three decisions from Steve (12 Nov 2026), after round 11:
//
//   1. The break's "Lineup re-planned" line has an Undo that puts back
//      the lineup from before the re-plan (every sport that re-plans,
//      through the shared break).
//   2. The live screen's top bar says how long the periods are
//      ("4 × 10 min"), and so does the game page while the game is on.
//   3. The Game plan's copied group-chat text names its rotation.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel", timeout: 120_000 });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

async function quiet(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen", "rl-walkthrough-seen"]) {
        localStorage.setItem(k, "1");
      }
    } catch {}
  });
}

async function available(admin: Admin, gameId: string, ownerId: string, ids: string[]) {
  await admin
    .from("game_availability")
    .upsert(ids.map((id) => ({ game_id: gameId, player_id: id, status: "available" as const, updated_by: ownerId })), {
      onConflict: "game_id,player_id",
    });
}

const shot = (name: string) => test.info().outputPath(name);

// ─── 1. Undo the re-plan ────────────────────────────────────────

/** A game at its first break: the lineup it ended on, and what happened. */
async function seedBreak(
  admin: Admin,
  ownerId: string,
  gameId: string,
  sport: string,
  lineup: unknown,
  periodMs: number,
  extra: { type: string; player_id?: string; metadata: Record<string, unknown> }[] = [],
) {
  const start = Date.now() - periodMs - 120_000;
  const at = (ms: number) => new Date(start + ms).toISOString();
  const meta = (m: Record<string, unknown>) => ({ ...m, sport });
  await admin.from("game_events").insert([
    { game_id: gameId, type: "lineup_set", metadata: meta({ lineup }), created_by: ownerId, created_at: at(0) },
    { game_id: gameId, type: "quarter_start", metadata: meta({ quarter: 1 }), created_by: ownerId, created_at: at(1000) },
    ...extra.map((e, i) => ({
      game_id: gameId,
      type: e.type,
      player_id: e.player_id ?? null,
      metadata: meta(e.metadata),
      created_by: ownerId,
      created_at: at(2000 + i * 1000),
    })),
    { game_id: gameId, type: "quarter_end", metadata: meta({ quarter: 1, elapsed_ms: periodMs }), created_by: ownerId, created_at: at(periodMs + 1000) },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", gameId);
}

async function openBreak(page: Page, teamId: string, gameId: string, title: RegExp) {
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  const selectTeam = page.getByRole("button", { name: /select team for/i });
  await expect(page.getByRole("heading", { name: title }).or(selectTeam)).toBeVisible({ timeout: 20_000 });
  if (await selectTeam.isVisible()) await selectTeam.click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });
}

/** The break's lineup: each line on the field with its kids in order, and the bench. */
async function lineupOnScreen(page: Page) {
  return page.evaluate(() => {
    const id = (el: Element) => el.getAttribute("data-testid")!.replace("player-tile-", "");
    const field = document.querySelector("[data-testid='break-field']")!;
    const lines: Record<string, string[]> = {};
    field.querySelectorAll("[role='group'][aria-label]").forEach((g) => {
      lines[g.getAttribute("aria-label")!] = Array.from(g.querySelectorAll("[data-testid^='player-tile-']")).map(id);
    });
    const onField = new Set(Array.from(field.querySelectorAll("[data-testid^='player-tile-']")).map(id));
    const bench = Array.from(document.querySelectorAll("[data-testid^='player-tile-']"))
      .map(id)
      .filter((p) => !onField.has(p));
    return { lines, bench };
  });
}

const undoButton = (page: Page) => page.getByRole("button", { name: "Undo the re-plan" });

async function expectTapTarget(page: Page) {
  const box = await undoButton(page).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

test("1 soccer: Undo puts back the lineup from before the re-plan, and it stays put", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await quiet(page);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U10", name: `R12B soc ${uniq()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rovers" });
  const k = players.map((p) => p.id);
  await available(admin, game.id, ownerId, k);
  // 9 a side; k[11] lent to the other side from kickoff.
  const lineup = { keeper: k[0], lines: { def: k.slice(1, 4), mid: k.slice(4, 7), att: k.slice(7, 9), field: [] }, bench: k.slice(9) };
  await seedBreak(admin, ownerId, game.id, "soccer", lineup, 25 * 60_000, [
    { type: "player_loan", player_id: k[11], metadata: { loaned: true, quarter: 1, elapsed_ms: 0 } },
  ]);

  await openBreak(page, team.id, game.id, /^2nd half lineup$/);
  // No re-plan yet, so nothing to undo.
  await expect(undoButton(page)).toHaveCount(0);
  const before = await lineupOnScreen(page);

  await page.getByTestId(`break-bring-back-${k[11]}`).click();
  const note = page.getByTestId("break-replanned");
  await expect(note).toHaveText(/^Lineup re-planned: \d+ kids? moved\.$/, { timeout: 15_000 });
  await expect(undoButton(page)).toBeVisible();
  await expect(undoButton(page)).toHaveText("Undo");
  await expectTapTarget(page);
  const replanned = await lineupOnScreen(page);
  expect(replanned.lines, "the re-plan moved kids").not.toEqual(before.lines);
  await note.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot("r12b-replan-undo-soccer.png") });

  await undoButton(page).click();
  await expect(note).toHaveText("Lineup put back.");
  await expect(note).toBeFocused();
  await expect(undoButton(page)).toHaveCount(0);
  // The lineup from before, the kid back from loan on the bench.
  const undone = await lineupOnScreen(page);
  expect(undone.lines).toEqual(before.lines);
  expect(undone.bench).toContain(k[11]);
  expect(undone.bench.slice().sort()).toEqual([...before.bench, k[11]].filter((v, i, a) => a.indexOf(v) === i).sort());
  await page.screenshot({ path: shot("r12b-replan-undone-soccer.png") });

  // Undone, the lineup is the coach's: kept over a reload.
  await page.waitForTimeout(1500);
  await openBreak(page, team.id, game.id, /^2nd half lineup$/);
  await expect.poll(async () => (await lineupOnScreen(page)).lines, { timeout: 10_000 }).toEqual(before.lines);
  await expect(page.getByTestId("break-replanned")).toHaveCount(0);
});

test("1 rugby league: the same Undo, from the shared break", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await quiet(page);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league", ageGroup: "U10", name: `R12B rl ${uniq()}` });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const size = game.on_field_size as number;
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: size + 3 });
  const k = players.map((p) => p.id);
  await available(admin, game.id, ownerId, k);
  const fwd = Math.floor(size / 2);
  const lent = k[size + 2];
  const lineup = { forwards: k.slice(0, fwd), backs: k.slice(fwd, size), bench: k.slice(size, size + 2) };
  await seedBreak(admin, ownerId, game.id, "rugby_league", lineup, 20 * 60_000, [
    { type: "player_loan", player_id: lent, metadata: { loaned: true, quarter: 1, elapsed_ms: 0 } },
  ]);

  await openBreak(page, team.id, game.id, /lineup$/);
  const before = await lineupOnScreen(page);
  await page.getByTestId(`break-bring-back-${lent}`).click();
  await expect(page.getByTestId("break-replanned")).toHaveText(/^Lineup re-planned: \d+ kids? moved\.$/, { timeout: 15_000 });
  await expectTapTarget(page);
  await undoButton(page).click();
  await expect(page.getByTestId("break-replanned")).toHaveText("Lineup put back.");
  const undone = await lineupOnScreen(page);
  expect(undone.lines).toEqual(before.lines);
  expect(undone.bench).toContain(lent);
});

test("1 basketball: Undo after a kid is hurt since benches them, and a swap takes Undo away", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await quiet(page);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12", name: `R12B bb ${uniq()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 8 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rivals" });
  const k = players.map((p) => p.id);
  await available(admin, game.id, ownerId, k);
  const lent = k[7];
  const lineup = { lines: { guard: k.slice(0, 2), forward: k.slice(2, 5), court: [] }, bench: k.slice(5, 7) };
  await seedBreak(admin, ownerId, game.id, "basketball", lineup, 20 * 60_000, [
    { type: "player_loan", player_id: lent, metadata: { loaned: true, quarter: 1, elapsed_ms: 0 } },
  ]);

  await openBreak(page, team.id, game.id, /^2nd half lineup$/);
  const before = await lineupOnScreen(page);
  await page.getByTestId(`break-bring-back-${lent}`).click();
  const note = page.getByTestId("break-replanned");
  await expect(note).toHaveText(/^Lineup re-planned: \d+ kids? moved\./, { timeout: 15_000 });

  // A kid who started on court before the re-plan is hurt now: the break
  // re-plans again, and Undo still goes back to the coach's lineup, with
  // the hurt kid benched (their spot left empty), not on court.
  // (One on court before the re-plan and after it, so hurting them moves kids.)
  const replanned = await lineupOnScreen(page);
  const onCourt = (l: { lines: Record<string, string[]> }) => Object.values(l.lines).flat();
  const hurtId = onCourt(before).find((id) => onCourt(replanned).includes(id))!;
  const hurt = players.find((p) => p.id === hurtId)!;
  await page.getByRole("button", { name: /^game settings/i }).click();
  await page.getByRole("button", { name: "Mark injured" }).click();
  await page.getByRole("button", { name: new RegExp(hurt.full_name) }).last().click();
  await expect(page.getByRole("button", { name: `Mark ${hurt.full_name} fit` })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: `Mark ${hurt.full_name} fit` })).toHaveCount(0);
  await expect(undoButton(page)).toBeVisible({ timeout: 15_000 });
  await undoButton(page).click();
  await expect(note).toHaveText("Lineup put back.");
  const undone = await lineupOnScreen(page);
  for (const [line, ids] of Object.entries(before.lines)) {
    expect(undone.lines[line], line).toEqual(ids.filter((id) => id !== hurt.id));
  }
  expect(undone.bench).toEqual(expect.arrayContaining([hurt.id, lent]));

  // A swap of the coach's own takes the line, and its Undo, away.
  await page.getByTestId(`player-tile-${onCourt(undone)[0]}`).click();
  await page.getByTestId(`player-tile-${lent}`).click();
  await expect(note).toHaveCount(0);
  await expect(undoButton(page)).toHaveCount(0);
});

// ─── 2. The periods' length during the game ─────────────────────

type LiveSport = "afl" | "soccer" | "netball";
const LINEUPS: Record<LiveSport, { age: string; count: number; lineup: (ids: string[]) => Record<string, unknown> }> = {
  afl: { age: "U10", count: 15, lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }) },
  soccer: { age: "U10", count: 12, lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 4), mid: ids.slice(4, 7), att: ids.slice(7, 9), field: [] }, bench: ids.slice(9) }) },
  netball: { age: "11u", count: 9, lineup: (ids) => ({ positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }) },
};

/** A game in its first period. */
async function inFirstPeriod(sport: LiveSport, teamSeconds: number | null = null) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const cfg = LINEUPS[sport];
  const team = await makeTeam(admin, { ownerId, sport, ageGroup: cfg.age, name: `R12B ${sport} ${uniq()}` });
  if (teamSeconds != null) await admin.from("teams").update({ quarter_length_seconds: teamSeconds }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: cfg.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  await available(admin, game.id, ownerId, ids);
  const at = (s: number) => new Date(Date.now() - 60_000 + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: cfg.lineup(ids), sport }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(1) },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, ownerId, team, game };
}

async function openLive(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
  const selectTeam = page.getByRole("button", { name: /select team for/i });
  const clock = page.getByRole("button", { name: /^clock — /i });
  await expect(clock.or(selectTeam)).toBeVisible({ timeout: 20_000 });
  if (await selectTeam.isVisible()) await selectTeam.click();
  await expect(clock).toBeVisible({ timeout: 20_000 });
}

/** The top bar fits: Exit, the length and the menu all on screen. */
async function expectBarFits(page: Page, width: number) {
  for (const el of [page.getByRole("button", { name: "Exit live game" }), page.getByTestId("live-period-length"), page.getByRole("button", { name: "Game menu" })]) {
    const box = await el.boundingBox();
    expect(box, "on screen").not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test("2 AFL: the live top bar says 4 × 10 min, the team's length, and fits at 320 px", async ({ page }) => {
  await quiet(page);
  const { team, game } = await inFirstPeriod("afl", 600);
  await page.setViewportSize({ width: 390, height: 844 });
  await openLive(page, `/teams/${team.id}/games/${game.id}/live`);
  const length = page.getByTestId("live-period-length");
  await expect(length).toHaveText(/·\s4 × 10 min$/);
  await expectBarFits(page, 390);
  await page.screenshot({ path: shot("r12b-live-header-afl.png") });

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(length).toBeVisible();
  await expectBarFits(page, 320);
  await page.screenshot({ path: shot("r12b-live-header-afl-320.png") });

  // The game page says it too, while the game is on.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await expect(page.getByTestId("game-period-format")).toHaveText("4 × 10 min quarters", { timeout: 15_000 });
});

test("2 soccer: the live top bar says its halves", async ({ page }) => {
  await quiet(page);
  const { team, game } = await inFirstPeriod("soccer");
  await page.setViewportSize({ width: 390, height: 844 });
  await openLive(page, `/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByTestId("live-period-length")).toHaveText(/·\s2 × \d+ min$/);
  await expectBarFits(page, 390);
  await page.screenshot({ path: shot("r12b-live-header-soccer.png") });
});

async function parentPhone(browser: Browser, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport });
  return { context, page: await context.newPage() };
}

test("2 netball: the game-day link's top bar says whose game and the length", async ({ browser }) => {
  const { team, game } = await inFirstPeriod("netball", 480);
  const { context, page } = await parentPhone(browser, { width: 320, height: 700 });
  await openLive(page, `/run/${game.share_token}`);
  await expect(page.getByTestId("run-whose")).toContainText(`Scoring for ${team.name}`);
  await expect(page.getByTestId("live-period-length")).toHaveText(/·\s4 × 8 min$/);
  await expectBarFits(page, 320);
  await page.screenshot({ path: shot("r12b-live-header-run-netball-320.png") });
  await context.close();
});

// ─── 3. The rotation in the copied plan ─────────────────────────

test("3 the Game plan's group-chat text names its rotation, and the copy carries it", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const afl = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `R12B plan ${uniq()}` });
  await makePlayers(admin, { teamId: afl.id, ownerId, count: 15 });
  const aflGame = await makeGame(admin, { teamId: afl.id, ownerId, opponent: "Eagles" });
  await page.goto(`/teams/${afl.id}/games/${aflGame.id}`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /^game plan$/i }).click({ timeout: 15_000 });
  await expect(page.getByTestId("game-plan-rotation")).toHaveText("Rotation: Suggested", { timeout: 10_000 });
  const text = page.locator("#game-plan-text");
  await expect(text).toContainText("Rotation: Suggested");
  const lines = ((await text.textContent()) ?? "").split("\n");
  expect(lines.findIndex((l) => l === "Rotation: Suggested")).toBe(lines.findIndex((l) => /^4 quarters · /.test(l)) + 1);
  await page.getByRole("button", { name: /copy for group chat/i }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5_000 }).toContain("Rotation: Suggested");
  await text.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot("r12b-plan-text-afl.png") });

  // A netball team on Position cycle says so in the text too.
  const nb = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "11u", name: `R12B plan nb ${uniq()}` });
  await admin.from("team_playbooks").upsert({ team_id: nb.id, strategy: "position-cycle" }, { onConflict: "team_id" });
  await makePlayers(admin, { teamId: nb.id, ownerId, count: 9 });
  const nbGame = await makeGame(admin, { teamId: nb.id, ownerId, opponent: "Swifts" });
  await page.goto(`/teams/${nb.id}/games/${nbGame.id}`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /^game plan$/i }).click({ timeout: 15_000 });
  await expect(page.locator("#game-plan-text")).toContainText("Rotation: Position cycle", { timeout: 10_000 });
});
