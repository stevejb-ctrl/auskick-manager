// ─── Lending a kid: who comes on, in every sport ─────────────
// Stagehand round 9 (9 Nov 2026), about six runs: lending a field kid
// left a gap on the field with no word outside AFL; Lend hid under More;
// getting a lent kid back at the break was only in Game settings; and a
// lent league kid kept the Dummy Half vest drawn on their tile.
//
// Now, in every sport that lends:
//   - lending a field kid asks who comes on (the shared
//     InjuryReplacementModal, AFL's flow), and the pick takes the spot
//     (netball: their bib);
//   - with nobody on the bench the sheet says so and lends them short;
//   - the kid bar's More says "lend";
//   - the shared break lists each lent kid with a plain Bring back;
//   - a lent kid carries no vest or position mark (league's DH).

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;
type Sport = "afl" | "soccer" | "rugby_league" | "netball" | "basketball" | "touch";

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

interface Side {
  age: string;
  count: number;
  onField: number;
  /** The kickoff lineup from the squad's ids (in squad order). */
  lineup: (ids: string[]) => Record<string, unknown>;
  /** The tile's test id. */
  tile: (pid: string) => string;
}

const SIDES: Record<Sport, Side> = {
  afl: {
    age: "U10",
    count: 15,
    onField: 12,
    lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }),
    tile: (pid) => `player-tile-${pid}`,
  },
  soccer: {
    age: "U12",
    count: 12,
    onField: 9,
    lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 4), mid: ids.slice(4, 7), att: ids.slice(7, 9), field: [] }, bench: ids.slice(9) }),
    tile: (pid) => `player-tile-${pid}`,
  },
  rugby_league: {
    age: "U9",
    count: 11,
    onField: 8,
    lineup: (ids) => ({ forwards: ids.slice(0, 3), backs: ids.slice(3, 8), bench: ids.slice(8) }),
    tile: (pid) => `league-player-tile-${pid}`,
  },
  netball: {
    age: "11u",
    count: 9,
    onField: 7,
    lineup: (ids) => ({ positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }),
    tile: (pid) => `player-tile-${pid}`,
  },
  basketball: {
    age: "U12",
    count: 8,
    onField: 5,
    lineup: (ids) => ({ lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) }),
    tile: (pid) => `player-tile-${pid}`,
  },
  touch: {
    age: "U12",
    count: 9,
    onField: 6,
    lineup: (ids) => ({ lines: { middle: ids.slice(0, 2), link: ids.slice(2, 4), wing: ids.slice(4, 6), field: [] }, bench: ids.slice(6) }),
    tile: (pid) => `player-tile-${pid}`,
  },
};

/**
 * A game a minute into its first period (or, `atBreak`, at the first
 * break), with `count` kids (fewer: an empty bench) and any events after
 * the kickoff.
 */
