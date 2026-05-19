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
import { seedDefaultAvailability } from "@/lib/games/seedDefaultAvailability";

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
