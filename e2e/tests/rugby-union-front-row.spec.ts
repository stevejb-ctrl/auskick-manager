// ─── Rugby union: the front row and named positions ─────────
// UX audit, 23 Oct 2026 (union P1s), on a U12 side with named
// positions and season balance on (the defaults):
//
//   - Half time's "Suggested" moved eight of fifteen kids across lines
//     and dealt the front row to whoever was left (fullback at hooker,
//     lock at tighthead), and the break showed only Forwards / Backs.
//     Now the lines follow the kids' roles, the front row (LHP1, HK2,
//     THP3) goes to kids picked for it, and each tile shows its
//     position. A lineup that puts an unpicked kid there is a broken
//     rule with a Fix.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { pickBreakStrategy, startFromBreak } from "../helpers/break";

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
 * A U12 union side with named positions and Balanced season balance.
 * Kid i (0–14) has home position i + 1; kids 15 and 16 have none. The
 * game is in H1 (or at half time, with `ended`), kid i at position i + 1.
 */
async function unionNamedSide(admin: SupabaseClient, name: string, opts: { ended: boolean }) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_union", ageGroup: "U12", name: `${name} ${Date.now()}` });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "named-positions", season_balance: "balanced" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 17 });
  const ids = players.map((p) => p.id);
  const { error: prefErr } = await admin.from("player_position_prefs").insert(
    ids.slice(0, 15).map((pid, i) => ({ team_id: team.id, player_id: pid, position_key: `ru-${i + 1}`, kind: "home", rank: 0 })),
  );
  if (prefErr) throw new Error(prefErr.message);
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const { error } = await admin.from("games").update({ sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const slots = Object.fromEntries(ids.slice(0, 15).map((id, i) => [id, `ru-${i + 1}`]));
  const lineup = { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: ids.slice(15), slots };
  const events = [
    { type: "lineup_set", metadata: { lineup, sport: "rugby_union" }, created_at: at(1600) },
    { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_union" }, created_at: at(1599) },
    ...(opts.ended ? [{ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 25 * 60_000, sport: "rugby_union" }, created_at: at(10) }] : []),
  ];
  const { error: evErr } = await admin.from("game_events").insert(events.map((e) => ({ ...e, game_id: game.id, created_by: ownerId })));
  if (evErr) throw new Error(evErr.message);
  return { team, game, players, ids, ownerId };
}

test("union half time: Suggested keeps the lines and the picked front row, each tile shows its position", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game, ids } = await unionNamedSide(admin, "RU-FRONTROW-BREAK", { ended: true });

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });

  const section = (name: "Forwards" | "Backs" | "Bench") => page.getByRole("group", { name, exact: true });
  const tile = (pid: string) => page.getByTestId(`player-tile-${pid}`);
  // Every kid on is in their home position's line.
  for (let i = 0; i < 15; i++) {
    const pid = ids[i];
    const inBench = await section("Bench").getByTestId(`player-tile-${pid}`).count();
    if (inBench) continue;
    await expect(section(i < 8 ? "Forwards" : "Backs").getByTestId(`player-tile-${pid}`), `kid ${i}`).toHaveCount(1);
  }
  // The picked front row is on, each in their own spot, labelled.
  const frontRow = ["LHP1", "HK2", "THP3"];
  for (let i = 0; i < 3; i++) {
    await expect(section("Forwards").getByTestId(`player-tile-${ids[i]}`)).toContainText(frontRow[i]);
  }
  // No other kid wears a front-row label.
  for (const pid of ids.slice(3)) {
    await expect(tile(pid)).not.toContainText(/^(LHP1|HK2|THP3)/);
  }

  // Start H2: the recorded slots give the front row to the picked kids.
  await startFromBreak(page, /^start 2nd half/i);
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("metadata, created_at").eq("game_id", game.id).eq("type", "lineup_set").order("created_at");
      const last = (data ?? []).at(-1)?.metadata as { lineup?: { slots?: Record<string, string> } } | undefined;
      const slots = last?.lineup?.slots ?? {};
      return [slots[ids[0]], slots[ids[1]], slots[ids[2]]];
    }, { timeout: 15_000 })
    .toEqual(["ru-1", "ru-2", "ru-3"]);
});

test("union half time: a lineup that puts an unpicked kid in the front row is a broken rule", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game } = await unionNamedSide(admin, "RU-FRONTROW-ROTATE", { ended: true });

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  // Rotate swaps the lines: the backs go up, and the front row with them
  // can only be dealt to kids not picked for it.
  await pickBreakStrategy(page, "Rotate");
  await expect(page.getByText(/is at (LHP1|HK2|THP3) but isn't picked to play there/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("break-broken-rule").filter({ hasText: /Rule: Front-row spots go to kids picked for them/ }).first()).toBeVisible();
});

