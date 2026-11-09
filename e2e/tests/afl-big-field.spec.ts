// ─── AFL's big field (live v3, Phase 11) ──────────────────────
// From U13 an AFL side plays 15, 16 or 18 a side in named positions. The
// live screen draws the team's formation (Forward, Centre, Back; each
// line its rows of positions) with dense tiles that lead with the
// position ("CHB Jack S"), and it all fits a phone: 18 on and 7 on the
// bench at 390×844 with no page scroll.
//
// Tapping two kids on the field trades their positions at once (it's
// not a sub), with Undo on the toast ("Jack S to FB · Tom to CHB ·
// position change logged"). The change is its own event, position_swap
// (migration 0078), so a reload draws it again.
//
// And the rotation rule's minimum (AFL 50 %): a kid at risk of missing
// it by full time says "Needs N′ more", and the info line counts them.
// Nobody is flagged at the first bounce.
//
// Covers: src/lib/sports/afl/bigField.ts, src/lib/live/positionSeats.ts,
// positionSwap.ts, LiveGame.tsx's big field, recordPositionSwap.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { coachId } from "../helpers/people";
import { waitForHydration } from "../helpers/navigation";
import type { GameEvent } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

// The design's Wombats: forwards, mids, backs (formation order), bench.
const NAMES = [
  "Max Ward", "Finn Cole", "Zac Hill", "Theo Hart", "Jack Taylor", "Liam Shaw",
  "Ollie Ryan", "Noah Kerr", "Sam Price", "Harvey Lee", "Ben Fox", "Will Kent",
  "Josh Bell", "Jack Smith", "Oscar Wu", "Ryan Cook", "Tom Lane", "Henry Moss",
  "Leo Park", "Kai Moana", "Eli Stone", "Archie Dunn", "Charlie Rose", "Lucas Ng", "Hamish Bray",
];

type Kid = { id: string; full_name: string };
const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();

/**
 * An AFL game under way, the field filled forwards, mids, backs from the
 * first kids. `events` adds to the lineup and Q1 start (seconds ago).
 */
async function bigGame(
  admin: SupabaseClient,
  opts: {
    ageGroup: string;
    onField: number;
    bench: number;
    perLine: [number, number, number];
    q1SecsAgo: number;
    subInterval?: number;
    extra?: (k: Kid[], ownerId: string) => Record<string, unknown>[];
  },
) {
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: opts.ageGroup, name: `Wombats ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const count = opts.onField + opts.bench;
  const made = await makePlayers(admin, { teamId: team.id, ownerId, count, ageGroup: opts.ageGroup });
  const names = opts.onField === 18 ? NAMES : [...NAMES.slice(0, 5), ...NAMES.slice(6, 11), ...NAMES.slice(13, 18), ...NAMES.slice(18)];
  const kids: Kid[] = [];
  for (let i = 0; i < made.length; i++) {
    await admin.from("players").update({ full_name: names[i] }).eq("id", made[i].id);
    kids.push({ id: made[i].id, full_name: names[i] });
  }
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  const { error: gErr } = await admin
    .from("games")
    .update({ on_field_size: opts.onField, status: "in_progress", sub_interval_seconds: opts.subInterval ?? 600 })
    .eq("id", game.id);
  if (gErr) throw new Error(gErr.message);
  await admin.from("game_availability").insert(kids.map((k) => ({ game_id: game.id, player_id: k.id, status: "available" as const, updated_by: ownerId })));
  const ids = kids.map((k) => k.id);
  const [f, m, b] = opts.perLine;
  const lineup = { fwd: ids.slice(0, f), hfwd: [], mid: ids.slice(f, f + m), hback: [], back: ids.slice(f + m, f + m + b), bench: ids.slice(f + m + b) };
  const rows: Record<string, unknown>[] = [
    { type: "lineup_set", metadata: { lineup }, created_at: at(opts.q1SecsAgo + 30) },
    { type: "quarter_start", metadata: { quarter: 1 }, created_at: at(opts.q1SecsAgo) },
    ...(opts.extra?.(kids, ownerId) ?? []),
  ];
  const { error } = await admin.from("game_events").insert(rows.map((r) => ({ ...r, game_id: game.id, created_by: ownerId })));
  if (error) throw new Error(`seed: ${error.message}`);
  return { team, game, kids, lineup };
}

const byName = (kids: Kid[], name: string) => kids.find((k) => k.full_name === name)!;

async function open(page: Page, teamId: string, gameId: string, quarter = 1) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: new RegExp(`^clock — q${quarter}, running`, "i") })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

/** Wholly on screen. */
async function onScreen(page: Page, name: string, box: { x: number; y: number; width: number; height: number } | null) {
  const vp = page.viewportSize()!;
  expect(box, name).not.toBeNull();
  expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(vp.height + 1);
  expect(box!.x, `${name} left`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(vp.width + 1);
}

async function fits(page: Page, kids: Kid[], onField: number) {
  const s = await page.evaluate(() => {
    const el = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    return {
      page: document.documentElement.scrollHeight - window.innerHeight,
      pageX: document.documentElement.scrollWidth - window.innerWidth,
      shell: el("live-shell").scrollHeight - el("live-shell").clientHeight,
      field: el("live-field").scrollHeight - el("live-field").clientHeight,
    };
  });
  expect(s.page, "the page scrolls").toBeLessThanOrEqual(0);
  expect(s.pageX, "the page scrolls sideways").toBeLessThanOrEqual(0);
  expect(s.shell, "the shell scrolls").toBeLessThanOrEqual(1);
  expect(s.field, "the field has to scroll to show every kid").toBeLessThanOrEqual(1);
  // Every kid, on the field and the bench, is on screen, and each tile
  // is a full tap target.
  for (const k of kids) {
    const tile = page.getByTestId(`player-tile-${k.id}`);
    const box = await tile.boundingBox();
    await onScreen(page, k.full_name, box);
    expect(box!.height, `${k.full_name}'s tile height`).toBeGreaterThanOrEqual(44);
  }
  await onScreen(page, "clock", await page.getByRole("button", { name: /^clock — /i }).boundingBox());
  await onScreen(page, "+ GOAL", await page.getByRole("button", { name: /^add goal, wombats/i }).boundingBox());
  await onScreen(page, "their +B", await page.getByRole("button", { name: "Add behind, Kookas" }).boundingBox());
  expect(await page.getByTestId("live-field").locator('[data-testid^="player-tile-"]').count()).toBe(onField);
}

