// ─── Rugby League rotation enforcement ──────────────────────
// Junior RL has three independent rotation rules that all enforce
// server-side. This spec hits each one through the DB-level event
// log + server action contracts (NOT the UI) so the rules can be
// regression-tested fast without spinning up the full live screen.
// The UI playthrough lives in
// `rugby-league-full-game-playthrough.spec.ts`.
//
// Rules covered:
//   1. Vests §12 — no player wears the same vest twice in a game,
//      except via the explicit `replacement: true` carve-out.
//   2. Conversions §15 — a player can't kick a second conversion
//      until everyone on the field has had a turn; `force: true`
//      bypasses for the foul-in-act carve-out.
//   3. Kickoffs §16 — a player can't take two kickoffs until the
//      whole squad has had one.
//
// All three checks live in src/app/(app)/teams/[teamId]/games/
// [gameId]/live/league-actions.ts; this spec calls them indirectly
// by inserting the prior events and then asserting the SECOND
// attempt's outcome against the unique-constraint and CHECK
// constraint behaviours.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import type { SupabaseClient } from "@supabase/supabase-js";
// Static imports at the top so Playwright's TS loader compiles
// these (dynamic `await import("@/...")` runs through Node's
// untransformed CommonJS loader → "Unexpected token 'export'").
import {
  vestHistory,
  eligibleForVest,
} from "../../src/lib/sports/rugby_league/vests";
import {
  conversionCycle,
  nextEligibleConversionKickers,
  nextEligibleKickoffTakers,
  kickoffTakers,
} from "../../src/lib/sports/rugby_league/kicks";
import type { GameEvent } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

/**
 * Lightweight seed: a U9 RL team with `count` players, an
 * in-progress game with the first N players on field, and an
 * already-active quarter 1. Returns the ids the tests can drive.
 */
