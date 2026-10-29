// Stagehand round 8 (29 Oct 2026): confused parents and rushed coaches,
// all ten sports. .planning/USABILITY-STAGEHAND-2026-10-ROUND8.md has
// the findings; each test here names its number.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { kidLabel } from "../../src/lib/availability/parentLink";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

type Sport = "afl" | "soccer" | "netball";
const LINEUPS: Record<Sport, { age: string; count: number; lineup: (ids: string[]) => Record<string, unknown> }> = {
  afl: { age: "U10", count: 15, lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }) },
  soccer: { age: "U12", count: 12, lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 4), mid: ids.slice(4, 7), att: ids.slice(7, 9), field: [] }, bench: ids.slice(9) }) },
  netball: { age: "11u", count: 9, lineup: (ids) => ({ positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }) },
};

/** A game in its first period, scoring on: the team, game, kids and its share token. */
async function inFirstPeriod(sport: Sport) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const cfg = LINEUPS[sport];
  const team = await makeTeam(admin, { ownerId, sport, ageGroup: cfg.age, name: `R8 ${sport} ${uniq()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: cfg.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const at = (s: number) => new Date(Date.now() - 60_000 + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: cfg.lineup(ids), sport }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(1) },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, ownerId, team, game, players, ids };
}

/** A phone with nobody signed in: a parent opening the link. */
async function parentPhone(browser: Browser, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport });
  return { context, page: await context.newPage() };
}

async function openLive(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — /i })).toBeVisible({ timeout: 15_000 });
}

const countOf = async (admin: Admin, gameId: string, type: string) =>
  (await admin.from("game_events").select("id").eq("game_id", gameId).eq("type", type)).data?.length ?? 0;

for (const sport of ["soccer", "afl"] as const) {
  test(`#1 ${sport}: a double tap on the other team's score is one score`, async ({ browser }) => {
    const { admin, game } = await inFirstPeriod(sport);
    const { context, page } = await parentPhone(browser);
    await openLive(page, `/run/${game.share_token}`);
    await page.getByRole("button", { name: "Add goal, Sharks" }).dblclick();
    await page.waitForTimeout(2500);
    expect(await countOf(admin, game.id, "opponent_goal")).toBe(1);
    // A second goal a moment later still counts.
    await page.getByRole("button", { name: "Add goal, Sharks" }).click();
    await expect.poll(() => countOf(admin, game.id, "opponent_goal"), { timeout: 10_000 }).toBe(2);
    await context.close();
  });
}

test("#2 a phone held sideways fills the screen: no desktop phone frame", async ({ browser }) => {
  const { game } = await inFirstPeriod("soccer");
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 915, height: 412 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await openLive(page, `/run/${game.share_token}`);
  const main = await page.locator("main").boundingBox();
  expect(main!.width).toBeGreaterThan(800);
  const theirs = await page.getByRole("button", { name: "Add goal, Sharks" }).boundingBox();
  expect(theirs!.x + theirs!.width).toBeLessThanOrEqual(915);
  await context.close();
});

for (const sport of ["afl", "soccer"] as const) {
  test(`#3 ${sport}: a goal being picked when the other phone ends the period says it wasn't saved`, async ({ browser }) => {
    const { admin, ownerId, game } = await inFirstPeriod(sport);
    const { context, page } = await parentPhone(browser);
    await openLive(page, `/run/${game.share_token}`);
    await page.getByRole("button", { name: /^Add goal, R8/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // The other phone ends the first period.
    await admin.from("game_events").insert({ game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 60_000, sport }, created_by: ownerId });
    await expect(page.getByTestId("lost-score-notice")).toContainText("wasn't saved", { timeout: 20_000 });
    await context.close();
  });
}

test("#5 Exit on a finished game's link leads back to the result", async ({ browser }) => {
  const { admin, ownerId, game } = await inFirstPeriod("afl");
  await admin.from("game_events").insert([
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 600_000 }, created_by: ownerId },
    { game_id: game.id, type: "game_finalised", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);
  const { context, page } = await parentPhone(browser);
  await page.goto(`/run/${game.share_token}/left`);
  await page.getByRole("link", { name: "See the result" }).click();
  await expect(page).toHaveURL(new RegExp(`/run/${game.share_token}$`));
  await context.close();
});

test("#7 the game-day link says whose team it is and what sport", async ({ browser }) => {
  const { team, game } = await inFirstPeriod("netball");
  const { context, page } = await parentPhone(browser);
  await page.goto(`/run/${game.share_token}`);
  const whose = page.getByTestId("run-whose");
  await expect(whose).toContainText(`You're scoring for ${team.name} v Sharks`);
  await expect(whose).toContainText("Netball");
  await context.close();
});

test("#9 netball's player sheet says subs happen at the break", async ({ browser }) => {
  const { game } = await inFirstPeriod("netball");
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  await page.getByRole("button", { name: /^Goal Shooter,/ }).click({ delay: 600 });
  await expect(page.getByTestId("lock-modal-note")).toContainText("Netball subs happen at the break");
  await context.close();
});

test("#12 the availability link can clear a wrong answer", async ({ browser }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `R8 avail ${uniq()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 3 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew" });
  const { data } = await admin.from("games").select("availability_token").eq("id", game.id).single();
  const { context, page } = await parentPhone(browser);
  await page.goto(`/availability/${data!.availability_token}`);
  await waitForHydration(page);
  const kid = players[0];
  const label = kidLabel(kid.full_name);
  await page.getByRole("group", { name: `${label} availability` }).getByRole("button", { name: /^in$/i }).click();
  const status = async () =>
    (await admin.from("game_availability").select("status, replied_at").eq("game_id", game.id).eq("player_id", kid.id).maybeSingle()).data;
  await expect.poll(async () => (await status())?.status, { timeout: 10_000 }).toBe("available");
  await page.reload();
  await page.getByRole("button", { name: `Clear the answer for ${label}` }).click();
  await expect.poll(async () => {
    const s = await status();
    return s ? `${s.status}:${s.replied_at ? "replied" : "-"}` : null;
  }, { timeout: 10_000 }).toBe("unknown:-");
  await context.close();
});

for (const [sport, over] of [["netball", "Q1 is over"], ["soccer", "1st half is over"]] as const) {
  test(`#8 ${sport}: the break says the period is over and what to do`, async ({ browser }) => {
    const { admin, ownerId, game } = await inFirstPeriod(sport);
    await admin.from("game_events").insert({ game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 600_000, sport }, created_by: ownerId });
    const { context, page } = await parentPhone(browser);
    await page.goto(`/run/${game.share_token}`);
    await expect(page.getByTestId("period-over")).toContainText(over, { timeout: 15_000 });
    await expect(page.getByTestId("period-over")).toContainText("then tap Start");
    await context.close();
  });
}

