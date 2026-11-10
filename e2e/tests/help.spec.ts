// The help system: the global topics every sport shares, and a hub per
// sport at /help/<slug>. Every page opens with its own h1, the sidebar's
// links all resolve, a hub's sidebar lists its own sections, Help from
// inside a team lands on that team's sport hub, and the old names for a
// sport (or the scoring page) redirect.
//
// Covers: src/app/help/*, src/app/help/[sport]/page.tsx,
//         src/components/help/HelpNav.tsx, src/lib/help/{pages,sports}.ts,
//         src/app/(app)/teams/[teamId]/help/page.tsx, src/lib/help/helpHref.ts,
//         src/components/layout/UserMenu.tsx, next.config.mjs (redirects)

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HELP_PAGES } from "../../src/lib/help/pages";
import { SPORT_HELP } from "../../src/lib/help/sports";

test.describe.configure({ mode: "parallel" });

async function superAdminId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("every global help page opens with its own h1 and canonical", async ({ page }) => {
    for (const p of HELP_PAGES) {
      const res = await page.goto(p.href);
      expect(res?.status(), p.href).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }), p.href).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]'), p.href).toHaveAttribute("href", new RegExp(`${p.href}$`));
    }
  });

  test("every sport hub opens with its h1, its sections, its formats and its screenshots", async ({ page }) => {
    for (const hub of SPORT_HELP) {
      const res = await page.goto(hub.href);
      expect(res?.status(), hub.href).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${hub.title} help`);
      await expect(page).toHaveTitle(`${hub.title} · Help · Siren`);
      for (const s of hub.sections) {
        await expect(page.locator(`section#${s.id} h2`), `${hub.href}#${s.id}`).toBeVisible();
      }
      // The age groups come from the sport's config: at least one row.
      expect(await page.getByTestId("help-age-groups").locator("tbody tr").count(), hub.href).toBeGreaterThan(0);
      // Its own live, pairs, scoring, break and full-time screenshots.
      for (const shot of ["live", "pairs", "scoring", "break", "fulltime"]) {
        await expect(
          page.locator(`figure.help-figure img[src*="${encodeURIComponent(`/help-screenshots/${hub.sport.slug}/${shot}.png`)}"]`),
          `${hub.href} ${shot}`,
        ).toHaveCount(1);
      }
    }
  });

  test("an unknown sport is a 404", async ({ page }) => {
    const res = await page.goto("/help/quidditch");
    expect(res?.status()).toBe(404);
  });

  test("the help home page lists the topics and the ten sports", async ({ page }) => {
    await page.goto("/help");
    const grid = page.getByTestId("help-sport-grid");
    await expect(grid.getByRole("link")).toHaveCount(SPORT_HELP.length);
    for (const hub of SPORT_HELP) {
      await expect(grid.getByRole("link", { name: hub.title, exact: true })).toHaveAttribute("href", hub.href);
    }
    await expect(page.getByTestId("help-topic-list").getByRole("link")).toHaveCount(HELP_PAGES.length - 1);
  });

  test("every link in the help sidebar resolves", async ({ page, request }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/help/netball");
    const nav = page.getByRole("navigation", { name: "Help topics" });
    const hrefs = await nav.getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    // Topics, sports, and netball's own sections.
    expect(hrefs.length).toBeGreaterThanOrEqual(HELP_PAGES.length + SPORT_HELP.length);
    for (const href of Array.from(new Set(hrefs.map((h) => h.split("#")[0])))) {
      expect((await request.get(href)).status(), href).toBe(200);
    }
    // Inside a hub, its sections are listed, and each anchor is on the page.
    const sections = nav.getByTestId("help-nav-sections").getByRole("link");
    const hub = SPORT_HELP.find((h) => h.href === "/help/netball")!;
    await expect(sections).toHaveCount(hub.sections.length);
    for (const s of hub.sections) await expect(page.locator(`#${s.id}`)).toHaveCount(1);
    await expect(nav.getByRole("link", { name: "Netball" })).toHaveAttribute("aria-current", "page");
  });

  test("the sitemap lists every help page and sport hub", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const path of [...HELP_PAGES.map((p) => p.href), ...SPORT_HELP.map((h) => h.href)]) {
      expect(xml, path).toMatch(new RegExp(`<loc>[^<]*${path}</loc>`));
    }
  });

  test("a sport hub carries breadcrumbs and an article date", async ({ request }) => {
    const html = await (await request.get("/help/rugby-league")).text();
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"name":"Rugby league"');
    expect(html).toContain('"@type":"TechArticle"');
  });

  test("other names for a sport, and the scoring page's, redirect", async ({ request }) => {
    for (const [from, to] of [
      ["/help/league", "/help/rugby-league"],
      ["/help/rugby_union", "/help/rugby-union"],
      ["/help/football", "/help/soccer"],
      ["/help/touch", "/help/touch-football"],
      ["/help/keeping-score", "/help/track-scoring"],
    ]) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(res.headers().location, from).toMatch(new RegExp(`${to}$`));
    }
  });
});

test("Help from inside a team opens that team's sport hub", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league", ageGroup: "U9" });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/teams/${team.id}`);
    await page.getByTestId("user-menu-trigger").click();
    const help = page.getByRole("menuitem", { name: "Help" });
    await expect(help).toHaveAttribute("href", `/teams/${team.id}/help`);
    await help.click();
    await expect(page).toHaveURL(/\/help\/rugby-league$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rugby league help");
    // Signed in, the hub's header leads back into the app.
    await expect(page.getByRole("banner").getByRole("link", { name: /back to siren/i })).toBeVisible();

    // Outside a team, Help is the help home page.
    await page.goto("/dashboard");
    await page.getByTestId("user-menu-trigger").click();
    await expect(page.getByRole("menuitem", { name: "Help" })).toHaveAttribute("href", "/help");
  } finally {
    await admin.from("teams").delete().eq("id", team.id);
  }
});

test("a team's help link doesn't tell someone off the team its sport", async ({ page }) => {
  const admin = createAdminClient();
  // A team the signed-in super-admin isn't on.
  const { data: other } = await admin.auth.admin.createUser({
    email: `help-other-${Date.now()}@siren.test`,
    password: `Other-${Date.now()}`,
    email_confirm: true,
  });
  const team = await makeTeam(admin, { ownerId: other.user!.id, sport: "netball", ageGroup: "11u" });
  try {
    // The team layout says they're not on the team; nothing names its sport.
    await page.goto(`/teams/${team.id}/help`);
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toMatch(/\/help\/netball/);
    await expect(page.getByRole("heading", { name: "Netball help" })).toHaveCount(0);
  } finally {
    await admin.from("teams").delete().eq("id", team.id);
    await admin.auth.admin.deleteUser(other.user!.id);
  }
});
