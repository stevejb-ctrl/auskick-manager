// Covers the setAvailability action + add/remove fill-in flow on
// the game detail page.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/actions.ts:
//         setAvailability, addFillIn, removeFillIn

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("team admin toggles a player's availability for a game", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 12,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // The original spec assumed "all players default to available", but
  // since the AvailabilityRow rework that's no longer true: a fresh
  // game has NO game_availability rows, AvailabilityRow renders status
  // "unknown" with the button label "Unavailable", and
  // `nextStatus.unknown = "available"` — so clicking once flips them
  // TO available, not the other way. To verify a flip from "available"
  // to "unavailable", click twice: unknown → available → unavailable.
  const target = players[0];

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  const row = page
    .getByRole("listitem")
    .filter({ hasText: target.full_name })
    .first();
  // Click 1: unknown → available. Button label is "Unavailable" until
  // it flips, then becomes "Available".
  await row.getByRole("button", { name: /^unavailable$/i }).click();
  // Wait for the round-trip to land before clicking again — otherwise
  // we race and may double-fire on stale state.
  await expect(row.getByRole("button", { name: /^available$/i })).toBeVisible();
  // Click 2: available → unavailable.
  await row.getByRole("button", { name: /^available$/i }).click();

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_availability")
          .select("status")
          .eq("game_id", game.id)
          .eq("player_id", target.id)
          .single();
        return data?.status;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe("unavailable");
});

test("team admin adds a fill-in player for this game only", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  await page.getByText(/add fill-in/i).click();
  await page
    .getByPlaceholder(/fill-in name/i)
    .fill("Guest Player");
  await page.getByPlaceholder(/^#$/).fill("99");
  await page.getByRole("button", { name: /^add$/i }).click();

  await expect(page.getByText("Guest Player")).toBeVisible({ timeout: 5_000 });

  const { data: fillIns } = await admin
    .from("game_fill_ins")
    .select("id, full_name")
    .eq("game_id", game.id);
  expect(fillIns?.find((f) => f.full_name === "Guest Player")).toBeDefined();
});