test("AFL 18 + 7 at 390×844: the formation fits with no scroll, every tile led by its position", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, kids } = await bigGame(admin, { ageGroup: "U16_boys", onField: 18, bench: 7, perLine: [6, 6, 6], q1SecsAgo: 60 });
  await open(page, team.id, game.id);
  await fits(page, kids, 18);

  // The formation: Forward, Centre, Back, each two rows of three.
  const forward = page.getByRole("group", { name: "Forward", exact: true });
  const centre = page.getByRole("group", { name: "Centre", exact: true });
  const back = page.getByRole("group", { name: "Back", exact: true });
  await expect(forward.locator('[data-testid^="player-tile-"]')).toHaveCount(6);
  await expect(centre.locator('[data-testid^="player-tile-"]')).toHaveCount(6);
  await expect(back.locator('[data-testid^="player-tile-"]')).toHaveCount(6);
  // Dense tiles: the position, then the name ("CHB Jack S").
  await expect(page.getByTestId(`player-tile-${byName(kids, "Max Ward").id}`)).toContainText(/^\d*LFP\s*Max/);
  await expect(page.getByTestId(`player-tile-${byName(kids, "Noah Kerr").id}`)).toContainText(/^\d*C\s*Noah/);
  await expect(page.getByTestId(`player-tile-${byName(kids, "Jack Smith").id}`)).toContainText(/^\d*CHB\s*Jack S/);
  await expect(page.getByTestId(`player-tile-${byName(kids, "Tom Lane").id}`)).toContainText(/^\d*FB\s*Tom/);
  // A screen reader hears the position as where they are.
  await expect(page.getByTestId(`player-tile-${byName(kids, "Jack Smith").id}`)).toHaveAttribute("aria-label", /CHB/);
});

test("AFL 15 + 5 (U13) fits too, in the 15-a-side formation", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, kids } = await bigGame(admin, { ageGroup: "U13", onField: 15, bench: 5, perLine: [5, 5, 5], q1SecsAgo: 60 });
  await open(page, team.id, game.id);
  await fits(page, kids, 15);
  await expect(page.getByRole("group", { name: "Forward", exact: true }).locator('[data-testid^="player-tile-"]')).toHaveCount(5);
  // 15's backs: CHB HBF over LBP FB RBP.
  await expect(page.getByTestId(`player-tile-${kids[10].id}`)).toContainText(/^\d*CHB/);
  await expect(page.getByTestId(`player-tile-${kids[13].id}`)).toContainText(/^\d*FB/);
});

/** The undo strip's Undo, naming the change (the toast has had no Undo of its own since Stagehand round 9). */
async function tapUndo(page: Page) {
  await expect(page.getByTestId("swap-toast").getByRole("button")).toHaveCount(0);
  const undo = page.getByTestId("undo-strip").getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible({ timeout: 5_000 });
  await undo.click();
}

