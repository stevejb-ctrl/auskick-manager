// ─── Rugby league: the break's Suggested keeps its own Musts ─
// Round 2 usability, 24 Oct 2026 (league P1, v1 and hp). Suggested was
// the planner's cold projection, blind to the game's events:
//
//   - U10 half time: eleven kids still owed their unbroken half after
//     live subs in H1. Suggested benched two of them and kept on two
//     who'd had theirs; the check said "can't reach 50%" and "can't get
//     1 unbroken half", and Start read "2 rules".
//   - U9: Tyler sat out Q1 and played Q2. Suggested benched him at Q3
//     with no warning and again at Q4; the parent runner was asked to
//     "Start anyway".
//   - The Q2 vest plan had Charlie in DH; Suggested benched him.
//
// Now Suggested starts the kids a Must needs, keeps the planned vests
// on, and Start goes straight through. A bench move that leaves a kid
// needing every period left is a warning.

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
const MIN = 60_000;

/** A league side at a break: its events written `ago` seconds back, a second apart. */
async function leagueAtBreak(
  admin: SupabaseClient,
  opts: { name: string; ageGroup: "U9" | "U10"; count: number; events: (ids: string[]) => { type: string; player_id?: string; metadata: Record<string, unknown> }[] },
) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league", ageGroup: opts.ageGroup, name: `${opts.name} ${Date.now()}` });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "both-lines", season_balance: "off" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count, ageGroup: opts.ageGroup });
  const ids = players.map((p) => p.id);
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const { error } = await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const rows = opts.events(ids);
  const { error: evErr } = await admin.from("game_events").insert(
    rows.map((e, i) => ({
      type: e.type,
      player_id: e.player_id ?? null,
      metadata: { ...e.metadata, sport: "rugby_league" },
      game_id: game.id,
      created_by: ownerId,
      created_at: at(rows.length + 30 - i),
    })),
  );
  if (evErr) throw new Error(evErr.message);
  return { team, game, players, ids, nameOf: (pid: string) => players.find((p) => p.id === pid)!.full_name };
}

const vest = (pid: string, v: "fr" | "dh", period: number) => ({
  type: "vest_assigned",
  player_id: pid,
  metadata: { vest: v, period, replacement: false },
});

const group = (page: Page, name: "Forwards" | "Backs" | "Bench") => page.getByRole("group", { name, exact: true });

