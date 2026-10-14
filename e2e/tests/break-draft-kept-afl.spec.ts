// ─── Regression: the staged break lineup survives leaving the live screen (AFL) ───
//
// Stagehand round 5: the lineup a coach stages at a quarter break lived
// only on the break screen. Going to the team page and back ("Back to
// live game"), a reload, or the phone evicting the tab threw the edits
// away and the auto-suggestion came back.
//
// Pre-fix this FAILS: back on the break, the field is the fresh
// suggestion (and the mode is back to Suggested), not the coach's
// "Keep last quarter" + swap.
//
// Covers:
//   - src/components/live/QuarterBreak.tsx (restores the staged draft)
//   - src/lib/live/breakDraft.ts + the live store's `breakDraft` slice

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, replayGame } from "../../src/lib/fairness";
import type { GameEvent } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });


/**
 * The coach's way out and back, all in the app: Exit to the game page,
 * the Today tab (the team page), then "Back to live game".
 */
async function viaTeamPage(page: Page, teamId: string): Promise<void> {
  await page.getByRole("button", { name: "Exit live game" }).click();
  await page
    .getByRole("navigation", { name: "Team sections" })
    .getByRole("link", { name: "Today" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/teams/${teamId}$`), { timeout: 15_000 });
  await page.getByRole("link", { name: /back to live game/i }).click();
}

async function suppressWalkthrough(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
}

async function reachBreak(page: Page): Promise<void> {
  const selectTeamBtn = page.getByRole("button", { name: /select team for q2/i });
  if (await selectTeamBtn.isVisible().catch(() => false)) {
    await selectTeamBtn.click({ timeout: 10_000 });
  }
  await expect(page.getByRole("button", { name: /^start q2$/i })).toBeVisible({ timeout: 15_000 });
}

/** The staged break lineup as the screen draws it: player ids per zone group. */
async function stagedLineup(page: Page): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const group of ["Forward", "Centre", "Back", "Bench"]) {
    const ids = await page
      .getByRole("group", { name: group, exact: true })
      .first()
      .locator('[data-testid^="player-tile-"]')
      .evaluateAll((tiles) =>
        tiles.map((t) => (t.getAttribute("data-testid") ?? "").replace("player-tile-", "")),
      );
    out[group] = [...ids].sort();
  }
  return out;
}

// A full 15-kid squad: 12 on the field, 3 on the bench.
async function seedQ1Break(admin: ReturnType<typeof createAdminClient>, label: string) {
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    name: `AFL-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  const onField = players.slice(0, game.on_field_size);
  const bench = players.slice(game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const lineup = {
    back: onField.slice(0, third).map((p) => p.id),
    hback: [],
    mid: onField.slice(third, third * 2).map((p) => p.id),
    hfwd: [],
    fwd: onField.slice(third * 2).map((p) => p.id),
    bench: bench.map((p) => p.id),
  };
  const aMomentAgo = new Date(Date.now() - 13 * 60_000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: aMomentAgo },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: aMomentAgo },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: 12 * 60_000 },
      created_by: ownerId,
      created_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ]);
  await admin.from("game_availability").upsert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "game_id,player_id" },
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { ownerId, team, game, players, lineup };
}

