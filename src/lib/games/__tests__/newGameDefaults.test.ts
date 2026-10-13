// ─── importedGameDefaults — regression ───────────────────────
// PlayHQ imports (coach action + nightly cron) used to read the
// AFL-only AGE_GROUPS table for every team. A rugby league U13
// fixture came in with AFL U13's 15-a-side and AFL's sub cadence,
// and a netball team fell through to AFL U10's 12-a-side.
//
// Non-AFL teams now take their own sport's age-group config. AFL
// stays on the legacy table so its imports don't change.

import { describe, it, expect } from "vitest";
import { importedGameDefaults } from "@/lib/games/importedGameDefaults";
import { getAgeGroupConfig } from "@/lib/sports";

describe("importedGameDefaults", () => {
  it("rugby league U13 gets league's 13-a-side, not AFL's 15", () => {
    const d = importedGameDefaults("rugby_league", "U13");
    expect(d.on_field_size).toBe(13);
    expect(d.sub_interval_seconds).toBe(
      getAgeGroupConfig("rugby_league", "U13").subIntervalSeconds,
    );
  });

  it("rugby league U8 gets league's 8-a-side, not AFL's 6", () => {
    const d = importedGameDefaults("rugby_league", "U8");
    expect(d.on_field_size).toBe(8);
    expect(d.sub_interval_seconds).toBe(
      getAgeGroupConfig("rugby_league", "U8").subIntervalSeconds,
    );
  });

  it("netball gets its own court size, not AFL U10's 12", () => {
    const d = importedGameDefaults("netball", "go");
    expect(d.on_field_size).toBe(7);
    expect(d.sub_interval_seconds).toBe(
      getAgeGroupConfig("netball", "go").subIntervalSeconds,
    );
  });

  it("AFL keeps the legacy table's values", () => {
    expect(importedGameDefaults("afl", "U10")).toEqual({
      on_field_size: 12,
      sub_interval_seconds: 180,
    });
    expect(importedGameDefaults("afl", "U13")).toEqual({
      on_field_size: 15,
      sub_interval_seconds: 240,
    });
  });

  it("a team with no sport set is treated as AFL", () => {
    expect(importedGameDefaults(null, "U10")).toEqual(
      importedGameDefaults("afl", "U10"),
    );
  });
});
