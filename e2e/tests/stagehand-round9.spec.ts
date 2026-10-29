// Stagehand round 9 (29 Oct 2026): the front door, a coach's season,
// each sport's rules, desktop and keyboard, and round 8's fixes from a
// parent's side. .planning/USABILITY-STAGEHAND-2026-10-ROUND9.md has the
// findings; each test here names its number. #1 (a game manager's game
// never leaving "Upcoming") is game-manager-runs-game.spec.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { contrastOf, skipHints } from "../helpers/a11y";
import { newPerson, signedInPhone } from "../helpers/people";
import { deleteTestUser } from "../fixtures/supabase";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

type Sport = "afl" | "soccer" | "netball" | "rugby_league";
const LINEUPS: Record<Sport, { age: string; count: number; lineup: (ids: string[]) => Record<string, unknown> }> = {
  afl: { age: "U10", count: 15, lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }) },
  soccer: { age: "U12", count: 12, lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 4), mid: ids.slice(4, 7), att: ids.slice(7, 9), field: [] }, bench: ids.slice(9) }) },
  netball: { age: "11u", count: 9, lineup: (ids) => ({ positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }) },
  rugby_league: { age: "U8", count: 11, lineup: (ids) => ({ forwards: ids.slice(0, 3), backs: ids.slice(3, 8), bench: ids.slice(8) }) },
};

/** A game `secs` into its first period: the team, game, kids and its share token. */
async function inFirstPeriod(sport: Sport, opts: { secs?: number; subIntervalSeconds?: number } = {}) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const cfg = LINEUPS[sport];
  const team = await makeTeam(admin, { ownerId, sport, ageGroup: cfg.age, name: `R9 ${sport} ${uniq()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: cfg.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const at = (s: number) => new Date(Date.now() - (opts.secs ?? 60) * 1000 + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: cfg.lineup(ids), sport }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(1) },
  ]);
  await admin
    .from("games")
    .update({ status: "in_progress", ...(opts.subIntervalSeconds ? { sub_interval_seconds: opts.subIntervalSeconds } : {}) })
    .eq("id", game.id);
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

// ─── #2 Contrast ─────────────────────────────────────────────────

test("#2 a live game's badge and Back to live game button, and the stats notice, read at AA", async ({ page }) => {
  const { team } = await inFirstPeriod("afl");
  await page.goto(`/teams/${team.id}`);
  await waitForHydration(page);
  const back = page.getByRole("link", { name: /back to live game/i });
  await expect(back).toBeVisible({ timeout: 15_000 });
  expect(await contrastOf(back)).toBeGreaterThanOrEqual(4.5);

  await page.goto(`/teams/${team.id}/games`);
  await waitForHydration(page);
  const live = page.locator('span[aria-label="Live"]').first();
  await expect(live).toBeVisible({ timeout: 15_000 });
  expect(await contrastOf(live)).toBeGreaterThanOrEqual(4.5);

  await page.goto(`/teams/${team.id}/stats`);
  await waitForHydration(page);
  const notice = page.getByTestId("stats-unfinished-games").locator("p").first();
  await expect(notice).toBeVisible({ timeout: 15_000 });
  expect(await contrastOf(notice)).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(page.getByTestId("stats-unfinished-games").getByRole("link").first())).toBeGreaterThanOrEqual(4.5);
});

test("#2 league: the next-sub card's position labels read at AA on the dark card", async ({ browser }) => {
  const { game } = await inFirstPeriod("rugby_league", { secs: 120, subIntervalSeconds: 60 });
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  const label = page.getByTestId("league-swap-pair-0").locator("span").first();
  await expect(label).toBeVisible({ timeout: 15_000 });
  expect(await contrastOf(label)).toBeGreaterThanOrEqual(4.5);
  await context.close();
});

// ─── #3 Escape closes info dialogs ───────────────────────────────

test("#3 Escape closes the quarter-by-quarter scores and Game settings", async ({ page }) => {
  const { team, game } = await inFirstPeriod("afl");
  await skipHints(page);
  await openLive(page, `/teams/${team.id}/games/${game.id}/live`);
  const dialog = page.getByRole("dialog");

  await page.getByRole("button", { name: "Show quarter-by-quarter scores" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /^game settings$/i }).click();
  await expect(dialog.getByRole("heading", { name: "Game settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

// ─── #5 The reset pages' tagline ─────────────────────────────────

test("#5 the password-reset page says what sign-in says, not AFL", async ({ browser }) => {
  const { context, page } = await parentPhone(browser);
  await page.goto("/forgot-password");
  await expect(page.getByText(/junior sport team management/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/junior afl team management/i)).toHaveCount(0);
  await context.close();
});

// ─── #6 The parents' message says when and where ─────────────────

test("#6 Ask parents who's in: the message has the game's time and venue", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U12", name: `R9 ask ${uniq()}` });
  const at = new Date(Date.now() + 3 * 86_400_000);
  at.setHours(19, 30, 0, 0);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew Kestrels", scheduledAt: at.toISOString() });
  await admin.from("games").update({ location: "Brunswick Park" }).eq("id", game.id);
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /ask parents who.s in/i }).click({ timeout: 15_000 });
  const sheet = page.getByRole("dialog", { name: "Ask parents who's in" });
  await expect(sheet).toContainText("Kew Kestrels");
  await expect(sheet).toContainText(/7:30\s?pm at Brunswick Park/i);
});

// ─── #4 The laptop's last row clear of the hint and score bar ────

test("#4 on a laptop, the live page's last row scrolls clear of the tap hint and the score bar", async ({ browser }) => {
  const { team, game } = await inFirstPeriod("afl");
  const context = await browser.newContext({ storageState: "playwright/.auth/super-admin.json", viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await openLive(page, `/teams/${team.id}/games/${game.id}/live`);
  const hint = page.getByText("Tap a player for actions");
  await expect(hint).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const restart = page.getByRole("button", { name: /^restart game$/i });
  const r = (await restart.boundingBox())!;
  const h = (await hint.boundingBox())!;
  const bar = (await page.getByRole("button", { name: /^clock — /i }).first().evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    while (n && getComputedStyle(n).position !== "sticky" && getComputedStyle(n).position !== "fixed") n = n.parentElement;
    return n!.getBoundingClientRect().top;
  }));
  expect(r.y + r.height).toBeLessThanOrEqual(h.y);
  expect(r.y + r.height).toBeLessThanOrEqual(bar);
  await context.close();
});

// ─── #7 Which team is the parent's ───────────────────────────────

for (const sport of ["netball", "soccer", "rugby_league"] as const) {
  test(`#7 ${sport}: on a game-day link the scorebug marks our team as the parent's`, async ({ browser }) => {
    const { game, team } = await inFirstPeriod(sport);
    const { context, page } = await parentPhone(browser);
    await openLive(page, `/run/${game.share_token}`);
    const names = page.getByTestId("scorebug-team-name");
    await expect(names.first()).toContainText(team.name);
    await expect(names.first().getByTestId("scorebug-yours")).toHaveText(/\(you\)/);
    await expect(names.last().getByTestId("scorebug-yours")).toHaveCount(0);
    await context.close();
  });
}

