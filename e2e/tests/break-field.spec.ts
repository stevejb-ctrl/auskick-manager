// ─── The break draws the sport's field ───
//
// Steve, 10 Nov 2026: "The quarter-break screen still draws the old
// court. It doesn't have netball's zigzag or the rugby markings yet."
// The period break used to list the kids under coloured zone headings.
// It now draws the next period's lineup on the sport's field, exactly as
// the live screen does (live/FieldLines, each sport's markings from the
// helper its live screen uses), with the bench a list under it, in all
// ten sports. Tap two kids to swap, as before.
//
// Covers:
//   - src/components/quarter-break/PeriodBreak.tsx (the field + KidBench)
//   - src/components/quarter-break/BreakPlayerTile.tsx (the field look)
//   - each sport's adapter: its surface, markings and line shapes
//     (ovalField, netballCourt/netballCourtLine, soccerField, woodCourt,
//     rugbyField + leagueFieldLayout, spreadRows)

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import type { SportId } from "../../src/lib/sports";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function quiet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

interface Seed {
  sport: SportId;
  ageGroup: string;
  /** Squad size, or from the game's on-field size. */
  count: number | ((size: number) => number);
  /** Period 1's lineup, from the squad's ids. */
  lineup: (k: string[], size: number) => unknown;
  periodMs: number;
  /** players' age group, where the sport's differs (netball). */
  playerAge?: string;
}

/** A game at the break after period 1, which `lineup` played. */
async function atBreak(seed: Seed) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: seed.sport, ageGroup: seed.ageGroup, name: `BF-${seed.sport}-${Date.now() % 1e6}` });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rovers" });
  const size = game.on_field_size as number;
  const count = typeof seed.count === "number" ? seed.count : seed.count(size);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count, ...(seed.playerAge ? { ageGroup: seed.playerAge } : {}) });
  const k = players.map((p) => p.id);
  await admin
    .from("game_availability")
    .upsert(k.map((id) => ({ game_id: game.id, player_id: id, status: "available" as const, updated_by: ownerId })), {
      onConflict: "game_id,player_id",
    });
  const lineup = seed.lineup(k, size);
  const start = Date.now() - seed.periodMs - 120_000;
  const at = (ms: number) => new Date(start + ms).toISOString();
  const meta = (m: Record<string, unknown>) => ({ ...m, sport: seed.sport });
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: meta({ lineup }), created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: meta({ quarter: 1 }), created_by: ownerId, created_at: at(1000) },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: meta({ quarter: 1, elapsed_ms: seed.periodMs }),
      created_by: ownerId,
      created_at: at(seed.periodMs + 1000),
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { team, game, k, size };
}

async function openBreak(page: Page, teamId: string, gameId: string) {
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  const title = page.getByRole("heading", { name: /lineup$/ });
  const selectTeam = page.getByRole("button", { name: /select team for/i });
  await expect(title.or(selectTeam).first()).toBeVisible({ timeout: 20_000 });
  if (await selectTeam.isVisible()) await selectTeam.click();
  await expect(title).toBeVisible({ timeout: 20_000 });
  await page.getByRole("radiogroup", { name: "How the next lineup is built" }).getByRole("radio", { name: "Repeat" }).click();
}

const tile = (page: Page, id: string) => page.getByTestId(`player-tile-${id}`);
const bench = (page: Page) => page.getByRole("group", { name: "Bench", exact: true });

/**
 * The kids are on the sport's field (its markings under them), the bench
 * is a list under it, and a tap on a field kid then a bench kid swaps them.
 */
