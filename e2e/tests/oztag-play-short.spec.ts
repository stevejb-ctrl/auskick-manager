// ─── Oztag over the boys' cap: play one short ────────────────
// Round 2 usability, 24 Oct 2026 (Oztag P1): a hand sub put a 5th boy
// on (Swap anyway), then a girl was hurt and the only bench girl came on
// for her. The banner said the side could field one fewer under the
// rule, but the pinned strip said "nobody on the bench can fix it", the
// suggestions swapped boy for boy, and the long-press sheet couldn't
// take a kid off without a replacement.
//
// Now the strip's Fix takes the boy on longest off and the side plays
// the size the rule allows, and the sheet has "Take off, no
// replacement" for any kid on the field.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

interface TouchLineupMeta {
  lines: { middle: string[]; link: string[]; wing: string[]; field: string[] };
  bench: string[];
}

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/**
 * Oztag U10, mixed (at most 4 boys, at least 1 girl), 8 a side, three
 * minutes into H1: kickoff 4 boys and 4 girls; at 1:00 a 5th boy came
 * on for a girl; at 2:00 another girl was hurt and the girl who'd gone
 * off came back on for her. 5 boys and 3 girls on, one boy on the bench.
 */
async function overTheCap(admin: SupabaseClient, name: string) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "oztag", ageGroup: "U10", name: `${name} ${Date.now()}` });
  await admin.from("teams").update({ mixed_max_boys: 4, mixed_min_girls: 1, mixed_min_boys: 0 }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10 });
  const ids = players.map((p) => p.id);
  const boys = ids.slice(0, 6);
  const girls = ids.slice(6);
  for (const pid of ids) await admin.from("players").update({ mixed_group: boys.includes(pid) ? "boy" : "girl" }).eq("id", pid);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Charlestown Chargers" });
  const { error } = await admin.from("games").update({ sub_interval_seconds: 600, status: "in_progress" }).eq("id", game.id);
  if (error) throw new Error(error.message);
  await admin.from("game_availability").insert(
    players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
  );
  const kickoff: TouchLineupMeta = {
    lines: { middle: [], link: [], wing: [], field: [...boys.slice(0, 4), ...girls] },
    bench: boys.slice(4),
  };
  const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  const { error: evErr } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup: kickoff }, created_at: ago(200) },
      { type: "quarter_start", metadata: { quarter: 1 }, created_at: ago(180) },
      { type: "swap", player_id: boys[4], metadata: { quarter: 1, elapsed_ms: 60_000, off_player_id: girls[3], on_player_id: boys[4] }, created_at: ago(120) },
      { type: "injury", player_id: girls[0], metadata: { quarter: 1, elapsed_ms: 120_000, injured: true }, created_at: ago(60) },
      { type: "swap", player_id: girls[3], metadata: { quarter: 1, elapsed_ms: 120_000, off_player_id: girls[0], on_player_id: girls[3] }, created_at: ago(59) },
    ].map((e) => ({ ...e, metadata: { ...e.metadata, sport: "oztag" }, game_id: game.id, created_by: ownerId })),
  );
  if (evErr) throw new Error(evErr.message);
  const lastLineup = async (): Promise<TouchLineupMeta> => {
    const { data } = await admin
      .from("game_events")
      .select("metadata, created_at")
      .eq("game_id", game.id)
      .eq("type", "lineup_set")
      .order("created_at", { ascending: false })
      .limit(1);
    return (data?.[0]?.metadata as { lineup: TouchLineupMeta }).lineup;
  };
  return { team, game, players, boys, girls, lastLineup, nameOf: (pid: string) => players.find((p) => p.id === pid)!.full_name };
}

async function openLive(page: Page, teamId: string, gameId: string) {
  await page.addInitScript(() => window.localStorage.setItem("siren-longpress-seen-v1", "true"));
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
}

test("oztag over the boys' cap with no girl on the bench: Fix takes a boy off, the side plays 7", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game, boys, lastLineup, nameOf } = await overTheCap(admin, "OZT-PLAY-SHORT");
  await openLive(page, team.id, game.id);

  const breach = page.getByTestId("touch-mixed-breach");
  await expect(breach).toContainText("5 boys on · rule 4", { timeout: 15_000 });
  await expect(breach).toContainText("take a boy off: play 7");
  await expect(breach).not.toContainText("nobody on the bench can fix it");
  // The boy on longest goes (the four who started; the first of them).
  await breach.getByRole("button", { name: `Fix: take ${nameOf(boys[0])} off — play 7` }).click();
  await expect
    .poll(async () => (await lastLineup()).bench.includes(boys[0]), { timeout: 15_000 })
    .toBe(true);
  const after = await lastLineup();
  expect(after.lines.field).toHaveLength(7);
  expect(after.lines.field.filter((pid) => boys.includes(pid))).toHaveLength(4);
  await expect(breach).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("swap-toast")).toContainText("off — playing 7");
});

test("oztag: the long-press sheet takes a kid off with no replacement", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game, boys, lastLineup } = await overTheCap(admin, "OZT-TAKE-OFF");
  await openLive(page, team.id, game.id);

  await page.getByTestId(`player-tile-${boys[4]}`).click({ delay: 600 });
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: /take off, no replacement/i }).click();
  await expect
    .poll(async () => (await lastLineup()).bench.includes(boys[4]), { timeout: 15_000 })
    .toBe(true);
  expect((await lastLineup()).lines.field).toHaveLength(7);
  await expect(page.getByTestId("touch-mixed-breach")).toHaveCount(0, { timeout: 15_000 });
});
