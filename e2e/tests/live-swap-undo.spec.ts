// ─── A manual swap is instant, with Undo ─────────────────────
// Live v3 (Steve, 8 Nov 2026): a swap made by hand happens at once and
// the toast carries an Undo for 6 s. There's no "Manually sub X for Y?"
// confirm first. Undo writes the swap back (events stay as they were
// written), so a reload shows the lineup Undo put back, and with no
// signal the swap and its undo save in order once it's back.
//
// AFL (the reference): tap-tap bench ↔ field, the dock's "Swap
// player" picker, and a bench kid into an empty spot (instant; there's
// nobody to bring back, so no Undo). Soccer stands in for the sports on
// the shared chrome (useLiveChrome.manualSwap). Touch and Oztag still ask
// before a swap that breaks the mixed rule (touch-mixed-playthrough).

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { aflPositionModel, getAgeGroupConfig } from "../../src/lib/sports";
import { ZONE_LABELS } from "../../src/lib/ageGroups";
import type { GameEvent, Lineup, Zone } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

type Kid = { id: string; full_name: string };

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function swapsOf(admin: SupabaseClient, gameId: string) {
  const { data } = await admin
    .from("game_events")
    .select("*")
    .eq("game_id", gameId)
    .eq("type", "swap")
    .order("created_at", { ascending: true });
  return ((data ?? []) as GameEvent[]).map((e) => {
    const m = e.metadata as { off_player_id?: string | null; on_player_id?: string; undo?: boolean };
    return { off: m.off_player_id || null, on: m.on_player_id ?? null, ...(m.undo ? { undo: true } : {}) };
  });
}

async function skipTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

/**
 * An AFL U10 game in Q1: the field filled zone by zone from the first
 * kids, the rest on the bench. `emptySpots` leaves that many forward
 * spots empty (a short squad).
 */
async function aflInQ1(admin: SupabaseClient, opts: { count?: number; emptySpots?: number } = {}) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = (await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count ?? 15 })) as Kid[];
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const caps = zoneCapsFor(game.on_field_size, aflPositionModel(getAgeGroupConfig("afl", team.ageGroup)));
  const lineup: Lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  const zoneOf: Record<string, Zone> = {};
  let cursor = 0;
  for (const z of ALL_ZONES) {
    const take = z === "fwd" ? caps[z] - (opts.emptySpots ?? 0) : caps[z];
    for (let i = 0; i < take; i++) {
      lineup[z].push(players[cursor].id);
      zoneOf[players[cursor].id] = z;
      cursor++;
    }
  }
  lineup.bench = players.slice(cursor).map((p) => p.id);
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
  const { error } = await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: at(62_000) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: at(60_000) },
  ]);
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { team, game, players, field: players.slice(0, cursor), bench: players.slice(cursor), zoneOf };
}

async function openAfl(page: Page, teamId: string, gameId: string) {
  await skipTours(page);
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — q1, running$/i })).toBeVisible({ timeout: 15_000 });
}

const noConfirm = (page: Page) => page.getByRole("dialog", { name: /manually sub|^move .+ to .+\?$/i });

/** The toast's Undo, once its slide-in has settled (WebKit calls it "not stable" while it moves). */
async function tapUndo(page: Page) {
  const undo = page.getByTestId("swap-toast").getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(400);
  await undo.click({ force: true });
}

test("AFL: a tap-tap sub happens at once, Undo puts it back, and a reload agrees", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, field, bench, zoneOf } = await aflInQ1(admin);
  const off = field[0];
  const on = bench[0];
  const zone = page.getByRole("group", { name: ZONE_LABELS[zoneOf[off.id]], exact: true });
  const benchGroup = page.getByRole("group", { name: "Bench", exact: true });
  await openAfl(page, team.id, game.id);

  await page.getByTestId(`player-tile-${on.id}`).click();
  await page.getByTestId(`player-tile-${off.id}`).click();
  // No confirm: the swap is made, and the toast says so with an Undo.
  await expect(page.getByTestId("swap-toast")).toContainText(`${off.full_name} → ${on.full_name}`, { timeout: 3_000 });
  await expect(noConfirm(page)).toHaveCount(0);
  await expect(zone.getByTestId(`player-tile-${on.id}`)).toBeVisible();
  await expect(benchGroup.getByTestId(`player-tile-${off.id}`)).toBeVisible();

  // Undo while the toast is up (6 s); both writes are checked below.
  await tapUndo(page);
  await expect(zone.getByTestId(`player-tile-${off.id}`)).toBeVisible({ timeout: 3_000 });
  await expect(benchGroup.getByTestId(`player-tile-${on.id}`)).toBeVisible();
  // The swap back is its own event (events are never rewritten), marked
  // as an undo so it nets to no sub.
  await expect
    .poll(() => swapsOf(admin, game.id), { timeout: 15_000 })
    .toEqual([
      { off: off.id, on: on.id },
      { off: on.id, on: off.id, undo: true },
    ]);

  await page.reload();
  await waitForHydration(page);
  await expect(zone.getByTestId(`player-tile-${off.id}`)).toBeVisible({ timeout: 15_000 });
  await expect(benchGroup.getByTestId(`player-tile-${on.id}`)).toBeVisible();
});

