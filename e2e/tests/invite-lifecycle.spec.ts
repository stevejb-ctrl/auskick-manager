// Invites are one person's, once (round 2 usability, 24 Oct 2026):
//
// 1. Removing a helper didn't remove their access. Their old /join link
//    re-added them (acceptance let the same person accept twice), and a
//    page left open on it still had a working Accept button.
// 2. A used link showed a second person "Accept & join team", then
//    refused them. It now says so before the button.
// 3. The invite said "Anyone who opens this link can join", and login
//    reached from it said "New email? You'll be invited to set up a team".
//
// The coach, the helper and a second person each have their own phone.
//
// Covers: src/app/join/[token]/actions.ts (acceptInvite)
//         src/app/join/[token]/page.tsx
//         src/app/(app)/teams/[teamId]/settings/member-actions.ts (removeMember)
//         src/components/team/TeamMembersSettings.tsx (remove confirm, invite copy)
//         src/app/(auth)/login/page.tsx + src/components/auth/LoginForm.tsx

import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { anonPhone, coachId, coachPhone, makeInvite, newPerson, signedInPhone } from "../helpers/people";

test.describe.configure({ mode: "parallel" });

test("a removed helper's old invite can't bring them back, even from a page left open", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "netball" });
  const token = await makeInvite(admin, { teamId: team.id, createdBy: ownerId });
  const helper = await newPerson(admin, "removed-helper", "Sam Helper");
  try {
    const { context: helperContext, page: helperPage } = await signedInPhone(browser, helper);
    // A second tab left open on the invite before accepting it.
    const staleTab = await helperContext.newPage();
    await gotoStable(staleTab, `/join/${token}`);
    await waitForHydration(staleTab);
    await expect(staleTab.getByRole("button", { name: /accept.*join team/i })).toBeVisible();

    await gotoStable(helperPage, `/join/${token}`);
    await waitForHydration(helperPage);
    await helperPage.getByRole("button", { name: /accept.*join team/i }).click();
    await helperPage.waitForURL(new RegExp(`/teams/${team.id}/games`), { timeout: 30_000 });

    // The coach removes them from Team › People, with a confirm that names them.
    const { context: coachContext, page: coachPage } = await coachPhone(browser);
    await gotoStable(coachPage, `/teams/${team.id}/settings`);
    const row = coachPage.getByRole("listitem").filter({ hasText: "Sam Helper" });
    await row.getByRole("button", { name: /^remove$/i }).click();
    const confirm = coachPage.getByRole("dialog", { name: /remove sam helper/i });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: /^remove sam helper$/i }).click();
    await expect(coachPage.getByRole("listitem").filter({ hasText: "Sam Helper" })).toHaveCount(0, { timeout: 10_000 });
    await coachContext.close();

    // The page left open still shows Accept: tapping it is refused server-side.
    await staleTab.getByRole("button", { name: /accept.*join team/i }).click();
    await expect(staleTab.getByRole("alert").filter({ hasText: /\S/ })).toContainText(
      /already been used|cancelled/i,
      { timeout: 15_000 },
    );

    // Re-opening the link says it's been cancelled, with no Accept button.
    await gotoStable(helperPage, `/join/${token}`);
    await expect(helperPage.getByText(/this invite has been cancelled/i)).toBeVisible({ timeout: 10_000 });
    await expect(helperPage.getByRole("button", { name: /accept.*join team/i })).toHaveCount(0);

    const { data: rows } = await admin
      .from("team_memberships")
      .select("role")
      .eq("team_id", team.id)
      .eq("user_id", helper.id);
    expect(rows).toEqual([]);
    const { data: invite } = await admin.from("team_invites").select("revoked_at").eq("token", token).single();
    expect(invite?.revoked_at).not.toBeNull();
    await helperContext.close();
  } finally {
    await deleteTestUser(admin, helper.id);
  }
});

test("a used invite tells a second person so, before any button", async ({ browser }) => {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "touch" });
  const token = await makeInvite(admin, { teamId: team.id, createdBy: ownerId });
  const first = await newPerson(admin, "first-invitee", "First Person");
  try {
    await admin.from("team_memberships").insert({ team_id: team.id, user_id: first.id, role: "game_manager" });
    await admin
      .from("team_invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: first.id })
      .eq("token", token);

    // Signed out: no "Continue with email" into a dead end.
    const { context, page } = await anonPhone(browser);
    await gotoStable(page, `/join/${token}`);
    await expect(page.getByText(/this invite has already been used/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/one person/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /continue with email/i })).toHaveCount(0);
    await context.close();
  } finally {
    await deleteTestUser(admin, first.id);
  }
});

test("an invite reads as one person's, and login from it tells the joining story", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league" });

  // "Invite a manager" lands on People with the invite form open.
  const { context: coachContext, page: coachPage } = await coachPhone(browser);
  await gotoStable(coachPage, `/teams/${team.id}/settings?invite=1#people`);
  await coachPage.getByRole("button", { name: /^create invite link$/i }).click();
  const created = coachPage.getByTestId("invite-created");
  await expect(created).toContainText(/one person/i, { timeout: 10_000 });
  await expect(created).not.toContainText(/anyone/i);
  const link = await created.getByRole("textbox").inputValue();
  const token = link.split("/join/")[1];
  await coachContext.close();

  const { context, page } = await anonPhone(browser);
  await gotoStable(page, `/join/${token}`);
  await page.getByRole("link", { name: /continue with email/i }).click();
  await page.waitForURL(/\/login\?next=/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Join ${team.name}`);
  await expect(page.getByText(/as a manager/i)).toBeVisible();
  await expect(page.getByText(/set up a team/i)).toHaveCount(0);
  await expect(page.getByText(/parents don.t need an account/i)).toHaveCount(0);

  // The team-code page's login tells the same story, without a team.
  await gotoStable(page, "/login?next=%2Fjoin-team");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/join your team/i);
  await expect(page.getByText(/set up a team/i)).toHaveCount(0);
  await context.close();
});
