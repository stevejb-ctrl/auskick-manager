// One pair of a planned sub can be undone (Stagehand round 10, 10 Nov
// 2026: the undo-chain, nervous-volunteer and basketball sideline runs).
// "Make swap 1" from the pairs sheet made the swap, but the one Undo
// still named the last score: the pair couldn't be taken back. Now the
// strip names the pair ("Undo: Ava on for Leo"), and Undo puts the kids
// back and the pair back in the plan: the sub is still due on time, with
// the whole batch to make.
//
// Each game: subs every 5 minutes, 4 minutes into the first period on a
// real-time clock, so the sub is a minute away.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const k of [
        "gm-walkthrough-seen",
        "soccer-walkthrough-seen",
        "league-walkthrough-seen",
        "rl-walkthrough-seen",
        "basketball-walkthrough-seen",
        "touch-walkthrough-seen",
      ]) {
        localStorage.setItem(k, "1");
      }
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
});

type Case = {
  sport: "afl" | "soccer" | "basketball" | "touch" | "rugby_league";
  ageGroup: string;
  count: number;
  lineup: (ids: string[]) => Record<string, unknown>;
  onField?: number;
};

const CASES: Case[] = [
  {
    sport: "afl",
    ageGroup: "U10",
    count: 15,
    lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }),
  },
  {
    sport: "soccer",
    ageGroup: "U9",
    count: 10,
    lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 3), mid: ids.slice(3, 6), att: ids.slice(6, 7), field: [] }, bench: ids.slice(7) }),
  },
  {
    sport: "basketball",
    ageGroup: "U12",
    count: 9,
    lineup: (ids) => ({ lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) }),
  },
  {
    sport: "touch",
    ageGroup: "U12",
    count: 10,
    lineup: (ids) => ({ lines: { middle: ids.slice(0, 2), link: ids.slice(2, 4), wing: ids.slice(4, 6), field: [] }, bench: ids.slice(6) }),
  },
  {
    sport: "rugby_league",
    ageGroup: "U10",
    count: 15,
    onField: 11,
    lineup: (ids) => ({ forwards: ids.slice(0, 5), backs: ids.slice(5, 11), bench: ids.slice(11) }),
  },
];

for (const c of CASES) {
  test(`${c.sport}: one pair of the planned sub can be undone, and the pair is planned again`, async ({ page }) => {
    test.setTimeout(90_000);
    const admin = createAdminClient();
    const { data: su } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
    const suffix = `${Date.now() % 100000}-${Math.random().toString(36).slice(2, 6)}`;
    const team = await makeTeam(admin, { ownerId, sport: c.sport, ageGroup: c.ageGroup, name: `PAIR-UNDO ${c.sport} ${suffix}` });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: c.count });
    const names = new Map(players.map((p) => [p.id, p.full_name as string]));
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    const { error } = await admin
      .from("games")
      .update({
        sub_interval_seconds: 300,
        clock_multiplier: 1,
        status: "in_progress",
        ...(c.onField ? { on_field_size: c.onField } : {}),
      })
      .eq("id", game.id);
    if (error) throw new Error(error.message);
    await admin.from("game_availability").insert(
      players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
    );
    const ids = players.map((p) => p.id);
    const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
    const sportMeta = c.sport === "afl" ? {} : { sport: c.sport };
    const { error: evErr } = await admin.from("game_events").insert(
      [
        { type: "lineup_set", metadata: { lineup: c.lineup(ids), ...sportMeta }, created_at: t(241) },
        { type: "quarter_start", metadata: { quarter: 1, ...sportMeta }, created_at: t(240) },
      ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
    );
    if (evErr) throw new Error(evErr.message);
    type Swap = { metadata: { batch_left?: number; manual?: boolean; off_player_id?: string; on_player_id?: string } };
    const swaps = async () =>
      ((await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap").order("created_at"))
        .data ?? []) as Swap[];

    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    const info = page.getByTestId("info-line");
    await expect(info).toContainText(/next sub 0:\d\d · \d swaps/i, { timeout: 20_000 });
    const planned = Number((await info.innerText()).match(/(\d) swaps/i)![1]);
    expect(planned).toBeGreaterThan(1);

    // One pair, from the pairs sheet.
    await info.click();
    await page.getByRole("dialog").getByRole("button", { name: /^swap .+ off, .+ on$/i }).first().click();
    await expect.poll(async () => (await swaps()).length).toBe(1);
    const made = (await swaps())[0].metadata;
    const offName = names.get(made.off_player_id!)!;
    const onName = names.get(made.on_player_id!)!;
    await page.keyboard.press("Escape");
    await expect(info).toContainText(new RegExp(`${planned - 1} swap`, "i"), { timeout: 15_000 });

    // The one Undo names the pair, and takes it back.
    const strip = page.getByTestId("undo-strip");
    await expect(strip).toContainText(`Undo: ${onName} on for ${offName}`, { timeout: 10_000 });
    await strip.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await swaps()).length).toBe(2);
    const back = (await swaps())[1].metadata;
    expect(back.off_player_id).toBe(made.on_player_id);
    expect(back.on_player_id).toBe(made.off_player_id);
    // The whole batch is open again: the clock didn't restart.
    expect(back.batch_left).toBe(planned);

    // The pair is planned again, on time, with the rest.
    await expect(info).toContainText(new RegExp(`next sub 0:\\d\\d · ${planned} swaps`, "i"), { timeout: 15_000 });
    await expect(info).not.toContainText(/no more subs/i);
  });
}
