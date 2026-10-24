// The sub clock, the same in every sport, across a reload (round-2
// usability test, 24 Oct 2026).
//
// - AFL (P1): a reload right after subbing brought "Sub due — NOW"
//   back. The countdown was re-seeded on mount from the clock, floored
//   onto the interval grid, not from the last sub. It now comes from the
//   events: the last planned swap.
// - AFL: making 1 of 2 due swaps restarted the countdown and dropped the
//   other pair. The rest of a due batch stays due, as soccer's does.
// - Soccer: a hand swap restarted the countdown (3:15 -> 3:58). AFL's
//   rule now: a hand swap doesn't restart it.
// - Touch's family: the Sub due card and OFF badges stayed up at the
//   hooter. No sub is due once the clock is out.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "league-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
});

type Sport = "afl" | "soccer" | "oztag";
type Row = { type: string; player_id?: string | null; metadata: Record<string, unknown> };

/**
 * A game of `sport` in its first period, kicked off `secondsIn` ago at
 * real speed, with subs every `subSeconds` and `extra` events after the
 * kickoff (stamped a second apart, ending now).
 */
async function liveGame(
  sport: Sport,
  opts: { ageGroup: string; count: number; secondsIn: number; subSeconds: number; periodSeconds?: number },
  lineup: (ids: string[]) => Record<string, unknown>,
  extra: (ids: string[]) => Row[] = () => [],
) {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    sport,
    ageGroup: opts.ageGroup,
    name: `Sub-Clock-${sport}-${Date.now() % 100000}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count, ageGroup: opts.ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const { error: gameErr } = await admin
    .from("games")
    .update({
      status: "in_progress",
      clock_multiplier: 1,
      sub_interval_seconds: opts.subSeconds,
      ...(opts.periodSeconds ? { quarter_length_seconds: opts.periodSeconds } : {}),
    })
    .eq("id", game.id);
  if (gameErr) throw new Error(gameErr.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const ids = players.map((p) => p.id);
  const sportTag = sport === "afl" ? {} : { sport };
  const kickoff = Date.now() - opts.secondsIn * 1000;
  const later = extra(ids);
  const rows: (Row & { created_at: string })[] = [
    { type: "lineup_set", metadata: { lineup: lineup(ids) }, created_at: new Date(kickoff - 1000).toISOString() },
    { type: "quarter_start", metadata: { quarter: 1 }, created_at: new Date(kickoff).toISOString() },
    ...later.map((r, i) => ({ ...r, created_at: new Date(Date.now() - (later.length - i) * 1000).toISOString() })),
  ];
  const { error } = await admin.from("game_events").insert(
    rows.map((r) => ({ ...r, metadata: { ...r.metadata, ...sportTag }, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed events: ${error.message}`);
  return { admin, team, game, ids };
}

const aflLineup = (ids: string[]) => ({
  back: ids.slice(0, 4),
  hback: [],
  mid: ids.slice(4, 8),
  hfwd: [],
  fwd: ids.slice(8, 12),
  bench: ids.slice(12),
});

/**
 * The sub card: its countdown (m:ss, or NOW) and its heading. Collapsed,
 * the header is the toggle button; open and due, the card is the alert.
 */
const subCard = (page: Page) =>
  page
    .getByRole("alert")
    .filter({ hasText: /Sub due — \d+ swaps?/ })
    .or(page.locator("button[aria-expanded]").filter({ hasText: /(Sub due|Suggested) — \d+ swaps?/ }))
    .first();

