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

test.describe("soccer", () => {
  test("half-time says 2nd half, the keeper has one slot, and Fix gives someone else a turn in goal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await quiet(page);
    const admin = createAdminClient();
    const ownerId = await ownerOf(admin);
    const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U10", name: `PB-SOC-${Date.now() % 1e6}` });
    await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
    const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rovers" });
    const k = players.map((p) => p.id);
    await available(admin, game.id, ownerId, k);
    // 9 a side: keeper, 3-3-2, three on the bench.
    const lineup = { keeper: k[0], lines: { def: k.slice(1, 4), mid: k.slice(4, 7), att: k.slice(7, 9), field: [] }, bench: k.slice(9) };
    await seedBreak(admin, ownerId, game.id, "soccer", lineup, 25 * 60_000, [
      { type: "goal", player_id: k[7], metadata: { quarter: 1, elapsed_ms: 60_000 } },
      { type: "opponent_goal", metadata: { quarter: 1, elapsed_ms: 90_000 } },
      { type: "goal", player_id: k[8], metadata: { quarter: 1, elapsed_ms: 120_000 } },
    ]);

    await openBreak(page, team.id, game.id, /^2nd half lineup$/);
    await expect(page.getByText("Half-time · vs Rovers")).toBeVisible();
    await expect(page.getByRole("button", { name: /review and update scores/i })).toContainText("2 – 1");
    const names = await page.getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names.filter((n) => ["Attack", "Midfield", "Defence", "Keeper", "Bench"].includes(n ?? ""))).toEqual([
      "Attack",
      "Midfield",
      "Defence",
      "Keeper",
      "Bench",
    ]);
    await expect(group(page, "Keeper")).toContainText("1 on");
    await expect(group(page, "Keeper").getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^start 2nd half/i })).toBeVisible();
    await expect(page.getByText(/\bH2\b/)).toHaveCount(0);

    // Repeat: last half's keeper in goal again breaks "everyone has a
    // turn" (and the bench kids sitting out again breaks the 50% floor).
    await strategy(page, "Repeat").click();
    await expect(page.getByTestId("break-broken-rule").filter({ hasText: "can't reach 50% now" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^start 2nd half/i })).toContainText("2 rules");
    const broken = page.getByTestId("break-broken-rule").filter({ hasText: "kept goal last half" });
    await expect(broken).toBeVisible();
    await expect(broken).toContainText("Rule: Everyone has a turn: one half in goal each");
    await page.screenshot({ path: test.info().outputPath("soccer-break.png") });
    await broken.getByRole("button", { name: "Fix" }).click();
    await expect(broken).toHaveCount(0);
    await expect(group(page, "Keeper").getByTestId(`player-tile-${k[0]}`)).toHaveCount(0);
    // Three bench kids short of the floor: Fix brings them on, a swap each.
    const floor = page.getByTestId("break-broken-rule").filter({ hasText: "can't reach 50% now" });
    await floor.getByRole("button", { name: "Fix" }).click();
    await expect(page.getByTestId("break-broken-rule")).toHaveCount(0);

    await page.getByRole("button", { name: /^start 2nd half$/i }).click();
    await page.getByRole("button", { name: /^start 2nd half now$/i }).click();
    await expect
      .poll(
        async () => {
          const { data } = await admin.from("game_events").select("type, metadata").eq("game_id", game.id).order("created_at");
          const types = (data ?? []).map((e) => e.type);
          const set = [...(data ?? [])].reverse().find((e) => e.type === "lineup_set")?.metadata as { lineup?: { keeper?: string } };
          return { started: types.includes("quarter_start") && types.lastIndexOf("quarter_start") > types.lastIndexOf("lineup_set"), keeper: set?.lineup?.keeper };
        },
        { timeout: 20_000 },
      )
      .toMatchObject({ started: true });
  });
});

