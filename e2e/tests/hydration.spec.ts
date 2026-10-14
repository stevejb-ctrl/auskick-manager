// The live game survives a slow phone in every sport (netball's case
// lives in netball-live-flow.spec.ts). Times computed from Date.now()
// in render made the server and the browser disagree by a second, so
// React threw the server HTML away and swallowed the coach's first
// tap. Holding the app's JavaScript back 1.5s makes that gap certain.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function superAdminId(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/** Load a live page on a "slow phone" and return the hydration errors seen. */
async function loadSlowly(page: Page, url: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
      localStorage.setItem("rl-walkthrough-seen", "1");
    } catch {}
  });
  await page.route("**/_next/static/chunks/**", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto(url);
  // Hydrated once the clock button carries React's props.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[aria-label^="Clock"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
    },
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(500);
  return errors.filter((m) => /hydrat|did not match|server-rendered/i.test(m));
}

test("AFL: the live game hydrates cleanly on a slow phone", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: startedAt },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: startedAt },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  expect(await loadSlowly(page, `/teams/${team.id}/games/${game.id}/live`)).toEqual([]);
});

test("league: the live game hydrates cleanly on a slow phone", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U9", sport: "rugby_league" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10, ageGroup: "U9" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  await admin.from("games").update({ on_field_size: 8, status: "in_progress" }).eq("id", game.id);
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup: { forwards: ids.slice(0, 4), backs: ids.slice(4, 8), bench: ids.slice(8) }, sport: "rugby_league" },
      created_by: ownerId,
      created_at: startedAt,
    },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: startedAt },
  ]);

  expect(await loadSlowly(page, `/teams/${team.id}/games/${game.id}/live`)).toEqual([]);
});
