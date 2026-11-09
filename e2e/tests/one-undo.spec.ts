// ─── One Undo, and it says what it takes back ────────────────
// Stagehand round 9 (9 Nov 2026, about 8 runs): the undo strip named the
// last score after a swap or a foul ("Undo takes back: Flyers 2
// points" with a foul just logged), basketball's Undo didn't take fouls
// back, and a swap's toast carried a second Undo beside the strip's.
//
// Now the strip is the one Undo, in every sport. It names exactly what
// it takes back, the newest thing this phone did ("Undo: foul on Sam",
// "Undo: Ava on for Leo", "Undo: Roos goal — Mia"), and after an undo
// the next one down. The swap toast just says what happened.
//
// Covers: src/lib/live/lastUndoable.ts, src/components/live/useOneUndo.tsx,
// UndoStrip, SwapDoneToast, useLiveChrome and each sport's live screen.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { aflPositionModel, getAgeGroupConfig } from "../../src/lib/sports";
import { ZONE_LABELS } from "../../src/lib/ageGroups";
import type { Lineup, Zone } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

type Kid = { id: string; full_name: string };

async function ownerOf(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

async function skipTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

/** The period in play, started a minute ago: `lineup` on, the sport on each event. */
async function seedInPlay(admin: SupabaseClient, ownerId: string, gameId: string, sport: string, lineup: unknown) {
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
  const { error } = await admin.from("game_events").insert([
    { game_id: gameId, type: "lineup_set", metadata: { lineup, sport }, created_by: ownerId, created_at: at(62_000) },
    { game_id: gameId, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(60_000) },
  ]);
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", gameId);
}

async function available(admin: SupabaseClient, gameId: string, ownerId: string, ids: string[]) {
  await admin
    .from("game_availability")
    .insert(ids.map((id) => ({ game_id: gameId, player_id: id, status: "available" as const, updated_by: ownerId })));
}

const count = async (admin: SupabaseClient, gameId: string, type: string) =>
  ((await admin.from("game_events").select("id").eq("game_id", gameId).eq("type", type)).data ?? []).length;

const strip = (page: Page) => page.getByTestId("undo-strip");
/** Every Undo on screen: there's one, on the strip. */
const undos = (page: Page) => page.getByRole("button", { name: /^undo\b/i });

async function tapUndo(page: Page) {
  await expect(undos(page)).toHaveCount(1);
  await strip(page).getByRole("button", { name: "Undo" }).click();
}

test("AFL: after a goal and a swap, Undo names the swap and puts it back, then names the goal", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = (await makePlayers(admin, { teamId: team.id, ownerId, count: 15 })) as Kid[];
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew Comets" });
  const caps = zoneCapsFor(game.on_field_size, aflPositionModel(getAgeGroupConfig("afl", team.ageGroup)));
  const lineup: Lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  const zoneOf: Record<string, Zone> = {};
  let cursor = 0;
  for (const z of ALL_ZONES)
    for (let i = 0; i < caps[z]; i++) {
      lineup[z].push(players[cursor].id);
      zoneOf[players[cursor].id] = z;
      cursor++;
    }
  lineup.bench = players.slice(cursor).map((p) => p.id);
  await seedInPlay(admin, ownerId, game.id, "afl", lineup);
  const scorer = players.find((p) => p.id === lineup.fwd[0])!;
  const off = players.find((p) => p.id === lineup.back[0])!;
  const on = players.find((p) => p.id === lineup.bench[0])!;

  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — q1, running$/i })).toBeVisible({ timeout: 15_000 });

  // A goal: the strip names it.
  await page.getByRole("button", { name: `Add goal, ${team.name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(scorer.full_name) }).click();
  await expect(strip(page)).toContainText(`Undo: ${team.name} goal — ${scorer.full_name}`);
  await expect.poll(() => count(admin, game.id, "goal"), { timeout: 15_000 }).toBe(1);

  // A swap: the toast says what happened, with no Undo of its own; the
  // strip now names the swap, not the goal.
  await page.getByTestId(`player-tile-${on.id}`).click();
  await page.getByTestId(`player-tile-${off.id}`).click();
  await expect(page.getByTestId("swap-toast")).toContainText(`${off.full_name} → ${on.full_name}`);
  await expect(page.getByTestId("swap-toast").getByRole("button")).toHaveCount(0);
  await expect(strip(page)).toContainText(`Undo: ${on.full_name} on for ${off.full_name}`);
  await expect(strip(page)).not.toContainText("goal");

  // Undo puts the swap back; the goal stands, and the strip names it next.
  await tapUndo(page);
  const zone = page.getByRole("group", { name: ZONE_LABELS[zoneOf[off.id]], exact: true });
  await expect(zone.getByTestId(`player-tile-${off.id}`)).toBeVisible({ timeout: 5_000 });
  await expect(strip(page)).toContainText(`Undo: ${team.name} goal — ${scorer.full_name}`);
  expect(await count(admin, game.id, "score_undo")).toBe(0);

  // Undo again: the goal.
  await tapUndo(page);
  await expect.poll(() => count(admin, game.id, "score_undo"), { timeout: 15_000 }).toBe(1);
  await expect(strip(page)).toHaveCount(0);
});

test("basketball: Undo takes back a foul, named, and then the basket before it", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "basketball", ageGroup: "U12", name: `BBL-UNDO-${Date.now() % 1e6}` });
  await admin.from("teams").update({ track_scoring: true, track_fouls: true }).eq("id", team.id);
  const players = (await makePlayers(admin, { teamId: team.id, ownerId, count: 8 })) as Kid[];
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Frankston Flyers" });
  const k = players.map((p) => p.id);
  await available(admin, game.id, ownerId, k);
  await seedInPlay(admin, ownerId, game.id, "basketball", { lines: { guard: k.slice(0, 2), forward: k.slice(2, 5), court: [] }, bench: k.slice(5) });
  const [scorer, fouler] = [players[2], players[0]];

  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });

  // A 2 for Mia, then a foul on Sam: the strip names the foul.
  await page.getByTestId(`player-tile-${scorer.id}`).click();
  await page.getByRole("button", { name: /^\+2$/ }).first().click();
  await expect(strip(page)).toContainText(`Undo: ${team.name} 2 points — ${scorer.full_name}`);
  await page.getByTestId(`player-tile-${fouler.id}`).click();
  await page.getByTestId("basketball-foul").click();
  await expect(page.getByTestId(`fouls-${fouler.id}`)).toHaveText("F1");
  await expect(strip(page)).toContainText(`Undo: foul on ${fouler.full_name}`);
  await expect.poll(() => count(admin, game.id, "foul"), { timeout: 15_000 }).toBe(1);

  // Undo: the foul comes off (a foul taken back, as the − does), the basket stands.
  await tapUndo(page);
  await expect(page.getByTestId(`fouls-${fouler.id}`)).toHaveCount(0, { timeout: 5_000 });
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("player_id, metadata").eq("game_id", game.id).eq("type", "foul");
      return (data ?? []).filter((e) => (e.metadata as { undo?: boolean }).undo).map((e) => e.player_id);
    }, { timeout: 15_000 })
    .toEqual([fouler.id]);
  expect(await count(admin, game.id, "score_undo")).toBe(0);

  // Then the basket.
  await expect(strip(page)).toContainText(`Undo: ${team.name} 2 points — ${scorer.full_name}`);
  await tapUndo(page);
  await expect.poll(() => count(admin, game.id, "score_undo"), { timeout: 15_000 }).toBe(1);
});

test("netball: a mid-quarter swap is what Undo names and puts back, then the goal", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "go", sport: "netball", name: `NB-UNDO-${Date.now() % 1e6}` });
  await admin.from("teams").update({ track_scoring: true, allow_mid_quarter_subs: true }).eq("id", team.id);
  const players = (await makePlayers(admin, { teamId: team.id, ownerId, count: 9, ageGroup: "U10" })) as Kid[];
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew Kestrels" });
  const ids = players.map((p) => p.id);
  await available(admin, game.id, ownerId, ids);
  const BIBS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
  await seedInPlay(admin, ownerId, game.id, "netball", {
    positions: Object.fromEntries(BIBS.map((b, i) => [b, [ids[i]]])),
    bench: ids.slice(BIBS.length),
  });
  const gs = players[0];
  const benchKid = players[7];

  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const gsTile = (p: Kid) => page.getByRole("button", { name: new RegExp(`^${p.full_name}, Goal Shooter`, "i") });
  await expect(gsTile(gs)).toBeVisible({ timeout: 15_000 });

  // A goal for GS.
  await gsTile(gs).click();
  await page.getByRole("button", { name: /^(\+\s*goal|record goal|confirm goal)$/i }).click();
  await expect(strip(page)).toContainText(`Undo: ${team.name} goal — ${gs.full_name}`);
  await expect.poll(() => count(admin, game.id, "goal"), { timeout: 15_000 }).toBe(1);

  // A swap at GS: the strip names it.
  await page.getByTestId(`player-tile-${benchKid.id}`).click();
  await gsTile(gs).click();
  await expect(gsTile(benchKid)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("swap-toast").getByRole("button")).toHaveCount(0);
  await expect(strip(page)).toContainText(`Undo: ${benchKid.full_name} on for ${gs.full_name}`);

  // Undo: GS is back on; the goal is next.
  await tapUndo(page);
  await expect(gsTile(gs)).toBeVisible({ timeout: 5_000 });
  await expect(strip(page)).toContainText(`Undo: ${team.name} goal — ${gs.full_name}`);
  expect(await count(admin, game.id, "score_undo")).toBe(0);
});

test("soccer: after a goal and a swap, Undo names the swap, puts it back, then names the goal", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U10", name: `SOC-UNDO-${Date.now() % 1e6}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = (await makePlayers(admin, { teamId: team.id, ownerId, count: 12 })) as Kid[];
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Coogee Crabs" });
  const k = players.map((p) => p.id);
  await available(admin, game.id, ownerId, k);
  await seedInPlay(admin, ownerId, game.id, "soccer", {
    keeper: k[0],
    lines: { def: k.slice(1, 4), mid: k.slice(4, 7), att: k.slice(7, 9), field: [] },
    bench: k.slice(9),
  });
  const scorer = players[7];
  const off = players[1];
  const on = players[9];

  await skipTours(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });

  await page.getByTestId(`player-tile-${scorer.id}`).click();
  await page.getByRole("button", { name: /^\+\s*goal$/i }).click();
  await expect(strip(page)).toContainText(`Undo: ${team.name} goal — ${scorer.full_name}`);
  await expect.poll(() => count(admin, game.id, "goal"), { timeout: 15_000 }).toBe(1);

  await page.getByTestId(`player-tile-${on.id}`).click();
  await page.getByTestId(`player-tile-${off.id}`).click();
  await expect(page.getByTestId("swap-toast")).toContainText(`${off.full_name} → ${on.full_name}`);
  await expect(page.getByTestId("swap-toast").getByRole("button")).toHaveCount(0);
  await expect(strip(page)).toContainText(`Undo: ${on.full_name} on for ${off.full_name}`);
  await expect.poll(() => count(admin, game.id, "swap"), { timeout: 15_000 }).toBe(1);

  await tapUndo(page);
  await expect(page.getByRole("group", { name: "Defence" }).getByTestId(`player-tile-${off.id}`)).toBeVisible({ timeout: 5_000 });
  await expect.poll(() => count(admin, game.id, "swap"), { timeout: 15_000 }).toBe(2);
  await expect(strip(page)).toContainText(`Undo: ${team.name} goal — ${scorer.full_name}`);
  expect(await count(admin, game.id, "score_undo")).toBe(0);
});