async function countdownSeconds(page: Page): Promise<number> {
  const text = (await subCard(page).getByText(/^\s*(\d+:\d{2}|NOW)\s*$/).first().textContent()) ?? "";
  if (/NOW/.test(text)) return 0;
  const m = text.match(/(\d+):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

test("AFL: a reload just after subbing counts down from the sub, not from the clock", async ({ page }) => {
  test.setTimeout(90_000);
  // 3:40 into Q1 with 2-minute subs: the 2:00 subs were made late, at
  // 3:30. The next is due at 5:30. A reload used to re-seed the countdown
  // on the 2:00 grid, so it said 4:00 (or NOW from a stale clock).
  const { team, game } = await liveGame(
    "afl",
    { ageGroup: "U10", count: 16, secondsIn: 220, subSeconds: 120 },
    aflLineup,
    (ids) => [
      { type: "swap", player_id: ids[12], metadata: { off_player_id: ids[0], on_player_id: ids[12], zone: "back", quarter: 1, elapsed_ms: 210_000 } },
      { type: "swap", player_id: ids[13], metadata: { off_player_id: ids[4], on_player_id: ids[13], zone: "mid", quarter: 1, elapsed_ms: 210_000 } },
    ],
  );
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(subCard(page)).toBeVisible({ timeout: 30_000 });
  await expect(subCard(page)).toContainText(/Suggested — /);
  // About 1:50 left (load time aside); the grid would say under 0:20.
  await expect.poll(() => countdownSeconds(page), { timeout: 10_000 }).toBeGreaterThan(75);
  await expect(page.getByText(/sub due/i)).toHaveCount(0);
});

test("AFL: making one of two due swaps keeps the other due", async ({ page }) => {
  test.setTimeout(90_000);
  // 1:10 in with 1-minute subs: the first subs are due.
  const { team, game } = await liveGame("afl", { ageGroup: "U10", count: 16, secondsIn: 70, subSeconds: 60 }, aflLineup);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const card = subCard(page);
  await expect(card).toContainText(/Sub due — \d+ swaps/, { timeout: 30_000 });
  const before = Number(((await card.textContent()) ?? "").match(/Sub due — (\d+) swaps/)![1]);
  expect(before).toBeGreaterThan(1);
  // The card is open when due; make the first pair only.
  await page.getByRole("button", { name: "Make swap" }).first().click();
  // Still due, with the rest of the batch. Before the fix: "Suggested —
  // 1 swap" on a fresh countdown, and a different pair.
  const left = before - 1;
  await expect(card).toContainText(new RegExp(`Sub due — ${left} swaps?`), { timeout: 10_000 });
  await page.waitForTimeout(2_000);
  await expect(card).toContainText(new RegExp(`Sub due — ${left} swaps?`));
  // And a reload keeps it so (the swap says how many of its batch are left).
  await page.reload();
  await waitForHydration(page);
  await expect(subCard(page)).toContainText(new RegExp(`Sub due — ${left} swaps?`), { timeout: 30_000 });
});

test("Soccer: a hand swap doesn't restart the sub countdown", async ({ page }) => {
  test.setTimeout(90_000);
  // 1:00 in with 4-minute subs: 3:00 to go.
  const { admin, team, game, ids } = await liveGame(
    "soccer",
    { ageGroup: "U9", count: 9, secondsIn: 60, subSeconds: 240 },
    (k) => ({ keeper: k[0], lines: { def: k.slice(1, 3), mid: k.slice(3, 6), att: k.slice(6, 7), field: [] }, bench: k.slice(7) }),
  );
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(subCard(page)).toBeVisible({ timeout: 30_000 });
  const before = await countdownSeconds(page);
  expect(before).toBeLessThanOrEqual(180);

  // Tap a midfielder, then a bench kid, and confirm.
  await page.getByTestId(`player-tile-${ids[3]}`).click();
  await page.getByTestId(`player-tile-${ids[7]}`).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect
    .poll(async () => (await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap")).data ?? [], {
      timeout: 15_000,
    })
    .toHaveLength(1);
  const { data: swaps } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "swap");
  expect((swaps?.[0]?.metadata as { manual?: boolean }).manual).toBe(true);
  // Still counting toward 4:00, not a fresh 4:00 from the hand swap.
  await expect(subCard(page)).toBeVisible();
  expect(await countdownSeconds(page)).toBeLessThanOrEqual(before);
  await page.reload();
  await waitForHydration(page);
  await expect(subCard(page)).toBeVisible({ timeout: 30_000 });
  expect(await countdownSeconds(page)).toBeLessThan(200);
});

test("Oztag: no Sub due card or OFF badges once the clock is out", async ({ page }) => {
  test.setTimeout(90_000);
  // 10:40 into a 10:00 half with 2-minute subs: the phone waits at 0:00
  // for the whistle. The subs due at 2:00 were never made.
  const { team, game } = await liveGame(
    "oztag",
    { ageGroup: "U10", count: 12, secondsIn: 640, subSeconds: 120, periodSeconds: 600 },
    (k) => ({ lines: { middle: k.slice(0, 2), link: k.slice(2, 6), wing: k.slice(6, 8), field: [] }, bench: k.slice(8) }),
  );
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — \w+, (half|full) time$/i })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  await expect(subCard(page)).toHaveCount(0);
  await expect(page.getByText(/sub due/i)).toHaveCount(0);
  await expect(page.getByLabel(/^Coming off next/)).toHaveCount(0);
});
