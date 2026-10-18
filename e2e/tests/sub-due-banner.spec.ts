// "Sub due" is a banner under the top bar, not a modal, in every sport
// (Steve, 16 Oct 2026). The modal sat over the score chips, so a coach
// had to dismiss it before recording a try that had just been scored
// (Stagehand union). The banner leaves the field and the chips tappable;
// "Got it" clears it. It beeps as AFL's always has.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

// A phone: the banner's message fits one line beside Got it.
test.use({ viewport: { width: 375, height: 740 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Count the sub-due beeps: a stand-in AudioContext that records each
    // tone started, so the test can hear what a coach would.
    const w = window as unknown as { __beeps: number; AudioContext: unknown };
    w.__beeps = 0;
    const param = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    w.AudioContext = class {
      state = "running";
      currentTime = 0;
      destination = {};
      resume() { return Promise.resolve(); }
      createGain() { return { gain: param, connect() {} }; }
      createOscillator() { return { type: "", frequency: param, connect() {}, start() { w.__beeps++; }, stop() {} }; }
    };
    try {
      for (const k of ["gm-walkthrough-seen", "league-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
});

const SUB_INTERVAL_S = 30;

/** A game 40 s into its first period with 30 s subs; open it with `openWithSubDue`. */
async function subDueGame(sport: "afl" | "rugby_union") {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const union = sport === "rugby_union";
  const ageGroup = union ? "U12" : "U10";
  const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `SUB-DUE ${sport} ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: union ? 17 : 15, ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const { error } = await admin
    .from("games")
    .update({ clock_multiplier: 1, sub_interval_seconds: SUB_INTERVAL_S, status: "in_progress" })
    .eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = players.map((p) => p.id);
  const lineup = union
    ? { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: ids.slice(15) }
    : { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const { error: evErr } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport }, created_at: t(41) },
      { type: "quarter_start", metadata: { quarter: 1, sport }, created_at: t(40) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (evErr) throw new Error(evErr.message);
  return { coach: `/teams/${team.id}/games/${game.id}/live`, runner: `/run/${game.share_token}` };
}

/**
 * Open the live screen with its sub due. League and union count the
 * interval from the period start, so theirs is due on arrival. AFL lines
 * its countdown up to the interval grid when the screen mounts (LiveGame's
 * subBaseMs seed), so 40 s in with 30 s subs its sub falls due at 60 s:
 * 15–20 s after arrival, against a 20 s wait that starts later still. CI
 * run 39068715755 missed it by under a second, three times. So the page
 * runs on Playwright's clock, and once it has hydrated the clock jumps one
 * interval: wherever the screen mounted, the next grid point is behind it.
 */
async function openWithSubDue(page: Page, url: string) {
  await page.clock.install();
  await page.goto(url);
  await waitForHydration(page);
  await page.clock.fastForward(SUB_INTERVAL_S * 1000);
}

async function expectBannerNotModal(page: Page, chip: string) {
  const banner = page.getByRole("alert").filter({ hasText: /sub due/i });
  await expect(banner).toBeVisible({ timeout: 20_000 });
  expect((await banner.locator("p").boundingBox())!.height).toBeLessThan(30);
  // It beeps as it appears, in every sport (league and union were silent).
  await expect.poll(() => page.evaluate(() => (window as unknown as { __beeps: number }).__beeps)).toBeGreaterThan(0);
  // Nothing modal over the screen: the score chip would take the tap
  // (a trial click checks nothing covers it, without recording).
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: chip }).first().click({ trial: true, timeout: 5_000 });
  // Got it clears the banner.
  await banner.getByRole("button", { name: "Got it" }).click();
  await expect(banner).toHaveCount(0);
}

// AFL: one event, one voice (design session 17 Oct 2026). The swap card
// IS the sub-due alert — amber ring, SUB DUE eyebrow, role="alert" — and
// the separate banner is gone, so exactly one alert is on screen. It
// still beeps, nothing modal covers the chips, and Collapse folds it.
async function expectCardIsTheAlert(page: Page) {
  const alerts = page.getByRole("alert");
  await expect(alerts.filter({ hasText: /sub due/i })).toBeVisible({ timeout: 20_000 });
  // Next's route announcer is an empty role="alert"; count the ones
  // that say something.
  const spoken = alerts.filter({ hasText: /\S/ });
  await expect(spoken).toHaveCount(1);
  const card = spoken.first();
  await expect(card).toContainText("Rotate a player off");
  await expect(card.getByTestId("swapcard-apply-all")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __beeps: number }).__beeps)).toBeGreaterThan(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^add goal, /i }).first().click({ trial: true, timeout: 5_000 });
  await card.getByRole("button", { name: "Collapse" }).click();
  await expect(card.getByTestId("swapcard-apply-all")).toHaveCount(0);
}

test("AFL: sub due is the swap card, and +G still takes the tap", async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSubDue(page, (await subDueGame("afl")).coach);
  await expectCardIsTheAlert(page);
});

// The runner link gets the same live screen (and so the same card) as
// the coach.
test("AFL runner: sub due is the same card", async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSubDue(page, (await subDueGame("afl")).runner);
  await expect(page.getByRole("button", { name: "Exit live game" })).toBeVisible({ timeout: 15_000 });
  await expectCardIsTheAlert(page);
});

test("union: sub due is a banner, and +T still takes the tap", async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSubDue(page, (await subDueGame("rugby_union")).coach);
  await expectBannerNotModal(page, "Record a try for our team");
});

// The banner's screenshots (16 Oct 2026) showed the sub card's swap rows
// at 375 px clipping names: AFL's to a single glyph ("D [ ⌄ → O ( ⌄"),
// union's to "Bren… → Qu…". Make swap now wraps to its own line first.
for (const { sport, rows } of [
  { sport: "afl" as const, rows: '[data-testid^="swap-pair-"][data-testid$="-off"], [data-testid^="swap-pair-"][data-testid$="-on"]' },
  { sport: "rugby_union" as const, rows: '[data-testid^="league-swap-pair-"]' },
]) {
  test(`${sport}: at 375 px the sub card's swap rows show whole names`, async ({ page }) => {
    test.setTimeout(90_000);
    await openWithSubDue(page, (await subDueGame(sport)).coach);
    await expect(page.locator(rows).first()).toBeVisible({ timeout: 20_000 });
    const clipped = await page.evaluate((selector) => {
      // League rows truncate a name span; AFL's name buttons ARE the names.
      const names = Array.from(document.querySelectorAll(selector)).flatMap((row) => {
        const spans = Array.from(row.querySelectorAll("span.truncate"));
        return spans.length > 0 ? spans : [row];
      }) as HTMLElement[];
      return { count: names.length, clipped: names.filter((n) => n.scrollWidth > n.clientWidth).map((n) => n.textContent) };
    }, rows);
    expect(clipped.count).toBeGreaterThan(0);
    expect(clipped.clipped).toEqual([]);
  });
}
