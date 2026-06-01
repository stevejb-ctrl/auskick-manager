// ─── B1 / AVAIL-01 regression: availability holds at kickoff ───
// A player the coach marks UNAVAILABLE pre-game must NOT be in the
// committed kickoff lineup, even when a stale lineup draft placed
// them on the field. Covers all three sports.
//
// Repro chain (the user's verbatim B1, 09-CONTEXT.md "Specific Ideas"):
//   1. Seed team + players + game.
//   2. Save a `game_lineup_drafts` row that PLACES player X on the
//      field (so the picker hydrates X into its lineup state).
//   3. Mark player X `game_availability.status = "unavailable"`.
//   4. Drive the start flow through the picker UI (Ready for Q1 →
//      Start Q1) so the per-sport start action commits the lineup.
//   5. Assert X is NOT in any zone array of the latest `lineup_set`
//      event metadata, AND X is not rendered as an on-field tile.
//
// Pre-fix this FAILS: the three start actions commit whatever lineup
// the client sends, with zero reconciliation against game_availability.
//
// Covers:
//   - src/lib/live/reconcileLineupToAvailability.ts (the fix)
//   - startGame / startNetballGame / startLeagueGame (3 start actions)

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

// Flatten every player id out of a lineup_set metadata.lineup blob.
// Handles AFL/league flat-array zones ({ back: [...], ... }) AND the
// netball nested shape ({ positions: { gs: [...] }, bench: [...] }).
function flattenLineupIds(lineup: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const v of node) if (typeof v === "string") out.push(v);
      return;
    }
    if (node && typeof node === "object") {
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(lineup);
  return out;
}

// Poll the most recent lineup_set event's flattened ids until the
// event exists, then assert membership. Returns the flattened ids.
async function latestLineupSetIds(
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
): Promise<string[]> {
  let ids: string[] | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("metadata, created_at")
          .eq("game_id", gameId)
          .eq("type", "lineup_set")
          .order("created_at", { ascending: false })
          .limit(1);
        const row = (data ?? [])[0] as
          | { metadata: { lineup?: unknown } }
          | undefined;
        if (!row) return false;
        ids = flattenLineupIds(row.metadata?.lineup);
        return true;
      },
      { timeout: 15_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);
  return ids ?? [];
}

// ─── AFL ───────────────────────────────────────────────────────
test("AFL: a player marked unavailable pre-game is dropped from the kickoff lineup", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  // 15 = 12 on field + 3 bench for U10 (defaultOnFieldSize=12).
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // Player X — placed in a zone in the draft, then marked unavailable.
  const X = players[0];
  const onField = players.slice(0, game.on_field_size);
  const bench = players.slice(game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const lineup = {
    back: onField.slice(0, third).map((p) => p.id), // X is back[0]
    hback: [],
    mid: onField.slice(third, third * 2).map((p) => p.id),
    hfwd: [],
    fwd: onField.slice(third * 2).map((p) => p.id),
    bench: bench.map((p) => p.id),
  };

  // Save a stale draft that places X on the field.
  await admin.from("game_lineup_drafts").upsert(
    {
      game_id: game.id,
      lineup,
      on_field_size: game.on_field_size,
      sub_interval_seconds: 180,
      updated_by: ownerId,
    },
    { onConflict: "game_id" },
  );

  // Everyone available EXCEPT X.
  await admin.from("game_availability").upsert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: p.id === X.id ? "unavailable" : "available",
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "game_id,player_id" },
  );

  await suppressWalkthrough(page, "gm-walkthrough-seen");
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page
    .getByRole("button", { name: /^ready for q1$/i })
    .click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start q1$/i }).click();

  const ids = await latestLineupSetIds(admin, game.id);
  expect(ids).not.toContain(X.id);

  // ...and X is not rendered as an on-field tile.
  await expect(page.getByTestId(`player-tile-${X.id}`)).toHaveCount(0);
});

// ─── Netball ─────────────────────────────────────────────────────
test("netball: a player marked unavailable pre-game is dropped from the kickoff lineup", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-AVAIL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // 9 players = 7 court + 2 bench for "go".
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 9,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U10",
  });

  const X = players[0]; // seated at GS in the draft
  const courtKeys = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;
  const positions: Record<string, string[]> = {};
  courtKeys.forEach((k, i) => {
    positions[k] = [players[i].id];
  });
  const lineup = { positions, bench: players.slice(7).map((p) => p.id) };

  await admin.from("game_lineup_drafts").upsert(
    {
      game_id: game.id,
      lineup,
      on_field_size: 7,
      sub_interval_seconds: 180,
      updated_by: ownerId,
    },
    { onConflict: "game_id" },
  );

  await admin.from("game_availability").upsert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: p.id === X.id ? "unavailable" : "available",
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "game_id,player_id" },
  );

  await suppressWalkthrough(page, "nb-walkthrough-seen");
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page
    .getByRole("button", { name: /^ready for q1$/i })
    .click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start q1$/i }).click();

  const ids = await latestLineupSetIds(admin, game.id);
  expect(ids).not.toContain(X.id);
});

// ─── Rugby league ────────────────────────────────────────────────
test("rugby league: a player marked unavailable pre-game is dropped from the kickoff lineup", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-AVAIL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // 13 players = 11 on field + 2 bench (U10 RL defaultOnFieldSize=11).
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 13,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    ageGroup: "U10",
  });
  // makeGame uses AFL's defaultOnFieldSize (12 for U10); RL is 11.
  await admin.from("games").update({ on_field_size: 11 }).eq("id", game.id);

  const X = players[0]; // forwards[0]
  const lineup = {
    forwards: players.slice(0, 5).map((p) => p.id), // X is forwards[0]
    backs: players.slice(5, 11).map((p) => p.id),
    bench: players.slice(11).map((p) => p.id),
  };

  await admin.from("game_lineup_drafts").upsert(
    {
      game_id: game.id,
      lineup,
      on_field_size: 11,
      sub_interval_seconds: 180,
      updated_by: ownerId,
    },
    { onConflict: "game_id" },
  );

  await admin.from("game_availability").upsert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: p.id === X.id ? "unavailable" : "available",
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "game_id,player_id" },
  );

  await suppressWalkthrough(page, "gm-walkthrough-seen");
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  // U10 RL plays HALVES — the picker labels the CTA "Ready for H1".
  await page
    .getByRole("button", { name: /^ready for (h1|half 1|q1)$/i })
    .click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start\s*[qh]\s*1$/i }).click();

  const ids = await latestLineupSetIds(admin, game.id);
  expect(ids).not.toContain(X.id);
});

// Suppress a sport's first-visit walkthrough overlay so it doesn't
// intercept the test's first interactions. Must run before goto.
async function suppressWalkthrough(page: Page, key: string): Promise<void> {
  await page.addInitScript((k: string) => {
    try {
      localStorage.setItem(k, "1");
    } catch {}
  }, key);
}
