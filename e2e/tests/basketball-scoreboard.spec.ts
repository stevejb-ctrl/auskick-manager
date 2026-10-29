// Steve 2026-10-22: "This 1/2/3 points part of the ui for basketball still
// isn't working right. Looks terrible." On a phone the long-press hint
// ("Tap a player for actions") sits a fixed 96 px above
// the bottom, which clears AFL's one-row scorebug but lands on basketball's
// taller one: it covered the +1 / +2 row, so taps hit the hint and the
// score stayed 0. And the chips wrapped 2 + 1 under each score.
//
// Pinned on a 375 px touch screen, first visit (the hint showing): every
// chip is the topmost thing at its own centre, the three sit in one row
// at 44 pt or more, and +2, +3, +1 read 2, 5, 6 on the scorebug.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

async function chipsAreReachable(page: Page, name: string) {
  for (const n of [1, 2, 3]) {
    const chip = page.getByRole("button", { name: `Add ${n} ${n === 1 ? "point" : "points"}, ${name}` });
    await expect(chip).toBeVisible();
    const topmost = await chip.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === el || el.contains(hit);
    });
    expect(topmost, `+${n} for ${name} is covered`).toBe(true);
  }
  const boxes = await Promise.all(
    [1, 2, 3].map((n) =>
      page.getByRole("button", { name: `Add ${n} ${n === 1 ? "point" : "points"}, ${name}` }).boundingBox(),
    ),
  );
  for (const b of boxes) {
    expect(b!.height).toBeGreaterThanOrEqual(44);
    expect(b!.width).toBeGreaterThanOrEqual(44);
    expect(Math.abs(b!.y - boxes[0]!.y), `${name}'s chips share one row`).toBeLessThan(2);
  }
}

test("basketball's +1 / +2 / +3 sit in one row, aren't covered, and score on a phone", async ({ page }) => {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12", name: `Hoops ${Date.now() % 1000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 7 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Fdggd" });
  const k = players.map((p) => p.id);
  const lineup = { lines: { guard: k.slice(0, 2), forward: k.slice(2, 5), court: [] }, bench: k.slice(5) };
  const start = new Date(Date.now() - 17_000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup, sport: "basketball" }, created_by: ownerId, created_at: start },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport: "basketball" }, created_by: ownerId, created_at: start },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
  // First visit on this phone: the player-actions hint is up.
  await expect(page.getByText(/tap a player for actions/i)).toBeVisible({ timeout: 10_000 });
  // The hint sits wholly above the score bar, on any phone.
  const overlap = await page.evaluate(() => {
    const hint = Array.from(document.querySelectorAll("[role=status]")).find((e) => /tap a player for actions/i.test(e.textContent ?? ""))!;
    const bar = document.querySelector("[aria-label^='Clock']")!.closest(".fixed")!;
    return hint.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
  });
  expect(overlap, "the hint overlaps the score bar").toBeLessThanOrEqual(0);

  await chipsAreReachable(page, team.name);
  await chipsAreReachable(page, "Fdggd");

  const ours = page.getByTestId("scorebug-team-name").first().locator("xpath=..");
  for (const [n, total] of [
    [2, "2"],
    [3, "5"],
    [1, "6"],
  ] as const) {
    await page.getByRole("button", { name: `Add ${n} ${n === 1 ? "point" : "points"}, ${team.name}` }).tap();
    await page.getByRole("dialog").getByRole("button", { name: /not sure who/i }).tap();
    await expect(ours).toContainText(total, { timeout: 3_000 });
  }
});