async function seed(
  sport: Sport,
  opts: {
    count?: number;
    atBreak?: boolean;
    extra?: (ids: string[]) => { type: string; player_id?: string; metadata: Record<string, unknown> }[];
  } = {},
) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const side = SIDES[sport];
  const team = await makeTeam(admin, { ownerId, sport, ageGroup: side.age, name: `LEND ${sport} ${uniq()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count ?? side.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const start = Date.now() - (opts.atBreak ? 10 * 60_000 : 60_000);
  const at = (s: number) => new Date(start + s * 1000).toISOString();
  const events = [
    { type: "lineup_set", metadata: { lineup: side.lineup(ids) } },
    { type: "quarter_start", metadata: { quarter: 1 } },
    ...(opts.extra?.(ids) ?? []),
    ...(opts.atBreak ? [{ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 8 * 60_000 } }] : []),
  ];
  const { error } = await admin.from("game_events").insert(
    events.map((e, i) => ({
      game_id: game.id,
      type: e.type,
      player_id: (e as { player_id?: string }).player_id ?? null,
      metadata: { ...e.metadata, sport },
      created_by: ownerId,
      created_at: at(i),
    })),
  );
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  await admin.from("games").update({ status: "in_progress", on_field_size: side.onField, sub_interval_seconds: 600 }).eq("id", game.id);
  return { admin, team, game, players, ids, side };
}

async function open(page: Page, teamId: string, gameId: string, atBreak = false) {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "basketball-walkthrough-seen", "touch-walkthrough-seen", "soccer-walkthrough-seen", "league-walkthrough-seen"]) {
        localStorage.setItem(k, "1");
      }
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  if (atBreak) await expect(page.getByTestId("period-over")).toBeVisible({ timeout: 15_000 });
  else await expect(page.getByRole("button", { name: /^clock — /i })).toBeVisible({ timeout: 15_000 });
}

/** Each kid's latest loan in the log: true lent, false back. */
async function loanOf(admin: Admin, gameId: string, pid: string): Promise<boolean | null> {
  const { data } = await admin
    .from("game_events")
    .select("metadata, created_at")
    .eq("game_id", gameId)
    .eq("type", "player_loan")
    .eq("player_id", pid)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0] as { metadata: { loaned?: boolean } } | undefined;
  return row ? row.metadata.loaned !== false : null;
}

/** Long-press a kid and tap Lend in their sheet. */
async function lend(page: Page, tileId: string) {
  await page.getByTestId(tileId).click({ delay: 650 });
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: /^lend to opposition/i }).click();
}

// ── Lending a field kid asks who comes on ─────────────────────
for (const sport of ["soccer", "rugby_league", "basketball", "touch"] as const) {
  test(`${sport}: lending a field kid asks who comes on, and the pick takes the spot`, async ({ page }) => {
    test.setTimeout(90_000);
    const { admin, team, game, players, ids, side } = await seed(sport);
    await open(page, team.id, game.id);

    // A kid in the middle of the side; the last bench kid comes on.
    const lent = ids[3];
    const on = players[players.length - 1];
    await lend(page, side.tile(lent));

    const who = page.getByRole("dialog", { name: /who comes on at/i });
    await expect(who).toBeVisible({ timeout: 10_000 });
    await expect(who).toContainText(/lending .+ to the opposition/i);
    await who.getByRole("button", { name: new RegExp(`^${on.full_name} #${on.jersey_number}\\b`) }).click();

    await expect.poll(() => loanOf(admin, game.id, lent), { timeout: 15_000 }).toBe(true);
    // The lent kid sits on the bench, LENT; the pick is on the field.
    const bench = page.getByRole("group", { name: "Bench", exact: true });
    await expect(bench.getByTestId(side.tile(lent))).toContainText("LENT", { timeout: 10_000 });
    await expect(bench.getByTestId(side.tile(on.id))).toHaveCount(0);
    await expect(page.getByTestId(side.tile(on.id))).toBeVisible();
  });
}

test("netball: lending a court kid asks who comes on at their bib", async ({ page }) => {
  test.setTimeout(90_000);
  const { admin, team, game, players, ids, side } = await seed("netball");
  await open(page, team.id, game.id);

  const gs = ids[0];
  const on = players[players.length - 1];
  await lend(page, side.tile(gs));
  const who = page.getByRole("dialog", { name: /who comes on at gs/i });
  await expect(who).toBeVisible({ timeout: 10_000 });
  await who.getByRole("button", { name: new RegExp(`^${on.full_name}\\b`) }).click();

  await expect.poll(() => loanOf(admin, game.id, gs), { timeout: 15_000 }).toBe(true);
  // The pick wears GS; the lent kid's tile carries no bib.
  await expect(page.getByTestId(side.tile(on.id))).toContainText("GS", { timeout: 10_000 });
  const lentTile = page.getByRole("group", { name: "Bench", exact: true }).getByTestId(side.tile(gs));
  await expect(lentTile).toContainText("LENT");
  await expect(lentTile).not.toContainText("GS");
});

