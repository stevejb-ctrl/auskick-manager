// A played game keeps the period length it was played with (UX round 2,
// 24 Oct 2026): after Settings went from 12- to 10-minute quarters,
// Stats clipped game 1's quarters to 10 minutes. A game that used the
// team's length stored none (games.quarter_length_seconds null), so it
// followed today's setting. pinPlayedPeriodLength writes the length in
// force onto every started or finished game still following the team's,
// before the change lands.

import { describe, expect, it, vi } from "vitest";
import { pinPlayedPeriodLength } from "@/lib/games/pinPlayedPeriodLength";

function makeClient(team: Record<string, unknown>) {
  const updates: { patch: Record<string, unknown>; filters: Array<[string, string, unknown]> }[] = [];
  const teamsQuery = {
    select: vi.fn(function (this: typeof teamsQuery) {
      return this;
    }),
    eq: vi.fn(function (this: typeof teamsQuery) {
      return this;
    }),
    single: vi.fn(() => Promise.resolve({ data: team, error: null })),
  };
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "teams") return teamsQuery;
      if (table === "games") {
        return {
          update: vi.fn((patch: Record<string, unknown>) => {
            const entry = { patch, filters: [] as Array<[string, string, unknown]> };
            updates.push(entry);
            const chain = {
              eq: (col: string, val: unknown) => (entry.filters.push(["eq", col, val]), chain),
              in: (col: string, val: unknown) => (entry.filters.push(["in", col, val]), chain),
              is: (col: string, val: unknown) => (entry.filters.push(["is", col, val]), chain),
              then: (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
            };
            return chain;
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { supabase: supabase as never, updates };
}

describe("pinPlayedPeriodLength", () => {
  it("writes the team's length onto the games already played that follow it", async () => {
    const { supabase, updates } = makeClient({ sport: "afl", age_group: "U10", quarter_length_seconds: null, period_count: null });
    await pinPlayedPeriodLength(supabase, "t1");
    expect(updates).toHaveLength(1);
    // U10 plays 12-minute quarters.
    expect(updates[0].patch).toEqual({ quarter_length_seconds: 720 });
    expect(updates[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "team_id", "t1"],
        ["in", "status", ["in_progress", "completed"]],
        ["is", "quarter_length_seconds", null],
      ]),
    );
  });

  it("uses the team's own length when it has one", async () => {
    const { supabase, updates } = makeClient({ sport: "afl", age_group: "U10", quarter_length_seconds: 600, period_count: null });
    await pinPlayedPeriodLength(supabase, "t1");
    expect(updates[0].patch).toEqual({ quarter_length_seconds: 600 });
  });

  it("uses a basketball team's own halves or quarters", async () => {
    const halves = makeClient({ sport: "basketball", age_group: "U12", quarter_length_seconds: null, period_count: null });
    const quarters = makeClient({ sport: "basketball", age_group: "U12", quarter_length_seconds: null, period_count: 4 });
    await pinPlayedPeriodLength(halves.supabase, "t1");
    await pinPlayedPeriodLength(quarters.supabase, "t1");
    const half = halves.updates[0].patch.quarter_length_seconds as number;
    const quarter = quarters.updates[0].patch.quarter_length_seconds as number;
    expect(quarter).toBeLessThan(half);
  });
});
