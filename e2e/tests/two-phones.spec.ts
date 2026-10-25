// Two phones on one game (UX round 2, 24 Oct 2026): the coach on the
// live page and a parent on the game-day link (/run/<token>), at the
// same time, each in its own browser context.
//
//   - The phones stay in step: one phone's goal, the other's quarter
//     start, show on the other phone without a reload (LiveSync).
//   - A phone that's behind can't write a second kickoff or break: its
//     Start is refused ("Another phone already started Q1") and it shows
//     the game as it stands.
//   - Both phones tapping Start in the same instant start the period
//     once: the database refuses the second (migration 0075).
//   - Undo on one phone takes back the score its strip names, never the
//     other phone's later one.
//
// A phone is made to fall behind by blocking its sync checks
// (/run/<token>/sync), as a phone that hasn't looked yet would be.
//
// Covers: src/components/live/LiveSync.tsx, src/lib/live/periodGuard.ts,
// src/lib/live/undoTarget.ts and every live/*-actions.ts that uses them.

import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { closeGameSettings, liveWritesSaved, startFromBreak } from "../helpers/break";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { aflPositionModel, getAgeGroupConfig } from "../../src/lib/sports";
import type { Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

const NB_KEYS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;
const OPPONENT = "Kew Kestrels";

type Admin = ReturnType<typeof createAdminClient>;

async function ownerIdOf(admin: Admin): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function netballGame(admin: Admin) {
  const ownerId = await ownerIdOf(admin);
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `R1-2P-NB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: OPPONENT });
  await admin
    .from("game_availability")
    .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const })));
  return { team, players, game, ownerId };
}

async function seedNetballQ1(admin: Admin, gameId: string, ownerId: string, ids: string[], opts: { ended?: boolean } = {}) {
  const lineup = { positions: Object.fromEntries(NB_KEYS.map((k, i) => [k, [ids[i]]])), bench: ids.slice(NB_KEYS.length) };
  const at = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const rows = [
    { game_id: gameId, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: at(120) },
    { game_id: gameId, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: at(120) },
    ...(opts.ended
      ? [{ game_id: gameId, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 600_000 }, created_by: ownerId, created_at: at(30) }]
      : []),
  ];
  await admin.from("game_events").insert(rows);
  await admin.from("games").update({ status: "in_progress" }).eq("id", gameId);
}

/** The parent's phone: signed out, on the game-day link. */
async function runnerPhone(browser: Browser, token: string, opts: { behind?: boolean } = {}): Promise<Page> {
  const context = await browser.newContext({ storageState: undefined });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  const runner = await context.newPage();
  // A phone that hasn't looked at the game since: its sync checks fail.
  if (opts.behind) await runner.route("**/run/*/sync", (route) => route.abort());
  await runner.goto(`/run/${token}`);
  return runner;
}

async function coachPhone(page: Page, teamId: string, gameId: string) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nb-walkthrough-seen", "1");
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
}

/** A side's total on the scorebug (every sport's has the team names). */
const score = (page: Page, side: "us" | "them") =>
  page.getByTestId("scorebug-team-name").nth(side === "us" ? 0 : 1).locator("xpath=following-sibling::p[1]");

async function events(admin: Admin, gameId: string, type: string) {
  const { data } = await admin
    .from("game_events")
    .select("id, type, player_id, metadata, idempotency_key, created_at")
    .eq("game_id", gameId)
    .eq("type", type)
    .order("created_at");
  return (data ?? []) as { id: string; player_id: string | null; metadata: Record<string, unknown> }[];
}

const SYNC = { timeout: 15_000 };

test("netball: each phone shows the other's goal without a reload", async ({ page, browser }) => {
  const admin = createAdminClient();
  const { team, players, game, ownerId } = await netballGame(admin);
  await seedNetballQ1(admin, game.id, ownerId, players.map((p) => p.id));

  await coachPhone(page, team.id, game.id);
  const runner = await runnerPhone(browser, game.share_token);
  await expect(score(page, "them")).toHaveText("0", { timeout: 15_000 });
  await expect(score(runner, "us")).toHaveText("0", { timeout: 15_000 });

  // The runner scores for the opposition: the coach's phone shows it.
  await runner.getByRole("button", { name: `Add goal, ${OPPONENT}` }).click();
  await expect(score(runner, "them")).toHaveText("1");
  await expect(score(page, "them")).toHaveText("1", SYNC);

  // The coach scores a GS goal: the runner's phone shows it.
  await page.getByRole("button", { name: new RegExp(`^Goal Shooter,\\s*${players[0].full_name}`, "i") }).click();
  await page.getByRole("button", { name: /^(\+\s*goal|record goal|confirm goal)$/i }).click();
  await expect(score(page, "us")).toHaveText("1");
  await expect(score(runner, "us")).toHaveText("1", SYNC);
  await runner.context().close();
});

test("netball: the runner's break gives way when the coach starts Q2", async ({ page, browser }) => {
  // The runner sat on the break with "Start Q2" after the coach had
  // already started it.
  const admin = createAdminClient();
  const { team, players, game, ownerId } = await netballGame(admin);
  await seedNetballQ1(admin, game.id, ownerId, players.map((p) => p.id), { ended: true });

  await coachPhone(page, team.id, game.id);
  const runner = await runnerPhone(browser, game.share_token);
  await expect(runner.getByRole("button", { name: /^start q2$/i })).toBeVisible({ timeout: 15_000 });

  await startFromBreak(page, /^start q2$/i);
  await expect.poll(async () => (await events(admin, game.id, "quarter_start")).length, SYNC).toBe(2);
  await expect(runner.getByRole("button", { name: /^start q2$/i })).toBeHidden(SYNC);
  await expect(runner.getByText(/^q2\b/i).first()).toBeVisible(SYNC);
  await runner.context().close();
});

test("netball: a phone that's behind can't kick off a second time", async ({ page, browser }) => {
  // Both phones on the lineup picker. The coach starts Q1; the runner's
  // still-open picker then taps Start Q1 too. It used to write a second
  // lineup and quarter start, overwriting the coach's lineup and
  // doubling every kid's minutes.
  const admin = createAdminClient();
  const { team, game } = await netballGame(admin);

  await coachPhone(page, team.id, game.id);
  const runner = await runnerPhone(browser, game.share_token, { behind: true });
  await expect(runner.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^start q1$/i }).click();
  await page.getByRole("button", { name: /^start q1 now$/i }).click();
  await expect.poll(async () => (await events(admin, game.id, "quarter_start")).length, SYNC).toBe(1);
  const coachLineup = (await events(admin, game.id, "lineup_set"))[0].metadata.lineup;

  await runner.getByRole("button", { name: /^start q1$/i }).click();
  await runner.getByRole("button", { name: /^start q1 now$/i }).click();
  await expect(runner.getByTestId("live-sync-notice")).toHaveText(/Another phone already started Q1\./, SYNC);
  // The runner's phone shows the game as it stands.
  await expect(runner.getByRole("button", { name: /^start q1$/i })).toBeHidden(SYNC);

  // One kickoff: the coach's lineup stands.
  expect(await events(admin, game.id, "lineup_set")).toHaveLength(1);
  expect(await events(admin, game.id, "quarter_start")).toHaveLength(1);
  expect((await events(admin, game.id, "lineup_set"))[0].metadata.lineup).toEqual(coachLineup);
  await runner.context().close();
});

test("netball: a phone that's behind can't start the next quarter a second time", async ({ page, browser }) => {
  const admin = createAdminClient();
  const { team, players, game, ownerId } = await netballGame(admin);
  await seedNetballQ1(admin, game.id, ownerId, players.map((p) => p.id), { ended: true });

  await coachPhone(page, team.id, game.id);
  const runner = await runnerPhone(browser, game.share_token, { behind: true });
  await expect(runner.getByRole("button", { name: /^start q2$/i })).toBeVisible({ timeout: 15_000 });

  await startFromBreak(page, /^start q2$/i);
  await expect.poll(async () => (await events(admin, game.id, "quarter_start")).length, SYNC).toBe(2);

  await startFromBreak(runner, /^start q2$/i);
  await expect(runner.getByTestId("live-sync-notice")).toHaveText(/Another phone already started Q2\./, SYNC);
  await expect(runner.getByRole("button", { name: /^start q2$/i })).toBeHidden(SYNC);
  expect(await events(admin, game.id, "quarter_start")).toHaveLength(2);
  expect(await events(admin, game.id, "period_break_swap")).toHaveLength(1);
  await runner.context().close();
});

// ─── Both phones tap Start in the same instant ───────────────
// The guard reads, then writes: two Starts ~100 ms apart both passed it.
// Migration 0075's unique indexes refuse the second in the database.

test("the database holds one start per period and one Finish per game", async () => {
  const admin = createAdminClient();
  const { players, game, ownerId } = await netballGame(admin);
  await seedNetballQ1(admin, game.id, ownerId, players.map((p) => p.id), { ended: true });

  const start = () =>
    admin.from("game_events").insert({ game_id: game.id, type: "quarter_start", metadata: { quarter: 2, sport: "netball" }, created_by: ownerId });
  const results = await Promise.all([start(), start()]);
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(results.find((r) => r.error)?.error).toMatchObject({ code: "23505", message: expect.stringContaining("game_events_one_start_per_period") });
  expect(await events(admin, game.id, "quarter_start")).toHaveLength(2);

  const finish = () => admin.from("game_events").insert({ game_id: game.id, type: "game_finalised", metadata: { quarter: 2 }, created_by: ownerId });
  const finishes = await Promise.all([finish(), finish()]);
  expect(finishes.filter((r) => !r.error)).toHaveLength(1);
  expect(await events(admin, game.id, "game_finalised")).toHaveLength(1);
});

test("netball: both phones tapping Start Q2 at once start it once", async ({ page, browser }) => {
  const admin = createAdminClient();
  const { team, players, game, ownerId } = await netballGame(admin);
  await seedNetballQ1(admin, game.id, ownerId, players.map((p) => p.id), { ended: true });

  await coachPhone(page, team.id, game.id);
  const runner = await runnerPhone(browser, game.share_token, { behind: true });
  // Both phones at the break, each with its confirm sheet open.
  const nowButtons: Locator[] = [];
  for (const phone of [page, runner]) {
    await closeGameSettings(phone);
    await phone.getByRole("button", { name: /^start q2$/i }).click({ timeout: 15_000 });
    const anyway = phone.getByRole("button", { name: "Start anyway" });
    const now = phone.getByRole("button", { name: /^start q2 now$/i });
    await expect(anyway.or(now)).toBeVisible();
    nowButtons.push((await anyway.isVisible()) ? anyway : now);
  }
  // Both tap in the same instant.
  await Promise.all(nowButtons.map((b) => b.click()));

  await expect.poll(async () => (await events(admin, game.id, "quarter_start")).length, SYNC).toBeGreaterThanOrEqual(2);
  await liveWritesSaved(page);
  await liveWritesSaved(runner);
  const starts = (await events(admin, game.id, "quarter_start")).filter((e) => e.metadata.quarter === 2);
  expect(starts).toHaveLength(1);
  // Both phones are in Q2, neither on its break.
  for (const phone of [page, runner]) {
    await expect(phone.getByRole("button", { name: /^start q2$/i })).toBeHidden(SYNC);
  }
  await runner.context().close();
});

test("netball: undo on the runner's phone takes back its own goal, not the coach's later one", async ({ page, browser }) => {
  const admin = createAdminClient();
  const { team, players, game, ownerId } = await netballGame(admin);
  await seedNetballQ1(admin, game.id, ownerId, players.map((p) => p.id));

  await coachPhone(page, team.id, game.id);
  const runner = await runnerPhone(browser, game.share_token);
  await expect(score(runner, "them")).toHaveText("0", { timeout: 15_000 });

  // The runner scores for the opposition; then the coach scores, later.
  await runner.getByRole("button", { name: `Add goal, ${OPPONENT}` }).click();
  await expect.poll(async () => (await events(admin, game.id, "opponent_goal")).length, SYNC).toBe(1);
  await page.getByRole("button", { name: new RegExp(`^Goal Shooter,\\s*${players[0].full_name}`, "i") }).click();
  await page.getByRole("button", { name: /^(\+\s*goal|record goal|confirm goal)$/i }).click();
  await expect.poll(async () => (await events(admin, game.id, "goal")).length, SYNC).toBe(1);

  // The runner's strip still names its opposition goal: Undo takes back that one.
  await expect(runner.getByTestId("undo-strip")).toContainText(OPPONENT);
  await runner.getByRole("button", { name: /^undo$/i }).click();
  await expect.poll(async () => (await events(admin, game.id, "score_undo")).length, SYNC).toBe(1);
  const [undo] = await events(admin, game.id, "score_undo");
  const [theirGoal] = await events(admin, game.id, "opponent_goal");
  expect(undo.metadata.target_event_id).toBe(theirGoal.id);

  // Both phones agree: the coach's goal stands, the opposition's is gone.
  for (const phone of [page, runner]) {
    await expect(score(phone, "us")).toHaveText("1", SYNC);
    await expect(score(phone, "them")).toHaveText("0", SYNC);
  }
  await runner.context().close();
});

test("AFL: the coach's phone shows the runner's goal without a reload", async ({ page, browser }) => {
  // AFL's screen keeps its own store; it now takes the other phone's
  // events when a refresh brings them.
  const admin = createAdminClient();
  const ownerId = await ownerIdOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl", name: `R1-2P-AFL-${Date.now()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: OPPONENT });
  const caps = zoneCapsFor(game.on_field_size, aflPositionModel(getAgeGroupConfig("afl", "U10")));
  const lineup: Lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  let cursor = 0;
  for (const z of ALL_ZONES) for (let i = 0; i < caps[z]; i++) lineup[z].push(players[cursor++].id);
  lineup.bench = players.slice(cursor).map((p) => p.id);
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await coachPhone(page, team.id, game.id);
  const runner = await runnerPhone(browser, game.share_token);
  // The opposition's goals·behinds tally (its column puts it before the total).
  await expect(score(page, "them")).toContainText("0·0", { timeout: 15_000 });

  await runner.getByRole("button", { name: `Add goal, ${OPPONENT}` }).click();
  await expect.poll(async () => (await events(admin, game.id, "opponent_goal")).length, SYNC).toBe(1);
  await expect(score(page, "them")).toContainText("1·0", SYNC);
  await runner.context().close();
});
