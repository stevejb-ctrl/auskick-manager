// Crawler-facing basics: the sitemap lists every public page (it was
// missing /why-siren and /support), every listed page opens for a
// signed-out visitor rather than bouncing to /login, and robots.txt
// keeps crawlers out of the app and token links.
//
// Covers: src/app/sitemap.ts, src/app/robots.ts, src/lib/public-routes.ts.

import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("the sitemap lists every public page, and each opens signed out", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  const paths = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => new URL(m[1]).pathname);

  expect(paths).toEqual(
    expect.arrayContaining(["/", "/demo", "/why-siren", "/support", "/help", "/help/faq", "/login"]),
  );
  expect(new Set(paths).size).toBe(paths.length);

  for (const path of paths) {
    const page = await request.get(path, { maxRedirects: 0 });
    expect(page.status(), path).toBe(200);
  }
});

test("robots.txt keeps crawlers out of the app and token links", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const txt = await res.text();
  for (const prefix of ["/api/", "/auth/", "/dashboard", "/teams/", "/run/", "/join/", "/reset"]) {
    expect(txt, prefix).toContain(`Disallow: ${prefix}`);
  }
  expect(txt).toMatch(/Sitemap: https:\/\/www\.siren[a-z]+\.com\.au\/sitemap\.xml/);
});
