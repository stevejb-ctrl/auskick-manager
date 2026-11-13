// The ten sport pages (/netball, /afl, …) and the header's Sports menu
// that leads to them, from the ten-sport homepage (design canvas,
// 22 Oct 2026). Each page is one template fed by the sport's data
// (src/app/(marketing)/[sport]/page.tsx, content/marketing/sports.json).
//
// Covers: src/app/(marketing)/[sport]/page.tsx, SportsMenu,
// SportChips, FieldBand, GameTour, src/lib/public-routes.ts (sport pages are
// public and in the sitemap).

import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const SPORTS = [
  { path: "/netball", name: "netball", h1: "Seven positions. Every kid gets a go." },
  { path: "/afl", name: "AFL", h1: "Every kid gets a go in every zone." },
  { path: "/rugby-league", name: "rugby league", h1: "Every kid gets a run, by the Junior Laws." },
  { path: "/soccer", name: "football (soccer)", h1: "Everyone gets a turn in goal." },
  { path: "/basketball", name: "basketball", h1: "Every kid gets to bring it up." },
  { path: "/rugby-union", name: "rugby union", h1: "Props, locks and a number 8." },
  { path: "/touch-football", name: "touch football", h1: "Mixed teams, kept legal." },
  { path: "/oztag", name: "Oztag", h1: "A girl's try counts two." },
  { path: "/hockey", name: "hockey", h1: "Halves or quarters, every kid gets a fair run." },
  { path: "/futsal", name: "futsal", h1: "Fast subs, and a fair turn in goal." },
];

for (const sport of SPORTS) {
  test(`${sport.path} opens signed out with its own pitch, rules and links on`, async ({ page }) => {
    const res = await page.goto(sport.path);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${sport.path}$`));
    await expect(page.getByRole("heading", { level: 1, name: sport.h1 })).toBeVisible();
    await expect(page).toHaveTitle(/\| Siren$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${sport.path}$`));

    // Three things Siren knows about the sport's junior rules.
    await expect(page.getByRole("heading", { name: `Junior ${sport.name}, the way it's played.` })).toBeVisible();
    await expect(page.locator("section[aria-labelledby='knows-heading'] li")).toHaveCount(3);

    // The live-game screenshot loads (through next/image).
    const shot = page.locator("main img").first();
    await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    // The other nine sports, and the sign-up named for this one.
    const others = page.getByRole("navigation", { name: "Coach another sport too?" });
    await expect(others.getByRole("link")).toHaveCount(9);
    await expect(others.locator(`a[href="${sport.path}"]`)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: `Set up your ${sport.name} team in about five minutes.` })).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/\bbeta\b/i);
  });
}

// The v3 site (docs/marketing/V3-SITE-DESIGN.md): each sport page sits on
// its own ground and tours one game in its own screenshots.
const SURFACES: Record<string, { surface: string; rgb: string }> = {
  "/netball": { surface: "court", rgb: "rgb(30, 70, 95)" },
  "/futsal": { surface: "court", rgb: "rgb(30, 70, 95)" },
  "/basketball": { surface: "wood", rgb: "rgb(90, 56, 32)" },
};
const GRASS = { surface: "field", rgb: "rgb(15, 76, 43)" };

for (const sport of SPORTS) {
  test(`${sport.path} is on its own ground, with a six-step tour in its own screenshots`, async ({ page }) => {
    await page.goto(sport.path);
    const slug = sport.path.slice(1);

    // The hero band is the sport's playing surface, as the live screen draws it.
    const want = SURFACES[sport.path] ?? GRASS;
    const hero = page.locator("main > section").first();
    await expect(hero).toHaveAttribute("data-surface", want.surface);
    await expect(hero).toHaveCSS("background-color", want.rgb);

    // One game in six moments, each over its own screen.
    const steps = page.locator("#features ol > li");
    await expect(steps).toHaveCount(6);
    for (const stamp of ["Full time", "After the game"]) await expect(steps.filter({ hasText: stamp })).toHaveCount(1);

    // Every picture on the page is this sport's own: no other sport's
    // folder (the AFL and league shots used to stand in for others).
    const srcs = await page.locator("main img").evaluateAll((imgs) =>
      imgs.map((img) => {
        const src = (img as HTMLImageElement).getAttribute("src") ?? "";
        const url = new URL(src, location.href);
        return decodeURIComponent(url.searchParams.get("url") ?? url.pathname);
      }),
    );
    expect(srcs.length).toBeGreaterThanOrEqual(7);
    for (const src of srcs) expect(src, src).toMatch(new RegExp(`^/marketing/screenshots/${slug}/(live|pairs|scoring|break|fulltime|stats)\\.png$`));
    // And every one of them has words for anyone who can't see it.
    const alts = await page.locator("main img").evaluateAll((imgs) => imgs.map((img) => img.getAttribute("alt")));
    expect(alts.filter((a) => a !== "" && (a ?? "").length < 20)).toEqual([]);
  });
}

