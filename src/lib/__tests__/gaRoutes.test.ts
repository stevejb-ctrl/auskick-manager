// Google Analytics may only see public pages, and never a URL that
// could carry a secret. e2e/tests/google-analytics-routes.spec.ts
// checks the same rule in the browser.
import { describe, expect, it } from "vitest";
import { gaDisableKey, isGaAllowed } from "@/lib/analytics/ga-routes";
import { INDEXABLE_ROUTES } from "@/lib/public-routes";

const allowed = (url: string) => {
  const { pathname, searchParams } = new URL(url, "https://www.sirenfooty.com.au");
  return isGaAllowed(pathname, searchParams);
};

describe("isGaAllowed", () => {
  it("allows every sitemap page", () => {
    for (const { path } of INDEXABLE_ROUTES) expect(allowed(path), path).toBe(true);
  });

  it("allows campaign tags and ad-click IDs", () => {
    expect(allowed("/?utm_source=club&utm_medium=email&utm_campaign=kotara")).toBe(true);
    expect(allowed("/demo?gclid=abc")).toBe(true);
    expect(allowed("/help?fbclid=abc")).toBe(true);
  });

  it("blocks token links and the app", () => {
    for (const url of [
      "/run/7f3c2a",
      "/run/7f3c2a/lineup",
      "/join/invite-token",
      "/dashboard",
      "/teams/1",
      "/teams/1/games/2/live",
      "/account",
      "/welcome",
      "/reset",
      "/auth/callback",
    ]) {
      expect(allowed(url), url).toBe(false);
    }
  });

  it("blocks a public page whose query could carry a secret or an email", () => {
    expect(allowed("/login?next=%2Fjoin%2Finvite-token")).toBe(false);
    expect(allowed("/login?email=coach%40example.com")).toBe(false);
    expect(allowed("/?code=abc")).toBe(false);
    expect(allowed("/help?utm_source=club&token=abc")).toBe(false);
  });

  it("blocks unlisted public pages", () => {
    expect(allowed("/signup")).toBe(false);
    expect(allowed("/forgot-password")).toBe(false);
  });
});

describe("gaDisableKey", () => {
  it("is GA's own opt-out flag name", () => {
    expect(gaDisableKey("G-ZBTGMZPTD0")).toBe("ga-disable-G-ZBTGMZPTD0");
  });
});
