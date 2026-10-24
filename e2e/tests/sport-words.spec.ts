// A league team's screens say nothing that only fits AFL (cross-sport
// audit, 14 Oct 2026). Shared chrome said "a long ball-up", "goals and
// behinds", "zone minutes" and "Tap goals"; league's settings offered a
// team song that plays "on goals" (league's live screen plays none) and
// an "AFL-style" bar. Sports are independent: shared copy is neutral,
// and a sport only shows the settings it acts on.
//
// Ten-sport audit, 23 Oct 2026: the clock menu, the start and end-early
// confirms, the team home's oval, the squad step's "15–20 kids", "on
// field" on a court, "Wipes every quarter" in a halves game and the
// login's "Junior AFL" now come from each sport's config.

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
  // League waits for the referee's whistle, not AFL's siren.
  const start = page.getByRole("dialog").filter({ hasText: /when the whistle goes/i });
  await expect(start).toBeVisible({ timeout: 10_000 });
  await expect(start).not.toContainText(/siren/i);
  const startClock = page.getByRole("button", { name: /^start [qh]\d+ now$/i });
  // Start always opens the "Start clock" step. isVisible() doesn't wait,
  // so checking it raced the dialog and sometimes skipped the tap.
  await startClock.click({ timeout: 10_000 });

  await page.getByRole("button", { name: /^clock — h1, running$/i }).click({ timeout: 10_000 });
  const menu = page.getByRole("dialog", { name: /h1 clock/i });
  await expect(menu.getByRole("button", { name: /^pause clock$/i })).toBeVisible();
  await expect(menu).not.toContainText(/ball-up/i);
  await expect(menu).toContainText("When the whistle beats the app's clock.");
  await expect(menu).not.toContainText(/siren/i);

  // The end-early confirm fits a running clock: no "even though the
  // clock is paused".
  await menu.getByRole("button", { name: /^end h1 now/i }).click();
  const endEarly = page.getByRole("dialog", { name: /^end h1 now\?$/i });
  await expect(endEarly).toContainText(/The clock is still running, and everyone on the field/);
  await expect(endEarly).not.toContainText(/paused|siren/i);
  await endEarly.getByRole("button", { name: /^cancel$/i }).click();
  await expect(endEarly).toHaveCount(0);

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

// Futsal is a court sport playing halves: nothing on its screens says
// "field", "quarter" or draws AFL's oval (ten-sport UX audit, 23 Oct 2026).
test("futsal: team home, setup, settings, lineup and game menu speak court and halves", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "futsal", name: `Words futsal ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 7, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );

  // Team home: the "Next up" card draws a futsal court, not an oval.
  await page.goto(`/teams/${team.id}`);
  await expect(page.locator('svg[data-surface="futsal-court"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('svg[data-surface="oval"]')).toHaveCount(0);

  // Setup: the squad range comes from 5 on court and a cap of 12.
  await page.goto(`/teams/${team.id}/setup?step=squad`);
  await expect(page.getByText(/7–12 kids gives you plenty of cover/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/15–20 kids/)).toHaveCount(0);

  // Team settings: players on the court.
  await page.goto(`/teams/${team.id}/settings`);
  await expect(page.getByLabel("Players on the court")).toBeVisible({ timeout: 15_000 });

  // Lineup: "on court" in the footer, and futsal's flying subs.
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByText(/flying subs/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/rolling subs/i)).toHaveCount(0);
  await expect(page.getByText("on court", { exact: true })).toBeVisible();
  await expect(page.getByText("on field", { exact: true })).toHaveCount(0);

  // Game menu: restart wipes every half.
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await page.getByRole("button", { name: /^more actions$/i }).first().click({ timeout: 15_000 });
  const sheet = page.getByRole("dialog", { name: /game actions/i });
  await expect(sheet).toContainText("Wipes every half, swap and score.");
  await expect(sheet).not.toContainText(/quarter/i);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // The main Siren brand serves every sport: its login, Help and FAQ
  // name no single sport (ten-sport UX audit, 23 Oct 2026).
  test("login, Help and the FAQ speak to every sport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await expect(page.getByText("Junior sport team management")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/junior afl/i)).toHaveCount(0);

    await page.goto("/help");
    await expect(page.getByText(/run their junior AFL, netball, .*touch football, or Oztag season/)).toBeVisible();

    await page.goto("/help/faq");
    await expect(page.getByText(/every sport has them\s+except netball/)).toBeVisible();
    await expect(page.getByText(/AFL and league only/)).toHaveCount(0);
  });
});
