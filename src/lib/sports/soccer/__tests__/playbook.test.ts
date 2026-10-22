import { describe, expect, it } from "vitest";
import { soccerHowWePlay, soccerKeeperPrefs, soccerKeeperStrategy } from "@/lib/sports/soccer/playbook";

const pref = (player_id: string, kind: "home" | "never" | "also" | "keep_on", rank = 0, line: string | null = "gk") => ({
  player_id,
  position_key: null,
  line,
  kind,
  rank,
});

describe("soccerKeeperStrategy", () => {
  it("has no keeper at 4 a side, whatever the team chose", () => {
    expect(soccerKeeperStrategy("soccer", "U6", "keepers")).toBe("none");
  });

  it("plays the team's strategy, turns unless it named keepers", () => {
    expect(soccerKeeperStrategy("soccer", "U9", "keepers")).toBe("keepers");
    expect(soccerKeeperStrategy("soccer", "U9", "turns")).toBe("turns");
    expect(soccerKeeperStrategy("soccer", "U14", null)).toBe("turns");
  });
});

describe("soccerKeeperPrefs", () => {
  it("reads goal roles: home is keen (and named, in rank order), not here is not in goal", () => {
    const prefs = soccerKeeperPrefs([
      pref("b", "home", 2),
      pref("a", "home", 1),
      pref("c", "never"),
      pref("d", "keep_on", 0, null),
      // A position row isn't a line role.
      { player_id: "e", position_key: "cb", line: "gk", kind: "home" as const, rank: 0 },
    ]);
    expect(prefs.keenKeepers).toEqual(["a", "b"]);
    expect(prefs.namedKeepers).toEqual(["a", "b"]);
    expect(prefs.notInGoal).toEqual(["c"]);
  });
});

describe("soccerHowWePlay", () => {
  const loaded = {
    resolved: {
      strategy: { id: "turns" } as never,
      seasonBalance: "strong" as const,
      seasonBalanceSince: "2026-10-01T00:00:00Z",
    },
    prefs: [pref("k", "home")],
  };

  it("reads the team's How we play before kick-off", () => {
    expect(soccerHowWePlay(loaded, "soccer", "U10")).toMatchObject({
      keeperStrategy: "turns",
      balance: "strong",
      since: "2026-10-01T00:00:00Z",
      prefs: { keenKeepers: ["k"] },
    });
  });

  it("plays a game under way as it kicked off", () => {
    const snapshot = { strategy: "keepers", seasonBalance: "off" as const, seasonBalanceSince: null };
    expect(soccerHowWePlay(loaded, "soccer", "U12", snapshot)).toMatchObject({
      keeperStrategy: "keepers",
      balance: "off",
      since: null,
    });
  });
});
