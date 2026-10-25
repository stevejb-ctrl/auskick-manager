// Ending a period early credits the time played (round-3 edge testing,
// 24 Oct 2026, P1), and "Sub due" needs someone to bring on (P2).
//
// - Ending a half 6 s after it started credited every kid on the court the
//   full 20:00: quarter_end saved the whole period, the confirm never said
//   how much had been played, and the only way back was Restart. The
//   confirm now shows the time played and credits it; "The game played on:
//   credit the full …" is the explicit second choice.
// - Basketball's top-bar "Sub due — rotate a player off" fired with
//   nobody on the bench who could come on (all fouled out).

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Row = { type: string; player_id?: string | null; metadata: Record<string, unknown> };

async function liveGame(
  admin: SupabaseClient,
  sport: "afl" | "basketball",
  opts: { secondsIn: number; multiplier?: number; subSeconds?: number },
  extra: (ids: string[]) => Row[] = () => [],
) {
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const ageGroup = sport === "afl" ? "U10" : "U12";
  const team = await makeTeam(admin, {
    ownerId,
    sport,
    ageGroup,
    name: `End-Early-${sport}-${Date.now() % 100000}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: sport === "afl" ? 14 : 7, ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = players.map((p) => p.id);
  const lineup =
    sport === "afl"
      ? { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }
      : { lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) };
  const tag = sport === "afl" ? {} : { sport };
  const kickoff = Date.now() - opts.secondsIn * 1000;
  const later = extra(ids);
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, ...tag }, created_at: new Date(kickoff - 1000).toISOString() },
      { type: "quarter_start", metadata: { quarter: 1, ...tag }, created_at: new Date(kickoff).toISOString() },
      ...later.map((r, i) => ({ ...r, metadata: { ...r.metadata, ...tag }, created_at: new Date(kickoff + (i + 1) * 100).toISOString() })),
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed events: ${error.message}`);
  await admin
    .from("games")
    .update({
      status: "in_progress",
      clock_multiplier: opts.multiplier ?? 1,
      sub_interval_seconds: opts.subSeconds ?? 900,
      quarter_length_seconds: 600,
    })
    .eq("id", game.id);
  return { team, game, ids };
}

async function skipTours(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

async function endedAt(admin: SupabaseClient, gameId: string): Promise<number | null> {
  const { data } = await admin.from("game_events").select("metadata").eq("game_id", gameId).eq("type", "quarter_end");
  const meta = data?.[0]?.metadata as { elapsed_ms?: number } | undefined;
  return meta?.elapsed_ms ?? null;
}

test("basketball: ending a half seconds in credits the time played, not the whole half", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { team, game } = await liveGame(admin, "basketball", { secondsIn: 5 });
  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const clock = page.getByRole("button", { name: /^clock — h1, running$/i });
  await expect(clock).toBeVisible({ timeout: 30_000 });
  await clock.click();
  await page.getByRole("button", { name: /^end h1 now$/i }).click();

  // The confirm says how much was played, and credits that by default.
  const confirm = page.getByRole("dialog", { name: /^end h1 now\?$/i });
  await expect(confirm).toContainText(/0:\d\d of the 10:00 half/);
  await expect(confirm.getByRole("button", { name: /credit the full 10:00/i })).toBeVisible();
  await confirm.getByRole("button", { name: /^end h1$/i }).click();

  // Saved at the time played: before, 600000 (the whole half).
  await expect.poll(() => endedAt(admin, game.id), { timeout: 20_000 }).not.toBeNull();
  expect(await endedAt(admin, game.id)).toBeLessThan(60_000);
});

test("AFL: a paused clock the game played on past can still credit the whole quarter, by choice", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  // Paused at 1:00 long ago: the game played on while the app's clock sat.
  const { team, game } = await liveGame(admin, "afl", { secondsIn: 300 }, () => [
    { type: "clock_pause", metadata: { quarter: 1, paused: true, elapsed_ms: 60_000, at_ms: Date.now() - 240_000 } },
  ]);
  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const clock = page.getByRole("button", { name: /^clock — q1, paused$/i });
  await expect(clock).toBeVisible({ timeout: 30_000 });
  await clock.click();
  await page.getByRole("button", { name: /^end q1 now$/i }).click();
  const confirm = page.getByRole("dialog", { name: /^end q1 now\?$/i });
  await expect(confirm).toContainText(/paused at 1:00 of the 10:00 quarter/);
  await confirm.getByRole("button", { name: /^the game played on: credit the full 10:00$/i }).click();
  await expect.poll(() => endedAt(admin, game.id), { timeout: 20_000 }).toBe(600_000);
});

test("basketball: no 'Sub due' banner when nobody on the bench can come on", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  // 30 s subs at 6×, 20 s in: two minutes of game time, a sub long due.
  // Both bench kids fouled out.
  const { team, game } = await liveGame(admin, "basketball", { secondsIn: 20, multiplier: 6, subSeconds: 30 }, (ids) =>
    [ids[5], ids[6]].map((id) => ({
      type: "injury",
      player_id: id,
      metadata: { injured: true, reason: "fouled_out", quarter: 1, elapsed_ms: 10_000 },
    })),
  );
  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3_000);
  await expect(page.getByText(/rotate a player off/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Got it" })).toHaveCount(0);
});
