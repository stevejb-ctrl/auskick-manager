// A finished game can't be wiped through its runner link.
//
// Round 5 (post-game-share): a completed game's runner link showed
// Game settings and "Restart game" above the summary, and the server
// accepted a runner-link reset of a finalised game — deleting every
// event and its minutes from season stats. Runner links get pasted into
// group chats; anyone holding one could do it. Now the live screen
// hides both on a finished game (all sports share the row), and the
// server refuses a runner-link reset once the game is finished. A team
// admin can still restart it from the game page's More menu.

import { test, expect, type Browser } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

async function seedPlayedGame() {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const at = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const events: Array<Record<string, unknown>> = [{ type: "lineup_set", metadata: { lineup }, created_at: at(60) }];
  for (let q = 1; q <= 4; q++) {
    events.push({ type: "quarter_start", metadata: { quarter: q }, created_at: at(60 - q * 13) });
    events.push({ type: "quarter_end", metadata: { quarter: q, elapsed_ms: 12 * 60_000 }, created_at: at(60 - q * 13 - 12) });
  }
  await admin.from("game_events").insert(events.map((e) => ({ ...e, game_id: game.id, created_by: ownerId })));
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  const finalise = async () => {
    await admin.from("game_events").insert({ game_id: game.id, type: "game_finalised", metadata: { quarter: 4 }, created_by: ownerId });
    await admin.from("games").update({ status: "completed" }).eq("id", game.id);
  };
  const eventCount = async () => {
    const { count } = await admin.from("game_events").select("id", { count: "exact", head: true }).eq("game_id", game.id);
    return count ?? 0;
  };
  return { admin, game, finalise, eventCount };
}

async function runnerPage(browser: Browser, token: string) {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/run/${token}`);
  return { context, page };
}

test("a finished game's runner link has no Restart or Game settings", async ({ browser }) => {
  const { game, finalise } = await seedPlayedGame();
  await finalise();
  const { context, page } = await runnerPage(browser, game.share_token);
  await expect(page.getByText(/game summary/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^restart game$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /game settings/i })).toHaveCount(0);
  await context.close();
});

test("a runner link can't wipe a game that finished while it was open", async ({ browser }) => {
  const { admin, game, finalise, eventCount } = await seedPlayedGame();
  // Open at the full-time review, before anyone has finished the game.
  const { context, page } = await runnerPage(browser, game.share_token);
  await expect(page.getByRole("button", { name: /finish game/i })).toBeVisible({ timeout: 15_000 });
  // The coach finishes it on their own phone.
  await finalise();
  const before = await eventCount();

  // A game-day link never offers Restart (UX round 2, 24 Oct 2026), and
  // resetGame refuses one (Vitest: liveActionsTwoPhones).
  await expect(page.getByRole("button", { name: /^restart game$/i })).toHaveCount(0);

  expect(await eventCount()).toBe(before);
  const { data } = await admin.from("games").select("status").eq("id", game.id).single();
  expect(data?.status).toBe("completed");
  await context.close();
});
