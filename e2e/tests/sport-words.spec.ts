// A league team's screens say nothing that only fits AFL (cross-sport
// audit, 14 Oct 2026). Shared chrome said "a long ball-up", "goals and
// behinds", "zone minutes" and "Tap goals"; league's settings offered a
// team song that plays "on goals" (league's live screen plays none) and
// an "AFL-style" bar. Sports are independent: shared copy is neutral,
// and a sport only shows the settings it acts on.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

async function leagueGame(name: string) {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U11", sport: "rugby_league", name: `${name} ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ on_field_size: 11 }).eq("id", game.id);
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  return { team, game };
}

test("league: the live screen's clock menu and restart say nothing AFL", async ({ page }) => {
  const { team, game } = await leagueGame("Words live");
  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page.getByRole("button", { name: /^start h1$/i }).click({ timeout: 15_000 });
  const startClock = page.getByRole("button", { name: /^start [qh]\d+ now$/i });
  // Start always opens the "Start clock" step. isVisible() doesn't wait,
  // so checking it raced the dialog and sometimes skipped the tap.
  await startClock.click({ timeout: 10_000 });

  await page.getByRole("button", { name: /^clock — h1, running$/i }).click({ timeout: 10_000 });
  const menu = page.getByRole("dialog", { name: /h1 clock/i });
  await expect(menu.getByRole("button", { name: /^pause clock$/i })).toBeVisible();
  await expect(menu).not.toContainText(/ball-up/i);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Game settings states U11's own §6 rule (one unbroken half), not
  // "an unbroken quarter/half".
  await page.getByRole("button", { name: /^game settings$/i }).click();
  await expect(page.getByText(/§6: each player must play 1 unbroken half\./)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/quarter\/half/)).toHaveCount(0);
  await page.getByRole("button", { name: /^cancel$/i }).click();

  await page.getByRole("button", { name: /^restart game$/i }).click();
  const restart = page.getByRole("dialog").filter({ hasText: /restart this game\?/i });
  await expect(restart).toBeVisible();
  await expect(restart).not.toContainText(/goal|behind|zone|quarter/i);
});

test("league: the runner's welcome and the team settings say nothing AFL", async ({ page }) => {
  const { team, game } = await leagueGame("Words settings");

  await page.goto(`/teams/${team.id}/settings`);
  await waitForHydration(page);
  await expect(page.getByText(/track forward and back time/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^team song$/i })).toHaveCount(0);
  await expect(page.getByText(/on goals/i)).toHaveCount(0);
  await expect(page.getByText(/afl-style/i)).toHaveCount(0);

  await page.goto(`/run/${game.share_token}`);
  const welcome = page.getByRole("region", { name: /welcome — getting started/i });
  await expect(welcome).toBeVisible({ timeout: 15_000 });
  await expect(welcome).not.toContainText(/goal/i);
});

// U8 league plays quarters: its vest and unbroken-play rules are per
// quarter, and U8 wears the First Receiver vest only (cross-sport audit,
// 14 Oct 2026: the card said "each half" at every age).
test("league U8: How we play states the rules in quarters, FR vest only", async ({ page }) => {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U8", sport: "rugby_league", name: `Words U8 ${Date.now() % 100000}` });

  await page.goto(`/teams/${team.id}/settings`);
  const rules = page.getByRole("list", { name: "Age group rules" });
  await expect(rules).toContainText("Each player plays 2 full quarters without a break", { timeout: 15_000 });
  await expect(rules).toContainText("FR vests are worn by a different player each quarter");
  await expect(rules).not.toContainText(/half|DH/);
});
