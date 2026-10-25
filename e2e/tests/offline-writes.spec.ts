// No signal on the sideline (round-3 edge testing, 24 Oct 2026, P0/P1).
//
// The write queue gave up on a write after five tries on a 1/2/4/8 s
// backoff and dropped it, never asking whether the phone had signal, so
// anything tapped more than ~15 s into an outage was lost, in tap order.
// A period that ended offline got stuck ("Applying…" forever in soccer,
// no break in netball), and AFL's Start Q2 offline crashed the page to
// "Something went wrong · Failed to fetch". After a reload, taps still
// queued vanished from the screen, so a coach tapped them again.
//
// Each sport here goes offline for well over 15 s: scores, a hand sub
// (where the sport has one mid-period), the period's hooter and the next
// period's start, all with no signal. Then the signal comes back, and the
// database has each action exactly once, in tap order. Plus a reload
// while offline: the queued tap is still drawn, saves once, and isn't
// doubled.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Sport = "afl" | "soccer" | "netball";

const SETUP: Record<Sport, { ageGroup: string; count: number; lineup: (ids: string[]) => Record<string, unknown> }> = {
  afl: {
    ageGroup: "U10",
    count: 14,
    lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }),
  },
  soccer: {
    ageGroup: "U9",
    count: 9,
    lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 3), mid: ids.slice(3, 6), att: ids.slice(6, 7), field: [] }, bench: ids.slice(7) }),
  },
  netball: {
    ageGroup: "go",
    count: 9,
    lineup: (ids) => ({
      positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])),
      bench: ids.slice(7),
    }),
  },
};

/** A game in its first period, `secondsIn` into a `periodSeconds` period at real speed, scoring on. */
async function liveGame(admin: SupabaseClient, sport: Sport, secondsIn: number, periodSeconds: number) {
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const s = SETUP[sport];
  const team = await makeTeam(admin, {
    ownerId,
    sport,
    ageGroup: s.ageGroup,
    name: `Offline-${sport}-${Date.now() % 100000}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: s.count, ageGroup: s.ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rovers" });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const kickoff = Date.now() - secondsIn * 1000;
  const sportTag = sport === "afl" || sport === "netball" ? {} : { sport };
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup: s.lineup(players.map((p) => p.id)), ...sportTag }, created_at: new Date(kickoff - 1000).toISOString() },
      { type: "quarter_start", metadata: { quarter: 1, ...sportTag }, created_at: new Date(kickoff).toISOString() },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed events: ${error.message}`);
  await admin
    .from("games")
    .update({ status: "in_progress", clock_multiplier: 1, sub_interval_seconds: 900, quarter_length_seconds: periodSeconds })
    .eq("id", game.id);
  return { team, game, ids: players.map((p) => p.id) };
}

async function eventTypes(admin: SupabaseClient, gameId: string) {
  const { data } = await admin
    .from("game_events")
    .select("type, metadata, idempotency_key")
    .eq("game_id", gameId)
    .order("created_at");
  return (data ?? []) as { type: string; metadata: { quarter?: number }; idempotency_key: string | null }[];
}

/** The types after the seed (lineup_set + quarter_start), in order, without clock marks. */
async function tapped(admin: SupabaseClient, gameId: string) {
  return (await eventTypes(admin, gameId))
    .slice(2)
    .filter((e) => e.type !== "clock_pause")
    .map((e) => (e.type === "quarter_start" || e.type === "quarter_end" ? `${e.type} ${e.metadata.quarter}` : e.type));
}

async function skipTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

/** The break's Start, then its confirm ("Start Q2 now", or "Start anyway" when a rule breaks). */
async function startNextPeriod(page: Page, label: RegExp) {
  // The hooter is up to a minute away.
  await page.getByRole("button", { name: label }).last().click({ timeout: 90_000 });
  const anyway = page.getByRole("button", { name: "Start anyway" });
  const now = page.getByRole("button", { name: /^start .+ now$/i });
  await expect(anyway.or(now)).toBeVisible();
  await ((await anyway.isVisible()) ? anyway : now).click();
}

test("AFL: scores, a sub, the siren and Start Q2 with no signal all save once, in order", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = createAdminClient();
  // 75 s quarters, 20 s in: the siren goes about a minute into the outage.
  const { team, game, ids } = await liveGame(admin, "afl", 20, 75);
  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — \w+, running$/i })).toBeVisible({ timeout: 30_000 });

  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Add goal, Rovers" }).click();
  await page.getByRole("button", { name: "Add behind, Rovers" }).click();
  await page.getByTestId(`player-tile-${ids[0]}`).click();
  await page.getByTestId(`player-tile-${ids[12]}`).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("offline-banner")).toContainText(/3 taps waiting to save/);

  // The siren, offline: the quarter ends here, and Q2 starts here.
  await page.getByRole("button", { name: /select team for q2/i }).click({ timeout: 90_000 });
  await startNextPeriod(page, /^start q2$/i);
  await expect(page.getByRole("button", { name: /^clock — q2, running$/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  // Nothing has reached the server, long past the old ~15 s cut-off.
  expect(await tapped(admin, game.id)).toEqual([]);

  await page.context().setOffline(false);
  await expect
    .poll(() => tapped(admin, game.id), { timeout: 45_000 })
    .toEqual(expect.arrayContaining(["opponent_goal", "opponent_behind", "swap", "quarter_end 1", "quarter_start 2"]));
  const types = await tapped(admin, game.id);
  // Each once, in tap order (a break lineup may sit before the start).
  expect(types.filter((t) => t !== "lineup_set")).toEqual(["opponent_goal", "opponent_behind", "swap", "quarter_end 1", "quarter_start 2"]);
  await expect(page.getByTestId("offline-banner")).toHaveCount(0, { timeout: 15_000 });
});

test("Soccer: goals, a sub, the half-time hooter and the second half with no signal all save once, in order", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = createAdminClient();
  const { team, game, ids } = await liveGame(admin, "soccer", 20, 75);
  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 30_000 });

  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Add goal, Rovers" }).click();
  await page.getByRole("button", { name: "Add goal, Rovers" }).click();
  await page.getByTestId(`player-tile-${ids[3]}`).click();
  await page.getByTestId(`player-tile-${ids[7]}`).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  // The hooter ends the half with no signal: the break opens here (it
  // used to sit on "Applying…" with the kids' minutes running on).
  await startNextPeriod(page, /^start 2nd half$/i);
  await expect(page.getByRole("button", { name: /^clock — h2, running$/i })).toBeVisible({ timeout: 15_000 });
  expect(await tapped(admin, game.id)).toEqual([]);

  await page.context().setOffline(false);
  await expect
    .poll(async () => (await tapped(admin, game.id)).filter((t) => t !== "lineup_set"), { timeout: 45_000 })
    .toEqual(["opponent_goal", "opponent_goal", "swap", "quarter_end 1", "quarter_start 2"]);
});

