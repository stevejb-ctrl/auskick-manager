// Covers deleteGame server action. The companion update-game test
// was removed in 2026-04-29 — `updateGame` is defined in
// `src/app/(app)/teams/[teamId]/games/actions.ts` but isn't called
// from anywhere in `src/`. There's no UI affordance to edit a game's
// metadata, so the spec was testing a flow that doesn't exist. Per
// CLAUDE.md "dead tests are worse than no tests."
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts:deleteGame

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("delete game removes it from the games list", async ({ page }) => {
  const admin = createAdminClient();

  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    opponent: `Doomed ${Date.now()}`,
  });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  // Delete lives in the game's More menu, behind a confirm dialog.
  await page.getByRole("button", { name: /more actions/i }).click();
  await page.getByRole("button", { name: /^delete game$/i }).click();
  await page.getByRole("button", { name: /yes, delete this game/i }).click();

  // Wait for the cascade-delete to complete in the DB before asserting on
  // the URL or row count. Under parallel workers the deleteGame server
  // action occasionally settles the navigation a touch later than 10s,
  // and the prior `waitForURL` race surfaced as a flake. This is a
  // DIFFERENT race from the admin-membership hydration helper at
  // e2e/helpers/admin-hydration.ts (which guards switch clicks); here we
  // wait for the cascade-delete row count, not for a hydrated control.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("games")
          .select("id")
          .eq("id", game.id);
        return data?.length ?? -1;
      },
      { timeout: 30_000, intervals: [200, 500, 1000, 2000, 2000] },
    )
    .toBe(0);
  await expect(page).toHaveURL(/\/teams\/[0-9a-f-]+\/games\/?$/, { timeout: 10_000 });
});

// Regression (UX plan H3 / 0.7): a final game's detail page led with
// "Open live game" and stacked Restart + Delete in red underneath. The
// primary action for a final game is its Summary; destructive actions
// live behind the More menu.
test("a final game leads with Summary and keeps Restart/Delete in More", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  await expect(page.getByRole("link", { name: /^summary$/i })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("link", { name: /open live game/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^restart game$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^delete game$/i })).toHaveCount(0);

  await page.getByRole("button", { name: /more actions/i }).click();
  const sheet = page.getByRole("dialog", { name: /game actions/i });
  await expect(sheet.getByRole("button", { name: /^restart game$/i })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^delete game$/i })).toBeVisible();
});

// UX plan 1.2 — Game hub: one primary per state. An upcoming game's one
// job is its lineup ("Plan lineup", or "Start game day" on the day);
// the game-day link, editing details and deleting live in More.
test("an upcoming game leads with Plan lineup; More holds link, edit and delete", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    opponent: `Hub ${Date.now()}`,
    scheduledAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
  });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  const primary = page.getByRole("link", { name: /^plan lineup$/i });
  await expect(primary).toBeVisible({ timeout: 10_000 });
  await expect(primary).toHaveAttribute("href", `/teams/${team.id}/games/${game.id}/live`);
  // The old pair of duplicate CTAs is gone.
  await expect(page.getByRole("link", { name: /^start game$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^set lineup$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /game-day link/i })).toHaveCount(0);

  await page.getByRole("button", { name: /more actions/i }).click();
  const sheet = page.getByRole("dialog", { name: /game actions/i });
  await expect(sheet.getByRole("button", { name: /^game-day link$/i })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^edit details$/i })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^delete game$/i })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^restart game$/i })).toHaveCount(0);

  // Game-day link opens with the runner URL.
  await sheet.getByRole("button", { name: /^game-day link$/i }).click();
  await expect(page.getByLabel(/^game-day link$/i)).toHaveValue(
    new RegExp(`/run/${game.share_token}$`),
  );
  await page.getByRole("button", { name: /^done$/i }).click();

  // Edit details saves through updateGame.
  await page.getByRole("button", { name: /more actions/i }).click();
  await page
    .getByRole("dialog", { name: /game actions/i })
    .getByRole("button", { name: /^edit details$/i })
    .click();
  await page.getByLabel(/opponent/i).fill("Renamed Rovers");
  await page.getByRole("button", { name: /^save changes$/i }).click();
  await expect
    .poll(
      async () => {
        const { data } = await admin.from("games").select("opponent").eq("id", game.id).single();
        return data?.opponent;
      },
      { timeout: 5_000, intervals: [200, 500, 1000] },
    )
    .toBe("Renamed Rovers");
  await expect(page.getByText("Renamed Rovers")).toBeVisible();
});
