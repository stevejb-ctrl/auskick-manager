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
    expect.arrayContaining(["/", "/demo", "/why-siren", "/support", "/help", "/help/faq"]),
  );
  // A sign-in form has little to index (it stays crawlable).
  expect(paths).not.toContain("/login");
  expect(new Set(paths).size).toBe(paths.length);

  for (const path of paths) {
    const page = await request.get(path, { maxRedirects: 0 });
    expect(page.status(), path).toBe(200);
  }
});

test("the homepage names every sport, in its title, description and server HTML", async ({ page, request }) => {
  // AI crawlers don't run JavaScript, so the sports must be in the HTML
  // the server sends, not just behind the sport picker.
  const html = await (await request.get("/")).text();
  expect(html).toContain(
    "One app, ten sports: junior AFL, netball, rugby league, rugby union, football (soccer), basketball, futsal, hockey, touch football and Oztag.",
  );

  await page.goto("/");
  await expect(page).toHaveTitle("Siren: fair rotations and subs for junior footy, netball, league and more");
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  for (const sport of [
    "AFL",
    "netball",
    "rugby league",
    "rugby union",
    "football (soccer)",
    "basketball",
    "futsal",
    "hockey",
    "touch football",
    "Oztag",
  ]) {
    expect(description, sport).toContain(sport);
  }
});

test("the homepage H1 paints before JavaScript runs", async ({ request }) => {
  // RevealOnScroll renders opacity:0 on the server and fades in after
  // hydration. Around the H1, the largest paint, that delayed LCP.
  const html = await (await request.get("/")).text();
  const beforeH1 = html.slice(0, html.indexOf("<h1"));
  const hero = beforeH1.slice(beforeH1.lastIndexOf("<section"));
  expect(hero).not.toContain("opacity:0");
});

test("help screenshots are served resized, and load", async ({ page }) => {
  // next/image, not the 780px PNGs straight from /public.
  await page.goto("/help/getting-started");
  const shot = page.locator("figure.help-figure img").first();
  await expect(shot).toHaveAttribute("src", /^\/_next\/image\?url=%2Fhelp-screenshots%2F/);
  await shot.scrollIntoViewIfNeeded();
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test("sign-in and help have titles and descriptions of their own", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Sign in · Siren");

  for (const path of ["/help", "/help/faq"]) {
    await page.goto(path);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description?.length, path).toBeGreaterThan(100);
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

test("llms.txt is public plain text: what Siren is, its sports and its pages", async ({ request }) => {
  // It used to 307 to /login, like any path the middleware didn't know.
  const res = await request.get("/llms.txt", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const txt = await res.text();
  expect(txt).toMatch(/^# Siren\n\n> Siren is a game-day app for junior sport coaches/);
  expect(txt).toContain("- Basketball\n");
  expect(txt).not.toMatch(/\(beta\)/);
  expect(txt).toMatch(/\]\(https:\/\/www\.siren[a-z]+\.com\.au\/help\/faq\)/);
});

test("a trailing slash redirects to the page's one URL", async ({ request }) => {
  // next.config turns Next's own redirect off for PostHog's /ingest
  // proxy; the middleware keeps it for pages.
  for (const path of ["/help/", "/why-siren/", "/help/faq/"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(308);
    expect(new URL(res.headers()["location"], "http://x").pathname, path).toBe(path.replace(/\/$/, ""));
  }
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
    sameAs: [expect.stringContaining("apps.apple.com")],
    founder: { "@type": "Person", name: "Steve Bull" },
    areaServed: { "@type": "Country", name: "Australia" },
  });
  expect(ofType(blocks, "WebSite")).toMatchObject({ name: expect.stringMatching(/^Siren /) });

  const app = ofType(blocks, "SoftwareApplication");
  expect(app).toMatchObject({
    applicationCategory: "SportsApplication",
    offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
    installUrl: expect.stringContaining("apps.apple.com"),
    description: expect.stringContaining("football (soccer), basketball, futsal, hockey, touch football and Oztag"),
  });
  expect((app?.featureList as string[]).length).toBeGreaterThan(3);
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

test("help pages say when they were updated and who wrote them, as the sitemap does", async ({ page, request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const lastmod = sitemap.match(/\/help\/faq<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})/)?.[1];
  expect(lastmod).toBeTruthy();

  // In the server HTML, for crawlers that don't run JavaScript.
  const html = await (await request.get("/help/faq")).text();
  expect(html).toContain('"@type":"TechArticle"');

  await page.goto("/help/faq");
  const updated = page.getByTestId("help-updated");
  await expect(updated).toContainText(/^Updated \d{1,2} [A-Z][a-z]{2} \d{4} · Steve Bull, parent-coach$/);
  await expect(updated.locator("time")).toHaveAttribute("datetime", lastmod!);
  expect(ofType(await jsonLd(page), "TechArticle")).toMatchObject({
    headline: "FAQ",
    dateModified: lastmod,
    author: { "@type": "Person", name: "Steve Bull" },
  });

  // Visitors from search get a way to what Siren is and a demo.
  await expect(page.locator('footer a[href="/why-siren"]')).toBeVisible();
  await expect(page.locator('footer a[href="/demo"]')).toBeVisible();
});
