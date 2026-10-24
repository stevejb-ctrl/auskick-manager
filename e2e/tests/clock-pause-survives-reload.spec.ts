// A clock pause survives a reload, in every sport (round-2 usability
// test, 24 Oct 2026, P1).
//
// The live clock rebuilds from the period's quarter_start time on a
// reload, and a pause lived only on the phone. So reloading during a
// stoppage counted the paused seconds as play: AFL's clock came back
// running with the paused minute credited to every kid on the field, and
// netball's, paused at 6:29 of Q1, ran on past the hooter and ended the
// quarter with everyone on 10:00. A pause and a resume are now game
// events (clock_pause), so a reload, and a second phone, rebuild the
// paused clock from them.
//
// Per sport:
//   - pause from the clock menu, reload: still paused at the paused time,
//     the kids' minutes held; a second phone shows the same; resume and
//     reload: the stoppage stays banked;
//   - a game paused at 6:29 long ago (the phone was away 20 minutes):
//     the page opens paused at 6:29, everyone on 6:29, and nothing ends
//     the period.

import { test, expect, type Browser, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

type Sport = "afl" | "netball" | "soccer" | "basketball";

interface SportCase {
  sport: Sport;
  ageGroup: string;
  /** Players to make: everyone in the lineup below plus a bench. */
  count: number;
  onFieldSize: number;
  /** The sport's lineup_set shape, from the squad's ids. ids[1] is on the field. */
  lineup: (ids: string[]) => Record<string, unknown>;
}

const CASES: SportCase[] = [
  {
    sport: "afl",
    ageGroup: "U10",
    count: 14,
    onFieldSize: 12,
    lineup: (ids) => ({
      back: ids.slice(0, 4),
      hback: [],
      mid: ids.slice(4, 8),
      hfwd: [],
      fwd: ids.slice(8, 12),
      bench: ids.slice(12),
    }),
  },
  {
    sport: "netball",
    ageGroup: "go",
    count: 9,
    onFieldSize: 7,
    lineup: (ids) => ({
      positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])),
      bench: ids.slice(7),
    }),
  },
  {
    sport: "soccer",
    ageGroup: "U8",
    count: 8,
    onFieldSize: 7,
    lineup: (ids) => ({
      keeper: ids[0],
      lines: { def: [ids[1], ids[2]], mid: [ids[3], ids[4], ids[5]], att: [ids[6]], field: [] },
      bench: ids.slice(7),
    }),
  },
  {
    sport: "basketball",
    ageGroup: "U12",
    count: 7,
    onFieldSize: 5,
    lineup: (ids) => ({ lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) }),
  },
];

/** A 10:00 period, so the hooter is known. */
const PERIOD_SECONDS = 600;
const MIN = 60_000;

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/**
 * A game of `c.sport` in its first period, kicked off `startedMsAgo`
 * ago at real speed, plus any `extra` events (as clock_pause rows).
 */
async function gameInFirstPeriod(
  admin: SupabaseClient,
  c: SportCase,
  startedMsAgo: number,
  extra: (kickoffMs: number) => { type: string; metadata: Record<string, unknown>; created_at: string }[] = () => [],
) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, {
    ownerId,
    sport: c.sport,
    ageGroup: c.ageGroup,
    name: `Pause-Reload-${c.sport}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: c.count, ageGroup: c.ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const kickoffMs = Date.now() - startedMsAgo;
  const sportTag = c.sport === "afl" || c.sport === "netball" ? {} : { sport: c.sport };
  const at = (ms: number) => new Date(ms).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup: c.lineup(players.map((p) => p.id)), ...sportTag }, created_at: at(kickoffMs - 1_000) },
      { type: "quarter_start", metadata: { quarter: 1, ...sportTag }, created_at: at(kickoffMs) },
      ...extra(kickoffMs),
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed events: ${error.message}`);
  // No sub-due prompt over the field while the test runs: the longest
  // interval the games table takes.
  await admin
    .from("games")
    .update({
      status: "in_progress",
      on_field_size: c.onFieldSize,
      clock_multiplier: 1,
      sub_interval_seconds: 900,
      quarter_length_seconds: PERIOD_SECONDS,
    })
    .eq("id", game.id);
  return { team, game, kid: players[1] };
}

async function skipTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen", "rl-walkthrough-seen"]) {
        localStorage.setItem(k, "1");
      }
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

const clockButton = (page: Page) => page.getByRole("button", { name: /^clock — /i }).first();
const runningClock = (page: Page) => page.getByRole("button", { name: /^clock — \w+, running$/i }).first();
const pausedClock = (page: Page) => page.getByRole("button", { name: /^clock — \w+, paused$/i }).first();

/** The clock pill's readout (m:ss) in seconds: its own element, as the pill's text runs the period into it. */
async function clockSeconds(page: Page): Promise<number> {
  const text = await clockButton(page).getByText(/^\s*\d+:\d{2}\s*$/).first().textContent();
  return mmss(text);
}

