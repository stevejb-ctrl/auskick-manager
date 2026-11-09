// ─── The words under a kid (live v3, Phase 6) ───────────────
// AFL's live screen says what happens next under each kid, in plain
// words, and numbers the pairs on the kids themselves, so a coach reads
// the sub off the field without opening anything:
//
//   - before the sub: the kids coming off say "Off next", the bench kids
//     going on say "On next → FWD" (the line they go to);
//   - each pair's two kids carry the same numeral badge, visible
//     without a tap;
//   - when it's due: "Off now" / "On now → FWD", and the bar is "Make
//     all N swaps";
//   - tapping a kid opens their kid bar, with minutes and % of game.
//
// Covers: src/components/live/KidTile.tsx, KidBench.tsx, FieldLines.tsx,
// InfoLine.tsx, KidBar.tsx, lib/live/kidWords.ts, LiveGame.tsx.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { coachId } from "../helpers/people";
import { skipHints } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";
import { subDueAlert } from "../helpers/liveShell";
import { startFromBreak } from "../helpers/break";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

const SHORT: Record<string, string> = { Back: "BCK", Centre: "CEN", Forward: "FWD" };

/** AFL U10, 12 on and 3 on the bench, 30 s subs, `secondsIn` into Q1 (of `quarterSeconds`, else the age group's). */
async function aflSubGame(secondsIn: number, quarterSeconds?: number) {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `KIDWORDS ${Date.now() % 100000}-${Math.random().toString(36).slice(2, 6)}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup }, created_at: at(secondsIn + 1) },
      { type: "quarter_start", metadata: { quarter: 1 }, created_at: at(secondsIn) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(error.message);
  await admin
    .from("games")
    .update({
      status: "in_progress",
      sub_interval_seconds: 30,
      clock_multiplier: 1,
      ...(quarterSeconds ? { quarter_length_seconds: quarterSeconds } : {}),
    })
    .eq("id", game.id);
  return { url: `/teams/${team.id}/games/${game.id}/live`, ids };
}

async function open(page: Page, url: string) {
  await skipHints(page);
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — q1/i })).toBeVisible({ timeout: 15_000 });
}

type Kid = { badge: string; words: string; line: string | null; name: string };

/** Each kid with a pair badge: its number, its words, and its line (null on the bench). */
async function paired(page: Page): Promise<Kid[]> {
  const out: Kid[] = [];
  const read = async (scope: Locator, line: string | null) => {
    const tiles = scope.locator('[data-testid^="player-tile-"]');
    for (let i = 0; i < (await tiles.count()); i++) {
      const tile = tiles.nth(i);
      const badge = tile.getByTestId("pair-badge");
      if ((await badge.count()) === 0) continue;
      await expect(badge).toBeVisible();
      out.push({
        badge: (await badge.innerText()).trim(),
        words: (await tile.innerText()).split("\n").map((s) => s.trim()).filter(Boolean).at(-1) ?? "",
        line,
        name: (await tile.getAttribute("aria-label")) ?? "",
      });
    }
  };
  for (const line of ["Forward", "Centre", "Back"]) await read(page.getByRole("group", { name: line, exact: true }), line);
  await read(page.getByRole("group", { name: "Bench", exact: true }), null);
  return out;
}

function expectPairsMatch(kids: Kid[], off: RegExp, on: (to: string) => RegExp) {
  const field = kids.filter((k) => k.line);
  const bench = kids.filter((k) => !k.line);
  expect(bench.length, "every bench kid is in a pair").toBe(3);
  expect(field.map((k) => k.badge).sort()).toEqual(bench.map((k) => k.badge).sort());
  for (const b of bench) {
    const f = field.find((k) => k.badge === b.badge)!;
    expect(f.words, `${f.name}`).toMatch(off);
    // The bench kid goes on where their pair's field kid comes off.
    expect(b.words, `${b.name}`).toMatch(on(SHORT[f.line!]));
    // A screen reader hears it too, with the pair's number.
    expect(b.name).toMatch(new RegExp(`, On (next|now) to ${SHORT[f.line!]}, pair ${b.badge}`));
  }
}

test("before the sub: Off next / On next → line, the pairs' badges match and show without a tap", async ({ page }) => {
  const { url } = await aflSubGame(3);
  await open(page, url);
  await expect(page.getByTestId("info-line")).toContainText(/Next sub \d:\d\d · 3 swaps/);
  // Nothing tapped, nothing open.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("kid-bar")).toHaveCount(0);
  expectPairsMatch(await paired(page), /^Off next$/, (to) => new RegExp(`^On next → ${to}$`));
});

test("when due: Off now / On now → line, and the bar makes all the swaps", async ({ page }) => {
  test.setTimeout(90_000);
  const { url } = await aflSubGame(20);
  await open(page, url);
  await expect(subDueAlert(page)).toContainText("Sub due — 3 swaps", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Make all 3 swaps" })).toBeVisible();
  expectPairsMatch(await paired(page), /^Off now$/, (to) => new RegExp(`^On now → ${to}$`));
  // Badges go hi-vis when due: the same badge, still on every pair.
  const kids = await paired(page);
  expect(kids.filter((k) => k.line).length).toBe(3);
});

test("tapping a kid opens their kid bar with minutes and % of game", async ({ page }) => {
  const { url, ids } = await aflSubGame(40);
  await open(page, url);
  await page.getByTestId(`player-tile-${ids[4]}`).click();
  const bar = page.getByTestId("kid-bar");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(/Centre · \d+′ this game · \d+% of game/);
  await expect(bar.getByRole("button", { name: /^\+ goal$/i })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^injured$/i })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^more$/i })).toBeVisible();
  // The same kid again puts them down; so does Escape.
  await page.getByTestId(`player-tile-${ids[4]}`).click();
  await expect(bar).toHaveCount(0);
  await page.getByTestId(`player-tile-${ids[12]}`).click();
  await expect(bar).toContainText(/Bench · \d+′ this game · \d+% of game/);
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
});

// Regression (live v3, Phase 7): Phase 6 held the siren while a field
// kid's kid bar was open, so a coach who left a kid tapped never got the
// quarter-end sheet. Only the who-scored sheet holds it now, and the
// siren puts the kid down.
test("a kid left tapped doesn't hold the siren: it puts them down and the quarter ends", async ({ page }) => {
  test.setTimeout(90_000);
  const { url, ids } = await aflSubGame(48, 60);
  await open(page, url);
  await page.getByTestId(`player-tile-${ids[4]}`).click();
  await expect(page.getByTestId("kid-bar")).toBeVisible();
  await expect(page.getByRole("button", { name: /select team for q2/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("kid-bar")).toHaveCount(0);
});

// Stagehand, 9 Nov 2026 (whole-game-futsal): late in the last half, with
// no more subs before the siren, the bench kids still read "On after the
// break". There's no break after the last period: they say nothing then.
test("in the last quarter, with the subs done, the bench doesn't promise a break that isn't coming", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `KIDWORDS Q4 ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  // 5-minute quarters and a 10-minute sub interval: no sub falls inside a
  // quarter. Q1–Q3 played; Q3 at the break, Q4 under way.
  const events: { type: string; metadata: Record<string, unknown>; created_at: string }[] = [
    { type: "lineup_set", metadata: { lineup }, created_at: at(4000) },
  ];
  for (let q = 1; q <= 3; q++) {
    events.push({ type: "quarter_start", metadata: { quarter: q }, created_at: at(4000 - q * 600) });
    events.push({ type: "quarter_end", metadata: { quarter: q, elapsed_ms: 300_000 }, created_at: at(3700 - q * 600) });
  }
  const { error } = await admin.from("game_events").insert(events.map((e) => ({ ...e, game_id: game.id, created_by: ownerId })));
  if (error) throw new Error(error.message);
  await admin
    .from("games")
    .update({ status: "in_progress", sub_interval_seconds: 600, clock_multiplier: 1, quarter_length_seconds: 300 })
    .eq("id", game.id);

  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  // Start Q4 from the break, then read the bench.
  await startFromBreak(page, /^start q4/i);
  await expect(page.getByRole("button", { name: /^clock — q4/i })).toBeVisible({ timeout: 15_000 });
  const bench = page.getByRole("group", { name: "Bench", exact: true });
  await expect(bench.locator('[data-testid^="player-tile-"]')).toHaveCount(3);
  await expect(bench).not.toContainText(/after the break/i);
});

