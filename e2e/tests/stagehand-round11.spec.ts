// Stagehand round 11 (11 Nov 2026): the public site signed out, new
// teams in every sport, whole games, and team admin.
// .planning/USABILITY-STAGEHAND-2026-11-ROUND11.md has the findings;
// each test here names its number.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

// ─── #1 Typing the next kid straight after Add ──────────────────
// A coach adding a squad taps Add and starts typing the next name. The
// name box was disabled while the add saved (about a second), so the
// first letters, or the whole name, went nowhere ("hloe Nguyen").

test("#1 the next kid's name typed straight after Add player is kept", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `R11 squad ${uniq()}` });

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  const name = page.getByLabel(/player name/i);
  await name.fill("Ava First");
  await page.getByRole("button", { name: /^add player$/i }).click();
  // No wait: the next name goes in while the first one saves.
  await name.pressSequentially("Chloe Nguyen", { delay: 30 });

  await expect(page.getByRole("listitem").filter({ hasText: "Ava First" })).toBeVisible();
  await expect(name).toHaveValue("Chloe Nguyen");
  await page.getByRole("button", { name: /^add player$/i }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Chloe Nguyen" })).toBeVisible();
  await expect(name).toHaveValue("");
});