async function eventsUntilQ2Starts(
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
): Promise<GameEvent[]> {
  let events: GameEvent[] = [];
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("*")
          .eq("game_id", gameId)
          .order("created_at", { ascending: true });
        events = (data ?? []) as GameEvent[];
        return events.some(
          (e) => e.type === "quarter_start" && (e.metadata as { quarter?: number }).quarter === 2,
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return events;
}

async function keepLastQuarter(page: Page): Promise<void> {
  const settings = page.getByRole("button", { name: /game settings/i });
  if ((await settings.getAttribute("aria-expanded")) !== "true") await settings.click();
  await page.getByRole("radio", { name: /keep last quarter/i }).click();
}

test("AFL: a swap staged at the break is still there after the team page and back, and starts Q2", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { team, game, lineup } = await seedQ1Break(admin, "BRK-KEPT");
  const comingOn = lineup.bench[0];
  const goingOff = lineup.fwd[0];

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await reachBreak(page);

  // Keep last quarter's field, then swap a bench kid on for a forward.
  await keepLastQuarter(page);
  await page.getByTestId(`player-tile-${comingOn}`).click();
  await page.getByTestId(`player-tile-${goingOff}`).click();
  const forward = page.getByRole("group", { name: "Forward", exact: true }).first();
  await expect(forward.getByTestId(`player-tile-${comingOn}`)).toBeVisible();
  await expect(forward.getByTestId(`player-tile-${goingOff}`)).toHaveCount(0);
  const staged = await stagedLineup(page);

  // Off to the team page, then back to the live game.
  await viaTeamPage(page, team.id);
  await reachBreak(page);

  // The coach's lineup is still staged, in the mode they picked.
  await expect.poll(() => stagedLineup(page), { timeout: 10_000 }).toEqual(staged);
  const settings = page.getByRole("button", { name: /game settings/i });
  if ((await settings.getAttribute("aria-expanded")) !== "true") await settings.click();
  await expect(page.getByRole("radio", { name: /keep last quarter/i })).toBeChecked();

  // Start Q2: the committed lineup is the staged one.
  await page.getByRole("button", { name: /^start q2$/i }).click();
  await page.getByRole("button", { name: /^start clock$/i }).click();
  const q2 = replayGame(await eventsUntilQ2Starts(admin, game.id)).lineup!;
  expect(q2.fwd).toContain(comingOn);
  expect(q2.bench).toContain(goingOff);
  expect([...q2.mid].sort()).toEqual(staged.Centre);
  expect([...q2.back].sort()).toEqual(staged.Back);
});

// The draft is restored only for the kids who can still play: one hurt
// while the coach was away (another phone, say) comes off the staged
// field rather than starting Q2 on it.
test("AFL: a kid hurt while the coach was away isn't restored onto the staged field", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { ownerId, team, game, lineup } = await seedQ1Break(admin, "BRK-HURT");
  const comingOn = lineup.bench[0];
  const goingOff = lineup.fwd[0];

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await reachBreak(page);
  await keepLastQuarter(page);
  await page.getByTestId(`player-tile-${comingOn}`).click();
  await page.getByTestId(`player-tile-${goingOff}`).click();
  const forward = page.getByRole("group", { name: "Forward", exact: true }).first();
  await expect(forward.getByTestId(`player-tile-${comingOn}`)).toBeVisible();
  const staged = await stagedLineup(page);

  // The kid just brought on is hurt, recorded elsewhere.
  await admin.from("game_events").insert({
    game_id: game.id,
    type: "injury",
    player_id: comingOn,
    metadata: { injured: true, quarter: 2, elapsed_ms: 0 },
    created_by: ownerId,
  });

  // Reload the break.
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await reachBreak(page);

  // The rest of the staged lineup is kept; the hurt kid sits on the bench.
  const bench = page.getByRole("group", { name: "Bench", exact: true }).first();
  await expect(bench.getByTestId(`player-tile-${comingOn}`)).toBeVisible({ timeout: 10_000 });
  await expect(forward.getByTestId(`player-tile-${comingOn}`)).toHaveCount(0);
  const back = await stagedLineup(page);
  expect(back.Centre).toEqual(staged.Centre);
  expect(back.Back).toEqual(staged.Back);
  expect(back.Forward).toEqual(staged.Forward.filter((id) => id !== comingOn));
  expect(back.Forward).not.toContain(goingOff);

  // Nobody hurt starts Q2 on the field.
  await page.getByRole("button", { name: /^start q2$/i }).click();
  await page.getByRole("button", { name: /^start clock$/i }).click();
  const q2 = replayGame(await eventsUntilQ2Starts(admin, game.id)).lineup!;
  expect(ALL_ZONES.flatMap((z) => q2[z])).not.toContain(comingOn);
  expect(q2.bench).toContain(comingOn);
  expect(q2.bench).toContain(goingOff);
});
