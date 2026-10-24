// Finish game when the request is lost (round-2 usability test, 24 Oct
// 2026).
//
// P1, netball: the first tap on Finish game replaced the whole live page
// with "Something went wrong · Failed to fetch", and the game wasn't
// finished. Every sport awaited its finalise action bare, so a request
// dropped on a sideline connection threw into the error boundary. Now the
// review stays up and says "Couldn't save — try again", and the retry
// finishes the game once (one game_finalised).
//
// P3: the summary after Finish opened scrolled where the review was, with
// the final score and "Copy for group chat" off-screen. It opens at the
// top.

import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { getAgeGroupConfig } from "../../src/lib/sports/registry";

test.describe.configure({ mode: "parallel" });

type Sport = "afl" | "netball" | "soccer" | "basketball";

const CASES: { sport: Sport; ageGroup: string; count: number; lineup: (ids: string[]) => Record<string, unknown> }[] = [
  {
    sport: "afl",
    ageGroup: "U10",
    count: 14,
    lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }),
  },
  {
    sport: "netball",
    ageGroup: "go",
    count: 9,
    lineup: (ids) => ({
      positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])),
      bench: ids.slice(7),
    }),
  },
  {
    sport: "soccer",
    ageGroup: "U8",
    count: 8,
    lineup: (ids) => ({ keeper: ids[0], lines: { def: [ids[1], ids[2]], mid: [ids[3], ids[4], ids[5]], att: [ids[6]], field: [] }, bench: ids.slice(7) }),
  },
  {
    sport: "basketball",
    ageGroup: "U12",
    count: 7,
    lineup: (ids) => ({ lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) }),
  },
];

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/** A game whose last period has ended: the full-time review, not finished yet. */
async function gameAtFullTime(admin: SupabaseClient, c: (typeof CASES)[number]) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, {
    ownerId,
    sport: c.sport,
    ageGroup: c.ageGroup,
    name: `Finish-Retry-${c.sport}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: c.count, ageGroup: c.ageGroup });
  // Scoring on: the review then has its score tables, so it scrolls.
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const periods = getAgeGroupConfig(c.sport, c.ageGroup).periodCount;
  const sportTag = c.sport === "afl" || c.sport === "netball" ? {} : { sport: c.sport };
  const rows: { type: string; metadata: Record<string, unknown> }[] = [
    { type: "lineup_set", metadata: { lineup: c.lineup(players.map((p) => p.id)) } },
  ];
  for (let q = 1; q <= periods; q++) {
    rows.push({ type: "quarter_start", metadata: { quarter: q } });
    rows.push({ type: "quarter_end", metadata: { quarter: q, elapsed_ms: 600_000 } });
  }
  const t0 = Date.now() - 3_600_000;
  const { error } = await admin.from("game_events").insert(
    rows.map((r, i) => ({
      ...r,
      metadata: { ...r.metadata, ...sportTag },
      game_id: game.id,
      created_by: ownerId,
      created_at: new Date(t0 + i * 1000).toISOString(),
    })),
  );
  if (error) throw new Error(`seed events: ${error.message}`);
  await admin.from("games").update({ status: "in_progress", quarter_length_seconds: 600 }).eq("id", game.id);
  return { team, game };
}

const finalisedCount = async (admin: SupabaseClient, gameId: string) =>
  (await admin.from("game_events").select("id").eq("game_id", gameId).eq("type", "game_finalised")).data?.length ?? 0;

for (const c of CASES) {
  test(`${c.sport}: Finish game keeps the review when the save is lost, and the retry finishes once`, async ({ page }) => {
    test.setTimeout(120_000);
    const admin = createAdminClient();
    const { team, game } = await gameAtFullTime(admin, c);
    await page.addInitScript(() => {
      try {
        for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen"]) localStorage.setItem(k, "1");
      } catch {}
    });
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    const finish = page.getByRole("button", { name: /^finish game$/i });
    await expect(finish).toBeVisible({ timeout: 30_000 });
    // Let the review settle (its score log loaded, nothing saving), then
    // the next save is lost.
    await page.waitForLoadState("networkidle");
    let dropped = 0;
    await page.route(`**/games/${game.id}/live`, async (route) => {
      if (route.request().method() === "POST" && dropped === 0) {
        dropped++;
        await route.abort("internetdisconnected");
        return;
      }
      await route.continue();
    });

    // The coach scrolled down to the button.
    await finish.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await finish.click();

    // Before the fix: the error boundary ("Something went wrong").
    await expect(page.getByText("Couldn't save — try again.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(finish).toBeVisible();
    expect(dropped).toBe(1);
    expect(await finalisedCount(admin, game.id)).toBe(0);

    // Try again: it finishes, once, and the summary opens at the top.
    const scrolledTo = await page.evaluate(() => window.scrollY);
    await finish.click();
    const copy = page.getByRole("button", { name: /copy for group chat/i }).first();
    await expect(copy).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => finalisedCount(admin, game.id), { timeout: 15_000 }).toBe(1);
    const { data: row } = await admin.from("games").select("status").eq("id", game.id).single();
    expect(row?.status).toBe("completed");
    // The review had the page scrolled; the summary starts at the top.
    expect(scrolledTo).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeLessThan(10);
    await expect(copy).toBeInViewport();
  });
}