test.describe("rugby", () => {
  async function seedRugby(sport: "rugby_league" | "rugby_union", ageGroup: string, extra = 3) {
    const admin = createAdminClient();
    const ownerId = await ownerOf(admin);
    const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `PB-${sport === "rugby_league" ? "RL" : "RU"}-${Date.now() % 1e6}` });
    await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
    const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
    const size = game.on_field_size as number;
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: size + extra });
    const k = players.map((p) => p.id);
    await available(admin, game.id, ownerId, k);
    const fwd = Math.floor(size / 2);
    const lineup = { forwards: k.slice(0, fwd), backs: k.slice(fwd, size), bench: k.slice(size) };
    return { admin, ownerId, team, game, players, k, size, fwd, lineup };
  }

  test("league: Forwards / Backs / Bench, the vests a chip under the score, a swap staged until Start", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await quiet(page);
    const { admin, ownerId, team, game, k, size, fwd, lineup } = await seedRugby("rugby_league", "U8");
    await seedBreak(admin, ownerId, game.id, "rugby_league", lineup, 12 * 60_000);

    await openBreak(page, team.id, game.id, /^Q2 lineup$/);
    await expect(page.getByText("Q1 break · vs Sharks")).toBeVisible();
    const names = await page.getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names.filter((n) => ["Forwards", "Backs", "Bench"].includes(n ?? ""))).toEqual(["Forwards", "Backs", "Bench"]);
    // UI polish round 2 R1: the vests are a chip opening a sheet, not a
    // card under the bench twice the height of the lineup.
    await expect(page.getByRole("region", { name: "Vest assignment" })).toHaveCount(0);
    const vests = page.getByRole("button", { name: /^Vests: FR / });
    await expect(vests).toBeVisible();
    await vests.click();
    const sheet = page.getByRole("dialog", { name: "Vests" });
    await expect(sheet.getByRole("region", { name: "Vest assignment" })).toBeVisible();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);
    // No auto-opened start modal on arrival any more.
    await expect(page.getByRole("button", { name: /^start q2 now$/i })).toHaveCount(0);

    await strategy(page, "Repeat").click();
    await tile(page, k[0]).click();
    await tile(page, k[size]).click();
    await expect(group(page, "Forwards").getByTestId(`player-tile-${k[size]}`)).toContainText("From bench");
    await expect(group(page, "Bench").getByTestId(`player-tile-${k[0]}`)).toContainText("From Forwards");
    // Staged: nothing is written until Start.
    const swaps = await admin.from("game_events").select("id").eq("game_id", game.id).in("type", ["swap", "lineup_set"]);
    expect(swaps.data?.length).toBe(1);
    await page.screenshot({ path: test.info().outputPath("league-break.png") });

    const start = page.getByRole("button", { name: /^start q2/i });
    await start.click();
    const anyway = page.getByRole("button", { name: "Start anyway" });
    const now = page.getByRole("button", { name: /^start q2 now$/i });
    await expect(anyway.or(now)).toBeVisible();
    await ((await anyway.isVisible()) ? anyway : now).click();
    await expect
      .poll(
        async () => {
          const { data } = await admin.from("game_events").select("type, metadata").eq("game_id", game.id).order("created_at");
          const set = [...(data ?? [])].reverse().find((e) => e.type === "lineup_set")?.metadata as { lineup?: { forwards: string[] } };
          return { last: (data ?? []).map((e) => e.type).slice(-1)[0], forwards: set?.lineup?.forwards?.includes(k[size]) };
        },
        { timeout: 20_000 },
      )
      .toEqual({ last: "quarter_start", forwards: true });
    expect(fwd).toBeGreaterThan(0);
  });

  test("union: 2nd half words, no vests", async ({ page }) => {
    await quiet(page);
    const { admin, ownerId, team, game, lineup } = await seedRugby("rugby_union", "U10");
    await seedBreak(admin, ownerId, game.id, "rugby_union", lineup, 20 * 60_000);
    await openBreak(page, team.id, game.id, /^2nd half lineup$/);
    await expect(page.getByText("Half-time · vs Sharks")).toBeVisible();
    await expect(page.getByRole("button", { name: /^start 2nd half/i })).toBeVisible();
    await expect(page.getByText(/first receiver|dummy half/i)).toHaveCount(0);
    await expect(group(page, "Forwards")).toBeVisible();
  });
});