// Stagehand, 9 Nov 2026 (whole-game-hockey, and AFL the same): one pair
// of the planned sub made a minute early counted as the whole rotation.
// The sub clock restarted, the next sub fell past the siren, and the
// other pairs vanished. They stay planned, for the same time.
test("one pair made early leaves the rest of the planned sub on, at the same time", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `KIDWORDS EARLY ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  // 15-minute quarters, subs every 10, 9 minutes in: the sub is a minute away.
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup }, created_at: at(541) },
      { type: "quarter_start", metadata: { quarter: 1 }, created_at: at(540) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(error.message);
  await admin
    .from("games")
    .update({ status: "in_progress", sub_interval_seconds: 600, clock_multiplier: 1, quarter_length_seconds: 900 })
    .eq("id", game.id);

  await open(page, `/teams/${team.id}/games/${game.id}/live`);
  const info = page.getByTestId("info-line");
  await expect(info).toContainText(/next sub 0:\d\d · 3 swaps/i, { timeout: 15_000 });
  await info.click();
  await page.getByRole("dialog").getByRole("button", { name: /^swap .+ off, .+ on$/i }).first().click();
  await page.keyboard.press("Escape");
  await expect(info).toContainText(/next sub 0:\d\d · 2 swaps/i, { timeout: 15_000 });
  await expect(info).not.toContainText(/no more subs/i);
});
