// Covers the setAvailability action + add/remove fill-in flow on
// the standalone /availability route. (Until 2026-05-13 the
// availability + fill-in UI lived inline on the game-detail page;
// it was split out into its own pre-game step. Tests below
// navigate to /availability accordingly — the game-detail page no
// longer renders the AvailabilityList.)
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

  // UX review #11 (Steve 2026-07-08): each row is now ONE segmented
  // In / Out control — tap the state you want. A fresh game has NO
  // game_availability rows, so every row starts as "Out" (unknown).
  // Click In (unknown → available), wait for the active state, then
  // click Out (available → unavailable).
  const target = players[0];

  await page.goto(`/teams/${team.id}/games/${game.id}/availability`);

  const row = page
    .getByRole("listitem")
    .filter({ hasText: target.full_name })
    .first();
  const inBtn = row.getByRole("button", { name: /^in$/i });
  const outBtn = row.getByRole("button", { name: /^out$/i });
  // Click 1: unknown → available.
  await inBtn.click();
  // Wait for the round-trip to land before clicking again — otherwise
  // we race and may double-fire on stale state.
  await expect(inBtn).toHaveAttribute("aria-pressed", "true");
  // Click 2: available → unavailable.
  await outBtn.click();

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

// UX review #11 (Steve 2026-07-08): the everyone-showed-up fast path.
// One "Mark all N in" tap replaces N individual row taps.
test("Mark all in marks the whole squad available in one tap", async ({
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

  await page.goto(`/teams/${team.id}/games/${game.id}/availability`);

  await page.getByRole("button", { name: /^mark all 12 in$/i }).click();

  // Every squad player ends up available…
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_availability")
          .select("status")
          .eq("game_id", game.id)
          .eq("status", "available");
        return data?.length ?? 0;
      },
      { timeout: 10_000, intervals: [300, 500, 500, 1000, 1000, 2000] },
    )
    .toBe(players.length);

  // …and the bulk button disappears (nothing left to mark).
  await expect(
    page.getByRole("button", { name: /mark all .* in/i }),
  ).toHaveCount(0, { timeout: 10_000 });
});

// Regression for the "couple-of-seconds dead tap" Steve saw 2026-05-13
// going from /availability → /live: the CTA was a plain Next.js Link
// so during the ~2s the /live RSC payload streams in, React kept the
// old availability UI painted with no busy signal. The fix swapped
// it for a client-component button using useTransition + router.push
// so the button itself shows the brand pulse + "Loading lineup…"
// while the navigation is in flight.
//
// This test pins the structural contract: the CTA must be a
// <button>, not an <a>, AND clicking it must land on /live. If a
// future refactor regresses to a plain Link, role="button" stops
// matching and this test goes red.
test("Continue-to-lineup CTA is a button with pending state, not a plain link", async ({
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

  // Seed availability so /live doesn't hit its "no players available"
  // empty-state branch — we want it to take its full data-fetching
  // path so the test actually exercises the slow transition.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/availability`);

  // role="button" — the contract. A plain SFButton href renders as
  // an <a>, which would NOT match this locator. The button-based
  // ContinueToLineupButton DOES match.
  const cta = page.getByRole("button", { name: /continue to lineup/i });
  await expect(cta).toBeVisible({ timeout: 10_000 });

  await cta.click();

  // After click, we should land on /live and the LineupPicker should
  // render. The "Ready for Q1" CTA is the LineupPicker's pre-kickoff
  // signal (see lineup.spec.ts for the deeper assertion).
  await expect(page).toHaveURL(/\/live$/, { timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: /^ready for q1$/i }),
  ).toBeVisible({ timeout: 10_000 });
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

  await page.goto(`/teams/${team.id}/games/${game.id}/availability`);

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