test.describe("basketball", () => {
  test("forwards over guards, points on the chip, a fouled-out kid faded on the bench", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await quiet(page);
    const admin = createAdminClient();
    const ownerId = await ownerOf(admin);
    const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12", name: `PB-BBL-${Date.now() % 1e6}` });
    await admin.from("teams").update({ track_scoring: true, track_fouls: true }).eq("id", team.id);
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 8 });
    const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rivals" });
    const k = players.map((p) => p.id);
    await available(admin, game.id, ownerId, k);
    const lineup = { lines: { guard: k.slice(0, 2), forward: k.slice(2, 5), court: [] }, bench: k.slice(5) };
    await seedBreak(admin, ownerId, game.id, "basketball", lineup, 20 * 60_000, [
      { type: "two_pointer", player_id: k[0], metadata: { quarter: 1, elapsed_ms: 60_000 } },
      { type: "opponent_three_pointer", metadata: { quarter: 1, elapsed_ms: 90_000 } },
      // k[4] fouls out (5 personals) and was benched.
      ...[1, 2, 3, 4, 5].map((n) => ({ type: "foul", player_id: k[4], metadata: { kind: "personal", quarter: 1, elapsed_ms: 100_000 + n * 1000 } })),
      { type: "injury", player_id: k[4], metadata: { injured: true, reason: "fouled_out", quarter: 1, elapsed_ms: 106_000 } },
    ]);

    await openBreak(page, team.id, game.id, /^2nd half lineup$/);
    await expect(page.getByText("Half-time · vs Rivals")).toBeVisible();
    const score = page.getByRole("button", { name: /review and update scores/i });
    await expect(score).toContainText("2 – 3");
    await expect(score).toContainText("Points");
    const names = await page.getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names.filter((n) => ["Forwards", "Guards", "Bench"].includes(n ?? ""))).toEqual(["Forwards", "Guards", "Bench"]);

    const out = group(page, "Bench").getByTestId(`player-tile-${k[4]}`);
    await expect(out).toBeDisabled();
    await expect(out).toContainText("Fouled out");
    await expect(out).toContainText("5F");
    await expect(group(page, "Bench")).toContainText("+ 1 fouled out");

    // A guard and a forward trade lines.
    await strategy(page, "Repeat").click();
    await tile(page, k[0]).click();
    await tile(page, k[2]).click();
    await expect(group(page, "Forwards").getByTestId(`player-tile-${k[0]}`)).toContainText("From Guard");
    await page.screenshot({ path: test.info().outputPath("basketball-break.png") });

    // The score sheet keeps basketball's +1/+2/+3.
    await score.click();
    await expect(page.getByRole("button", { name: /^add 3 points, rivals$/i })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    const start = page.getByRole("button", { name: /^start 2nd half/i });
    await start.click();
    const anyway = page.getByRole("button", { name: "Start anyway" });
    const now = page.getByRole("button", { name: /^start 2nd half now$/i });
    await expect(anyway.or(now)).toBeVisible();
    await (await anyway.isVisible() ? anyway : now).click();
    await expect
      .poll(
        async () => {
          const { data } = await admin.from("game_events").select("type").eq("game_id", game.id).order("created_at");
          return (data ?? []).map((e) => e.type).slice(-2);
        },
        { timeout: 20_000 },
      )
      .toEqual(["lineup_set", "quarter_start"]);
  });
});

