// Regression for the Modal slide-up entrance (P0-4 in
// .planning/MICRO-INTERACTIONS-PLAN.md).
//
// Modals used to pop in at full opacity with no transform — every
// in-game modal (StartQuarterModal, QuarterEndModal, SubDueModal,
// LockModal, WalkthroughModal, SwapConfirmDialog,
// InjuryReplacementModal, QuarterScoreModal) inherited the snap.
// This PR adds `motion-safe:animate-sheet-up` to the Modal
// primitive's inner card + `motion-safe:animate-fade-in` to its
// backdrop, so every consumer gets the entrance for free.
//
// The structural pin: the rendered inner card's
// `animation-name` computed style must resolve to `sheetUp`. If
// the keyframe is removed from tailwind.config.ts (the original
// PulseRing-style silent regression), `animation-name` collapses
// to "none" and this test goes red.
//
// We trigger the ResetGameButton's confirmation modal because
// it's the most accessible Modal consumer on a freshly-seeded
// team — no live game state required, just navigate to game
// detail and click Restart game.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("Modal inner card animates with sheet-up on mount", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  // Restart game is a destructive SFButton variant="danger" — see
  // ResetGameButton.tsx. Clicking opens the Modal primitive in
  // its confirmation form.
  await page.getByRole("button", { name: /^restart game$/i }).click();

  // Modal renders an inner card with the sheet-up animation. The
  // role isn't `dialog` (the primitive doesn't add ARIA role
  // dialog yet — a separate accessibility task), so anchor on the
  // distinctive shadow-modal class + max-h sizing token.
  const card = page.locator(".shadow-modal").first();
  await expect(card).toBeVisible({ timeout: 10_000 });

  // The load-bearing assertion: keyframe must resolve to sheetUp.
  // Pre-fix state had no keyframe defined → animation-name "none".
  await expect(card).toHaveCSS("animation-name", "sheetUp");
});
