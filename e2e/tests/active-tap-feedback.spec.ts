// Regression for the `active:` tap-down feedback sweep (PR 2 of
// .planning/MICRO-INTERACTIONS-PLAN.md — items P0-2, P0-3, P1-1,
// P1-11).
//
// Phones can't hover, and the codebase used to ship buttons with
// only `hover:` state — so on a phone the 50-150ms between
// pointer-down and the action landing showed ZERO visual feedback.
// Stagehand testers repeatedly described this as "felt
// unresponsive". This PR added `active:` colour swaps to
// `SFButton`, the legacy `Button`, `PlayerTile`, and the score-record
// `+G` / `+B` chips.
//
// We're not asserting the runtime pseudo-class fires (that would
// need pointer-down simulation + colour-equality checks across
// browsers and is famously brittle). We assert the STATIC
// className contains an `active:` modifier — the structural pin.
// If a future refactor strips them, the className regex stops
// matching and this test goes red.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("SFButton primary on team home wires active:bg- tap feedback", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  await makeGame(admin, { teamId: team.id, ownerId });

  await page.goto(`/teams/${team.id}`);

  const openGame = page.getByRole("link", { name: /open game/i });
  await expect(openGame).toBeVisible({ timeout: 10_000 });
  // SFButton primary → `active:bg-ink/95`. The Tailwind escape
  // for `/` in arbitrary-value-like syntax keeps the slash in the
  // className literally, so a substring match on `active:bg-ink`
  // is enough — and is robust to opacity-modifier tweaks.
  await expect(openGame).toHaveClass(/active:bg-ink/);
});

test("legacy Button on /login wires active:bg- tap feedback", async ({
  page,
}) => {
  // Clear storageState so we land on the public login form
  // (default chromium project has a super-admin session that
  // would redirect /login → /dashboard).
  await page.context().clearCookies();
  await page.goto("/login");

  // LoginForm renders a primary Button — the Send magic link CTA.
  // The label varies between marketing copy revisions, so anchor
  // on the role + first match.
  const submit = page.getByRole("button").first();
  await expect(submit).toBeVisible({ timeout: 10_000 });
  // Legacy Button primary → `active:bg-brand-800`.
  await expect(submit).toHaveClass(/active:bg-brand-/);
});

test("PlayerTile + score chips on /live wire pointer-down feedback", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
  });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 12,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // Seed all 12 as available so /live renders the LineupPicker
  // (then we still see the GameHeader's +G chips, since they
  // render once track_scoring is on; tracking defaults to on for
  // U10 — see migration 0001).
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // PlayerTile renders inside the LineupPicker — the data-testid
  // is the most stable handle. P1-1 added
  // `motion-safe:active:scale-[0.97]` for tap-down shrink.
  const tile = page.locator(`[data-testid^="player-tile-"]`).first();
  await expect(tile).toBeVisible({ timeout: 10_000 });
  await expect(tile).toHaveClass(/active:scale-/);

  // The +G chips appear before the lineup is committed (in the
  // pre-kickoff GameHeader shell). Pick the first one — there
  // are 2-4 on screen depending on track_scoring + onOpponent
  // wiring, and they all share the SCORE_CHIP constant.
  const plusG = page.getByRole("button", { name: /^\+G$/i }).first();
  await expect(plusG).toBeVisible({ timeout: 10_000 });
  // SCORE_CHIP constant → `active:bg-brand-200`.
  await expect(plusG).toHaveClass(/active:bg-brand-/);
});
