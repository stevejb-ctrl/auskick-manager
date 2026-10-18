// Google Analytics is for the public site only (marketing, help,
// login). It used to load from the root layout on every route, so on
// prod each /run/<token> page view sent the runner token, a bearer
// secret that gives live control of a game, to Google. /join/<token>
// invites and /login?next=/join/<token> went the same way.
//
// GA is prod-only, so each test sets the e2e cookie that loads it with
// a dummy ID (src/lib/analytics/ga.ts) and stubs gtag.js, so nothing
// reaches Google.
//
// Covers: src/components/analytics/GoogleAnalyticsGate.tsx and
// src/lib/analytics/ga-routes.ts.

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

const GA_TEST_COOKIE = "siren-e2e-ga";
const GA_DISABLE_KEY = "ga-disable-G-E2ETEST000";
const GA_SCRIPT = 'script[src*="googletagmanager.com"]';

async function withGa(context: BrowserContext, baseURL: string | undefined) {
  await context.addCookies([
    { name: GA_TEST_COOKIE, value: "1", url: baseURL ?? "http://localhost:3000" },
  ]);
  await context.route(/googletagmanager\.com|google-analytics\.com/, (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
}

async function gaDisabled(page: Page): Promise<unknown> {
  return page.evaluate(
    (key) => (window as unknown as Record<string, unknown>)[key],
    GA_DISABLE_KEY,
  );
}

async function superAdminId(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("public pages load GA, switched on", async ({ page, context, baseURL }) => {
    await withGa(context, baseURL);
    for (const path of ["/", "/help", "/login", "/why-siren"]) {
      await page.goto(path);
      await expect(page.locator(GA_SCRIPT), path).toHaveCount(1);
      expect(await gaDisabled(page), path).not.toBe(true);
    }
  });

  test("a runner link never loads GA", async ({ page, context, baseURL }) => {
    await withGa(context, baseURL);
    const admin = createAdminClient();
    const ownerId = await superAdminId();
    const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
    await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
    const game = await makeGame(admin, { teamId: team.id, ownerId });

    await page.goto(`/run/${game.share_token}`);
    await expect(page.getByText(/continue to starting lineup/i)).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForLoadState("networkidle");
    await expect(page.locator(GA_SCRIPT)).toHaveCount(0);
  });

  test("an invite link never loads GA", async ({ page, context, baseURL }) => {
    await withGa(context, baseURL);
    await page.goto(`/join/not-a-real-invite-${Date.now()}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator(GA_SCRIPT)).toHaveCount(0);
  });

  test("login carrying an invite in ?next= keeps GA switched off", async ({
    page,
    context,
    baseURL,
  }) => {
    await withGa(context, baseURL);
    await page.goto(`/login?next=${encodeURIComponent("/join/secret-invite-token")}`);
    await page.waitForLoadState("networkidle");
    expect(await gaDisabled(page)).toBe(true);
  });
});

test.describe("signed in", () => {
  test("app routes never load GA", async ({ page, context, baseURL }) => {
    await withGa(context, baseURL);
    const admin = createAdminClient();
    const ownerId = await superAdminId();
    const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });

    for (const path of ["/dashboard", `/teams/${team.id}`]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator(GA_SCRIPT), path).toHaveCount(0);
    }
  });

  test("leaving help for the app switches GA off", async ({ page, context, baseURL }) => {
    await withGa(context, baseURL);
    await page.goto("/help");
    await expect(page.locator(GA_SCRIPT)).toHaveCount(1);
    expect(await gaDisabled(page)).not.toBe(true);

    // A client-side navigation: gtag stays loaded, so it must be
    // switched off before the app route's page view.
    await page.getByRole("link", { name: /back to siren/i }).first().click();
    await page.waitForURL(/\/dashboard|\/teams\//);
    expect(await gaDisabled(page)).toBe(true);
  });
});
