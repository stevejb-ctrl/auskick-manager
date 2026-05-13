// Regression for the broken kickoff-window pulse. P0-1 in
// .planning/MICRO-INTERACTIONS-PLAN.md.
//
// Background: `PulseRing` referenced `animate-pulse-ripple-burst`,
// `animate-pulse-ripple-slow`, and `animate-pulse-ripple` — Tailwind
// utilities that did not exist in `tailwind.config.ts`. The component
// rendered an invisible span; `KickoffPulseWrapper` was a no-op in
// production. The fix adds a `pulseRipple` keyframe + the three
// animation utilities, AND wires `KickoffPulseWrapper` around the
// "Open game" CTA on team home so the wrapper actually has a
// production consumer.
//
// This spec pins both halves:
//   1. When a game's `scheduled_at` is inside the ±30min kickoff
//      window, the PulseRing renders next to "Open game" with a
//      non-zero `animation-name`.
//   2. When `scheduled_at` is well outside the window, the ring is
//      absent (so coaches viewing next week's fixture aren't pulled
//      into a moment that isn't happening yet).

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("kickoff pulse: ring renders when game is inside the ±30min window", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  // Schedule the game for RIGHT NOW so the wrapper's
  // `Math.abs(Date.now() - target) <= 30min` check passes immediately.
  await makeGame(admin, {
    teamId: team.id,
    ownerId,
    scheduledAt: new Date().toISOString(),
  });

  await page.goto(`/teams/${team.id}`);

  // The PulseRing carries data-pulse-ring="slow" inside the kickoff
  // window (slow = sustained urgency, the variant KickoffPulseWrapper
  // picks). The attribute is the regression's pin — if the wrapper
  // unmounts or the keyframes regress so the animation resolves to
  // "none", this assertion goes red.
  const ring = page.locator('[data-pulse-ring="slow"]');
  await expect(ring).toHaveCount(1, { timeout: 10_000 });

  // animation-name comes from the `motion-safe:animate-pulse-ripple-slow`
  // utility resolving to the `pulseRipple` keyframe. If the keyframe
  // were missing (the pre-fix state), animation-name would compute to
  // "none". This is the load-bearing assertion.
  await expect(ring).toHaveCSS("animation-name", "pulseRipple");
});

test("kickoff pulse: ring is absent when game is well outside the window", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  // +2h from now — comfortably outside the ±30min window.
  await makeGame(admin, {
    teamId: team.id,
    ownerId,
    scheduledAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
  });

  await page.goto(`/teams/${team.id}`);

  // The "Open game" button MUST still be there — we're not asserting
  // the whole hero is gone, just the pulse.
  await expect(
    page.getByRole("link", { name: /open game/i }),
  ).toBeVisible({ timeout: 10_000 });

  // PulseRing should never have mounted because inWindow stayed false.
  await expect(page.locator('[data-pulse-ring]')).toHaveCount(0);
});