async function positionSwapsOf(admin: SupabaseClient, gameId: string) {
  const { data } = await admin.from("game_events").select("*").eq("game_id", gameId).eq("type", "position_swap").order("created_at");
  return ((data ?? []) as GameEvent[]).map((e) => {
    const m = e.metadata as Record<string, unknown>;
    return { a: m.player_a_id, b: m.player_b_id, from: m.position_a, to: m.position_b, ...(m.undo ? { undo: true } : {}) };
  });
}

test("tap two kids on the field: they trade positions at once, Undo puts them back, and a reload keeps a change", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game, kids } = await bigGame(admin, { ageGroup: "U16_boys", onField: 18, bench: 7, perLine: [6, 6, 6], q1SecsAgo: 60 });
  const jack = byName(kids, "Jack Smith");
  const tom = byName(kids, "Tom Lane");
  const noah = byName(kids, "Noah Kerr");
  await open(page, team.id, game.id);
  const tile = (k: Kid) => page.getByTestId(`player-tile-${k.id}`);
  await expect(tile(jack)).toContainText(/^\d*CHB/);

  // Jack (CHB), then Tom (FB): no confirm, no sub.
  await tile(jack).click();
  await tile(tom).click();
  await expect(page.getByTestId("swap-toast")).toContainText("Jack S to FB · Tom to CHB · position change logged", { timeout: 3_000 });
  await expect(tile(jack)).toContainText(/^\d*FB/);
  await expect(tile(tom)).toContainText(/^\d*CHB/);
  // Both still on the field, in the backs.
  const back = page.getByRole("group", { name: "Back", exact: true });
  await expect(back.getByTestId(`player-tile-${jack.id}`)).toBeVisible();
  await expect(back.getByTestId(`player-tile-${tom.id}`)).toBeVisible();

  // Undo puts them back.
  await tapUndo(page);
  await expect(tile(jack)).toContainText(/^\d*CHB/, { timeout: 3_000 });
  await expect(tile(tom)).toContainText(/^\d*FB/);
  await expect
    .poll(() => positionSwapsOf(admin, game.id), { timeout: 15_000 })
    .toEqual([
      { a: jack.id, b: tom.id, from: "chb", to: "fb" },
      { a: jack.id, b: tom.id, from: "fb", to: "chb", undo: true },
    ]);

  // Across lines: Jack (CHB) and Noah (C) trade, and change lines.
  await tile(jack).click();
  await tile(noah).click();
  await expect(page.getByTestId("swap-toast")).toContainText("Jack S to C · Noah to CHB · position change logged", { timeout: 3_000 });
  const centre = page.getByRole("group", { name: "Centre", exact: true });
  await expect(centre.getByTestId(`player-tile-${jack.id}`)).toContainText(/^\d*C\s*Jack S/);
  await expect(back.getByTestId(`player-tile-${noah.id}`)).toContainText(/^\d*CHB\s*Noah/);
  await expect.poll(async () => (await positionSwapsOf(admin, game.id)).length, { timeout: 15_000 }).toBe(3);

  // A reload draws the change from the log.
  await page.reload();
  await waitForHydration(page);
  await expect(centre.getByTestId(`player-tile-${jack.id}`)).toContainText(/^\d*C\s*Jack S/, { timeout: 15_000 });
  await expect(back.getByTestId(`player-tile-${noah.id}`)).toContainText(/^\d*CHB\s*Noah/);
  await expect(tile(tom)).toContainText(/^\d*FB/);
  // It wasn't a sub: nobody went to the bench.
  await expect(page.getByRole("group", { name: "Bench", exact: true }).locator('[data-testid^="player-tile-"]')).toHaveCount(7);
});

test("a field kid and a bench kid is still a sub: the bench kid takes the position", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, kids } = await bigGame(admin, { ageGroup: "U16_boys", onField: 18, bench: 7, perLine: [6, 6, 6], q1SecsAgo: 60 });
  const jack = byName(kids, "Jack Smith");
  const leo = byName(kids, "Leo Park");
  await open(page, team.id, game.id);
  await page.getByTestId(`player-tile-${leo.id}`).click();
  await page.getByTestId(`player-tile-${jack.id}`).click();
  await expect(page.getByTestId("swap-toast")).toContainText("Jack S → Leo", { timeout: 3_000 });
  await expect(page.getByRole("group", { name: "Back", exact: true }).getByTestId(`player-tile-${leo.id}`)).toContainText(/^\d*CHB\s*Leo/);
  await expect(page.getByRole("group", { name: "Bench", exact: true }).getByTestId(`player-tile-${jack.id}`)).toBeVisible();
});

