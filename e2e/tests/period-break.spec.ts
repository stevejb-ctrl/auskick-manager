// ─── The period break: one screen for every sport ───
//
// docs/handoffs/siren-footy-break-redesign-HANDOFF.md (Steve, 22 Oct
// 2026): every sport's quarter or half-time break is the same screen,
// driven by sport config. Header with the period's lineup title, a score
// chip and a status chip, the 4-up strategy picker, an issues card,
// zones from the sport's config (attack first, then middle, defence, a
// keeper, the bench last) as 2-column tiles, and a sticky Start footer.
//
// Covers:
//   - src/components/quarter-break/PeriodBreak.tsx and its parts
//   - each sport's adapter (live/QuarterBreak, netball/NetballQuarterBreak,
//     soccer/SoccerBreak, basketball/BasketballBreak, league/LeagueBreak)
//   - src/lib/sports/break.ts (zones, words, score line)
//   - src/lib/live/break/* (swaps, movement text, the Fix search)

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function quiet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen"]) localStorage.setItem(k, "1");
    } catch {}
  });
}

/**
 * A game at the break after period 1: `lineup` played period 1, which
 * ended a minute ago. Events carry the sport, as each sport writes them.
 */
async function seedBreak(
  admin: Admin,
  ownerId: string,
  gameId: string,
  sport: string,
  lineup: unknown,
  periodMs: number,
  extra: { type: string; player_id?: string; metadata: Record<string, unknown> }[] = [],
) {
  const start = Date.now() - periodMs - 120_000;
  const at = (ms: number) => new Date(start + ms).toISOString();
  const meta = (m: Record<string, unknown>) => ({ ...m, sport });
  await admin.from("game_events").insert([
    { game_id: gameId, type: "lineup_set", metadata: meta({ lineup }), created_by: ownerId, created_at: at(0) },
    { game_id: gameId, type: "quarter_start", metadata: meta({ quarter: 1 }), created_by: ownerId, created_at: at(1000) },
    ...extra.map((e, i) => ({
      game_id: gameId,
      type: e.type,
      player_id: e.player_id ?? null,
      metadata: meta(e.metadata),
      created_by: ownerId,
      created_at: at(60_000 + i * 1000),
    })),
    {
      game_id: gameId,
      type: "quarter_end",
      metadata: meta({ quarter: 1, elapsed_ms: periodMs }),
      created_by: ownerId,
      created_at: at(periodMs + 1000),
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", gameId);
}

async function available(admin: Admin, gameId: string, ownerId: string, ids: string[]) {
  await admin
    .from("game_availability")
    .upsert(ids.map((id) => ({ game_id: gameId, player_id: id, status: "available" as const, updated_by: ownerId })), {
      onConflict: "game_id,player_id",
    });
}

const tile = (page: Page, id: string) => page.getByTestId(`player-tile-${id}`);
const group = (page: Page, name: string) => page.getByRole("group", { name, exact: true });
const strategy = (page: Page, name: string) =>
  page.getByRole("radiogroup", { name: "How the next lineup is built" }).getByRole("radio", { name });

async function openBreak(page: Page, teamId: string, gameId: string, title: RegExp) {
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  const selectTeam = page.getByRole("button", { name: /select team for/i });
  await expect(page.getByRole("heading", { name: title }).or(selectTeam)).toBeVisible({ timeout: 20_000 });
  if (await selectTeam.isVisible()) await selectTeam.click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });
}

test.describe("AFL", () => {
  async function seedAfl(rules: unknown[] = []) {
    const admin = createAdminClient();
    const ownerId = await ownerOf(admin);
    const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `PB-AFL-${Date.now() % 1e6}` });
    await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
    const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Hawks" });
    const ids = players.map((p) => p.id);
    await available(admin, game.id, ownerId, ids);
    if (rules.length) {
      await admin.from("team_playbooks").insert({ team_id: team.id, strategy: "free", season_balance: "off", rules });
    }
    const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
    await seedBreak(admin, ownerId, game.id, "afl", lineup, 12 * 60_000, [
      { type: "goal", player_id: ids[8], metadata: { quarter: 1, elapsed_ms: 60_000 } },
      { type: "goal", player_id: ids[9], metadata: { quarter: 1, elapsed_ms: 120_000 } },
    ]);
    return { admin, ownerId, team, game, players, ids, lineup };
  }

  test("the screen: header, chips, strategies, zones in order, nothing removed comes back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 13
    await quiet(page);
    const { team, game, ids } = await seedAfl();
    await openBreak(page, team.id, game.id, /^Q2 lineup$/);

    await expect(page.getByText("Q1 break · vs Hawks")).toBeVisible();
    await expect(page.getByRole("button", { name: /feedback/i })).toHaveCount(0);
    // Score chip: points, margin, goals.behinds each side.
    const score = page.getByRole("button", { name: /review and update scores/i });
    await expect(score).toContainText("12 – 0");
    await expect(score).toContainText("+12");
    await expect(score).toContainText("2.0 v 0.0");
    await expect(page.getByRole("button", { name: /^game settings: all available$/i })).toBeVisible();
    for (const s of ["Suggested", "Rotate", "Repeat", "Manual"]) await expect(strategy(page, s)).toBeVisible();
    await expect(page.getByText("Tap two players to swap — any position or bench")).toBeVisible();

    // Zones top to bottom: Forward, Centre, Back, then Bench.
    const names = await page.getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names.filter((n) => ["Forward", "Centre", "Back", "Bench"].includes(n ?? ""))).toEqual([
      "Forward",
      "Centre",
      "Back",
      "Bench",
    ]);
    await expect(group(page, "Forward")).toContainText("4 on");

    // On an iPhone 13 the first two zones are on screen without scrolling.
    for (const name of ["Forward", "Centre"]) {
      const box = await group(page, name).boundingBox();
      expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(844 - 90);
    }

    // The scorers carry their score on the tile.
    await expect(tile(page, ids[8]).getByLabel("1 goals, 0 behinds")).toBeVisible();
    // Gone: the legend, the Game settings card, the old movement bars.
    await expect(page.getByRole("group", { name: /^colour key/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review and update scores", exact: true })).toHaveCount(0);
    await expect(page.getByText(/→/)).toHaveCount(0);

    // Labels never wrap at a phone's width: one line each.
    for (const s of ["Suggested", "Rotate", "Repeat", "Manual"]) {
      const box = await strategy(page, s).boundingBox();
      expect(box!.height, s).toBeLessThan(48);
    }
    await page.screenshot({ path: test.info().outputPath("afl-break.png") });
  });

  test("swapping updates movement, counts and the start pill; Fix resolves a broken rule", async ({ page }) => {
    await quiet(page);
    const { team, game, ids } = await seedAfl([
      { id: "r1", kind: "max-bench-in-row", params: { count: 2 }, strength: "must", enabled: true },
    ]);
    await openBreak(page, team.id, game.id, /^Q2 lineup$/);

    // Repeat keeps Q1's lineup: everyone stays, and the three on the
    // bench would sit out twice in a row — a broken rule, inline.
    await strategy(page, "Repeat").click();
    await expect(tile(page, ids[0])).toContainText("Stays");
    const broken = page.getByTestId("break-broken-rule");
    await expect(broken).toHaveCount(1);
    await expect(broken).toContainText("would sit out twice in a row");
    await expect(broken).toContainText("Rule: Nobody sits out two quarters in a row");
    const start = page.getByRole("button", { name: /^start q2/i });
    await expect(start).toContainText("1 rule");

    // Tap a forward, then a bench kid: they trade places.
    await tile(page, ids[8]).click();
    await expect(tile(page, ids[8])).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/^Swap .* with…$/)).toBeVisible();
    await tile(page, ids[12]).click();
    await expect(group(page, "Forward").getByTestId(`player-tile-${ids[12]}`)).toContainText("From bench");
    await expect(group(page, "Bench").getByTestId(`player-tile-${ids[8]}`)).toContainText("From Fwd");
    await expect(group(page, "Forward")).toContainText("4 on");
    await expect(group(page, "Bench")).toContainText("3");

    // Start with a rule still broken asks first; Fix first goes back.
    await start.click();
    await expect(page.getByRole("heading", { name: "Start with 1 rule broken?" })).toBeVisible();
    await page.getByRole("button", { name: "Fix first" }).click();

    // Fix clears it: the rule and the pill go.
    await broken.getByRole("button", { name: "Fix" }).click();
    await expect(broken).toHaveCount(0);
    await expect(start).not.toContainText("rule");

    // Start: the plain siren confirm, then Q2 is under way.
    await start.click();
    await page.getByRole("button", { name: /^start q2 now$/i }).click();
    await expect(page.getByRole("heading", { name: /^Q2 lineup$/ })).toHaveCount(0, { timeout: 20_000 });
  });

  test("injured kids sit faded on the bench, can't be swapped in, and come back from the status sheet", async ({ page }) => {
    await quiet(page);
    const { team, game, ids, players } = await seedAfl();
    await openBreak(page, team.id, game.id, /^Q2 lineup$/);
    await strategy(page, "Repeat").click();

    const settings = page.getByRole("button", { name: /^game settings:/i });
    await settings.click();
    await page.getByRole("button", { name: /^\+?\s*mark injured$/i }).click();
    await page.getByRole("dialog", { name: /mark injured/i }).getByRole("button", { name: new RegExp(players[0].full_name) }).click();
    await page.getByRole("button", { name: "Done" }).click();

    await expect(settings).toHaveAccessibleName(/1 injured/);
    const hurt = group(page, "Bench").getByTestId(`player-tile-${ids[0]}`);
    await expect(hurt).toBeDisabled();
    await expect(hurt).toContainText("Injured");
    await expect(group(page, "Bench")).toContainText("+ 1 injured");
    // Their spot is empty; tapping them does nothing.
    await expect(group(page, "Back").getByRole("button", { name: /empty .* spot/i })).toHaveCount(1);
    await hurt.click({ force: true });
    await expect(page.getByText(/^Swap .* with…$/)).toHaveCount(0);

    // Back via the sheet: Mark fit.
    await settings.click();
    await page.getByRole("button", { name: `Mark ${players[0].full_name} fit` }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(settings).toHaveAccessibleName(/all available/i);
    await expect(tile(page, ids[0])).toBeEnabled();
  });

  test("a staged swap survives a reload", async ({ page }) => {
    await quiet(page);
    const { team, game, ids } = await seedAfl();
    await openBreak(page, team.id, game.id, /^Q2 lineup$/);
    await strategy(page, "Repeat").click();
    await tile(page, ids[0]).click();
    await tile(page, ids[13]).click();
    await expect(group(page, "Back").getByTestId(`player-tile-${ids[13]}`)).toBeVisible();

    await page.reload();
    await waitForHydration(page);
    await expect(group(page, "Back").getByTestId(`player-tile-${ids[13]}`)).toBeVisible({ timeout: 20_000 });
    await expect(strategy(page, "Repeat")).toBeChecked();
  });
});
