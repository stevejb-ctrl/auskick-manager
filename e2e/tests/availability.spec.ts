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

  // The original spec assumed "all players default to 'available'", but
  // since the AvailabilityRow rework that's no longer true: a row with
  // no game_availability record renders the "Unavailable" button label
  // (legacy `unknown` is folded into unavailable for the 2-state UI),
  // and clicking it flips to `available` rather than `unavailable`. To
  // make the toggle test deterministic, pre-seed the target player as
  // `available` so the rendered button reads "Available" and clicking
  // it flips to `unavailable` — which is what the spec actually wants
  // to verify.
  const target = players[0];
  await admin.from("game_availability").insert({
    game_id: game.id,
    player_id: target.id,
    status: "available",
    updated_by: ownerId,
    updated_at: new Date().toISOString(),
  });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  // Find the row for the seeded player and click its toggle. The
  // button label reads "Available" because of the seed above; clicking
  // calls setAvailability with `nextStatus[available] = unavailable`.
  const row = page
    .getByRole("listitem")
    .filter({ hasText: target.full_name })
    .first();
  await row.getByRole("button", { name: /^available$/i }).click();

  // Short wait for the server action to commit.
  await page.waitForTimeout(500);

  const { data: availability } = await admin
    .from("game_availability")
    .select("status")
    .eq("game_id", game.id)
    .eq("player_id", target.id)
    .single();
  expect(availability?.status).toBe("unavailable");
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
