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
//   - Live, "Make all swaps" put a late arrival at loosehead and a
//     winger at hooker. Pairs now go by position, never an unpicked kid
//     into the front row, and each is labelled by its spot ("LW11 Kai →
//     Leo"). A coach's own swap that does it gets a warning.

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
async function unionNamedSide(
  admin: SupabaseClient,
  name: string,
  opts: {
    ended: boolean;
    extraPrefs?: (ids: string[]) => { player_id: string; position_key: string; kind: string; rank: number }[];
    /** H1's slots, when not each kid's home position. */
    slots?: (ids: string[]) => Record<string, string>;
  },
) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_union", ageGroup: "U12", name: `${name} ${Date.now()}` });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "named-positions", season_balance: "balanced" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 17 });
  const ids = players.map((p) => p.id);
  const { error: prefErr } = await admin.from("player_position_prefs").insert(
    ids.slice(0, 15).map((pid, i) => ({ team_id: team.id, player_id: pid, position_key: `ru-${i + 1}`, kind: "home", rank: 0 })),
  );
  if (prefErr) throw new Error(prefErr.message);
  const extra = opts.extraPrefs?.(ids) ?? [];
  if (extra.length > 0) {
    const { error: xErr } = await admin.from("player_position_prefs").insert(extra.map((p) => ({ ...p, team_id: team.id })));
    if (xErr) throw new Error(xErr.message);
  }
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const { error } = await admin.from("games").update({ sub_interval_seconds: 900, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const slots = opts.slots?.(ids) ?? Object.fromEntries(ids.slice(0, 15).map((id, i) => [id, `ru-${i + 1}`]));
  const lineup = { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: ids.slice(15), slots };
  const events = [
    { type: "lineup_set", metadata: { lineup, sport: "rugby_union" }, created_at: at(1600) },
    // At half time the half is over; in H1, twenty minutes in.
    { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_union" }, created_at: at(opts.ended ? 1599 : 1200) },
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
  const { team, game, ids } = await unionNamedSide(admin, "RU-FRONTROW-SWAP", { ended: true });

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  // The coach swaps the loosehead with the scrum-half: a back in the pack
  // can only be dealt the spot the loosehead left.
  await pickBreakStrategy(page, "Repeat");
  await page.getByTestId(`player-tile-${ids[0]}`).click();
  await page.getByTestId(`player-tile-${ids[8]}`).click();
  await expect(page.getByText(/is at LHP1 but isn't picked to play there/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("break-broken-rule").filter({ hasText: /Rule: Front-row spots go to kids picked for them/ }).first()).toBeVisible();
});

// Round 2 usability, 24 Oct 2026 (union P2): Rotate sent the whole front
// row to the wings and dealt LHP1 to an unpicked late arrival; Repeat
// reshuffled named positions and tagged everyone "Stays".

test("union half time: Rotate swaps the lines but keeps the picked front row in the pack", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game, ids } = await unionNamedSide(admin, "RU-FRONTROW-ROTATE", { ended: true });

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  await pickBreakStrategy(page, "Rotate");
  const forwards = page.getByRole("group", { name: "Forwards", exact: true });
  const frontRow = ["LHP1", "HK2", "THP3"];
  for (let i = 0; i < 3; i++) {
    await expect(forwards.getByTestId(`player-tile-${ids[i]}`), frontRow[i]).toContainText(frontRow[i]);
  }
  // The rest of the H1 pack went out to the backs.
  for (const pid of ids.slice(3, 8)) await expect(forwards.getByTestId(`player-tile-${pid}`)).toHaveCount(0);
  await expect(page.getByText(/isn't picked to play there/)).toHaveCount(0);
  await expect(page.getByTestId("break-broken-rule")).toHaveCount(0);
});

test("union half time: Repeat keeps each kid in their own position", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  // In H1 kid 3 (home 2R4) played 2R5 and kid 4 (home 2R5) played 2R4.
  const { team, game, ids } = await unionNamedSide(admin, "RU-REPEAT-SLOTS", {
    ended: true,
    slots: (k) => ({ ...Object.fromEntries(k.slice(0, 15).map((id, i) => [id, `ru-${i + 1}`])), [k[3]]: "ru-5", [k[4]]: "ru-4" }),
  });

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  const tile = (pid: string) => page.getByTestId(`player-tile-${pid}`);
  await pickBreakStrategy(page, "Repeat");
  await expect(tile(ids[3])).toContainText("2R5");
  await expect(tile(ids[3])).toContainText("Stays");
  await expect(tile(ids[4])).toContainText("2R4");
  await expect(tile(ids[4])).toContainText("Stays");
  // Suggested deals home positions: the move within the pack says where from.
  await pickBreakStrategy(page, "Suggested");
  await expect(tile(ids[3])).toContainText("2R4");
  await expect(tile(ids[3])).toContainText("From 2R5");

  // Repeat's Start records H1's slots.
  await pickBreakStrategy(page, "Repeat");
  await startFromBreak(page, /^start 2nd half/i);
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("metadata, created_at").eq("game_id", game.id).eq("type", "lineup_set").order("created_at");
      const slots = ((data ?? []).at(-1)?.metadata as { lineup?: { slots?: Record<string, string> } } | undefined)?.lineup?.slots ?? {};
      return [slots[ids[3]], slots[ids[4]]];
    }, { timeout: 15_000 })
    .toEqual(["ru-5", "ru-4"]);
});

test("union live subs: pairs go by position, never an unpicked kid into the front row", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  // Kid 16 (the audit's Leo) plays left wing; kid 15 arrived with no role.
  const { team, game, players, ids } = await unionNamedSide(admin, "RU-FRONTROW-LIVE", {
    ended: false,
    extraPrefs: (all) => [{ player_id: all[16], position_key: "ru-11", kind: "home", rank: 0 }],
  });
  const first = (pid: string) => players.find((p) => p.id === pid)!.full_name.split(" ")[0];

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  // The sub card's pairs (open when the sub is due, else tap it open).
  const pairs = page.locator("[data-testid^='league-swap-pair-']");
  const header = page.locator("button[aria-expanded='false']").filter({ hasText: "→" });
  await expect(pairs.first().or(header)).toBeVisible({ timeout: 15_000 });
  if (await header.isVisible()) await header.click();
  await expect(pairs).toHaveCount(2);
  // Leo takes the left wing's spot, and the pair says so.
  const leo = pairs.filter({ hasText: new RegExp(`→[A-Z]{0,3}${first(ids[16])}`) });
  await expect(leo).toContainText(new RegExp(`^LW11[A-Z]{0,3}${first(ids[10])}`));
  // Nobody in the front row comes off for either of them.
  for (const label of ["LHP1", "HK2", "THP3"]) await expect(pairs.filter({ hasText: new RegExp(`^${label}`) })).toHaveCount(0);

  await page.getByRole("button", { name: /make all 2 swaps/i }).click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap");
      return (data ?? []).length;
    }, { timeout: 15_000 })
    .toBe(2);
  await expect(page.getByTestId(`league-player-tile-${ids[16]}`).getByText("LW11", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("front-row-warning")).toHaveCount(0);
});

test("union live: a coach's swap that puts an unpicked kid at hooker gets a warning", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game, players, ids } = await unionNamedSide(admin, "RU-FRONTROW-WARN", { ended: false });
  const nameOf = (pid: string) => players.find((p) => p.id === pid)!.full_name;

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const tile = (pid: string) => page.getByTestId(`league-player-tile-${pid}`);
  await expect(tile(ids[1]).getByText("HK2", { exact: true })).toBeVisible({ timeout: 15_000 });
  // The hooker off, kid 15 (no role) on in their spot (AFL's confirm first).
  await tile(ids[1]).click();
  await tile(ids[15]).click();
  await page.getByRole("dialog", { name: /manually sub/i }).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("front-row-warning")).toContainText(`${nameOf(ids[15])} is at HK2 but isn't picked to play there`, {
    timeout: 15_000,
  });
});
