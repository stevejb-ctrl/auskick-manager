// ─── Rugby league: round 3 edge cases ────────────────────────
// Round 3 edge cases, 24 Oct 2026 (league P2s):
//
//   - The FR wearer was hurt with nobody on the bench: they stayed drawn
//     in the vest and the replace-vest sheet never came up.
//   - A kid brought back from loan at the break stayed on the bench; the
//     check said they "can't reach 50%" and "can't get 1 unbroken half",
//     and Fix fixed both. Suggested now plans them in.
//   - With one kid in, Start H1 was greyed out and nothing said why.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { openGameSettings, closeGameSettings } from "../helpers/break";

test.describe.configure({ mode: "parallel" });

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function skipWalkthroughs(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen", "gm-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

const MIN = 60_000;

/** A league game with these events, written a second apart ending `endAgo` seconds back. */
async function leagueGame(
  admin: SupabaseClient,
  opts: {
    name: string;
    ageGroup: "U9" | "U10";
    count: number;
    available?: number;
    status?: "upcoming" | "in_progress";
    endAgo?: number;
    events?: (ids: string[]) => { type: string; player_id?: string; metadata: Record<string, unknown> }[];
  },
) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league", ageGroup: opts.ageGroup, name: `${opts.name} ${Date.now()}` });
  await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "both-lines", season_balance: "off" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count, ageGroup: opts.ageGroup });
  const ids = players.map((p) => p.id);
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  if (opts.status === "in_progress") {
    const { error } = await admin.from("games").update({ status: "in_progress", sub_interval_seconds: 900 }).eq("id", game.id);
    if (error) throw new Error(error.message);
  }
  await admin.from("game_availability").upsert(
    players.map((p, i) => ({
      game_id: game.id,
      player_id: p.id,
      status: i < (opts.available ?? opts.count) ? ("available" as const) : ("unavailable" as const),
      updated_by: ownerId,
    })),
    { onConflict: "game_id,player_id" },
  );
  const rows = opts.events?.(ids) ?? [];
  if (rows.length > 0) {
    const { error: evErr } = await admin.from("game_events").insert(
      rows.map((e, i) => ({
        type: e.type,
        player_id: e.player_id ?? null,
        metadata: { ...e.metadata, sport: "rugby_league" },
        game_id: game.id,
        created_by: ownerId,
        created_at: new Date(Date.now() - ((opts.endAgo ?? 30) + rows.length - i) * 1000).toISOString(),
      })),
    );
    if (evErr) throw new Error(evErr.message);
  }
  return { team, game, players, ids, nameOf: (pid: string) => players.find((p) => p.id === pid)!.full_name };
}

const vest = (pid: string, v: "fr" | "dh", period: number) => ({
  type: "vest_assigned",
  player_id: pid,
  metadata: { vest: v, period, replacement: false },
});

test("league H2: the FR wearer hurt with nobody on the bench prompts for the vest", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  // U10, 11 on and nobody on the bench; kid 2 wears FR in H2 and is hurt
  // three minutes in, with no replacement.
  const { team, game, ids, nameOf } = await leagueGame(admin, {
    name: "RL-VEST-HURT",
    ageGroup: "U10",
    count: 11,
    status: "in_progress",
    endAgo: 120,
    events: (k) => [
      { type: "lineup_set", metadata: { lineup: { forwards: k.slice(0, 5), backs: k.slice(5, 11), bench: [] } } },
      vest(k[0], "fr", 1),
      vest(k[1], "dh", 1),
      vest(k[2], "fr", 2),
      vest(k[3], "dh", 2),
      { type: "quarter_start", metadata: { quarter: 1 } },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 20 * MIN } },
      { type: "quarter_start", metadata: { quarter: 2 } },
      { type: "injury", player_id: k[2], metadata: { quarter: 2, elapsed_ms: 3 * MIN, injured: true } },
    ],
  });
  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const sheet = page.getByRole("dialog", { name: /replace vest wearer/i });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet).toContainText(`${nameOf(ids[2])} is injured`);
  await expect(sheet).toContainText("Who takes the FR vest?");
});

test("league half time: a kid brought back from loan is planned into H2", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  // U10, 12 kids, 11 on. Kid 10 (the audit's Sienna) played 4:36 of H1,
  // then went on loan; kid 11 took her place.
  const { team, game, ids, nameOf } = await leagueGame(admin, {
    name: "RL-LOAN-BACK",
    ageGroup: "U10",
    count: 12,
    status: "in_progress",
    events: (k) => [
      { type: "lineup_set", metadata: { lineup: { forwards: k.slice(0, 5), backs: k.slice(5, 11), bench: [k[11]] } } },
      vest(k[0], "fr", 1),
      vest(k[1], "dh", 1),
      { type: "quarter_start", metadata: { quarter: 1 } },
      { type: "swap", metadata: { quarter: 1, elapsed_ms: 276_000, off_player_id: k[10], on_player_id: k[11] } },
      { type: "player_loan", player_id: k[10], metadata: { quarter: 1, elapsed_ms: 276_000, loaned: true } },
      { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 20 * MIN } },
    ],
  });
  const sienna = ids[10];
  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  await openGameSettings(page);
  await page.getByRole("button", { name: `Bring ${nameOf(sienna)} back` }).click();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "player_loan");
      return (data ?? []).some((e) => (e.metadata as { loaned?: boolean }).loaned === false);
    }, { timeout: 15_000 })
    .toBe(true);
  await closeGameSettings(page);
  // Suggested plans her in: she must play H2 for her floor and her unbroken half.
  await expect(page.getByRole("group", { name: "Bench", exact: true }).getByTestId(`player-tile-${sienna}`)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByRole("group", { name: "Forwards", exact: true }).getByTestId(`player-tile-${sienna}`).or(
    page.getByRole("group", { name: "Backs", exact: true }).getByTestId(`player-tile-${sienna}`),
  )).toBeVisible();
  await expect(page.getByTestId("break-broken-rule")).toHaveCount(0);
});

test("league U9 lineup with one kid in: Start H1 says the vests need two", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game } = await leagueGame(admin, { name: "RL-ONE-KID", ageGroup: "U9", count: 10, available: 1 });
  await skipWalkthroughs(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const start = page.getByRole("button", { name: /^start q1$/i });
  await expect(start).toBeVisible({ timeout: 15_000 });
  await expect(start).toBeDisabled();
  await expect(page.getByText("Need 2 on the field for the FR and DH vests")).toBeVisible();
});
