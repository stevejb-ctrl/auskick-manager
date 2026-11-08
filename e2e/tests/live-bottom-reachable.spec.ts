// The bottom of the live screen can be scrolled clear of the score bar.
//
// Round 5 (chaotic-substitution-coach): on a phone, "+ Add late arrival"
// sat under the fixed score bar at the bottom and the page wouldn't
// scroll any further, so it couldn't be tapped. The bar is shared by all
// three sports, and so was the problem: nothing in the page left room
// for it. Checked with the last thing on the page, the admin row's
// Restart game, on the coach's page (a game-day link no longer offers
// Restart: UX round 2, 24 Oct 2026).
//
// AFL's live v3 shell (Phase 5; netball's from Phase 7) has no admin row: the page doesn't
// scroll, the field scrolls inside the screen, and Restart is in ⋯. So
// there the last control is the field's last kid, scrolled to the end
// of the field, clear of the bench and the bar; and ⋯'s Restart is
// on top too. Netball (Phase 7) and rugby league (Phase 8) joined it.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

const NB = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];

for (const sport of ["afl", "netball", "rugby_league"] as const) {
  test(`${sport}: the last control on the live screen isn't hidden under the score bar`, async ({ browser }) => {
    const admin = createAdminClient();
    const { data: su } = await admin.auth.admin.listUsers();
    const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
    const age = sport === "afl" ? "U10" : sport === "netball" ? "11u" : "U11";
    const onField = sport === "afl" ? 12 : sport === "netball" ? 7 : 11;
    const team = await makeTeam(admin, { ownerId, ageGroup: age, sport, name: `Bottom ${sport} ${Date.now() % 100000}` });
    await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: onField + 2, ageGroup: "U10" });
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    await admin.from("games").update({ on_field_size: onField, status: "in_progress", sub_interval_seconds: 900 }).eq("id", game.id);
    const ids = players.map((p) => p.id);
    const lineup =
      sport === "netball"
        ? { positions: Object.fromEntries(NB.map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }
        : sport === "rugby_league"
          ? { forwards: ids.slice(0, 5), backs: ids.slice(5, 11), bench: ids.slice(11) }
          : { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
    await admin.from("game_events").insert(
      [
        { type: "lineup_set", metadata: { lineup, sport } },
        { type: "quarter_start", metadata: { quarter: 1, sport } },
      ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
    );

    // The coach (the signed-in super-admin owns the team).
    const context = await browser.newContext({ storageState: "playwright/.auth/super-admin.json", viewport: { width: 412, height: 839 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      try {
        for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
      } catch {}
    });
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    const field = page.getByTestId("live-field");
    const shell = sport === "afl" || sport === "netball" || sport === "rugby_league";
    const last =
      sport === "afl" || sport === "netball"
        ? field.locator('[data-testid^="player-tile-"]').last()
        : sport === "rugby_league"
          ? field.locator('[data-testid^="league-player-tile-"]').last()
        : page.getByRole("button", { name: /^restart game$/i });
    await expect(last).toBeAttached({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    if (shell) await field.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    else await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const onTop = await last.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
    expect(onTop).toBe(true);
    if (shell) {
      await page.getByRole("button", { name: "Game menu" }).click();
      const restart = page.getByRole("dialog", { name: "Game menu" }).getByRole("button", { name: /^restart game$/i });
      await expect(restart).toBeVisible();
      await restart.scrollIntoViewIfNeeded();
      expect(
        await restart.evaluate((el) => {
          const b = el.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return !!hit && (hit === el || el.contains(hit));
        }),
      ).toBe(true);
    }
    await context.close();
  });
}