test("#6 #13 a score from the other phone says so, and Undo names what it takes back", async ({ browser }) => {
  const { game } = await inFirstPeriod("soccer");
  const a = await parentPhone(browser);
  const b = await parentPhone(browser);
  await openLive(a.page, `/run/${game.share_token}`);
  await openLive(b.page, `/run/${game.share_token}`);
  await a.page.getByRole("button", { name: "Add goal, Sharks" }).click();
  await expect(b.page.getByText("Sharks goal added on another phone")).toBeVisible({ timeout: 20_000 });
  await expect(b.page.getByTestId("undo-strip")).toContainText("Undo takes back: Sharks goal");
  // The phone that scored isn't told it came from another phone.
  await expect(a.page.getByText("added on another phone")).toHaveCount(0);
  await a.context.close();
  await b.context.close();
});

test("#10 at 200% text a netball court name isn't cut to a letter, and the hint stays one line", async ({ browser }) => {
  const { players, game } = await inFirstPeriod("netball");
  const { context, page } = await parentPhone(browser);
  await page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "html { font-size: 200% !important; }";
      document.head.appendChild(s);
    }),
  );
  await openLive(page, `/run/${game.share_token}`);
  const token = page.getByRole("button", { name: /^Goal Shooter,/ });
  const name = token.getByText(players[0].full_name.split(" ")[0], { exact: false }).first();
  const cut = await name.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(cut).toBe(false);
  const hint = page.getByText("Tap a player for actions");
  if (await hint.count()) {
    const box = await hint.boundingBox();
    expect(box!.height).toBeLessThan(60);
  }
  await context.close();
});

test("#11 tapping a player says a second tap swaps, not just how to score", async ({ browser }) => {
  const { ids, game } = await inFirstPeriod("soccer");
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  await page.getByTestId(`player-tile-${ids[4]}`).click();
  await expect(page.getByTestId("dock-swap-hint")).toHaveText("Or tap a teammate to swap them.");
  await context.close();
});

test("#14 AFL: two quick taps that swap field kids can be undone from the toast", async ({ browser }) => {
  const { admin, ids, game } = await inFirstPeriod("afl");
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  // A back, then a forward: they trade zones at once.
  await page.getByTestId(`player-tile-${ids[0]}`).click();
  await page.getByTestId(`player-tile-${ids[8]}`).click();
  await expect(page.getByText(/zones swapped/)).toBeVisible();
  await page.getByRole("button", { name: /^undo$/i }).last().click();
  await expect
    .poll(async () => (await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "field_zone_swap")).data?.length ?? 0, { timeout: 10_000 })
    .toBe(2);
  await context.close();
});

test("#14 football's live screen has a ? that ends on the words you'll see", async ({ browser }) => {
  const { game } = await inFirstPeriod("soccer");
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  await page.getByRole("button", { name: "Open walkthrough" }).click();
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 8 && !(await dialog.getByText("Words you'll see").isVisible()); i++) {
    await dialog.getByRole("button", { name: "Next" }).click();
  }
  await expect(dialog.getByText("Words you'll see")).toBeVisible();
  await expect(dialog).toContainText("Pair 1, OFF 1");
  await context.close();
});