async function seedActiveGame(
  admin: SupabaseClient,
  ownerId: string,
  count: number,
  onFieldCount: number,
  ageGroup: "U8" | "U9" | "U10" = "U9",
): Promise<{
  teamId: string;
  gameId: string;
  playerIds: string[];
  onField: string[];
}> {
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup,
    sport: "rugby_league",
    name: `RL-ROT-${ageGroup}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U10",
  });

  // Position-aware lineup — split starters into forwards/backs.
  // U10 uses 5F/6B (forwardCount config) but this spec runs across
  // age groups that vary in on-field count, so we split roughly
  // in half with backs taking the extra slot.
  const fieldIds = players.slice(0, onFieldCount).map((p) => p.id);
  const forwardCount = Math.floor(onFieldCount / 2);
  const forwardIds = fieldIds.slice(0, forwardCount);
  const backIds = fieldIds.slice(forwardCount);
  const benchIds = players.slice(onFieldCount).map((p) => p.id);
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: {
        lineup: {
          forwards: forwardIds,
          backs: backIds,
          bench: benchIds,
        },
        sport: "rugby_league",
      },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1, sport: "rugby_league" },
      created_by: ownerId,
    },
  ]);
  await admin
    .from("games")
    .update({ status: "in_progress", on_field_size: onFieldCount })
    .eq("id", game.id);

  return {
    teamId: team.id,
    gameId: game.id,
    playerIds: players.map((p) => p.id),
    onField: fieldIds,
  };
}

test("vest §12: a player who wore FR in period 1 can't take FR again in period 2", async () => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const { gameId, onField } = await seedActiveGame(admin, ownerId, 12, 8, "U9");

  // Period 1 FR worn by player 0.
  await admin.from("game_events").insert({
    game_id: gameId,
    type: "vest_assigned",
    player_id: onField[0],
    metadata: {
      vest: "fr",
      period: 1,
      replacement: false,
      sport: "rugby_league",
    },
    created_by: ownerId,
  });

  // Server-side: the check constraint on game_events.type accepts
  // a second `vest_assigned` row freely (no DB-level uniqueness on
  // wearer) — the no-twice rule is purely a TS guard. So we
  // assert the helper directly here: re-derive vest history and
  // confirm player 0 is excluded from eligibleForVest.
  const { data: priorEvents } = await admin
    .from("game_events")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at");

  const events = (priorEvents ?? []) as GameEvent[];
  const history = vestHistory(events, "fr");
  expect(history.has(onField[0])).toBe(true);
  expect(eligibleForVest(events, onField[0], "fr")).toBe(false);
  expect(eligibleForVest(events, onField[1], "fr")).toBe(true);
});

test("conversion §15: cycle blocks a repeat kicker until everyone on field has had a turn", async () => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const { gameId, onField } = await seedActiveGame(admin, ownerId, 10, 6, "U9");

  // Player 0 kicks once.
  await admin.from("game_events").insert({
    game_id: gameId,
    type: "conversion_attempt",
    player_id: onField[0],
    metadata: {
      quarter: 1,
      made: true,
      force: false,
      sport: "rugby_league",
    },
    created_by: ownerId,
  });

  const { data: priorEvents } = await admin
    .from("game_events")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at");
  const events = (priorEvents ?? []) as GameEvent[];

  const cycle = conversionCycle(events, onField);
  expect(cycle.attempted.has(onField[0])).toBe(true);

  const eligible = nextEligibleConversionKickers(events, onField);
  expect(eligible).not.toContain(onField[0]);
  // Every OTHER on-field player is eligible.
  for (let i = 1; i < onField.length; i++) {
    expect(eligible).toContain(onField[i]);
  }
});

test("conversion §15: cycle resets after everyone on field has kicked", async () => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  // Use a small on-field count (3) so the test only has to seed
  // 3 conversion events to complete the cycle.
  const { gameId, onField } = await seedActiveGame(admin, ownerId, 8, 3, "U9");

  await admin.from("game_events").insert(
    onField.map((pid) => ({
      game_id: gameId,
      type: "conversion_attempt",
      player_id: pid,
      metadata: {
        quarter: 1,
        made: true,
        force: false,
        sport: "rugby_league",
      },
      created_by: ownerId,
    })),
  );

  const { data: priorEvents } = await admin
    .from("game_events")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at");
  const events = (priorEvents ?? []) as GameEvent[];

  const cycle = conversionCycle(events, onField);
  expect(cycle.attempted.size).toBe(0); // reset
  expect(nextEligibleConversionKickers(events, onField)).toEqual(onField);
});

test("kickoff §16: rotation tracks every player in the squad", async () => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const { gameId, playerIds } = await seedActiveGame(admin, ownerId, 4, 3, "U9");

  // Three of the four squad members kick off across periods 1-3.
  await admin.from("game_events").insert([
    {
      game_id: gameId,
      type: "kickoff_taken",
      player_id: playerIds[0],
      metadata: { period: 1, sport: "rugby_league" },
      created_by: ownerId,
    },
    {
      game_id: gameId,
      type: "kickoff_taken",
      player_id: playerIds[1],
      metadata: { period: 2, sport: "rugby_league" },
      created_by: ownerId,
    },
  ]);

  const { data: priorEvents } = await admin
    .from("game_events")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at");
  const events = (priorEvents ?? []) as GameEvent[];

  // playerIds[0] and playerIds[1] have kicked → not eligible.
  // playerIds[2] and playerIds[3] haven't → eligible.
  const eligible = nextEligibleKickoffTakers(events, playerIds);
  expect(eligible).toEqual([playerIds[2], playerIds[3]]);

  // kickoffTakers includes both who have kicked.
  expect(kickoffTakers(events)).toEqual(new Set([playerIds[0], playerIds[1]]));
});

// Regression (UX plan H3 / 0.5): the game-detail header read the
// AFL-only AGE_GROUPS map, so a rugby league U10 game claimed "12 on
// field" (AFL U10). RL U10 plays 11-a-side.
test("game detail shows rugby league's on-field size, not AFL's", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-HDR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  await page.goto(`/teams/${team.id}/games/${game.id}`);

  await expect(page.getByText("U10 · 11 on field")).toBeVisible({ timeout: 10_000 });
});

// Regression (UX plan H7 / 0.9): enforce_unbroken_periods was stored
// (team + game) but the lineup picker always applied the age group's
// §6 minimum, so turning the rule off changed nothing. The picker must
// honour the setting.
test("the unbroken-periods setting drives the league lineup picker", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U9",
    sport: "rugby_league",
    name: `RL-UNB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );
  await page.addInitScript(() => {
    try { localStorage.setItem("league-walkthrough-seen", "1"); } catch {}
  });

  // Rule off (the default): no unbroken-period requirement.
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page.getByRole("button", { name: /game settings/i }).click();
  await expect(page.getByText(/^Suggested: .* min/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/unbroken quarters per player/i)).toHaveCount(0);

  // Rule on at team level: the picker keeps the §6 minimum.
  await admin.from("teams").update({ enforce_unbroken_periods: true }).eq("id", team.id);
  await page.reload();
  await page.getByRole("button", { name: /game settings/i }).click();
  await expect(page.getByText(/2 unbroken quarters per player/i)).toBeVisible({
    timeout: 10_000,
  });
});
