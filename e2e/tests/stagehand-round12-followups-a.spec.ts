// ─── Stagehand round 12 follow-ups (a): Steve's calls ───────────────
// Two decisions on round 11's follow-ups, 12 Nov 2026:
//
//   1. The demo footer's "Create your team" lands on a page that reads
//      as sign-up: about setting up a team, not signing in. Still the
//      one email-first flow (a magic link makes the account).
//   2. Changing a pending invite's role re-sends its email, so the
//      email in their inbox names the role the link joins as.
//
// Covers: src/app/(auth)/signup/page.tsx, src/components/auth/LoginForm.tsx,
//         src/components/auth/LoginScreen.tsx, src/components/team/TeamMembersSettings.tsx,
//         src/app/(app)/teams/[teamId]/settings/member-actions.ts (updateInviteRole)

import { test, expect, type Locator, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { anonPhone, coachId, coachPhone, makeInvite } from "../helpers/people";
import { readTheme } from "../helpers/theme";

test.use({ viewport: { width: 390, height: 844 } });

/** A screenshot for Steve, when R12A_SHOTS names a folder. */
async function shot(page: Page, name: string, only?: Locator): Promise<void> {
  const dir = process.env.R12A_SHOTS;
  if (!dir) return;
  if (only) await only.screenshot({ path: `${dir}/${name}.png` });
  else await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

/** The sign-up screen's words: setting up a team, free, and a way back to sign in. */
async function expectSignUpScreen(page: Page) {
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/set up your team/i);
  await expect(page.getByText(/free for the 2026 season/i).first()).toBeVisible();
  await expect(page.getByTestId("login-submit")).toHaveText(/create account/i);
  // No password to set: the link makes the account.
  await expect(page.getByTestId("login-mode-toggle")).toHaveCount(0);
  const signIn = page.getByRole("link", { name: /^sign in$/i });
  await expect(signIn).toHaveAttribute("href", "/login");
  await expect(page.getByText(/already have an account\?/i)).toBeVisible();
}

test.describe("1. Create your team lands on sign-up", () => {
  test("/signup is its own page: set up your team, free, Create account, and Sign in back", async ({ browser }) => {
    const { context, page } = await anonPhone(browser);
    try {
      const res = await page.goto("/signup");
      expect(res?.status()).toBe(200);
      await waitForHydration(page);
      await expectSignUpScreen(page);
      await expect(page).toHaveTitle("Create your team · Siren");
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/signup$/);
      await shot(page, "1-signup-light");

      // The way back is sign-in's screen, as before.
      await page.getByRole("link", { name: /^sign in$/i }).click();
      await page.waitForURL(/\/login$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/run your team.s season/i);
    } finally {
      await context.close();
    }
  });

  test("it checks the email, and sends the link", async ({ browser }) => {
    const { context, page } = await anonPhone(browser);
    try {
      await gotoStable(page, "/signup");
      await waitForHydration(page);
      await page.getByTestId("login-email").fill("new.coach@examplecom");
      await page.getByTestId("login-submit").click();
      await expect(page.getByRole("alert").filter({ hasText: /needs a dot/i })).toBeVisible();

      await page.getByTestId("login-email").fill(`r12a-signup-${Date.now()}@siren.test`);
      await page.getByTestId("login-submit").click();
      await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/create your account/i)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  // When auth answers with an error page instead of JSON (a 504 from a
  // gateway), supabase-js puts the raw body in the message: the screen
  // said "{}" (round 12 combined run, 12 Nov 2026).
  test("a failed send says so in words, never {}", async ({ browser }) => {
    const { context, page } = await anonPhone(browser);
    try {
      await page.route("**/auth/v1/otp**", (route) => route.fulfill({ status: 504, body: "{}" }));
      await gotoStable(page, "/signup");
      await waitForHydration(page);
      await page.getByTestId("login-email").fill(`r12a-signup-504-${Date.now()}@siren.test`);
      await page.getByTestId("login-submit").click();
      await expect(page.getByText(/couldn.t send the link/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("{}", { exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("in the dark theme it reads", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", storageState: undefined });
    const page = await context.newPage();
    try {
      await gotoStable(page, "/signup");
      await waitForHydration(page);
      await expectSignUpScreen(page);
      const theme = await readTheme(page);
      expect(theme.colorScheme).toContain("dark");
      expect(theme.failures).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await shot(page, "1-signup-dark");
    } finally {
      await context.close();
    }
  });

  test("the demo picker's sign-up link lands there too", async ({ browser }) => {
    const { context, page } = await anonPhone(browser);
    try {
      await gotoStable(page, "/demo");
      const link = page.getByRole("main").getByRole("link", { name: "Create your team" });
      await expect(link).toHaveAttribute("href", "/signup");
      await link.click();
      await expectSignUpScreen(page);
    } finally {
      await context.close();
    }
  });

  test("an invite's next goes to the joining screen, not set up a team", async ({ browser }) => {
    const admin = createAdminClient();
    const ownerId = await coachId(admin);
    const team = await makeTeam(admin, { ownerId, sport: "afl", name: "R12A Joiners" });
    const token = await makeInvite(admin, { teamId: team.id, createdBy: ownerId, role: "parent" });
    const { context, page } = await anonPhone(browser);
    try {
      await gotoStable(page, `/signup?next=${encodeURIComponent(`/join/${token}`)}`);
      await expect(page).toHaveURL(/\/login\?next=/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/join r12a joiners/i);
    } finally {
      await context.close();
      await admin.from("teams").delete().eq("id", team.id);
    }
  });

  test("a signed-in coach on /signup goes on to their teams", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForURL((u) => /^\/(dashboard|teams\/)/.test(u.pathname), { timeout: 30_000 });
  });
});

test.describe("2. a role change re-sends the invite email", () => {
  type Seed = { email: string | null; sentAgoMs: number | null; count: number };

  async function seedInvite(seed: Seed) {
    const admin = createAdminClient();
    const ownerId = await coachId(admin);
    const team = await makeTeam(admin, { ownerId, sport: "afl" });
    const { data: invite, error } = await admin
      .from("team_invites")
      .insert({
        team_id: team.id,
        role: "game_manager",
        invited_email: seed.email,
        email_sent_at: seed.sentAgoMs === null ? null : new Date(Date.now() - seed.sentAgoMs).toISOString(),
        email_send_count: seed.count,
        created_by: ownerId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { admin, team, inviteId: invite!.id as string };
  }

  /** The pending invite's row (the page also has Next's route announcer, an alert). */
  function inviteRow(page: Page) {
    return page.locator("li").filter({ has: page.getByLabel(/^role for the invite/i) });
  }

  async function changeToParent(page: Page, teamId: string) {
    await gotoStable(page, `/teams/${teamId}/settings#people`);
    await waitForHydration(page);
    const picker = page.getByLabel(/^role for the invite/i);
    await expect(picker).toHaveValue("game_manager");
    await picker.selectOption("parent");
  }

  test("an emailed invite: the role changes and the email goes again, naming the new role", async ({ browser }) => {
    const email = `r12a-resend-${Date.now()}@siren.test`;
    const { admin, team, inviteId } = await seedInvite({ email, sentAgoMs: 5 * 60_000, count: 1 });
    const { context, page } = await coachPhone(browser);
    try {
      await changeToParent(page, team.id);
      await expect(
        page.getByRole("status").filter({ hasText: `The link now joins as Parent. Email re-sent to ${email}.` }),
      ).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => (await admin.from("team_invites").select("role, email_send_count").eq("id", inviteId).single()).data)
        .toEqual({ role: "parent", email_send_count: 2 });
      await expect(page.getByText("Emailed 2×")).toBeVisible({ timeout: 10_000 });
      // The resend wait starts from this send ("Sent -1s ago" before the
      // clock caught up with it).
      await expect(inviteRow(page).getByRole("button", { name: /^Sent \d+s ago$/ })).toBeDisabled();
      await expect(inviteRow(page).getByRole("alert")).toHaveCount(0);
      await shot(page, "2-invite-role-resent", inviteRow(page));
    } finally {
      await context.close();
      await admin.from("teams").delete().eq("id", team.id);
    }
  });

  test("inside the resend wait: the role still changes, and the row says the email wasn't sent and why", async ({ browser }) => {
    const email = `r12a-throttled-${Date.now()}@siren.test`;
    const { admin, team, inviteId } = await seedInvite({ email, sentAgoMs: 5_000, count: 1 });
    const { context, page } = await coachPhone(browser);
    try {
      await changeToParent(page, team.id);
      await expect(page.getByRole("status").filter({ hasText: "The link now joins as Parent." })).toBeVisible({ timeout: 15_000 });
      await expect(inviteRow(page).getByRole("alert").filter({ hasText: /email wasn.t re-sent.*sent under a minute ago/i })).toBeVisible();
      await expect
        .poll(async () => (await admin.from("team_invites").select("role, email_send_count").eq("id", inviteId).single()).data)
        .toEqual({ role: "parent", email_send_count: 1 });
      await shot(page, "2-invite-role-throttled", inviteRow(page));
    } finally {
      await context.close();
      await admin.from("teams").delete().eq("id", team.id);
    }
  });

  test("a link-only invite just changes, with nothing about email", async ({ browser }) => {
    const { admin, team, inviteId } = await seedInvite({ email: null, sentAgoMs: null, count: 0 });
    const { context, page } = await coachPhone(browser);
    try {
      await changeToParent(page, team.id);
      const note = page.getByRole("status").filter({ hasText: "The link now joins as Parent." });
      await expect(note).toBeVisible({ timeout: 15_000 });
      await expect(note).not.toContainText(/email/i);
      await expect(inviteRow(page).getByRole("alert")).toHaveCount(0);
      await expect
        .poll(async () => (await admin.from("team_invites").select("role, email_send_count").eq("id", inviteId).single()).data)
        .toEqual({ role: "parent", email_send_count: 0 });
    } finally {
      await context.close();
      await admin.from("teams").delete().eq("id", team.id);
    }
  });
});