/** What a kid's tile says they've played, in seconds. */
async function kidSeconds(page: Page, sport: Sport, kid: { id: string; full_name: string }): Promise<number> {
  const tile =
    sport === "netball"
      ? page.getByRole("button", { name: new RegExp(`^[^,]+, ${kid.full_name}\\b`) }).first()
      : page.getByTestId(`player-tile-${kid.id}`).first();
  return mmss(await tile.getByText(/^\s*\d+:\d{2}\s*$/).first().textContent());
}

function mmss(text: string | null): number {
  const m = (text ?? "").match(/(\d+):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

async function openOnAnotherPhone(browser: Browser, url: string) {
  const context = await browser.newContext({ storageState: "playwright/.auth/super-admin.json" });
  const page = await context.newPage();
  await skipTours(page);
  await page.goto(url);
  return { page, close: () => context.close() };
}

for (const c of CASES) {
  test(`${c.sport}: a paused clock stays paused across a reload, minutes and all`, async ({ page, browser }) => {
    test.setTimeout(150_000);
    const admin = createAdminClient();
    const { team, game, kid } = await gameInFirstPeriod(admin, c, 3_000);
    const url = `/teams/${team.id}/games/${game.id}/live`;
    await skipTours(page);
    await page.goto(url);

    const clockMenu = page.getByRole("dialog", { name: /clock$/i });
    await expect(runningClock(page)).toBeVisible({ timeout: 30_000 });
    // The clock ticks on the client first.
    const firstRead = await clockSeconds(page);
    await expect.poll(() => clockSeconds(page), { timeout: 8_000 }).not.toBe(firstRead);

    // Pause from the clock menu.
    await runningClock(page).click();
    await clockMenu.getByRole("button", { name: /^pause clock$/i }).click();
    await expect(pausedClock(page)).toBeVisible();
    const atPause = await clockSeconds(page);
    const kidAtPause = await kidSeconds(page, c.sport, kid);
    expect(atPause).not.toBeNaN();
    expect(kidAtPause).toBeGreaterThan(0);
    // Saved before the reload (the write queue sends it at once).
    await expect
      .poll(
        async () =>
          (await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "clock_pause")).data?.length ?? 0,
        { timeout: 15_000 },
      )
      .toBe(1);

    // A stoppage, then the phone reloads. Before the fix the clock came
    // back running, on by the stoppage, and the kid was credited it.
    await page.waitForTimeout(4_000);
    await page.reload();
    await expect(pausedClock(page)).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => clockSeconds(page), { timeout: 5_000 }).toBe(atPause);
    await page.waitForTimeout(1_500);
    expect(await clockSeconds(page)).toBe(atPause);
    expect(await kidSeconds(page, c.sport, kid)).toBe(kidAtPause);

    // Another phone on the same game sees the same pause.
    const other = await openOnAnotherPhone(browser, url);
    await expect(pausedClock(other.page)).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => clockSeconds(other.page), { timeout: 5_000 }).toBe(atPause);
    await other.close();

    // Resume: the clock carries on from the pause.
    await pausedClock(page).click();
    await clockMenu.getByRole("button", { name: /^resume clock$/i }).click();
    const resumedAt = Date.now();
    await expect(runningClock(page)).toBeVisible();
    await expect
      .poll(
        async () =>
          (await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "clock_pause")).data?.length ?? 0,
        { timeout: 15_000 },
      )
      .toBe(2);

    // Reload while it's running: the stoppage stays banked, so the clock
    // has only moved by the time since the resume (plus a tick).
    await page.waitForTimeout(2_000);
    await page.reload();
    await expect(runningClock(page)).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const moved = Math.abs(atPause - (await clockSeconds(page)));
          const sinceResume = (Date.now() - resumedAt) / 1000;
          return moved >= 1 && moved <= Math.ceil(sinceResume) + 1;
        },
        { timeout: 8_000 },
      )
      .toBe(true);
  });

  test(`${c.sport}: a long stoppage, reloaded, stays at the pause and doesn't end the period`, async ({ page }) => {
    test.setTimeout(90_000);
    const admin = createAdminClient();
    // Kicked off 20 minutes ago and paused at 6:29: the wall clock is
    // well past the 10:00 hooter.
    const pausedAt = 6 * MIN + 29_000;
    const { team, game, kid } = await gameInFirstPeriod(admin, c, 20 * MIN, (kickoffMs) => [
      {
        type: "clock_pause",
        metadata: { quarter: 1, paused: true, elapsed_ms: pausedAt, at_ms: kickoffMs + pausedAt },
        created_at: new Date(kickoffMs + pausedAt).toISOString(),
      },
    ]);
    await skipTours(page);
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);

    await expect(pausedClock(page)).toBeVisible({ timeout: 30_000 });
    // The pill counts down (3:31 left) or up (6:29 played), by sport.
    await expect
      .poll(async () => [PERIOD_SECONDS - 389, 389].includes(await clockSeconds(page)), { timeout: 5_000 })
      .toBe(true);
    expect(await kidSeconds(page, c.sport, kid)).toBe(389);
    // Nothing ends the period while it's paused.
    await page.waitForTimeout(3_000);
    await expect(pausedClock(page)).toBeVisible();
    const { data: ends } = await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "quarter_end");
    expect(ends ?? []).toHaveLength(0);
  });
}
