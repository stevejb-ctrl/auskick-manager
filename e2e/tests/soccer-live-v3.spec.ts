// ─── The soccer family on the live v3 shell (Phase 9) ──────────────
// Football, futsal and hockey run on LiveShell, as AFL, netball and
// rugby do:
//
//   - Ready on the picker sets the lineup only; the live screen opens
//     before the whistle with Start H1 on the bar, ⋯ → Edit lineup takes
//     the picker back, and only "Start H1 now" starts the half.
//   - The kids say their part in the next sub ("Off next", "On next →
//     DEF") with the pair's number on both; the keeper wears a GK flag.
//     The info line says when, and opens the pairs.
//   - A kid tapped opens their kid bar (+ Goal, Injured, More).
//   - The whistle waits while the who-scored sheet is open (a goal on
//     the whistle isn't lost), but not for a kid left picked: it puts
//     them down and the break opens.
//
// Covers: src/components/soccer/SoccerLiveGame.tsx, SoccerScoreBug.tsx,
// SoccerLineupPicker.tsx (Ready).

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { coachId } from "../helpers/people";
import { waitForHydration } from "../helpers/navigation";
import { readySoccer } from "../helpers/kickoff";
import { openGameMenu, openPairs } from "../helpers/liveShell";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

async function quiet(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("soccer-walkthrough-seen", "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

/** Football U9 (7 a side: keeper, 2-3-1) with 3 on the bench, `secsIn` into H1 of `periodSecs`. */
async function soccerGame(opts: { secsIn: number; subInterval?: number; periodSecs?: number }) {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U9", name: `SocV3 ${Date.now() % 100000}-${Math.random().toString(36).slice(2, 5)}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  await admin
    .from("games")
    .update({
      status: "in_progress",
      sub_interval_seconds: opts.subInterval ?? 600,
      ...(opts.periodSecs ? { quarter_length_seconds: opts.periodSecs } : {}),
    })
    .eq("id", game.id);
  const ids = players.map((p) => p.id);
  const lineup = { keeper: ids[0], lines: { def: ids.slice(1, 3), mid: ids.slice(3, 6), att: ids.slice(6, 7), field: [] }, bench: ids.slice(7) };
  const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "soccer" }, created_at: at(opts.secsIn + 1) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "soccer" }, created_at: at(opts.secsIn) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed: ${error.message}`);
  const count = async (type: string) =>
    ((await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", type)).data ?? []).length;
  return { url: `/teams/${team.id}/games/${game.id}/live`, ids, lineup, count };
}

test("Ready sets the lineup only; ⋯ → Edit lineup takes it back; Start H1 now starts the half", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U9", name: `SocReady ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kookas" });
  await admin.from("game_availability").insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));
  const count = async (type: string) =>
    ((await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", type)).data ?? []).length;

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /under 9 starting lineup/i })).toBeVisible({ timeout: 15_000 });
  await readySoccer(page);
  await expect.poll(() => count("lineup_set")).toBe(1);
  expect(await count("quarter_start")).toBe(0);
  // The first-visit tour is offered over Start H1.
  await expect(page.getByRole("button", { name: "Show me" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^start h1$/i })).toBeVisible();

  // ⋯ → Edit lineup: back to the picker, the lineup taken back.
  const menu = await openGameMenu(page);
  await menu.getByRole("button", { name: /^edit lineup/i }).click();
  await expect(page.getByRole("heading", { name: /under 9 starting lineup/i })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => count("lineup_set")).toBe(0);

  // Ready again, then the bar's Start H1 and "Start H1 now".
  await readySoccer(page);
  await page.getByRole("button", { name: /^start h1$/i }).click();
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^clock — h1, running/i })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => count("quarter_start")).toBe(1);
});

test("the kids say their part in the next sub; the keeper wears GK; a tap opens the kid bar", async ({ page }) => {
  await quiet(page);
  // Two minutes in, subs every 5: two bench kids on next.
  const { url, ids, lineup } = await soccerGame({ secsIn: 120, subInterval: 300 });
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running/i })).toBeVisible({ timeout: 15_000 });

  const field = page.getByRole("region", { name: "On field" });
  await expect(field.getByRole("group", { name: "Keeper" }).getByTestId(`player-tile-${ids[0]}`).getByTestId("kid-flag")).toHaveText("GK");
  // The keeper is never paired off.
  await expect(page.getByTestId(`player-tile-${ids[0]}`).getByTestId("pair-badge")).toHaveCount(0);
  // The info line counts down, and each bench kid on next says where.
  await expect(page.getByTestId("info-line")).toContainText(/next sub \d+:\d{2}/i);
  const onNext = page.getByRole("group", { name: "Bench", exact: true }).getByText(/^on next → (def|mid|att)$/i);
  await expect(onNext.first()).toBeVisible();
  const offNext = field.getByText(/^off next$/i);
  expect(await offNext.count()).toBe(await onNext.count());
  // The pairs sheet has them.
  const sheet = await openPairs(page);
  await expect(sheet.locator("li")).toHaveCount(await onNext.count());
  await sheet.getByRole("button", { name: "Close" }).click();

  // A tap: the kid bar, with + Goal, Injured and More.
  await page.getByTestId(`player-tile-${lineup.lines.att[0]}`).click();
  const bar = page.getByTestId("kid-bar");
  await expect(bar).toBeVisible();
  for (const name of [/^\+ goal$/i, /injured/i, /^more$/i]) await expect(bar.getByRole("button", { name })).toBeVisible();
  await expect(page.getByTestId("dock-swap-hint")).toContainText(/tap another kid to swap/i);
});

test("the whistle waits for the who-scored sheet, not for a kid left picked", async ({ page }) => {
  test.setTimeout(120_000);
  await quiet(page);
  // A one-minute half, 40 s gone.
  const { url, count } = await soccerGame({ secsIn: 40, periodSecs: 60 });
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running/i })).toBeVisible({ timeout: 15_000 });

  // The who-scored sheet open over the whistle: the half waits for it.
  await page.getByRole("button", { name: /^add goal, socv3/i }).click();
  const sheet = page.getByRole("dialog", { name: "Who scored?" });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(25_000);
  expect(await count("quarter_end")).toBe(0);
  await sheet.getByRole("button", { name: /not sure who/i }).click();
  await expect.poll(() => count("goal")).toBe(1);
  // Then the whistle goes: the break.
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => count("quarter_end")).toBe(1);
});

test("a kid left tapped doesn't hold the whistle: it puts them down and the break opens", async ({ page }) => {
  test.setTimeout(90_000);
  await quiet(page);
  const { url, lineup } = await soccerGame({ secsIn: 48, periodSecs: 60 });
  await page.goto(url);
  await waitForHydration(page);
  await page.getByTestId(`player-tile-${lineup.lines.mid[0]}`).click({ timeout: 15_000 });
  await expect(page.getByTestId("kid-bar")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("kid-bar")).toHaveCount(0);
});
