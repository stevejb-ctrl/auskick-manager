// "Sub due" is never a modal, in any sport (Steve, 16 Oct 2026): the
// modal sat over the score chips, so a coach had to dismiss it before
// recording a try that had just been scored (Stagehand union). Since the
// re-skin the sub card itself is the alert, one voice, in every sport;
// the top-bar banner is only for a sub due with nothing to suggest. It
// beeps as AFL's always has.

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

/**
 * A game in its first period with 30 s subs (the database's least) on
 * a 6× clock, so a sub falls due within 5 s of arriving.
 *
 * Union counts from the period start, so its sub is already due. AFL's
 * countdown sits on a grid from the period start, and a fresh mount
 * floors onto it (subIntervalStartFloor), so its next sub is up to one
 * interval away and never already due. At 1× that was up to 30 s, and
 * from 40 s in it fell due at 60 s, 20 s after setup: the AFL tests'
 * 20 s waits only caught it when the page took a while to load.
 */
async function subDueGame(sport: "afl" | "rugby_union" | "basketball" | "soccer") {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const union = sport === "rugby_union";
  const ageGroup = union ? "U12" : sport === "basketball" ? "U12" : sport === "soccer" ? "U9" : "U10";
  // Two workers start the two AFL tests in the same millisecond, so the
  // time alone gave both teams one name and makeTeam's fetch by name
  // found two rows. The random part keeps them apart.
  const suffix = `${Date.now() % 100000}-${Math.random().toString(36).slice(2, 6)}`;
  const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `SUB-DUE ${sport} ${suffix}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const count = union ? 17 : sport === "basketball" ? 7 : sport === "soccer" ? 9 : 15;
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count, ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const { error } = await admin
    .from("games")
    .update({ clock_multiplier: 6, sub_interval_seconds: 30, status: "in_progress" })
    .eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = players.map((p) => p.id);
  const lineup = union
    ? { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: ids.slice(15) }
    : sport === "basketball"
      ? { lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) }
      : sport === "soccer"
        ? { keeper: ids[0], lines: { def: ids.slice(1, 3), mid: ids.slice(3, 6), att: ids.slice(6, 7), field: [] }, bench: ids.slice(7) }
        : { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  // 10 s ago is a minute of game time: two of union's intervals, and
  // AFL's 12-minute quarter has 110 s left for the test to finish in
  // (union's 25-minute half has longer).
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const { error: evErr } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport }, created_at: t(11) },
      { type: "quarter_start", metadata: { quarter: 1, sport }, created_at: t(10) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (evErr) throw new Error(evErr.message);
  return { coach: `/teams/${team.id}/games/${game.id}/live`, runner: `/run/${game.share_token}` };
}

// Every other sport (23 Oct 2026, UI polish round 2 R2): the same one
// voice. Their sub card (NextSubCard, a fork of AFL's) is the alert too;
// the top-bar banner is only for a sub due with nothing to suggest.
async function expectOneVoice(page: Page, chip: string | RegExp) {
  const spoken = page.getByRole("alert").filter({ hasText: /\S/ });
  await expect(spoken.filter({ hasText: /sub due/i })).toBeVisible({ timeout: 20_000 });
  await expect(spoken).toHaveCount(1);
  const card = spoken.first();
  await expect(card).toContainText("Rotate a player off");
  await expect(card.getByRole("button", { name: /^make (all \d+ swaps|this swap)$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Got it" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __beeps: number }).__beeps)).toBeGreaterThan(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: chip }).first().click({ trial: true, timeout: 5_000 });
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
  await page.goto((await subDueGame("afl")).coach);
  await waitForHydration(page);
  await expectCardIsTheAlert(page);
});

// The runner link gets the same live screen (and so the same card) as
// the coach.
test("AFL runner: sub due is the same card", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto((await subDueGame("afl")).runner);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: "Exit live game" })).toBeVisible({ timeout: 15_000 });
  await expectCardIsTheAlert(page);
});

for (const { sport, chip } of [
  { sport: "rugby_union" as const, chip: "Record a try for our team" },
  { sport: "basketball" as const, chip: /^add 2 points, /i },
  { sport: "soccer" as const, chip: /^add goal, /i },
]) {
  test(`${sport}: sub due is the sub card alone, and the score chip still takes the tap`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto((await subDueGame(sport)).coach);
    await waitForHydration(page);
    await expectOneVoice(page, chip);
  });
}

// The banner's screenshots (16 Oct 2026) showed the sub card's swap rows
// at 375 px clipping names: AFL's to a single glyph ("D [ ⌄ → O ( ⌄"),
// union's to "Bren… → Qu…". Make swap now wraps to its own line first.
for (const { sport, rows } of [
  { sport: "afl" as const, rows: '[data-testid^="swap-pair-"][data-testid$="-off"], [data-testid^="swap-pair-"][data-testid$="-on"]' },
  { sport: "rugby_union" as const, rows: '[data-testid^="league-swap-pair-"]' },
]) {
  test(`${sport}: at 375 px the sub card's swap rows show whole names`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto((await subDueGame(sport)).coach);
    await waitForHydration(page);
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
