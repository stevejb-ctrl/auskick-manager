// ─── Pre-game rotation planner (GamePlanModal) ───────────────
// The coach's pre-kickoff "Game plan" affordance: auto-suggests a
// fair full-game rotation, lets the coach tweak it tap-to-swap, and
// hands over copy/paste text for the team chat. Pure client compute —
// no DB write, no change to how the live game runs (see the locked
// scope in src/lib/game-plan + src/components/game-plan).
//
// This spec exercises the feature through the UI on both mount
// surfaces and all three sports, per CLAUDE.md "reuse before you
// fork" (one planner, mounted consistently AFL / netball / RL):
//
//   1. AFL, game-detail entry — full interaction: open, rows render,
//      copy text is populated, tap-to-swap re-projects, close.
//   2. AFL, pre-kickoff /live breadcrumb entry — same button opens
//      the same planner from the lineup picker.
//   3. Netball, game-detail entry — netball projection drives the
//      single shared modal.
//   4. Rugby league, game-detail entry — RL projection drives it too.
//
// Covers: src/components/game-plan/{GamePlanButton,GamePlanModal}.tsx,
//         the game-detail upcoming action row + the LineupPicker
//         breadcrumb `action` slot.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

function ownerIdFinder() {
  return async () => {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers();
    return data.users.find(
      (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
    )!.id;
  };
}
const getOwnerId = ownerIdFinder();

test("AFL game-detail: planner opens, rows render, copy text populates, tap-to-swap re-projects", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    name: `GP-AFL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // 15 active players → 12 on field (U10) + a 3-player bench, so the
  // tap-to-swap below can swap an on-field player with a bench player
  // and the projected text is guaranteed to change.
  await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    opponent: "Eagles",
  });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  // The "Game plan" opener sits in the upcoming-game action row,
  // alongside "Start game" / "Set lineup".
  await page
    .getByRole("button", { name: /^game plan$/i })
    .click({ timeout: 15_000 });

  // Modal open — the heading is the cleanest signal (the opener button
  // shares the "Game plan" label but is a button, not a heading).
  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Every available player is placed somewhere (a group or the bench)
  // in the active period — 15 squad → 15 tappable rows.
  const rows = page.getByTestId("game-plan-player");
  await expect(rows).toHaveCount(15);

  // Copy block is live-populated with the formatted plan.
  const planText = page.locator("#game-plan-text");
  await expect(planText).toContainText("Game plan —");
  await expect(planText).toContainText(team.name);
  await expect(planText).toContainText("Eagles");
  await expect(planText).toContainText(/planned game time/i);

  // AFL rolls subs, so the plan reads as an interchange queue with a sub
  // cadence and rotation-adjusted (even) minutes — not whole quarters.
  await expect(planText).toContainText("Interchange (on first → last):");
  await expect(planText).toContainText(/subs ~every \d+ min/);
  await expect(planText).toContainText("Planned game time (with rotation)");
  // The editor's bench card is relabelled to the interchange queue.
  await expect(
    page.getByRole("heading", { name: /^interchange$/i }),
  ).toBeVisible();

  const before = (await planText.textContent()) ?? "";

  // Tap-to-swap: tap the first on-field row to arm it ("Swapping…"),
  // then the last (bench) row to exchange them. Swapping an on-field
  // player with a bench player re-projects, so the plan text changes.
  await rows.first().click();
  await expect(page.getByText(/swapping…/i)).toBeVisible();
  await rows.last().click();
  await expect(page.getByText(/swapping…/i)).toHaveCount(0);

  await expect(async () => {
    const after = (await planText.textContent()) ?? "";
    expect(after).not.toBe(before);
  }).toPass({ timeout: 5_000 });

  // Close via the footer "Done" button → modal dismissed.
  await page.getByRole("button", { name: /^done$/i }).click();
  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toHaveCount(0);
});

test("AFL pre-kickoff: planner opens from the lineup-picker breadcrumb on /live", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    name: `GP-LIVE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // /live short-circuits to "No players marked available" unless there
  // are available rows — seed availability so the LineupPicker (and its
  // breadcrumb action slot) renders. Mirrors lineup.spec.ts.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Wait for the picker to render (its commit CTA) before reaching for
  // the breadcrumb-mounted planner button.
  await expect(
    page.getByRole("button", { name: /^ready for q1$/i }),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^game plan$/i }).click();

  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("game-plan-player").first()).toBeVisible();
  await expect(page.locator("#game-plan-text")).toContainText("Game plan —");
});

test("Netball game-detail: the shared planner is driven by the netball projection", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `GP-NB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 9,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U10",
    opponent: "Comets",
  });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  await page
    .getByRole("button", { name: /^game plan$/i })
    .click({ timeout: 15_000 });

  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("game-plan-player").first()).toBeVisible();
  await expect(page.locator("#game-plan-text")).toContainText("Game plan —");
  await expect(page.locator("#game-plan-text")).toContainText(team.name);
  // Netball subs only at the break → whole-quarter bench, so no rolling-sub
  // interchange queue (the AFL-only treatment must not leak across sports).
  await expect(page.locator("#game-plan-text")).toContainText("Bench:");
  await expect(page.locator("#game-plan-text")).not.toContainText(
    "Interchange",
  );
});

test("Rugby league game-detail: the shared planner is driven by the RL projection", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await getOwnerId();

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U9",
    sport: "rugby_league",
    name: `GP-RL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 13,
    ageGroup: "U9",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U9",
    opponent: "Sharks",
  });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  await page
    .getByRole("button", { name: /^game plan$/i })
    .click({ timeout: 15_000 });

  await expect(
    page.getByRole("heading", { name: /^game plan$/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("game-plan-player").first()).toBeVisible();
  await expect(page.locator("#game-plan-text")).toContainText("Game plan —");
  await expect(page.locator("#game-plan-text")).toContainText(team.name);
});
