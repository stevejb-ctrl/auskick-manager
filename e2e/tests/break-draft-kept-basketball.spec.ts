// ─── Regression: a staged basketball break keeps each kid's position across a reload ───
//
// The break stages the next period's lineup in the live store's
// `breakDraft` slice, which kept only the lines and the bench. Under a
// position strategy each kid on court also holds a position (PG to C),
// so a draft restored after a reload (or the team page and back) came
// back with none: the tiles lost their PG / SG / … tags, and Start
// recorded the next period's lineup_set with no `slots`.
//
// Pre-fix this FAILS: after the reload the tiles carry no position, and
// the 2nd half's lineup_set has no slots.
//
// Covers:
//   - src/components/basketball/BasketballBreak.tsx (stages and restores slots)
//   - src/lib/live/breakDraft.ts + useStagedBreakDraft (carry them through)

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { pickBreakStrategy, startFromBreak } from "../helpers/break";

type Lineup = { lines: Record<string, string[]>; bench: string[]; slots?: Record<string, string> };

/** The persisted live store's staged break draft, as the page holds it. */
async function storedDraft(page: Page): Promise<{ groups: Record<string, string[]> } | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("siren-live-game-v1");
    return raw ? (JSON.parse(raw).state?.breakDraft ?? null) : null;
  });
}

test("basketball: positions staged at the break survive a reload, and Start records them", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;

  const team = await makeTeam(admin, {
    ownerId,
    sport: "basketball",
    ageGroup: "U12",
    name: `BBL-BRK-KEPT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // All five positions: every kid on court holds one of PG to C.
  await admin.from("team_playbooks").upsert({ team_id: team.id, strategy: "position-by-position" }, { onConflict: "team_id" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 7 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const k = players.map((p) => p.id);
  await admin
    .from("game_availability")
    .insert(k.map((id) => ({ game_id: game.id, player_id: id, status: "available" as const, updated_by: ownerId })));

  // The 1st half was played with each kid in a position; it ended a
  // couple of minutes ago.
  const lineup: Lineup = {
    lines: { guard: [k[0], k[1]], forward: [k[2], k[3], k[4]], court: [] },
    bench: [k[5], k[6]],
    slots: { [k[0]]: "pg", [k[1]]: "sg", [k[2]]: "sf", [k[3]]: "pf", [k[4]]: "c" },
  };
  const periodMs = 20 * 60_000;
  const start = Date.now() - periodMs - 120_000;
  const at = (ms: number) => new Date(start + ms).toISOString();
  const ev = (type: string, ms: number, metadata: Record<string, unknown>) => ({
    game_id: game.id,
    type,
    metadata: { ...metadata, sport: "basketball" },
    created_by: ownerId,
    created_at: at(ms),
  });
  await admin.from("game_events").insert([
    ev("lineup_set", 0, { lineup }),
    ev("quarter_start", 1000, { quarter: 1 }),
    ev("quarter_end", periodMs + 1000, { quarter: 1, elapsed_ms: periodMs }),
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  const tile = (id: string) => page.getByTestId(`player-tile-${id}`);
  const position = (id: string, label: string) => tile(id).getByText(label, { exact: true });
  const bench = page.getByRole("group", { name: "Bench", exact: true });
  // The footer's Start ("Start 2nd half", plus "1 rule" when one breaks).
  const start2nd = page.getByRole("button", { name: /^start 2nd half/i });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(start2nd).toBeVisible({ timeout: 15_000 });

  // Keep the 1st half's five, then make two swaps: the PG and the SF
  // trade places (positions go with them), and a bench kid comes on for
  // the C and takes C.
  await pickBreakStrategy(page, "Repeat");
  await tile(k[0]).click();
  await tile(k[2]).click();
  await tile(k[5]).click();
  await tile(k[4]).click();
  const expectStaged = async () => {
    await expect(position(k[0], "SF")).toBeVisible({ timeout: 10_000 });
    await expect(position(k[2], "PG")).toBeVisible();
    await expect(position(k[1], "SG")).toBeVisible();
    await expect(position(k[3], "PF")).toBeVisible();
    await expect(position(k[5], "C")).toBeVisible();
    await expect(bench.getByTestId(`player-tile-${k[4]}`)).toBeVisible();
  };
  await expectStaged();
  // The draft is saved before the reload.
  await expect.poll(async () => (await storedDraft(page))?.groups.forward ?? []).toContain(k[5]);

  await page.reload();
  await waitForHydration(page);
  await expect(start2nd).toBeVisible({ timeout: 15_000 });

  // The swaps are still staged, each kid still in their position.
  await expectStaged();
  await expect(page.getByRole("radio", { name: "Repeat" })).toBeChecked();

  // Start the 2nd half: the lineup it records carries the positions.
  await startFromBreak(page, /^start 2nd half/i);
  let second: Lineup | null = null;
  await expect
    .poll(
      async () => {
        const { data: sets } = await admin
          .from("game_events")
          .select("metadata, created_at")
          .eq("game_id", game.id)
          .eq("type", "lineup_set")
          .order("created_at");
        second = sets && sets.length > 1 ? (sets[sets.length - 1].metadata as { lineup: Lineup }).lineup : null;
        return second !== null;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  expect(second!.lines.guard).toEqual([k[2], k[1]]);
  expect(second!.lines.forward).toEqual([k[0], k[3], k[5]]);
  expect(second!.slots).toEqual({ [k[2]]: "pg", [k[1]]: "sg", [k[0]]: "sf", [k[3]]: "pf", [k[5]]: "c" });
});