// ── Nobody on the bench: said plainly, never a silent gap ─────
for (const sport of ["netball", "afl", "soccer"] as const) {
  test(`${sport}: lending a field kid with nobody on the bench says so, then lends them short`, async ({ page }) => {
    test.setTimeout(90_000);
    const { admin, team, game, ids, side } = await seed(sport, { count: SIDES[sport].onField });
    await open(page, team.id, game.id);

    const lent = ids[1];
    await lend(page, side.tile(lent));
    const sheet = page.getByRole("dialog", { name: /nobody to bring on/i });
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByTestId("replacement-empty")).toContainText("You'll play one short");
    // Nothing's lent until the coach says so.
    expect(await loanOf(admin, game.id, lent)).toBeNull();
    await sheet.getByRole("button", { name: "Lend and play one short" }).click();
    await expect.poll(() => loanOf(admin, game.id, lent), { timeout: 15_000 }).toBe(true);
  });
}

// ── Lend is easy to find ──────────────────────────────────────
test("the kid bar's More says it holds Lend, and Lend sits under Switch in the sheet", async ({ page }) => {
  const { team, game, ids, side } = await seed("soccer");
  await open(page, team.id, game.id);
  await page.getByTestId(side.tile(ids[4])).click();
  const more = page.getByTestId("kid-bar").getByRole("button", { name: /^more$/i });
  await expect(more).toContainText(/lend/i);
  await more.click();
  const buttons = page.getByRole("dialog").getByRole("button");
  const names = (await buttons.allInnerTexts()).map((t) => t.split("\n")[0].trim());
  expect(names.indexOf("Lend to opposition"), names.join(" | ")).toBe(names.indexOf("Switch player") + 1);
});

// ── Getting a lent kid back at the break ──────────────────────
for (const sport of ["soccer", "rugby_league", "netball"] as const) {
  test(`${sport}: the break lists a lent kid with a plain Bring back`, async ({ page }) => {
    test.setTimeout(90_000);
    const { admin, team, game, players, side } = await seed(sport, {
      atBreak: true,
      // The last bench kid was lent a minute in.
      extra: (k) => [{ type: "player_loan", player_id: k[k.length - 1], metadata: { quarter: 1, elapsed_ms: 60_000, loaned: true } }],
    });
    const lent = players[players.length - 1];
    void side;
    await open(page, team.id, game.id, true);

    const card = page.getByTestId("break-lent");
    await expect(card).toContainText("Lent to the other team");
    await expect(card).toContainText(lent.full_name);
    await card.getByRole("button", { name: `Bring ${lent.full_name} back` }).click();

    await expect.poll(() => loanOf(admin, game.id, lent.id), { timeout: 15_000 }).toBe(false);
    await expect(card).toHaveCount(0, { timeout: 10_000 });
    // On the bench for the next period, no longer lent.
    const tile = page.getByRole("group", { name: "Bench", exact: true }).getByTestId(`player-tile-${lent.id}`);
    await expect(tile).toBeEnabled();
    await expect(tile).not.toContainText("Lent");
  });
}

// ── League: a lent kid wears no vest ──────────────────────────
test("league: the Dummy Half lent to the other team carries no DH on their tile", async ({ page }) => {
  test.setTimeout(90_000);
  const { team, game, ids, side } = await seed("rugby_league", {
    extra: (k) => [
      { type: "vest_assigned", player_id: k[0], metadata: { vest: "dh", period: 1, replacement: false } },
      { type: "vest_assigned", player_id: k[3], metadata: { vest: "fr", period: 1, replacement: false } },
      { type: "player_loan", player_id: k[0], metadata: { quarter: 1, elapsed_ms: 30_000, loaned: true } },
    ],
  });
  await open(page, team.id, game.id);

  const lentTile = page.getByRole("group", { name: "Bench", exact: true }).getByTestId(side.tile(ids[0]));
  await expect(lentTile).toContainText("LENT", { timeout: 10_000 });
  await expect(lentTile.getByTestId("kid-flag")).toHaveCount(0);
  await expect(lentTile).not.toHaveAccessibleName(/dummy half/i);
  // The First Receiver, still ours, keeps theirs.
  await expect(page.getByTestId(side.tile(ids[3])).getByTestId("kid-flag")).toHaveText("FR");
});
