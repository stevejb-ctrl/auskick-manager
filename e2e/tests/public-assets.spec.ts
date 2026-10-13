// Public scripts must load for signed-out visitors. Round 5's route crawl
// found the middleware sending /capacitor.js (and next-pwa's
// swe-worker-*.js) to the login page for anyone signed out, so every
// public page (home, login, signup, help...) ran the login HTML as a
// script and threw "Unexpected token '<'".

import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

test.use({ storageState: { cookies: [], origins: [] } });

test("public scripts are served to signed-out visitors, not redirected to login", async ({ request }) => {
  const scripts = readdirSync(join(process.cwd(), "public")).filter((f) => f.endsWith(".js"));
  expect(scripts).toContain("capacitor.js");
  for (const f of scripts) {
    const res = await request.get(`/${f}`, { maxRedirects: 0 });
    expect(res.status(), f).toBe(200);
    expect(res.headers()["content-type"] ?? "", f).toMatch(/javascript/);
  }
});

test("signed-out pages load without a script error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  for (const path of ["/", "/login", "/signup", "/help"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});
