// Who's who on a team (round 2 usability, 24 Oct 2026):
//
// 1. Email sign-ups have a blank name, so the members list showed a
//    helper as just a "Manager" badge (no name, no email) and the remove
//    confirm read "Remove  from the team?".
// 2. My account showed Name "Not set" with no way to set it.
// 3. Joining asked for no name, and joining by code silently made you a
//    read-only Parent.
//
// Covers: src/components/team/TeamMembersSettings.tsx (MemberRowItem)
//         src/app/(app)/teams/[teamId]/settings/page.tsx (member mapper)
//         src/app/(app)/account/page.tsx + actions.ts (display name)
//         src/app/join/[token]/* and src/app/(app)/join-team/* (name on join)
//         src/components/team/JoinedNotice.tsx

import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { coachId, coachPhone, makeInvite, newPerson, signedInPhone } from "../helpers/people";

test.describe.configure({ mode: "parallel" });

test("a nameless helper shows as their email, and can set their name in My account", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl" });
  const helper = await newPerson(admin, "nameless-helper", "");
  try {
    await admin.from("team_memberships").insert({ team_id: team.id, user_id: helper.id, role: "game_manager" });

    const { context: coachContext, page: coachPage } = await coachPhone(browser);
    await gotoStable(coachPage, `/teams/${team.id}/settings`);
    const row = coachPage.getByRole("listitem").filter({ hasText: helper.email });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByRole("combobox", { name: `Role for ${helper.email}` })).toBeVisible();

    // The helper names themself in My account.
    const { context: helperContext, page: helperPage } = await signedInPhone(browser, helper);
    await gotoStable(helperPage, "/account");
    await waitForHydration(helperPage);
    await helperPage.getByRole("button", { name: /add your name/i }).click();
    await helperPage.getByLabel(/^your name$/i).fill("  Sam   Helper ");
    await helperPage.getByRole("button", { name: /^save$/i }).click();
    await expect(helperPage.getByText("Sam Helper", { exact: true })).toBeVisible({ timeout: 10_000 });
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", helper.id).single();
    expect(profile?.full_name).toBe("Sam Helper");
    await helperContext.close();

    // The coach now sees the name, with the email under it.
    await gotoStable(coachPage, `/teams/${team.id}/settings`);
    const named = coachPage.getByRole("listitem").filter({ hasText: "Sam Helper" });
    await expect(named).toContainText(helper.email, { timeout: 10_000 });
    await coachContext.close();
  } finally {
    await deleteTestUser(admin, helper.id);
  }
});

test("joining by invite asks a nameless person for their name", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "netball" });
  const token = await makeInvite(admin, { teamId: team.id, createdBy: ownerId });
  const helper = await newPerson(admin, "invite-name", "");
  try {
    const { context, page } = await signedInPhone(browser, helper);
    await gotoStable(page, `/join/${token}`);
    await waitForHydration(page);
    // No name, no join: the coach has to be able to tell who joined.
    await page.getByRole("button", { name: /accept.*join team/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText(/add your name/i);
    await page.getByLabel(/^your name$/i).fill("Jo Manager");
    await page.getByRole("button", { name: /accept.*join team/i }).click();
    await page.waitForURL(new RegExp(`/teams/${team.id}/games`), { timeout: 30_000 });
    await expect(page.getByRole("status").filter({ hasText: /joined/i })).toContainText(
      `You've joined ${team.name} as a Manager`,
    );
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", helper.id).single();
    expect(profile?.full_name).toBe("Jo Manager");
    await context.close();
  } finally {
    await deleteTestUser(admin, helper.id);
  }
});

test("joining by code says you'll be a Parent, how to become a Manager, and asks your name", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "touch" });
  const { data: teamRow } = await admin.from("teams").select("join_code").eq("id", team.id).single();
  const parent = await newPerson(admin, "code-parent", "");
  try {
    const { context, page } = await signedInPhone(browser, parent);
    await gotoStable(page, "/join-team");
    await waitForHydration(page);
    await expect(page.getByText(/you.ll join as a parent/i)).toBeVisible();
    await expect(page.getByText(/ask your coach to make you a manager/i)).toBeVisible();
    await page.getByTestId("join-code-input").fill(teamRow!.join_code as string);
    await page.getByLabel(/^your name$/i).fill("Pat Parent");
    await page.getByRole("button", { name: /^join team$/i }).click();
    await page.waitForURL(new RegExp(`/teams/${team.id}/games`), { timeout: 30_000 });
    const notice = page.getByRole("status").filter({ hasText: /joined/i });
    await expect(notice).toContainText(`You've joined ${team.name} as a Parent`);
    await expect(notice).toContainText(/ask your coach to make you a manager/i);
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", parent.id).single();
    expect(profile?.full_name).toBe("Pat Parent");
    await context.close();
  } finally {
    await deleteTestUser(admin, parent.id);
  }
});
