// A kickoff from the runner link keeps the game's sub interval.
//
// Round 5 (afl-experienced-coach): the runner lineup pages didn't pass
// the game's interval to the lineup picker, so it fell back to an
// estimate from the squad size and kickoff saved that over the game's
// own setting — a 7-minute game became 4 or 5 (or 6 after "Set manually"
// emptied the field). The coach's page always passed it.

import { test, expect, type Browser } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

async function runnerContext(browser: Browser) {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
  return { context, page };
}

for (const sport of ["afl", "rugby_league"] as const) {
  test(`${sport}: a runner-link kickoff keeps the game's 7-minute sub interval`, async ({ browser }) => {
    const admin = createAdminClient();
    const { data: superAdmin } = await admin.auth.admin.listUsers();
    const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
    const team = await makeTeam(admin, {
      ownerId,
      ageGroup: sport === "afl" ? "U10" : "U11",
      sport,
      name: `Runner sub ${sport} ${Date.now() % 100000}`,
    });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
    const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
    const { error } = await admin.from("games").update({ sub_interval_seconds: 420 }).eq("id", game.id);
    if (error) throw new Error(error.message);
    await admin.from("game_availability").insert(
      players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
    );

    const { context, page } = await runnerContext(browser);
    await page.goto(sport === "afl" ? `/run/${game.share_token}/lineup` : `/run/${game.share_token}`);
    // A tap on Start before hydration does nothing (WebKit).
    await waitForHydration(page);
    if (sport === "rugby_league") {
      const cont = page.getByRole("link", { name: /continue to starting lineup/i });
      if (await cont.isVisible({ timeout: 5_000 }).catch(() => false)) await cont.click();
    }
    await page.getByRole("button", { name: /^start (q|h)1$/i }).click({ timeout: 15_000 });
    const startClock = page.getByRole("button", { name: /^start clock$/i });
    if (await startClock.isVisible({ timeout: 5_000 }).catch(() => false)) await startClock.click();

    await expect
      .poll(async () => {
        const { data } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "lineup_set");
        return data?.length ?? 0;
      }, { timeout: 15_000 })
      .toBeGreaterThan(0);
    const { data: g } = await admin.from("games").select("sub_interval_seconds").eq("id", game.id).single();
    expect(g?.sub_interval_seconds).toBe(420);
    await context.close();
  });
}
