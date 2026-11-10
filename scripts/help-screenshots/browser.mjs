// Playwright session helpers for the help captures.
import path from "node:path";
import { existsSync } from "node:fs";
import { req, STATE_DIR } from "./lib.mjs";

const { chromium } = req("playwright");
export const BASE = process.env.HELP_SHOTS_BASE ?? "http://localhost:3107";
export const VIEWPORT = { width: 390, height: 844 };

let browser;
export async function getBrowser() {
  browser ??= await chromium.launch();
  return browser;
}
export async function closeBrowser() {
  await browser?.close();
  browser = undefined;
}

/** A fresh phone-sized context signed in as `user` (password login). */
export async function signedInContext(user, opts = {}) {
  const b = await getBrowser();
  const statePath = path.join(STATE_DIR, `state-${user.email}.json`);
  const ctxOpts = {
    viewport: opts.viewport ?? VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    locale: "en-AU",
    timezoneId: "Australia/Melbourne",
    colorScheme: "light",
    reducedMotion: "reduce",
  };
  if (existsSync(statePath) && !opts.fresh) {
    const ctx = await b.newContext({ ...ctxOpts, storageState: statePath });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`);
    if (!page.url().includes("/login")) return { ctx, page };
    await ctx.close();
  }
  const ctx = await b.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByText("Sign in with password instead").click();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  await ctx.storageState({ path: statePath });
  return { ctx, page };
}

export async function settle(page, ms = 700) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Hide the Next dev/route announcer and any toasts mid-fade.
  await page.waitForTimeout(ms);
}
