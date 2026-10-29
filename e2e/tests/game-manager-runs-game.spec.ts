// A game manager runs the whole game (Stagehand round 9, 29 Oct 2026).
//
// P1: an invited helper with the game-manager role started the game,
// scored, subbed and finished it, and the game read "Upcoming" all
// along. The live writes to the game row (kick-off's status, size,
// interval and How we play; Finish game's "completed") went through the
// manager's own session, and the games update policy was admin-only, so
// each one updated nothing, with no error. Migration 0077 lets a
// manager change the live columns only, and a write that changes nothing
// now says so.

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { coachId, newPerson, signedInPhone } from "../helpers/people";
import { waitForHydration } from "../helpers/navigation";
import { getAgeGroupConfig } from "../../src/lib/sports/registry";
import type { SportId } from "../../src/lib/sports";

test.describe.configure({ mode: "parallel" });

// Quarters or halves by sport and age: the first period's Start either way.
const FIRST = /^start [qh]1$/i;
const CASES: { sport: SportId; ageGroup: string }[] = [
  { sport: "afl", ageGroup: "U10" },
  { sport: "netball", ageGroup: "11u" },
  { sport: "soccer", ageGroup: "U8" },
  { sport: "basketball", ageGroup: "U12" },
  { sport: "rugby_league", ageGroup: "U10" },
  { sport: "touch", ageGroup: "U10" },
];

async function managedGame(c: (typeof CASES)[number]) {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, {
    ownerId,
    sport: c.sport,
    ageGroup: c.ageGroup,
    name: `GM-Run-${c.sport}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const cfg = getAgeGroupConfig(c.sport, c.ageGroup);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: cfg.defaultOnFieldSize + 2, ageGroup: c.ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew Comets" });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const manager = await newPerson(admin, "gm-run", "Gina Manager");
  await admin.from("team_memberships").insert({ team_id: team.id, user_id: manager.id, role: "game_manager" });
  return { admin, ownerId, team, game, manager, periods: cfg.periodCount };
}

const gameRow = async (admin: ReturnType<typeof createAdminClient>, id: string) =>
  (await admin.from("games").select("status, playbook_snapshot").eq("id", id).single()).data!;

for (const c of CASES) {
  test(`${c.sport}: a game manager's kick-off puts the game live and Finish game finishes it`, async ({ browser }) => {
    test.setTimeout(150_000);
    const { admin, ownerId, team, game, manager, periods } = await managedGame(c);
    const { context, page } = await signedInPhone(browser, manager);
    try {
      await page.addInitScript(() => {
        try {
          for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen", "rl-walkthrough-seen"]) {
            localStorage.setItem(k, "1");
          }
        } catch {}
      });
      await page.goto(`/teams/${team.id}/games/${game.id}/live`);
      await waitForHydration(page);
      await page.getByRole("button", { name: FIRST }).click({ timeout: 20_000 });
      await page.getByRole("button", { name: /^start [qh]\d+ now$|^start anyway$/i }).click({ timeout: 10_000 });
      await expect(page.getByRole("button", { name: /^clock — [qh]1, running$/i })).toBeVisible({ timeout: 20_000 });

      // Before the fix: still "upcoming", and no How we play at kick-off.
      await expect.poll(async () => (await gameRow(admin, game.id)).status, { timeout: 15_000 }).toBe("in_progress");
      expect((await gameRow(admin, game.id)).playbook_snapshot).not.toBeNull();

      // The rest of the game is played; the manager finishes it.
      const { data: started } = await admin
        .from("game_events")
        .select("created_at")
        .eq("game_id", game.id)
        .eq("type", "quarter_start")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      const t0 = new Date(started!.created_at as string).getTime();
      const sportTag = c.sport === "afl" || c.sport === "netball" ? {} : { sport: c.sport };
      const rows: { type: string; metadata: Record<string, unknown> }[] = [
        { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 600_000 } },
      ];
      for (let q = 2; q <= periods; q++) {
        rows.push({ type: "quarter_start", metadata: { quarter: q } });
        rows.push({ type: "quarter_end", metadata: { quarter: q, elapsed_ms: 600_000 } });
      }
      const { error } = await admin.from("game_events").insert(
        rows.map((r, i) => ({
          ...r,
          metadata: { ...r.metadata, ...sportTag },
          game_id: game.id,
          created_by: manager.id,
          created_at: new Date(t0 + (i + 1) * 1000).toISOString(),
        })),
      );
      if (error) throw new Error(`seed periods: ${error.message}`);
      await page.reload();
      const finish = page.getByRole("button", { name: /^finish game$/i });
      await finish.click({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: /copy for group chat/i }).first()).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => (await gameRow(admin, game.id)).status, { timeout: 15_000 }).toBe("completed");
      expect(ownerId).not.toBe(manager.id);
    } finally {
      await context.close();
      await deleteTestUser(admin, manager.id);
    }
  });
}

test("a game manager can't change the game's details, and is told so", async () => {
  const { admin, team, game, manager } = await managedGame(CASES[0]);
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.signInWithPassword({ email: manager.email, password: manager.password });

    const { error } = await client.from("games").update({ opponent: "Renamed" }).eq("id", game.id).select("id");
    expect(error?.message).toMatch(/only the team's admin/i);
    const { data: after } = await admin.from("games").select("opponent").eq("id", game.id).single();
    expect(after?.opponent).toBe("Kew Comets");

    // The live columns are theirs.
    const { data: live, error: liveError } = await client
      .from("games")
      .update({ sub_interval_seconds: 240 })
      .eq("id", game.id)
      .select("id");
    expect(liveError).toBeNull();
    expect(live).toHaveLength(1);
    expect(team.id).toBeTruthy();
  } finally {
    await deleteTestUser(admin, manager.id);
  }
});
