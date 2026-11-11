// Stagehand round 11 (11 Nov 2026): the public site signed out, new
// teams in every sport, whole games, and team admin.
// .planning/USABILITY-STAGEHAND-2026-11-ROUND11.md has the findings;
// each test here names its number.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { largeText } from "../helpers/a11y";
import { finishedGame, playPeriod } from "../helpers/finished-game";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

// ─── #1 Typing the next kid straight after Add ──────────────────
// A coach adding a squad taps Add and starts typing the next name. The
// name box was disabled while the add saved (about a second), so the
// first letters, or the whole name, went nowhere ("hloe Nguyen").

test("#1 the next kid's name typed straight after Add player is kept", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `R11 squad ${uniq()}` });

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  const name = page.getByLabel(/player name/i);
  await name.fill("Ava First");
  await page.getByRole("button", { name: /^add player$/i }).click();
  // No wait: the next name goes in while the first one saves.
  await name.pressSequentially("Chloe Nguyen", { delay: 30 });

  await expect(page.getByRole("listitem").filter({ hasText: "Ava First" })).toBeVisible();
  await expect(name).toHaveValue("Chloe Nguyen");
  await page.getByRole("button", { name: /^add player$/i }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Chloe Nguyen" })).toBeVisible();
  await expect(name).toHaveValue("");
});

// ─── #2 "Try the <sport> demo" starts that sport's demo ─────────
// Every sport page's "Try the Rugby league demo" went to the demo
// picker, where the visitor had to pick rugby league again.

test.describe("#2 signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const [path, label, sport] of [
    ["/rugby-league", /try the rugby league demo/i, "rugby_league"],
    ["/netball", /try the netball demo/i, "netball"],
  ] as const) {
    test(`#2 ${path}'s Try the demo starts a ${sport} demo game`, async ({ page }) => {
      await page.goto(path);
      // Not waitForHydration: a server-action form carries React's own
      // hidden action input, which never gets props.
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: label }).or(page.getByRole("link", { name: label })).first().click();
      await page.waitForURL(/\/run\/[a-zA-Z0-9_-]+/, { timeout: 20_000 });
      const token = page.url().match(/\/run\/([a-zA-Z0-9_-]+)/)![1];
      const { data: game } = await createAdminClient()
        .from("games")
        .select("teams!inner(sport, is_demo)")
        .eq("share_token", token)
        .single();
      expect(game).toMatchObject({ teams: { sport, is_demo: true } });
    });
  }
});

// ─── #3 The help search finds "subs" ─────────────────────────────
// The help's search box matched topic titles only, so a coach typing
// "subs" (or "injury", "fix score") on the main help got "No topics
// match": the answers live under Rotations and The Live Screen.

test.describe("#3 signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("#3 the help search finds the topic for subs, injuries and fixing a score", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/help");
    await waitForHydration(page);
    const nav = page.getByRole("navigation", { name: "Help topics" });
    const search = nav.getByRole("searchbox", { name: /search help topics/i });
    for (const [q, topic] of [
      ["subs", "Rotations"],
      ["injury", "The Live Screen"],
      ["fix score", "Keeping Score"],
    ] as const) {
      await search.fill(q);
      await expect(nav.getByTestId("help-nav-topics").getByRole("link", { name: topic }), q).toBeVisible();
      await expect(nav.getByText("No topics match.")).toHaveCount(0);
    }
  });
});

// ─── #4 The site's header at large text ─────────────────────────
// On a phone at 200% text the header ran 100 px off the screen: Start
// free was cut in half and every page scrolled sideways.

test.describe("#4 signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 412, height: 915 } });
  for (const path of ["/", "/netball", "/why-siren"]) {
    test(`#4 ${path} at 200% text keeps the header's Start free on screen, nothing scrolls sideways`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await largeText(page, 200);
      const start = page.getByRole("banner").getByRole("link", { name: "Start free" });
      await expect(start).toBeVisible();
      const box = (await start.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(412);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);
    });
  }
});

// ─── #5 Season balance says one thing ───────────────────────────
// Stats said "✓ Everyone's within a quarter of even." right above
// "12 of 25 kids within a quarter of even" (and "7 of 10" on netball):
// the tick only looked at kids owed time, the count at kids over too.

test("#5 the season-balance tick never contradicts the count under it", async ({ page }) => {
  test.setTimeout(90_000);
  // Two quarters, nobody moved: each kid is a quarter-plus over in their
  // line, and owed under a quarter in the other two.
  const { team } = await finishedGame("afl", 12, (ids) => [
    { type: "lineup_set", metadata: { lineup: { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: [] } } },
    ...playPeriod(1, []),
    ...playPeriod(2, []),
    { type: "game_finalised", metadata: { quarter: 2 } },
  ]);
  await page.goto(`/teams/${team.id}/stats`);
  await waitForHydration(page);
  const summary = page.getByTestId("season-balance-summary");
  await expect(summary).toContainText(/\d+\s*of\s*\d+/, { timeout: 15_000 });
  const [, within, total] = (await summary.textContent())!.match(/(\d+)\s*of\s*(\d+)/)!;
  expect(Number(within)).toBeLessThan(Number(total));
  await expect(page.getByTestId("season-balance-verdict")).not.toContainText(/everyone's within/i);
});
