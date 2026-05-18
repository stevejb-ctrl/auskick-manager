import { describe, expect, it } from "vitest";
import {
  currentVests,
  vestHistory,
  vestHistoryByPlayer,
  eligibleForVest,
  eligibleVestCandidates,
} from "@/lib/sports/rugby_league/vests";
import type { GameEvent, GameEventType } from "@/lib/types";

let _ts = 0;
function ev(
  type: GameEventType,
  metadata: Record<string, unknown> = {},
  playerId: string | null = null,
): GameEvent {
  _ts++;
  return {
    id: `e${_ts}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(2026, 0, 1, 9, 0, _ts).toISOString(),
  };
}
function reset() {
  _ts = 0;
}

function vestEvent(
  player: string,
  vest: "fr" | "dh",
  period: number,
  replacement = false,
): GameEvent {
  return ev("vest_assigned", { vest, period, replacement }, player);
}

describe("currentVests", () => {
  it("returns an empty object when no vests have been assigned", () => {
    reset();
    expect(currentVests([], 1)).toEqual({});
  });

  it("returns the FR + DH wearer for the queried period", () => {
    reset();
    const events = [
      vestEvent("p1", "fr", 1),
      vestEvent("p2", "dh", 1),
    ];
    expect(currentVests(events, 1)).toEqual({ fr: "p1", dh: "p2" });
  });

  it("scopes results to the queried period", () => {
    reset();
    const events = [
      vestEvent("p1", "fr", 1),
      vestEvent("p3", "fr", 2),
    ];
    expect(currentVests(events, 1).fr).toBe("p1");
    expect(currentVests(events, 2).fr).toBe("p3");
  });

  it("later vest_assigned events override earlier ones in the same period (replacement flow)", () => {
    reset();
    const events = [
      vestEvent("p1", "fr", 1),
      vestEvent("p4", "fr", 1, true), // injury replacement mid-period
    ];
    expect(currentVests(events, 1).fr).toBe("p4");
  });

  it("ignores vest_assigned events with missing or malformed metadata", () => {
    reset();
    const events = [
      ev("vest_assigned", { period: 1 }, "p1"), // missing vest
      ev("vest_assigned", { vest: "fr" }, "p2"), // missing period
      ev("vest_assigned", { vest: "boots", period: 1 }, "p3"), // bad vest
      ev("vest_assigned", { vest: "fr", period: 1 }), // missing player_id
      vestEvent("p5", "fr", 1),
    ];
    expect(currentVests(events, 1).fr).toBe("p5");
  });
});

describe("vestHistory + eligibleForVest", () => {
  it("vestHistory collects every player who has worn this vest type", () => {
    reset();
    const events = [
      vestEvent("p1", "fr", 1),
      vestEvent("p2", "fr", 2),
      vestEvent("p3", "dh", 1),
    ];
    expect(vestHistory(events, "fr")).toEqual(new Set(["p1", "p2"]));
    expect(vestHistory(events, "dh")).toEqual(new Set(["p3"]));
  });

  it("vestHistory includes replacements (laws §12: counts the replacement period)", () => {
    reset();
    const events = [
      vestEvent("p1", "fr", 1),
      vestEvent("p4", "fr", 1, true),
    ];
    expect(vestHistory(events, "fr")).toEqual(new Set(["p1", "p4"]));
  });

  it("eligibleForVest is false once the player has worn this vest", () => {
    reset();
    const events = [vestEvent("p1", "fr", 1)];
    expect(eligibleForVest(events, "p1", "fr")).toBe(false);
    expect(eligibleForVest(events, "p2", "fr")).toBe(true);
    // FR worn doesn't disqualify the same player from wearing DH.
    expect(eligibleForVest(events, "p1", "dh")).toBe(true);
  });

  it("eligibleForVest treats a replacement as 'has worn it' for next period", () => {
    reset();
    const events = [
      vestEvent("p1", "fr", 1),
      vestEvent("p4", "fr", 1, true),
    ];
    // p4 stepped in for the rest of Q1; can't take FR again at Q2.
    expect(eligibleForVest(events, "p4", "fr")).toBe(false);
  });
});

describe("eligibleVestCandidates", () => {
  it("returns on-field players who haven't worn the vest yet", () => {
    reset();
    const events = [vestEvent("p1", "fr", 1)];
    const onField = ["p1", "p2", "p3", "p4"];
    expect(eligibleVestCandidates(events, onField, "fr")).toEqual([
      "p2",
      "p3",
      "p4",
    ]);
  });

  it("returns an empty array when every on-field player has had a turn", () => {
    reset();
    const events = [
      vestEvent("p1", "fr", 1),
      vestEvent("p2", "fr", 2),
    ];
    expect(eligibleVestCandidates(events, ["p1", "p2"], "fr")).toEqual([]);
  });

  it("filters by vest type — wearing DH doesn't disqualify from FR", () => {
    reset();
    const events = [vestEvent("p1", "dh", 1)];
    expect(eligibleVestCandidates(events, ["p1", "p2"], "fr")).toEqual([
      "p1",
      "p2",
    ]);
  });
});

describe("vestHistoryByPlayer", () => {
  it("collects per-player periods for each vest type", () => {
    reset();
    const events = [
      vestEvent("p1", "fr", 1),
      vestEvent("p2", "fr", 2),
      vestEvent("p1", "dh", 3),
      vestEvent("p4", "fr", 2, true),
    ];
    const history = vestHistoryByPlayer(events);
    expect(history.p1).toEqual({ fr: [1], dh: [3] });
    expect(history.p2).toEqual({ fr: [2], dh: [] });
    expect(history.p4).toEqual({ fr: [2], dh: [] });
  });

  it("returns an empty object when no vests have been assigned", () => {
    reset();
    expect(vestHistoryByPlayer([])).toEqual({});
  });
});