test("the minimum: a kid at risk of missing half the game says Needs N′ more, and the info line counts them", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  // U16: 4 × 20 minutes, 50 %, 15-minute subs. Q2 is 12 minutes in (32
  // gone, 48 left). Six bench kids came on halfway through Q1; Hamish
  // sat until Q2 11:00 and has played a minute: he needs 39 of the 48
  // left, so he can't wait out another sub.
  const QMS = 20 * 60_000;
  const { team, game, kids, lineup } = await bigGame(admin, {
    ageGroup: "U16_boys",
    onField: 18,
    bench: 7,
    perLine: [6, 6, 6],
    q1SecsAgo: 12 * 60 + 300,
    subInterval: 900,
    extra: (k) => {
      const ids = k.map((x) => x.id);
      const fwd = ids.slice(0, 6), mid = ids.slice(6, 12), back = ids.slice(12, 18), bench = ids.slice(18);
      const offs = [fwd[0], fwd[1], mid[0], mid[1], back[0], back[1]];
      const zones = ["fwd", "fwd", "mid", "mid", "back", "back"];
      return [
        ...offs.map((off, n) => ({
          type: "swap",
          player_id: bench[n],
          metadata: { off_player_id: off, on_player_id: bench[n], zone: zones[n], quarter: 1, elapsed_ms: QMS / 2 },
          created_at: at(12 * 60 + 290 - n),
        })),
        { type: "quarter_end", metadata: { quarter: 1, elapsed_ms: QMS }, created_at: at(12 * 60 + 100) },
        { type: "quarter_start", metadata: { quarter: 2 }, created_at: at(12 * 60) },
        // Hamish on for Henry at Q2 11:00.
        {
          type: "swap",
          player_id: bench[6],
          metadata: { off_player_id: back[5], on_player_id: bench[6], zone: "back", quarter: 2, elapsed_ms: 11 * 60_000, manual: true },
          created_at: at(60),
        },
      ];
    },
  });
  void lineup;
  const hamish = byName(kids, "Hamish Bray");
  await open(page, team.id, game.id, 2);
  const hamishTile = page.getByTestId(`player-tile-${hamish.id}`);
  await expect(hamishTile).toContainText(/Needs 39′ more/);
  await expect(hamishTile).toHaveAttribute("aria-label", /under 50% of the game/);
  // In Henry's position, on the field.
  await expect(page.getByRole("group", { name: "Back", exact: true }).getByTestId(`player-tile-${hamish.id}`)).toContainText(/^\d*RBP/);
  // Only him: everyone else has time.
  await expect(page.getByText(/Needs \d+′ more/)).toHaveCount(1);
  await expect(page.getByTestId("info-line")).toContainText("1 under 50%");
  // His kid bar: % of the game against the minimum.
  await hamishTile.click();
  await expect(page.getByTestId("kid-bar")).toContainText(/% of game · min 50%/);
});

test("the minimum: nobody is flagged at the first bounce", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game } = await bigGame(admin, { ageGroup: "U16_boys", onField: 18, bench: 7, perLine: [6, 6, 6], q1SecsAgo: 20 });
  await open(page, team.id, game.id);
  // The kids' words are up (the bench is in the next sub).
  await expect(page.getByText(/^On next/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Needs \d+′ more/)).toHaveCount(0);
  await expect(page.getByTestId("info-line")).not.toContainText("under 50%");
});

test("a position change on the game-day link shows on the coach's phone without a reload", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game, kids } = await bigGame(admin, { ageGroup: "U16_boys", onField: 18, bench: 7, perLine: [6, 6, 6], q1SecsAgo: 60 });
  const jack = byName(kids, "Jack Smith");
  const tom = byName(kids, "Tom Lane");
  await open(page, team.id, game.id);
  await expect(page.getByTestId(`player-tile-${jack.id}`)).toContainText(/^\d*CHB/);

  // A parent running the game from the share link (signed out).
  const context = await browser.newContext({ storageState: undefined, viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
  const runner = await context.newPage();
  try {
    await runner.goto(`/run/${game.share_token}`);
    await waitForHydration(runner);
    const rTile = (k: Kid) => runner.getByTestId(`player-tile-${k.id}`);
    await expect(rTile(jack)).toContainText(/^\d*CHB/, { timeout: 15_000 });
    await rTile(jack).click();
    await rTile(tom).click();
    await expect(runner.getByTestId("swap-toast")).toContainText("Jack S to FB · Tom to CHB · position change logged", { timeout: 3_000 });
    await expect.poll(async () => (await positionSwapsOf(admin, game.id)).length, { timeout: 15_000 }).toBe(1);
    // The coach's phone takes it when its sync brings the event.
    await expect(page.getByTestId(`player-tile-${jack.id}`)).toContainText(/^\d*FB/, { timeout: 20_000 });
    await expect(page.getByTestId(`player-tile-${tom.id}`)).toContainText(/^\d*CHB/);
  } finally {
    await context.close();
  }
});
