// One pair of the planned sub made early is one of the batch, not the
// whole rotation (Stagehand, 9 Nov 2026). Made a minute before the sub
// from the pairs sheet, it used to restart the sub clock from then: the
// other pairs slid a whole interval later (or past the siren and away).
// AFL and the soccer family were fixed first (live-kid-words,
// soccer-full-game-playthrough); this is basketball, touch and league.
//
// Each game: subs every 5 minutes, 4 minutes into the first period on a
// real-time clock, so the sub is a minute away. Make one pair: the swap
// says how many are left (batch_left), the info line still counts down
// under a minute, one swap fewer.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const k of ["league-walkthrough-seen", "rl-walkthrough-seen", "basketball-walkthrough-seen", "touch-walkthrough-seen"]) {
        localStorage.setItem(k, "1");
      }
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
});

type Case = {
  sport: "basketball" | "touch" | "rugby_league";
  ageGroup: string;
  count: number;
  lineup: (ids: string[]) => Record<string, unknown>;
  onField?: number;
};

const CASES: Case[] = [
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
  test(`${c.sport}: one planned pair made early leaves the rest planned, on time`, async ({ page }) => {
    test.setTimeout(90_000);
    const admin = createAdminClient();
    const { data: su } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
    const suffix = `${Date.now() % 100000}-${Math.random().toString(36).slice(2, 6)}`;
    const team = await makeTeam(admin, { ownerId, sport: c.sport, ageGroup: c.ageGroup, name: `EARLY-PAIR ${c.sport} ${suffix}` });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: c.count });
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
    const { error: evErr } = await admin.from("game_events").insert(
      [
        { type: "lineup_set", metadata: { lineup: c.lineup(ids), sport: c.sport }, created_at: t(241) },
        { type: "quarter_start", metadata: { quarter: 1, sport: c.sport }, created_at: t(240) },
      ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
    );
    if (evErr) throw new Error(evErr.message);
    const swaps = async () =>
      ((await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap").order("created_at"))
        .data ?? []) as { metadata: { batch_left?: number } }[];

    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    const info = page.getByTestId("info-line");
    await expect(info).toContainText(/next sub 0:\d\d · \d swaps/i, { timeout: 20_000 });
    const planned = Number((await info.innerText()).match(/(\d) swaps/i)![1]);
    expect(planned).toBeGreaterThan(1);

    await info.click();
    await page.getByRole("dialog").getByRole("button", { name: /^swap .+ off, .+ on$/i }).first().click();
    await expect.poll(async () => (await swaps()).length).toBe(1);
    expect((await swaps())[0].metadata.batch_left).toBe(planned - 1);
    // The rest are still planned, under a minute away: not an interval later.
    await page.keyboard.press("Escape");
    await expect(info).toContainText(new RegExp(`next sub 0:\\d\\d · ${planned - 1} swap`, "i"), { timeout: 15_000 });
    await expect(info).not.toContainText(/no more subs/i);
  });
}