test("#7 the coach's own live screen doesn't say (you)", async ({ page }) => {
  const { team, game } = await inFirstPeriod("soccer");
  await skipHints(page);
  await openLive(page, `/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByTestId("scorebug-yours")).toHaveCount(0);
});

// ─── #8 The other phone's score names who scored ────────────────

test("#8 a goal from another phone names the kid who scored it", async ({ browser }) => {
  const { admin, ownerId, game, players } = await inFirstPeriod("soccer");
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  const scorer = players[4];
  await admin.from("game_events").insert({
    game_id: game.id,
    type: "goal",
    player_id: scorer.id,
    metadata: { sport: "soccer" },
    created_by: ownerId,
    idempotency_key: crypto.randomUUID(),
  });
  const first = scorer.full_name.split(" ")[0];
  await expect(page.getByText(new RegExp(`^Another phone added ${first}( \w+)?'s goal$`))).toBeVisible({ timeout: 20_000 });
  await context.close();
});

// ─── #10 Netball's sub note on a bench kid's sheet ───────────────

test("#10 netball: a bench kid's sheet says subs happen at the break", async ({ browser }) => {
  const { game, ids } = await inFirstPeriod("netball");
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  await page.getByTestId(`player-tile-${ids[7]}`).click({ delay: 600 });
  await expect(page.getByTestId("lock-modal-note")).toContainText("bench players go on in the next quarter's lineup");
  await context.close();
});

// ─── #11 Help answers the questions the rounds asked ─────────────

test("#11 the FAQ answers two phones, leaving early, OFF 1, the balance reset, period length and parents' accounts", async ({ browser }) => {
  const { context, page } = await parentPhone(browser);
  await page.goto("/help/faq");
  for (const q of [
    "What happens when two phones score the same game?",
    "A player leaves early. What do I do?",
    'What do "OFF 1" and "Stays" mean?',
    "Can I reset season balance without losing stats?",
    "How do I change the quarter or half length?",
    "Do parents need an account to say if their child can play?",
  ]) {
    await expect(page.getByText(q, { exact: true })).toBeVisible();
  }
  await context.close();
});

// ─── #12 A parent helper is told why ─────────────────────────────

test("#12 a parent helper's game page says who sets the lineup and starts the game", async ({ browser }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `R9 parent ${uniq()}` });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew" });
  const parent = await newPerson(admin, "r9-parent", "Pat Parent");
  await admin.from("team_memberships").insert({ team_id: team.id, user_id: parent.id, role: "parent" });
  const { context, page } = await signedInPhone(browser, parent);
  try {
    await page.goto(`/teams/${team.id}/games/${game.id}`);
    await expect(page.getByTestId("parent-game-note")).toContainText("The coach or a game manager sets the lineup and starts the game");
  } finally {
    await context.close();
    await deleteTestUser(admin, parent.id);
  }
});

// ─── #13 Keyboard: a skip link to the scores ─────────────────────

test("#13 keyboard: the first Tab offers Skip to scores, and the other team's chip is a few Tabs after", async ({ browser }) => {
  const { game } = await inFirstPeriod("soccer");
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  await page.locator("body").focus();
  let reached = false;
  for (let i = 0; i < 6 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Skip to scores");
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Enter");
  let tabs = 0;
  for (; tabs < 8; tabs++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    if (label === "Add goal, Sharks") break;
  }
  expect(tabs).toBeLessThan(8);
  expect(await page.evaluate(() => !!document.activeElement?.closest("#live-scores"))).toBe(true);
  await context.close();
});