test.describe("netball", () => {
  const BIBS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];

  async function seedNetball() {
    const admin = createAdminClient();
    const ownerId = await ownerOf(admin);
    const team = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "11u", name: `PB-NB-${Date.now() % 1e6}` });
    await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10, ageGroup: "U10" });
    const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Comets" });
    const ids = players.map((p) => p.id);
    await available(admin, game.id, ownerId, ids);
    const lineup = { positions: Object.fromEntries(BIBS.map((b, i) => [b, [ids[i]]])), bench: ids.slice(7) };
    await seedBreak(admin, ownerId, game.id, "netball", lineup, 10 * 60_000, [
      { type: "goal", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } },
    ]);
    return { admin, team, game, players, ids };
  }

  test("bibs on the slots, none on the bench; a swap moves the kids and the bibs stay", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await quiet(page);
    const { admin, team, game, ids } = await seedNetball();
    await openBreak(page, team.id, game.id, /^Q2 lineup$/);
    await expect(page.getByText("Q1 break · vs Comets")).toBeVisible();
    await expect(page.getByRole("button", { name: /review and update scores/i })).toContainText("Goals");

    await strategy(page, "Repeat").click();
    const attack = group(page, "Attack");
    await expect(attack.getByTestId(`player-tile-${ids[0]}`)).toContainText("GS");
    await expect(attack.getByTestId(`player-tile-${ids[1]}`)).toContainText("GA");
    await expect(group(page, "Centre")).toContainText("WA");
    await expect(group(page, "Defence")).toContainText("GK");
    // No jumper numbers, and no bib on the bench.
    await expect(page.getByText(/^#\d+$/)).toHaveCount(0);
    const benchTile = group(page, "Bench").getByTestId(`player-tile-${ids[7]}`);
    await expect(benchTile).not.toContainText(/\b(GS|GA|WA|C|WD|GD|GK)\b/);

    // GS ↔ GA: the kids move, the bibs stay with the slots.
    await tile(page, ids[0]).click();
    await tile(page, ids[1]).click();
    const first = attack.getByRole("button").first();
    await expect(first).toContainText("GS");
    await expect(first).toHaveAttribute("data-testid", `player-tile-${ids[1]}`);
    await expect(first).toContainText("From GA");

    // Bench → WA.
    await tile(page, ids[7]).click();
    await tile(page, ids[2]).click();
    await expect(group(page, "Centre").getByTestId(`player-tile-${ids[7]}`)).toContainText("From bench");

    await page.screenshot({ path: test.info().outputPath("netball-break.png") });

    await page.getByRole("button", { name: /^start q2/i }).click();
    await page.getByRole("button", { name: /^start q2 now$/i }).click();
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("game_events")
            .select("metadata")
            .eq("game_id", game.id)
            .eq("type", "period_break_swap");
          return (data?.[0]?.metadata as { lineup?: { positions: Record<string, string[]> } })?.lineup?.positions ?? null;
        },
        { timeout: 20_000 },
      )
      .toMatchObject({ gs: [ids[1]], ga: [ids[0]], wa: [ids[7]] });
  });

  test("an empty bib is a broken rule with a Fix, never a block", async ({ page }) => {
    await quiet(page);
    const { team, game, ids, players } = await seedNetball();
    await openBreak(page, team.id, game.id, /^Q2 lineup$/);
    await strategy(page, "Repeat").click();
    // GS goes off injured: her bib is empty.
    await page.getByRole("button", { name: /^game settings:/i }).click();
    await page.getByRole("button", { name: /^\+?\s*mark injured$/i }).click();
    await page.getByRole("dialog", { name: /mark injured/i }).getByRole("button", { name: new RegExp(players[0].full_name) }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(group(page, "Attack").getByRole("button", { name: /^empty gs spot$/i })).toBeVisible();
    const broken = page.getByTestId("break-broken-rule");
    await expect(broken).toContainText("empty");
    await broken.getByRole("button", { name: "Fix" }).click();
    await expect(broken).toHaveCount(0);
    await expect(group(page, "Attack").getByRole("button", { name: /^empty gs spot$/i })).toHaveCount(0);
    await expect(group(page, "Bench").getByTestId(`player-tile-${ids[0]}`)).toContainText("Injured");
  });
});

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