test("AFL: the dock's Swap player makes the sub at once, with Undo", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, field, bench, zoneOf } = await aflInQ1(admin);
  const off = field[1];
  const on = bench[1];
  const zone = page.getByRole("group", { name: ZONE_LABELS[zoneOf[off.id]], exact: true });
  await openAfl(page, team.id, game.id);

  await page.getByTestId(`player-tile-${off.id}`).click();
  await page.getByRole("button", { name: "Swap player" }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(on.full_name) }).click();
  await expect(page.getByTestId("swap-toast")).toContainText(`${off.full_name} → ${on.full_name}`, { timeout: 3_000 });
  await expect(noConfirm(page)).toHaveCount(0);
  await expect(zone.getByTestId(`player-tile-${on.id}`)).toBeVisible();

  await tapUndo(page);
  await expect(zone.getByTestId(`player-tile-${off.id}`)).toBeVisible({ timeout: 3_000 });
  await expect
    .poll(() => swapsOf(admin, game.id), { timeout: 15_000 })
    .toEqual([
      { off: off.id, on: on.id },
      { off: on.id, on: off.id, undo: true },
    ]);
});

test("AFL: a bench kid into an empty spot goes on at once", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, bench } = await aflInQ1(admin, { count: 13, emptySpots: 1 });
  const on = bench[0];
  await openAfl(page, team.id, game.id);

  await page.getByTestId(`player-tile-${on.id}`).click();
  await page.getByRole("button", { name: /^empty fwd spot/i }).first().click();
  await expect(page.getByTestId("swap-toast")).toContainText(`${on.full_name} on`, { timeout: 3_000 });
  await expect(noConfirm(page)).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Forward", exact: true }).getByTestId(`player-tile-${on.id}`)).toBeVisible();
  await expect.poll(() => swapsOf(admin, game.id), { timeout: 15_000 }).toEqual([{ off: null, on: on.id }]);
});

test("AFL: a swap and its Undo with no signal save in order once it's back", async ({ page }) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const { team, game, field, bench, zoneOf } = await aflInQ1(admin);
  const off = field[2];
  const on = bench[2];
  const zone = page.getByRole("group", { name: ZONE_LABELS[zoneOf[off.id]], exact: true });
  await openAfl(page, team.id, game.id);

  await page.context().setOffline(true);
  await page.getByTestId(`player-tile-${off.id}`).click();
  await page.getByTestId(`player-tile-${on.id}`).click();
  await expect(page.getByTestId("swap-toast")).toContainText(`${off.full_name} → ${on.full_name}`, { timeout: 3_000 });
  await tapUndo(page);
  await expect(zone.getByTestId(`player-tile-${off.id}`)).toBeVisible({ timeout: 3_000 });
  await expect(page.getByTestId("offline-banner")).toContainText(/2 taps waiting to save/);
  expect(await swapsOf(admin, game.id)).toEqual([]);

  await page.context().setOffline(false);
  await expect
    .poll(() => swapsOf(admin, game.id), { timeout: 45_000 })
    .toEqual([
      { off: off.id, on: on.id },
      { off: on.id, on: off.id, undo: true },
    ]);
  await expect(page.getByTestId("offline-banner")).toHaveCount(0, { timeout: 15_000 });
  await page.reload();
  await waitForHydration(page);
  await expect(zone.getByTestId(`player-tile-${off.id}`)).toBeVisible({ timeout: 15_000 });
});

test("soccer: a tap-tap sub happens at once, Undo puts it back, and a reload agrees", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U8" });
  const players = (await makePlayers(admin, { teamId: team.id, ownerId, count: 8 })) as Kid[];
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const lineup = {
    keeper: ids[0],
    lines: { def: [ids[1], ids[2]], mid: [ids[3], ids[4], ids[5]], att: [ids[6]], field: [] },
    bench: [ids[7]],
  };
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "soccer" }, created_at: at(62_000) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "soccer" }, created_at: at(60_000) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  const def1 = players[1];
  const benchKid = players[7];
  const defence = page.getByRole("group", { name: "Defence", exact: true });
  const benchGroup = page.getByRole("group", { name: "Bench", exact: true });

  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });

  await page.getByTestId(`player-tile-${benchKid.id}`).click();
  await page.getByTestId(`player-tile-${def1.id}`).click();
  await expect(page.getByTestId("swap-toast")).toContainText(`${def1.full_name} → ${benchKid.full_name}`, { timeout: 3_000 });
  await expect(noConfirm(page)).toHaveCount(0);
  await expect(defence.getByTestId(`player-tile-${benchKid.id}`)).toBeVisible();

  // Undo while the toast is up (6 s); both writes are checked below.
  await tapUndo(page);
  await expect(defence.getByTestId(`player-tile-${def1.id}`)).toBeVisible({ timeout: 3_000 });
  await expect(benchGroup.getByTestId(`player-tile-${benchKid.id}`)).toBeVisible();
  await expect
    .poll(async () => (await swapsOf(admin, game.id)).map(({ off, on }) => ({ off, on })), { timeout: 15_000 })
    .toEqual([
      { off: def1.id, on: benchKid.id },
      { off: benchKid.id, on: def1.id },
    ]);

  await page.reload();
  await waitForHydration(page);
  await expect(defence.getByTestId(`player-tile-${def1.id}`)).toBeVisible({ timeout: 15_000 });
  await expect(benchGroup.getByTestId(`player-tile-${benchKid.id}`)).toBeVisible();
});