test("Netball: goals, the quarter's hooter and Start Q2 with no signal all save once, in order", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = createAdminClient();
  const { team, game } = await liveGame(admin, "netball", 20, 75);
  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — q1, running$/i })).toBeVisible({ timeout: 30_000 });

  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Add goal, Rovers" }).click();
  await page.getByRole("button", { name: "Add goal, Rovers" }).click();

  // The hooter with no signal: the break opens here (it used to freeze
  // at 0:00 with no break), and Q2 starts here.
  await startNextPeriod(page, /^start q2$/i);
  await expect(page.getByRole("button", { name: /^clock — q2, running$/i })).toBeVisible({ timeout: 15_000 });
  expect(await tapped(admin, game.id)).toEqual([]);

  await page.context().setOffline(false);
  await expect
    .poll(async () => (await tapped(admin, game.id)).filter((t) => t !== "period_break_swap"), { timeout: 45_000 })
    .toEqual(["opponent_goal", "opponent_goal", "quarter_end 1", "quarter_start 2"]);
});

// Routing a save needs the service worker out of the way: WebKit's
// requests through it never reach Playwright's routes, so the save got
// through (merge e2e, 25 Oct 2026).
test.describe("with saves routed", () => {
  test.use({ serviceWorkers: "block" });

  test("Soccer: a tap still queued at a reload is still drawn, and saves once", async ({ page }) => {
    test.setTimeout(120_000);
    const admin = createAdminClient();
    const { team, game } = await liveGame(admin, "soccer", 20, 600);
    await skipTours(page);
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    const theirs = page.getByTestId("scorebug-team-name").last().locator("xpath=following-sibling::p[1]");
    await expect(theirs).toHaveText("0", { timeout: 30_000 });

    // The saves don't get through (a dead zone the phone calls online);
    // the page itself still loads, as it would from the phone's cache.
    // (Playwright's offline mode can't reload a page at all.)
    const dropSaves = (route: import("@playwright/test").Route) =>
      route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue();
    // By path, on the whole context.
    const livePage = (url: URL) => url.pathname.endsWith(`/games/${game.id}/live`);
    await page.context().route(livePage, dropSaves);
    await page.getByRole("button", { name: "Add goal, Rovers" }).click();
    await expect(theirs).toHaveText("1");
    await page.waitForTimeout(20_000);
    await page.reload();
    await waitForHydration(page);
    // Still there after the reload: before, it vanished (and was tapped again).
    await expect(theirs).toHaveText("1", { timeout: 30_000 });
    await expect(page.getByTestId("offline-banner")).toContainText(/Saving 1 change/);
    expect((await eventTypes(admin, game.id)).filter((e) => e.type === "opponent_goal")).toHaveLength(0);

    await page.context().unroute(livePage, dropSaves);
    await expect
      .poll(async () => (await eventTypes(admin, game.id)).filter((e) => e.type === "opponent_goal").length, { timeout: 30_000 })
      .toBe(1);
    await expect(theirs).toHaveText("1");
  });
});