/** Start goes straight through: no broken rule, and the confirm is "Start … now", not "Start anyway". */
async function expectCleanStart(page: Page, periodName: RegExp, nowName: RegExp) {
  await expect(page.getByTestId("break-broken-rule")).toHaveCount(0);
  await page.getByRole("button", { name: periodName }).click();
  await expect(page.getByRole("button", { name: nowName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start anyway" })).toHaveCount(0);
}

test("league U10 half time: Suggested starts the eleven who owe their unbroken half", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  // 13 kids, 11 on. The two bench kids rolled through H1, so only kids 0
  // and 1 (the audit's Isla and Jayden) played it unbroken.
  const { team, game, ids } = await leagueAtBreak(admin, {
    name: "RL-BREAK-U10",
    ageGroup: "U10",
    count: 13,
    events: (k) => {
      const swap = (min: number, off: string, on: string) => ({
        type: "swap",
        metadata: { quarter: 1, elapsed_ms: min * MIN, off_player_id: off, on_player_id: on },
      });
      return [
        { type: "lineup_set", metadata: { lineup: { forwards: k.slice(0, 5), backs: k.slice(5, 11), bench: k.slice(11) } } },
        vest(k[2], "fr", 1),
        vest(k[5], "dh", 1),
        { type: "quarter_start", metadata: { quarter: 1 } },
        swap(2, k[2], k[11]),
        swap(4, k[3], k[12]),
        swap(6, k[4], k[2]),
        swap(8, k[5], k[3]),
        swap(10, k[6], k[4]),
        swap(12, k[7], k[5]),
        swap(14, k[8], k[6]),
        swap(16, k[9], k[7]),
        swap(18, k[10], k[8]),
        { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 20 * MIN } },
      ];
    },
  });

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  // Suggested (the default): the two who've had their unbroken half sit.
  const bench = group(page, "Bench").locator("[data-testid^='player-tile-']");
  await expect(bench).toHaveCount(2);
  await expect(group(page, "Bench").getByTestId(`player-tile-${ids[0]}`)).toBeVisible();
  await expect(group(page, "Bench").getByTestId(`player-tile-${ids[1]}`)).toBeVisible();
  await expectCleanStart(page, /^start 2nd half/i, /^start 2nd half now$/i);
});

test("league U9 Q3 break: Tyler, on one quarter, starts; benching him warns he must play all of Q4", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  // 10 kids, 8 on, 4 × 8 min. Kids 8 and 9 (Tyler, Noah) sat Q1 and
  // played Q2; kids 6 and 7 sat Q2.
  const { team, game, ids, nameOf } = await leagueAtBreak(admin, {
    name: "RL-BREAK-U9",
    ageGroup: "U9",
    count: 10,
    events: (k) => [
      { type: "lineup_set", metadata: { lineup: { forwards: k.slice(0, 4), backs: k.slice(4, 8), bench: [k[8], k[9]] } } },
      vest(k[0], "fr", 1),
      vest(k[1], "dh", 1),
      { type: "quarter_start", metadata: { quarter: 1 } },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 8 * MIN } },
      { type: "lineup_set", metadata: { lineup: { forwards: k.slice(0, 4), backs: [k[4], k[5], k[8], k[9]], bench: [k[6], k[7]] } } },
      vest(k[2], "fr", 2),
      vest(k[3], "dh", 2),
      { type: "quarter_start", metadata: { quarter: 2 } },
      { type: "quarter_end", metadata: { quarter: 2, elapsed_ms: 8 * MIN } },
    ],
  });
  const tyler = ids[8];

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^Q3 lineup$/i })).toBeVisible({ timeout: 15_000 });
  // Everyone who still needs a quarter is on.
  for (const pid of [ids[6], ids[7], ids[8], ids[9]]) {
    await expect(group(page, "Bench").getByTestId(`player-tile-${pid}`), nameOf(pid)).toHaveCount(0);
  }
  await expect(page.getByTestId("break-broken-rule")).toHaveCount(0);
  await expect(page.getByText(/must play all of the last/)).toHaveCount(0);

  // The coach sits Tyler for a kid who's had both quarters: legal, but a warning.
  const benchKid = await group(page, "Bench").locator("[data-testid^='player-tile-']").first().getAttribute("data-testid");
  await page.getByTestId(`player-tile-${tyler}`).click();
  await page.getByTestId(benchKid!).click();
  await expect(group(page, "Bench").getByTestId(`player-tile-${tyler}`)).toBeVisible();
  const issues = page.getByTestId("break-issues");
  await expect(page.getByTestId("break-broken-rule")).toHaveCount(0);
  await issues.getByRole("button", { name: /warnings?/i }).click();
  await expect(issues).toContainText(`${nameOf(tyler)} must play all of the last quarter`);
});

test("league U9 Q1 break: the kid planned for the DH vest starts Q2", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  // Eight played Q1, kids 8 and 9 sat it out. On time alone two of the
  // eight sit Q2; the plan has kid 7 (the audit's Charlie) in DH.
  const { team, game, ids, nameOf } = await leagueAtBreak(admin, {
    name: "RL-BREAK-VEST",
    ageGroup: "U9",
    count: 10,
    events: (k) => [
      { type: "lineup_set", metadata: { lineup: { forwards: k.slice(0, 4), backs: k.slice(4, 8), bench: [k[8], k[9]] } } },
      vest(k[0], "fr", 1),
      vest(k[1], "dh", 1),
      vest(k[8], "fr", 2),
      vest(k[7], "dh", 2),
      { type: "quarter_start", metadata: { quarter: 1 } },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 8 * MIN } },
    ],
  });
  const first = (pid: string) => nameOf(pid).split(" ")[0];

  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^Q2 lineup$/i })).toBeVisible({ timeout: 15_000 });
  await expect(group(page, "Bench").getByTestId(`player-tile-${ids[7]}`)).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Vests: FR ${first(ids[8])} · DH ${first(ids[7])}` })).toBeVisible();
  await expectCleanStart(page, /^start q2/i, /^start q2 now$/i);
});
