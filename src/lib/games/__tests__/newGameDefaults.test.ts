// ─── newGameDefaults — regression ────────────────────────────
// PlayHQ imports (coach action + nightly cron) used to read the
// AFL-only AGE_GROUPS table for every team. A rugby league U13
// fixture came in with AFL U13's 15-a-side and AFL's sub cadence,
// and a netball team fell through to AFL U10's 12-a-side.
//
// Every sport now takes its own age-group config. AFL's sub interval
// is derived from quarter length, no longer the hand-set 3 / 4 min.

import { describe, it, expect } from "vitest";
import { newGameDefaults } from "@/lib/games/newGameDefaults";
import { getAgeGroupConfig } from "@/lib/sports";

describe("newGameDefaults", () => {
  it("rugby league U13 gets league's 13-a-side, not AFL's 15", () => {
    const d = newGameDefaults("rugby_league", "U13");
    expect(d.on_field_size).toBe(13);
    expect(d.sub_interval_seconds).toBe(
      getAgeGroupConfig("rugby_league", "U13").subIntervalSeconds,
    );
  });

  it("rugby league U8 gets league's 8-a-side, not AFL's 6", () => {
    const d = newGameDefaults("rugby_league", "U8");
    expect(d.on_field_size).toBe(8);
    expect(d.sub_interval_seconds).toBe(
      getAgeGroupConfig("rugby_league", "U8").subIntervalSeconds,
    );
  });

  it("netball gets its own court size, not AFL U10's 12", () => {
    const d = newGameDefaults("netball", "go");
    expect(d.on_field_size).toBe(7);
    expect(d.sub_interval_seconds).toBe(
      getAgeGroupConfig("netball", "go").subIntervalSeconds,
    );
  });

  it("AFL subs split each quarter into even stints of at least 4 min", () => {
    // U8: 10-min quarters → 2 × 5 min. Was a hand-set 3 min (3+3+3+1).
    expect(newGameDefaults("afl", "U8")).toEqual({
      on_field_size: 6,
      sub_interval_seconds: 300,
    });
    // U10: 12-min quarters → 3 × 4 min. Was 3 min.
    expect(newGameDefaults("afl", "U10")).toEqual({
      on_field_size: 12,
      sub_interval_seconds: 240,
    });
    // U13: 20-min quarters → 5 × 4 min. Unchanged.
    expect(newGameDefaults("afl", "U13")).toEqual({
      on_field_size: 15,
      sub_interval_seconds: 240,
    });
  });

  it("a team with no sport set is treated as AFL", () => {
    expect(newGameDefaults(null, "U10")).toEqual(newGameDefaults("afl", "U10"));
  });
});
