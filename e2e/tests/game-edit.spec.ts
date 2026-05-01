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

  // Delete affordance is typically behind a confirmation. Handle both
  // a native dialog and an in-page confirm modal.
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: /delete game|delete/i })
    .first()
    .click();

  // If an in-page modal appears, click its confirm button too.
  const confirmBtn = page.getByRole("button", {
    name: /confirm|yes.*delete/i,
  });
  if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirmBtn.click();
  }

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
