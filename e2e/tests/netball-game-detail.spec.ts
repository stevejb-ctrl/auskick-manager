// Regression coverage for the sport-aware "scorers" card on the
// game-detail page (/teams/[teamId]/games/[gameId]). For AFL the
// card is "Goal kickers / Who put it through" with goals + behinds
// + total points + a Guernsey jersey badge. For netball, none of
// that applies — netball has goal SHOOTERS, no behinds, no jersey
// numbers — so the card flips to "Goal shooters / Who put it in"
// with just goals.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx
//         scorers card (scorersFromEvents, per sport).

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("netball game-detail scorers card uses 'Goal shooters / Who put it in', omits behinds + jersey", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-GD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);

  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 9,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });

  // Seed scoring events directly: 3 goals for players[0] (GS), 1
  // goal for players[1] (GA). The netball replay credits `goal`
  // events to their player_id without any lineup scaffolding.
  await admin.from("game_events").insert([
    { game_id: game.id, type: "goal", player_id: players[0].id, metadata: { sport: "netball" }, created_by: ownerId },
    { game_id: game.id, type: "goal", player_id: players[0].id, metadata: { sport: "netball" }, created_by: ownerId },
    { game_id: game.id, type: "goal", player_id: players[0].id, metadata: { sport: "netball" }, created_by: ownerId },
    { game_id: game.id, type: "goal", player_id: players[1].id, metadata: { sport: "netball" }, created_by: ownerId },
  ]);

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  // Sport-flipped copy: eyebrow + heading. The AFL card reads
  // "Goal kickers / Who put it through".
  await expect(page.getByText(/^goal shooters$/i)).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("heading", { name: /^who put it in$/i }),
  ).toBeVisible();

  // The card should NOT render AFL-specific copy. The points
  // suffix "pts" only renders on the AFL branch (it sits next to
  // the (goals * 6 + behinds) total), so its absence is the most
  // direct proof the netball branch took.
  await expect(page.getByText(/^goal kickers$/i)).toHaveCount(0);
  await expect(page.getByText(/who put it through/i)).toHaveCount(0);
  await expect(page.getByText(/^pts$/i)).toHaveCount(0);

  // Top scorer is players[0] with 3 goals; players[1] has 1 — in
  // netball words (the AFL card would show "g" / "b" / "pts").
  await expect(page.getByText(/^3 goals$/i)).toBeVisible();
  await expect(page.getByText(/^1 goal$/i)).toBeVisible();

  // Scorer count chip: 2 distinct scorers.
  await expect(page.getByText(/^2 scorers$/i)).toBeVisible();

  // No Guernsey jersey badge for netball (jersey_number isn't
  // rendered). The Guernsey component renders an `img` with role
  // "img" and the player number as accessible name; if it leaks
  // through, that's a regression.
  await expect(page.locator("svg[aria-label*='jersey']")).toHaveCount(0);
});

// Regression (UX plan H3 / 0.5): the game-detail header read the
// AFL-only AGE_GROUPS map, so a netball "Go" game showed
// "Under 10 · 12 on field". It must use the netball sport config.
test("netball game detail shows the netball age label and on-court size", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-HDR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  await expect(page.getByText("Go (8–10) · 7 on field")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Under 10/)).toHaveCount(0);
});
