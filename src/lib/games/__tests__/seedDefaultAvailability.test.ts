// ─── seedDefaultAvailability — rule pin ──────────────────────
// Steve asked for "all players marked available by default for
// every game; coach un-selects no-shows" as a rule the app must
// always enforce. The rule lives in `seedDefaultAvailability` and
// is invoked from all four game-creation paths today:
//
//   * createGame UI action (`(app)/teams/[teamId]/games/actions.ts`)
//   * PlayHQ adopt (`(app)/teams/[teamId]/games/playhq-actions.ts`)
//   * Nightly PlayHQ cron (`api/cron/sync-playhq/route.ts`)
//   * Demo seed (`app/demo/page.tsx`)
//
// This unit test pins the BEHAVIOUR — given a squad of active
// players, the helper inserts exactly one `game_availability` row
// per player with status='available' and uses the right
// onConflict shape so re-runs don't flip a coach's manual
// "Unavailable" back to "Available".
//
// If anyone refactors the helper and accidentally changes the
// default status (e.g. flips to "unknown" or skips the upsert),
// this test fails before they ship.

import { describe, it, expect, vi } from "vitest";
import { seedAvailabilityForNewPlayers, seedDefaultAvailability } from "@/lib/games/seedDefaultAvailability";

/**
 * Build a Supabase-shaped mock client. Implements just enough of
 * the chained API (`from().select().eq().eq()` and
 * `from().upsert()`) for `seedDefaultAvailability` to round-trip.
 * Captures every upsert payload so tests can assert on what was
 * written.
 */
function makeMockClient(activePlayers: { id: string }[]) {
  const upserts: Array<{
    rows: Array<{
      game_id: string;
      player_id: string;
      status: string;
      updated_by: string | null;
    }>;
    opts: { onConflict: string; ignoreDuplicates: boolean };
  }> = [];

  // Thenable chain for the players SELECT. Each .eq() returns the
  // same chain; awaiting it resolves to { data, error }.
  const playersQuery = {
    select: vi.fn(function (this: typeof playersQuery) {
      return this;
    }),
    eq: vi.fn(function (this: typeof playersQuery) {
      return this;
    }),
    then(
      resolve: (v: { data: { id: string }[] | null; error: null }) => unknown,
    ) {
      return Promise.resolve({ data: activePlayers, error: null }).then(
        resolve,
      );
    },
  };

  const availabilityTable = {
    upsert: vi.fn((rows: typeof upserts[number]["rows"], opts: typeof upserts[number]["opts"]) => {
      upserts.push({ rows, opts });
      return Promise.resolve({ error: null });
    }),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "players") return playersQuery;
      if (table === "game_availability") return availabilityTable;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { supabase: supabase as never, upserts, playersQuery };
}

