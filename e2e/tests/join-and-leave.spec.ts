// Coming and going (round 2 usability, 24 Oct 2026):
//
// 1. The welcome screen buried "Join with a code" under five coach-only
//    steps, below the fold on a phone.
// 2. A removed member got a generic "Not found" mid-action, and leaving
//    dumped you on the coach welcome with no "You left …".
// 3. A sole coach could tap "Yes, leave the team" before being told they
//    can't.
// 4. A manager's read-only Squad and Team screens didn't say why.
//
// Covers: src/app/(app)/welcome/page.tsx
//         src/app/(app)/teams/[teamId]/layout.tsx (not on this team)
//         src/components/team/LeaveTeamButton.tsx, src/app/(app)/account/page.tsx
//         src/components/team/ReadOnlyNote.tsx (squad + settings pages)

import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { coachId, newPerson, signedInPhone } from "../helpers/people";

test.describe.configure({ mode: "parallel" });

test("the welcome screen offers the team code beside setting up, above the coach's steps", async ({ browser }) => {
  const admin = createAdminClient();
  const person = await newPerson(admin, "welcome-new", "");
  try {
    const { context, page } = await signedInPhone(browser, person);
    await gotoStable(page, "/welcome");
    const code = page.getByRole("link", { name: /join with a code/i });
    const setUp = page.getByRole("link", { name: /set up a new team/i });
    await expect(code).toBeInViewport();
    await expect(setUp).toBeInViewport();
    const codeBox = (await code.boundingBox())!;
    const firstStep = (await page.getByText("Team basics").boundingBox())!;
    expect(codeBox.y).toBeLessThan(firstStep.y);
    await context.close();
  } finally {
    await deleteTestUser(admin, person.id);
  }
});

test("a removed manager is told they're not on the team, not 'Not found'", async ({ browser }) => {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "basketball" });
  const manager = await newPerson(admin, "removed-manager", "Mo Manager");
  try {
    await admin.from("team_memberships").insert({ team_id: team.id, user_id: manager.id, role: "game_manager" });
    const { context, page } = await signedInPhone(browser, manager);
    await gotoStable(page, `/teams/${team.id}/games`);
    await expect(page.getByRole("navigation", { name: /team sections/i })).toBeVisible({ timeout: 10_000 });

    await admin.from("team_memberships").delete().eq("team_id", team.id).eq("user_id", manager.id);
    await gotoStable(page, `/teams/${team.id}/games`);
    await expect(page.getByRole("heading", { name: /you.re not on this team/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/not found/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /join with a code/i })).toBeVisible();
    await context.close();
  } finally {
    await deleteTestUser(admin, manager.id);
  }
});

test("leaving a team says so, and a sole coach is told up front they can't", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "hockey" });
  const parent = await newPerson(admin, "leaving-parent", "Lee Parent");
  try {
    await admin.from("team_memberships").insert({ team_id: team.id, user_id: parent.id, role: "parent" });
    const { context, page } = await signedInPhone(browser, parent);
    await gotoStable(page, "/account");
    await waitForHydration(page);
    await page.getByRole("button", { name: new RegExp(`^leave ${team.name}$`, "i") }).click();
    await page.getByRole("button", { name: /yes, leave the team/i }).click();
    await page.waitForURL(/\/(dashboard|welcome)/, { timeout: 15_000 });
    await expect(page.getByRole("status").filter({ hasText: /left/i })).toContainText(`You left ${team.name}`);
    await context.close();
  } finally {
    await deleteTestUser(admin, parent.id);
  }

  // A coach who's alone on their team.
  const coach = await newPerson(admin, "sole-coach", "Solo Coach");
  try {
    const own = await makeTeam(admin, { ownerId: coach.id, sport: "soccer" });
    const { context, page } = await signedInPhone(browser, coach);
    await gotoStable(page, "/account");
    await waitForHydration(page);
    await page.getByRole("button", { name: new RegExp(`^leave ${own.name}$`, "i") }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/only coach/i);
    await expect(dialog.getByRole("button", { name: /yes, leave the team/i })).toHaveCount(0);
    await context.close();
  } finally {
    await deleteTestUser(admin, coach.id);
  }
});

test("a manager's read-only Squad and Team screens say who can change them", async ({ browser }) => {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_union" });
  const manager = await newPerson(admin, "readonly-manager", "Mo Manager");
  try {
    await admin.from("team_memberships").insert({ team_id: team.id, user_id: manager.id, role: "game_manager" });
    const { context, page } = await signedInPhone(browser, manager);
    await gotoStable(page, `/teams/${team.id}/squad`);
    await expect(page.getByRole("note")).toContainText(/only the coach can change the squad/i, { timeout: 10_000 });
    await gotoStable(page, `/teams/${team.id}/settings`);
    await expect(page.getByRole("note").first()).toContainText(/only the coach can change/i, { timeout: 10_000 });
    await expect(page.getByText(/only admins/i)).toHaveCount(0);
    await context.close();
  } finally {
    await deleteTestUser(admin, manager.id);
  }
});
