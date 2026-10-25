// The people around the coach, each in their own browser: the coach is
// the suite's super-admin (its saved session), and a helper or a parent
// is a fresh account signed in through /login on a phone-sized screen.
// Round 2 usability (24 Oct 2026) tested them together for the first time.

import type { Browser, BrowserContext, Page } from "@playwright/test";
import { createAdminClient, createTestUser, type TestUser } from "../fixtures/supabase";
import { waitForHydration } from "./navigation";

export const PHONE = { width: 390, height: 844 };

type Admin = ReturnType<typeof createAdminClient>;

/** The suite's super-admin: every factory team's coach. */
export async function coachId(admin: Admin): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/**
 * A new account. `fullName: ""` is what an email sign-up gets: the
 * profile's name is blank, not null.
 */
export async function newPerson(admin: Admin, prefix: string, fullName: string): Promise<TestUser> {
  return createTestUser(admin, {
    email: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@siren.test`,
    password: `${prefix}-pw-12345`,
    fullName,
  });
}

/** The coach's phone, signed in from the suite's saved session. */
export async function coachPhone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: "playwright/.auth/super-admin.json", viewport: PHONE });
  return { context, page: await context.newPage() };
}

/** A phone with nobody signed in: a parent opening a link from the group chat. */
export async function anonPhone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: undefined, viewport: PHONE });
  return { context, page: await context.newPage() };
}

/** `person`'s phone, signed in with their password through /login. */
export async function signedInPhone(
  browser: Browser,
  person: TestUser,
): Promise<{ context: BrowserContext; page: Page }> {
  const { context, page } = await anonPhone(browser);
  await page.goto("/login");
  await waitForHydration(page);
  await page.getByTestId("login-mode-toggle").click();
  await page.getByTestId("login-email").fill(person.email);
  await page.getByTestId("login-password").fill(person.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
  await waitForHydration(page);
  return { context, page };
}

/** An open invite to `teamId` as `role`, made straight in the DB. */
export async function makeInvite(
  admin: Admin,
  opts: { teamId: string; createdBy: string; role?: "admin" | "game_manager" | "parent" },
): Promise<string> {
  const token = crypto.randomUUID();
  const { error } = await admin.from("team_invites").insert({
    token,
    team_id: opts.teamId,
    role: opts.role ?? "game_manager",
    created_by: opts.createdBy,
  });
  if (error) throw new Error(`makeInvite: ${error.message}`);
  return token;
}