// Steve, 10 Nov 2026: the sign-up band on a wide screen sliced AFL's oval
// to a strip, so its two ends and 50 m arcs read as stray circles. The
// short band draws the whole ground instead, centred behind the words.
test("the sign-up band draws the whole ground on a wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 900 });
  for (const path of ["/afl", "/"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const glyph = page.locator("#signup svg[data-sport-field]").filter({ visible: true });
    await expect(glyph).toHaveCount(1);
    await expect(glyph).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
  }
});

// Steve, 13 Nov 2026: Why Siren was still on the old brand (mono
// eyebrows, a pale gradient hero) after the site moved to field bands.
// It wears the homepage's look now: the hero on the grass in Archivo,
// the reading on the page, the sign-up back on the grass.
test("Why Siren is on the grass, in the site's own type", async ({ page }) => {
  await page.goto("/why-siren");
  const hero = page.locator("main > section").first();
  await expect(hero).toHaveAttribute("data-surface", GRASS.surface);
  await expect(hero).toHaveCSS("background-color", GRASS.rgb);
  const h1 = hero.getByRole("heading", { level: 1 });
  await expect(h1).toHaveText("Built for the kid who's been stuck in the same spot all quarter.");
  expect(await h1.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/archivo/i);
  for (const name of ["Three minutes until the next whistle.", "Positions, not just minutes.", "Not a generic rotation tracker."]) {
    const h2 = page.getByRole("heading", { level: 2, name });
    expect(await h2.evaluate((el) => getComputedStyle(el).fontFamily), name).toMatch(/archivo/i);
  }
  await expect(page.locator("#signup")).toHaveAttribute("data-surface", GRASS.surface);
});

test("the sport pages and the homepage fit a phone: nothing scrolls sideways at 390", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/why-siren", ...SPORTS.map((s) => s.path)]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide, path).toBeLessThanOrEqual(390);
  }
});

test("a sport Siren doesn't run has no page", async ({ page }) => {
  // Not public, so the middleware sends it to sign-in like any unknown path.
  await page.goto("/cricket");
  await expect(page).toHaveURL(/\/login/);
});

test("the header's Sports menu lists every sport, and Escape closes it", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("banner");
  const button = banner.getByRole("button", { name: "Sports" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");

  const menu = banner.getByRole("navigation", { name: "Sports" });
  const links = menu.getByRole("link");
  await expect(links).toHaveCount(10);
  await expect(links.first()).toContainText("Netball");
  await expect(links.last()).toContainText("Futsal");
  await expect(menu).toContainText("The mixed boys' cap");

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();

  await button.click();
  await menu.getByRole("link", { name: /hockey/i }).click();
  await expect(page).toHaveURL(/\/hockey$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("every kid gets a fair run");
  await expect(banner.getByRole("navigation", { name: "Sports" })).toBeHidden();
});

test("the footer links every sport's page", async ({ page }) => {
  await page.goto("/why-siren");
  const footer = page.getByRole("contentinfo").getByRole("navigation", { name: "Sports" });
  await expect(footer.getByRole("link")).toHaveCount(10);
  await footer.getByRole("link", { name: "Rugby union" }).click();
  await expect(page).toHaveURL(/\/rugby-union$/);
});
