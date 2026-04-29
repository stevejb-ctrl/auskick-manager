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

  // Land back on team games list. Assert the deleted opponent is gone.
  await page.waitForURL(/\/teams\/[0-9a-f-]+\/games\/?$/, { timeout: 10_000 });

  const { data: games } = await admin
    .from("games")
    .select("id")
    .eq("id", game.id);
  expect(games).toHaveLength(0);
});
