// ─── Rugby league: live subs keep §6 and the 50% floor ───────
// UX audit, 23 Oct 2026 (league P1). Tyler sat out H1 and started H2.
// Five minutes in, the sub card said "Tyler → Lachlan" — Lachlan had
// just played the whole first half. Taking Tyler off breaks §6 (one
// unbroken half each) and the 50% floor, both Musts on How we play and
// both only reachable for him this half. The suggester now leaves such
// kids on, and Lachlan (who leans forward) crosses to a back who's been
// on since kickoff instead of pulling a forward five minutes on.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function skipWalkthroughs(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
}

const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();

/**
 * A U10 side five minutes into H2. Two kids (the audit's Tyler and
 * Archie) sat out H1 and start H2 in the forwards; Lachlan played H1
 * and sits; Zara sat H1 and still sits.
 */
async function leagueGameInH2(admin: SupabaseClient, name: string) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league", ageGroup: "U10", name: `${name} ${Date.now()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14, ageGroup: "U10" });
  const p = players.map((x) => x.id);
  const [tyler, archie, zara, lachlan] = [p[11], p[12], p[13], p[1]];
  // Preferred line: Lachlan and Zara lean forward.
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "preferred-line", season_balance: "off" });
  await admin.from("player_position_prefs").insert(
    [lachlan, zara].map((pid) => ({ team_id: team.id, player_id: pid, line: "forwards", kind: "home", rank: 0 })),
  );
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const { error } = await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((x) => ({ game_id: game.id, player_id: x.id, status: "available" as const, updated_by: ownerId })),
  );
  const h1 = { forwards: [p[0], p[1], p[2], p[3], p[4]], backs: p.slice(5, 11), bench: [tyler, archie, zara] };
  const h2 = { forwards: [tyler, archie, p[0], p[2], p[3]], backs: [...p.slice(5, 10), p[4]], bench: [zara, lachlan, p[10]] };
  const HALF = 20 * 60_000;
  const vest = (pid: string, v: "fr" | "dh", period: number, ago: number) => ({
    type: "vest_assigned", player_id: pid, metadata: { vest: v, period, replacement: false, sport: "rugby_league" }, created_at: at(ago),
  });
  const { error: evErr } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup: h1, sport: "rugby_league" }, created_at: at(2000) },
      vest(p[2], "fr", 1, 1999),
      vest(p[3], "dh", 1, 1998),
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" }, created_at: at(1997) },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: HALF, sport: "rugby_league" }, created_at: at(600) },
      { type: "lineup_set", metadata: { lineup: h2, sport: "rugby_league" }, created_at: at(400) },
      vest(p[3], "fr", 2, 399),
      vest(p[2], "dh", 2, 398),
      // 5:46 into H2.
      { type: "quarter_start", metadata: { quarter: 2, sport: "rugby_league" }, created_at: at(346) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (evErr) throw new Error(evErr.message);
  return { team, game, players, tyler, archie, lachlan, h2 };
}

test("league H2: the sub card never takes off a kid who sat out H1", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, players, tyler, archie, lachlan } = await leagueGameInH2(admin, "RL-SUB-LAWS");
  const nameOf = (pid: string) => players.find((x) => x.id === pid)!.full_name;

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);

  // The card's summary: "Off→On · Off→On".
  const summary = page.locator("button[aria-expanded]").filter({ hasText: "→" }).first();
  await expect(summary).toContainText(`→${nameOf(lachlan)}`, { timeout: 15_000 });
  await expect(summary).not.toContainText(`${nameOf(tyler)}→`);
  await expect(summary).not.toContainText(`${nameOf(archie)}→`);

  // Lachlan leans forward, but the forwards free to come off have been on
  // five minutes: he crosses to a back who's played since kickoff.
  await summary.click();
  const lachlanPair = page.locator("[data-testid^='league-swap-pair-']").filter({ hasText: new RegExp(`→[A-Z]{0,3}${nameOf(lachlan)}`) });
  await expect(lachlanPair).toHaveCount(1);
  await expect(lachlanPair).toContainText(/^BACK/);
});