async function fieldAndSwap(page: Page, marks: string, onField: string, onBench: string) {
  const field = page.getByTestId("break-field");
  await expect(field).toBeVisible();
  await expect(field.getByTestId(marks).first()).toBeAttached();
  await expect(field.getByTestId(`player-tile-${onField}`)).toBeVisible();
  await expect(bench(page).getByTestId(`player-tile-${onBench}`)).toBeVisible();
  await expect(field.getByRole("group", { name: "Bench" })).toHaveCount(0);
  // The bench sits under the field.
  const f = (await field.boundingBox())!;
  const b = (await bench(page).boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(f.y + f.height - 1);

  await tile(page, onField).click();
  await expect(tile(page, onField)).toHaveAttribute("aria-pressed", "true");
  await tile(page, onBench).click();
  await expect(field.getByTestId(`player-tile-${onBench}`)).toBeVisible();
  await expect(field.getByTestId(`player-tile-${onBench}`)).toContainText("From bench");
  await expect(bench(page).getByTestId(`player-tile-${onField}`)).toBeVisible();
}

test("AFL: the oval under the kids, the bench under it, a swap", async ({ page }) => {
  await quiet(page);
  const { team, game, k } = await atBreak({
    sport: "afl",
    ageGroup: "U10",
    count: 15,
    periodMs: 12 * 60_000,
    lineup: (k) => ({ back: k.slice(0, 4), hback: [], mid: k.slice(4, 8), hfwd: [], fwd: k.slice(8, 12), bench: k.slice(12) }),
  });
  await openBreak(page, team.id, game.id);
  await fieldAndSwap(page, "oval-markings", k[8], k[12]);
});

test("netball: the court's circles, and the bibs zigzag down it one a row", async ({ page }) => {
  await quiet(page);
  const BIBS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
  const { team, game, k } = await atBreak({
    sport: "netball",
    ageGroup: "11u",
    playerAge: "U10",
    count: 10,
    periodMs: 10 * 60_000,
    lineup: (k) => ({ positions: Object.fromEntries(BIBS.map((b, i) => [b, [k[i]]])), bench: k.slice(7) }),
  });
  await openBreak(page, team.id, game.id);
  const field = page.getByTestId("break-field");
  await expect(field.getByTestId("shooting-circle")).toHaveCount(2);

  // Top to bottom GS, GA, WA, C, WD, GD, GK, each a row of its own,
  // zigzagging: GS centre, GA right, WA left, C centre, WD right, GD
  // left, GK centre.
  const f = (await field.boundingBox())!;
  const mid = f.x + f.width / 2;
  const boxes = [];
  for (let i = 0; i < 7; i++) boxes.push((await tile(page, k[i]).boundingBox())!);
  for (let i = 1; i < 7; i++) expect(boxes[i].y, `${BIBS[i]} under ${BIBS[i - 1]}`).toBeGreaterThan(boxes[i - 1].y + boxes[i - 1].height - 1);
  const side = (b: { x: number; width: number }) => {
    const c = b.x + b.width / 2;
    return Math.abs(c - mid) < 12 ? "center" : c > mid ? "right" : "left";
  };
  expect(boxes.map(side)).toEqual(["center", "right", "left", "center", "right", "left", "center"]);
  await expect(tile(page, k[0])).toContainText("GS");

  await fieldAndSwap(page, "shooting-circle", k[2], k[7]);
  // The bib stays with the spot: the bench kid is WA now.
  await expect(tile(page, k[7])).toContainText("WA");
});

test("soccer: the pitch, and a swap", async ({ page }) => {
  await quiet(page);
  const { team, game, k } = await atBreak({
    sport: "soccer",
    ageGroup: "U10",
    count: 12,
    periodMs: 25 * 60_000,
    lineup: (k) => ({ keeper: k[0], lines: { def: k.slice(1, 4), mid: k.slice(4, 7), att: k.slice(7, 9), field: [] }, bench: k.slice(9) }),
  });
  await openBreak(page, team.id, game.id);
  await fieldAndSwap(page, "pitch-markings", k[7], k[9]);
});

test("futsal: the court, and a swap", async ({ page }) => {
  await quiet(page);
  const { team, game, k } = await atBreak({
    sport: "futsal",
    ageGroup: "U10",
    count: 8,
    periodMs: 20 * 60_000,
    lineup: (k) => ({ keeper: k[0], lines: { def: k.slice(1, 3), mid: [], att: k.slice(3, 5), field: [] }, bench: k.slice(5) }),
  });
  await openBreak(page, team.id, game.id);
  await fieldAndSwap(page, "futsal-court-markings", k[3], k[5]);
});

test("hockey: the hockey pitch, and a swap", async ({ page }) => {
  await quiet(page);
  const { team, game, k } = await atBreak({
    sport: "hockey",
    ageGroup: "U9",
    count: 9,
    periodMs: 20 * 60_000,
    lineup: (k) => ({ keeper: k[0], lines: { def: k.slice(1, 3), mid: k.slice(3, 5), att: k.slice(5, 7), field: [] }, bench: k.slice(7) }),
  });
  await openBreak(page, team.id, game.id);
  await fieldAndSwap(page, "hockey-pitch-markings", k[5], k[7]);
});

test("basketball: the wood and its paint, and a swap", async ({ page }) => {
  await quiet(page);
  const { team, game, k } = await atBreak({
    sport: "basketball",
    ageGroup: "U12",
    count: 8,
    periodMs: 20 * 60_000,
    lineup: (k) => ({ lines: { guard: k.slice(0, 2), forward: k.slice(2, 5), court: [] }, bench: k.slice(5) }),
  });
  await openBreak(page, team.id, game.id);
  await fieldAndSwap(page, "wood-markings", k[0], k[5]);
});

test.describe("rugby", () => {
  for (const [sport, ageGroup] of [
    ["rugby_league", "U8"],
    ["rugby_union", "U10"],
  ] as const) {
    test(`${sport}: the try lines and posts, the formation's rows, and a swap`, async ({ page }) => {
      await quiet(page);
      const { team, game, k, size } = await atBreak({
        sport,
        ageGroup,
        count: (n) => n + 3,
        periodMs: 20 * 60_000,
        lineup: (k, n) => {
          const fwd = Math.floor(n / 2);
          return { forwards: k.slice(0, fwd), backs: k.slice(fwd, n), bench: k.slice(n) };
        },
      });
      await openBreak(page, team.id, game.id);
      const field = page.getByTestId("break-field");
      await expect(field.getByTestId("rugby-markings")).toBeAttached();
      await expect(field.getByTestId("rugby-posts")).toHaveCount(2);
      // The lines as in play: Forwards over Backs.
      const fwd = (await field.getByRole("group", { name: "Forwards" }).boundingBox())!;
      const backs = (await field.getByRole("group", { name: "Backs" }).boundingBox())!;
      expect(backs.y).toBeGreaterThan(fwd.y);
      await fieldAndSwap(page, "rugby-markings", k[0], k[size]);
    });
  }
});

test("touch: the touch field, no posts, and a swap", async ({ page }) => {
  await quiet(page);
  const { team, game, k } = await atBreak({
    sport: "touch",
    ageGroup: "U11",
    count: 10,
    periodMs: 20 * 60_000,
    lineup: (k) => ({ lines: { middle: k.slice(0, 2), link: k.slice(2, 4), wing: k.slice(4, 6), field: [] }, bench: k.slice(6) }),
  });
  await openBreak(page, team.id, game.id);
  await expect(page.getByTestId("break-field").getByTestId("rugby-posts")).toHaveCount(0);
  await fieldAndSwap(page, "rugby-markings", k[0], k[6]);
});

test("Oztag: one Field line staggered 3-2-3 down the field, and a swap", async ({ page }) => {
  await quiet(page);
  const { team, game, k } = await atBreak({
    sport: "oztag",
    ageGroup: "U10",
    count: 11,
    periodMs: 20 * 60_000,
    lineup: (k) => ({ lines: { middle: [], link: [], wing: [], field: k.slice(0, 8) }, bench: k.slice(8) }),
  });
  await openBreak(page, team.id, game.id);
  const field = page.getByTestId("break-field");
  await expect(field.getByTestId("rugby-markings")).toBeAttached();
  const line = field.getByRole("group", { name: "Field" });
  const ys: number[] = [];
  for (const id of k.slice(0, 8)) ys.push(Math.round((await line.getByTestId(`player-tile-${id}`).boundingBox())!.y));
  const rows = new Map<number, number>();
  for (const y of ys) rows.set(y, (rows.get(y) ?? 0) + 1);
  expect(Array.from(rows.entries()).sort((a, b) => a[0] - b[0]).map(([, n]) => n)).toEqual([3, 2, 3]);
  await fieldAndSwap(page, "rugby-markings", k[0], k[8]);
});
