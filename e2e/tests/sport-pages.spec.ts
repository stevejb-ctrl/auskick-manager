// The ten sport pages (/netball, /afl, …) and the header's Sports menu
// that leads to them, from the ten-sport homepage (design canvas,
// 22 Oct 2026). Each page is one template fed by the sport's data
// (src/app/(marketing)/[sport]/page.tsx, content/marketing/sports.json).
//
// Covers: src/app/(marketing)/[sport]/page.tsx, SportsMenu,
// SportChips, SharedFeatures, src/lib/public-routes.ts (sport pages are
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

test("a sport with its own tour scrolls through it; one without shows the shared six", async ({ page }) => {
  await page.goto("/netball");
  // Netball's own tour (content/marketing/brands/netball.json).
  await expect(page.getByText("Every kid gets a turn in the").first()).toBeAttached();

  await page.goto("/oztag");
  const features = page.locator("#features");
  await expect(features.locator("li")).toHaveCount(6);
  await expect(features).toContainText("Shown in netball");
  await expect(features).toContainText("The same six things in every sport, Oztag included.");
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
