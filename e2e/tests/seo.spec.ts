// Crawler-facing basics: the sitemap lists every public page (it was
// missing /why-siren and /support), every listed page opens for a
// signed-out visitor rather than bouncing to /login, robots.txt keeps
// crawlers out of the app and token links, and pages say they're in
// Australian English. Shared links get a preview image, and search
// engines get structured data: who makes Siren, that it's an app, and
// where each help page sits.
//
// Covers: src/app/sitemap.ts, src/app/robots.ts, src/lib/public-routes.ts,
// <html lang> and the Open Graph / Twitter metadata in src/app/layout.tsx,
// src/app/opengraph-image.tsx and src/lib/structured-data.ts.

import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

type JsonLd = Record<string, unknown>;

/** Every JSON-LD block on the page, parsed. */
async function jsonLd(page: Page): Promise<JsonLd[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((b) => JSON.parse(b) as JsonLd);
}

function ofType(blocks: JsonLd[], type: string): JsonLd | undefined {
  return blocks.find((b) => b["@type"] === type);
}

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

test("pages declare Australian English", async ({ page }) => {
  for (const path of ["/", "/help", "/login"]) {
    await page.goto(path);
    await expect(page.locator("html"), path).toHaveAttribute("lang", "en-AU");
  }
});

test("shared links show a preview image and the brand", async ({ page }) => {
  for (const path of ["/", "/why-siren", "/help/faq", "/login", "/support"]) {
    await page.goto(path);
    await expect(page.locator('meta[property="og:image"]'), path).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]').first(), path).toHaveAttribute(
      "content",
      /^https:\/\/www\.siren[a-z]+\.com\.au\/opengraph-image/,
    );
    await expect(page.locator('meta[property="og:image:width"]').first(), path).toHaveAttribute("content", "1200");
    await expect(page.locator('meta[property="og:image:height"]').first(), path).toHaveAttribute("content", "630");
    await expect(page.locator('meta[property="og:site_name"]'), path).toHaveAttribute("content", /^Siren /);
    await expect(page.locator('meta[property="og:locale"]'), path).toHaveAttribute("content", "en_AU");
    await expect(page.locator('meta[name="twitter:card"]'), path).toHaveAttribute("content", "summary_large_image");
  }
});

test("the preview image is a 1200×630 PNG a signed-out crawler can fetch", async ({ page, request }) => {
  await page.goto("/");
  const image = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  const { pathname, search } = new URL(image!);

  // WhatsApp, Facebook and Slack fetch this with no session, so it must
  // not bounce to /login.
  const res = await request.get(pathname + search, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  const png = await res.body();
  // A PNG's IHDR chunk holds the width then the height, from byte 16.
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width: 1200, height: 630 });
});

test("the home page tells search engines who makes Siren and that it's an app", async ({ page, request }) => {
  // Server-rendered, so crawlers that don't run JavaScript see it too.
  expect(await (await request.get("/")).text()).toContain('"@type":"SoftwareApplication"');

  await page.goto("/");
  const blocks = await jsonLd(page);
  expect(ofType(blocks, "Organization")).toMatchObject({
    name: "Siren",
    url: expect.stringMatching(/^https:\/\/www\.siren[a-z]+\.com\.au\/$/),
    logo: expect.stringMatching(/\.png$/),
  });
  expect(ofType(blocks, "WebSite")).toMatchObject({ name: expect.stringMatching(/^Siren /) });

  const app = ofType(blocks, "SoftwareApplication");
  expect(app).toMatchObject({
    applicationCategory: "SportsApplication",
    offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
    installUrl: expect.stringContaining("apps.apple.com"),
  });
  // No ratings until they're real ones from a review source.
  expect(app).not.toHaveProperty("aggregateRating");
});

test("help pages carry breadcrumbs", async ({ page, request }) => {
  expect(await (await request.get("/help/squads")).text()).toContain('"@type":"BreadcrumbList"');

  await page.goto("/help/squads");
  expect(ofType(await jsonLd(page), "BreadcrumbList")?.itemListElement).toEqual([
    { "@type": "ListItem", position: 1, name: "Home", item: expect.stringMatching(/\.com\.au\/$/) },
    { "@type": "ListItem", position: 2, name: "Help", item: expect.stringMatching(/\.com\.au\/help$/) },
    { "@type": "ListItem", position: 3, name: "Squads", item: expect.stringMatching(/\/help\/squads$/) },
  ]);

  await page.goto("/help");
  expect(ofType(await jsonLd(page), "BreadcrumbList")?.itemListElement).toHaveLength(2);
});
