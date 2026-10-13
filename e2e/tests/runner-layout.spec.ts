// The runner link's live screen fits a 375px phone in every sport. Round
// 5's route crawl found it scrolling sideways (netball 4px, league 16px):
// the live top bar bleeds edge to edge with -mx-4, and the runner page's
// wrappers had less padding than that (league none).

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.use({ viewport: { width: 375, height: 740 } });

const NB = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];

for (const sport of ["afl", "netball", "rugby_league"] as const) {
  test(`${sport}: the runner's live screen doesn't scroll sideways at 375px`, async ({ page }) => {
    const admin = createAdminClient();
    const { data: su } = await admin.auth.admin.listUsers();
    const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
    const age = sport === "afl" ? "U10" : sport === "netball" ? "11u" : "U11";
    const onField = sport === "afl" ? 12 : sport === "netball" ? 7 : 11;
    const team = await makeTeam(admin, { ownerId, ageGroup: age, sport, name: `Runner fit ${sport} ${Date.now() % 100000}` });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: onField + 2, ageGroup: "U10" });
    const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
    await admin.from("games").update({ on_field_size: onField, status: "in_progress" }).eq("id", game.id);
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
    await page.addInitScript(() => {
      try {
        for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
      } catch {}
    });
    await page.goto(`/run/${game.share_token}`);
    await expect(page.getByRole("button", { name: /^clock — (q|h)1/i })).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