describe("seedDefaultAvailability — default-available rule", () => {
  it("inserts one row per active player with status='available'", async () => {
    const { supabase, upserts } = makeMockClient([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    const count = await seedDefaultAvailability({
      supabase,
      gameId: "g1",
      teamId: "t1",
      createdBy: "u-admin",
    });

    expect(count).toBe(3);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].rows).toEqual([
      { game_id: "g1", player_id: "p1", status: "available", updated_by: "u-admin" },
      { game_id: "g1", player_id: "p2", status: "available", updated_by: "u-admin" },
      { game_id: "g1", player_id: "p3", status: "available", updated_by: "u-admin" },
    ]);
  });

  it("uses ignoreDuplicates so a coach's manual 'Unavailable' is NOT overwritten", async () => {
    // Critical: if `seedDefaultAvailability` ever runs again after
    // the coach has marked someone out (e.g. retry path, second
    // game-create from a PlayHQ sync), it must NOT flip their
    // status back to 'available'. The onConflict + ignoreDuplicates
    // pair guarantees that.
    const { supabase, upserts } = makeMockClient([{ id: "p1" }]);
    await seedDefaultAvailability({
      supabase,
      gameId: "g1",
      teamId: "t1",
      createdBy: null,
    });
    expect(upserts[0].opts).toEqual({
      onConflict: "game_id,player_id",
      ignoreDuplicates: true,
    });
  });

  it("returns 0 and does not upsert when the team has no active players", async () => {
    const { supabase, upserts } = makeMockClient([]);
    const count = await seedDefaultAvailability({
      supabase,
      gameId: "g1",
      teamId: "t1",
      createdBy: "u-admin",
    });
    expect(count).toBe(0);
    expect(upserts).toHaveLength(0);
  });

  it("accepts createdBy=null (service-role / cron paths)", async () => {
    const { supabase, upserts } = makeMockClient([{ id: "p1" }]);
    await seedDefaultAvailability({
      supabase,
      gameId: "g1",
      teamId: "t1",
      createdBy: null,
    });
    expect(upserts[0].rows[0].updated_by).toBeNull();
  });

  it("filters to active players via .eq('is_active', true)", async () => {
    // Indirect check: the helper's contract is "active players only"
    // — verify the query chain actually filters on is_active. If the
    // implementation drops the active filter, archived kids would
    // start the game marked Available and clutter the picker.
    const { supabase, playersQuery } = makeMockClient([{ id: "p1" }]);
    await seedDefaultAvailability({
      supabase,
      gameId: "g1",
      teamId: "t1",
      createdBy: "u-admin",
    });
    // playersQuery.eq was called twice — once for team_id, once for
    // is_active. We only care that is_active=true is in the filter
    // set, not the call order.
    const eqCalls = (playersQuery.eq as ReturnType<typeof vi.fn>).mock.calls;
    const filters = new Map<string, unknown>();
    for (const [col, val] of eqCalls) filters.set(col as string, val);
    expect(filters.get("team_id")).toBe("t1");
    expect(filters.get("is_active")).toBe(true);
  });
});

// ─── A kid added mid-season (UX round 2, 24 Oct 2026) ────────
// Noah, added after game 1, opened game 2 as "Out: Noah": availability
// was seeded for the squad when each game was made, and he had no row.
// A new or returning kid is In for every game still to come, like
// everyone else was when the game was made.

function makeUpcomingClient(upcoming: { id: string }[]) {
  const upserts: Array<{ rows: Array<Record<string, unknown>>; opts: Record<string, unknown> }> = [];
  const filters = new Map<string, unknown>();
  const gamesQuery = {
    select: vi.fn(function (this: typeof gamesQuery) {
      return this;
    }),
    eq: vi.fn(function (this: typeof gamesQuery, col: string, val: unknown) {
      filters.set(col, val);
      return this;
    }),
    then(resolve: (v: { data: { id: string }[]; error: null }) => unknown) {
      return Promise.resolve({ data: upcoming, error: null }).then(resolve);
    },
  };
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "games") return gamesQuery;
      if (table === "game_availability") {
        return {
          upsert: vi.fn((rows: Array<Record<string, unknown>>, opts: Record<string, unknown>) => {
            upserts.push({ rows, opts });
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { supabase: supabase as never, upserts, filters };
}

describe("seedAvailabilityForNewPlayers — a kid added mid-season", () => {
  it("marks them available for every upcoming game", async () => {
    const { supabase, upserts, filters } = makeUpcomingClient([{ id: "g2" }, { id: "g3" }]);
    const count = await seedAvailabilityForNewPlayers({ supabase, teamId: "t1", playerIds: ["noah"], createdBy: "u-admin" });
    expect(count).toBe(2);
    expect(filters.get("team_id")).toBe("t1");
    expect(filters.get("status")).toBe("upcoming");
    expect(upserts[0].rows).toEqual([
      { game_id: "g2", player_id: "noah", status: "available", updated_by: "u-admin" },
      { game_id: "g3", player_id: "noah", status: "available", updated_by: "u-admin" },
    ]);
    // A coach's "Out" for a returning kid stays.
    expect(upserts[0].opts).toEqual({ onConflict: "game_id,player_id", ignoreDuplicates: true });
  });

  it("writes nothing when no games are coming up", async () => {
    const { supabase, upserts } = makeUpcomingClient([]);
    expect(await seedAvailabilityForNewPlayers({ supabase, teamId: "t1", playerIds: ["noah"], createdBy: null })).toBe(0);
    expect(upserts).toHaveLength(0);
  });
});
