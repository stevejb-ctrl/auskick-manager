// Marketing landing-page coverage for the two sport variants:
//   • /         — Siren Footy (AFL accent, alarm orange)
//   • /netball  — Siren Netball (plum accent), themed twin
//
// Both routes share the same component shell (Hero, ScrollingFeatures,
// FinalCTA, etc.) and reskin via the SportThemeProvider CSS variables.
// The tests assert that copy + per-sport accents render correctly on
// each route — anything more visual belongs in a screenshot diff, not
// here.
//
// The shared `storageState` logs every spec in as super-admin, so the
// client island that flips CTAs ("Sign in / Start free" → "Dashboard")
// runs once Supabase resolves. We deliberately assert on copy that is
// auth-agnostic (banner, headline, eyebrow, features, closer text) so
// these tests stay stable regardless of auth state.

import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "parallel" });

test.describe("Siren Footy landing (/)", () => {
  test("renders banner, hero, features and closer in alarm-orange theme", async ({ page }) => {
    await page.goto("/");

    // Banner — mono caps copy.
    await expect(page.getByText("Free for the entire 2026 season.", { exact: false })).toBeVisible();

    // Hero — split-tone headline + sport-specific eyebrow.
    await expect(page.getByText("Built for junior AFL")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Run game day\.\s*Keep your head up\./ })).toBeVisible();

    // Features section eyebrow includes the sport label.
    await expect(page.getByText(/What Siren does/i)).toBeVisible();

    // Features split heading — two halves with their own visual rule.
    await expect(page.getByRole("heading", { name: /Everything you need\./ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Nothing you don.t\./ })).toBeVisible();

    // Closer — "five" is the accent-coloured word.
    await expect(page.getByText(/Set up your team in about/)).toBeVisible();
    await expect(page.getByText("five", { exact: true })).toBeVisible();

    // Sport accent published as a CSS variable on the theme wrapper.
    const accent = await page.locator('[data-sport="footy"]').first().evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--sport-accent").trim(),
    );
    expect(accent).toBe("#D9442D");
  });
});

test.describe("Siren Netball landing (/netball)", () => {
  test("renders themed twin with plum accent and netball copy", async ({ page }) => {
    await page.goto("/netball");

    // Banner copy is shared across sports.
    await expect(page.getByText("Free for the entire 2026 season.", { exact: false })).toBeVisible();

    // Hero — netball-specific eyebrow.
    await expect(page.getByText("Built for junior netball")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Run game day\.\s*Keep your head up\./ })).toBeVisible();

    // Features eyebrow names this sport.
    await expect(page.getByText(/What Siren does/i)).toBeVisible();
    await expect(page.getByText("netball", { exact: false }).first()).toBeVisible();

    // Closer is shared.
    await expect(page.getByText(/Set up your team in about/)).toBeVisible();

    // Plum accent published as a CSS variable on the theme wrapper.
    const accent = await page.locator('[data-sport="netball"]').first().evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--sport-accent").trim(),
    );
    expect(accent).toBe("#7C3F8C");
  });
});
