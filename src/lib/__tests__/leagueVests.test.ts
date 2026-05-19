import { describe, expect, it } from "vitest";
import {
  currentVests,
  vestHistory,
  vestHistoryByPlayer,
  eligibleForVest,
  eligibleVestCandidates,
} from "@/lib/sports/rugby_league/vests";
import { suggestVestRotation } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, GameEventType, Player } from "@/lib/types";

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

// ─── suggestVestRotation — combined-vest exclusion ────────────

function makePlayer(id: string, jersey: number | null = null): Player {
  return {
    id,
    team_id: "t1",
    full_name: id.toUpperCase(),
    jersey_number: jersey,
    is_active: true,
    created_by: "u1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("suggestVestRotation — combined-vest exclusion (any vest worn once)", () => {
  it("never reassigns a player to ANY vest after they've worn one in an earlier period (Steve 2026-05-19)", () => {
    // Six on-field players for a 2-half game with FR + DH required.
    // The suggester picks 4 distinct wearers (FR H1, DH H1, FR H2,
    // DH H2). Each player can wear at most ONE vest across the game.
    const players = [
      makePlayer("p1", 1),
      makePlayer("p2", 2),
      makePlayer("p3", 3),
      makePlayer("p4", 4),
      makePlayer("p5", 5),
      makePlayer("p6", 6),
    ];
    const rotation = suggestVestRotation({
      onFieldIds: players.map((p) => p.id),
      players,
      seasonEvents: [],
      requiredUnbrokenPeriods: 1,
      vestRequirements: { fr: true, dh: true },
      periodCount: 2,
    });
    expect(rotation.fr).toHaveLength(2);
    expect(rotation.dh).toHaveLength(2);
    // Collect every non-null pick across both vests.
    const picks = [...rotation.fr, ...rotation.dh].filter(
      (id): id is string => Boolean(id),
    );
    // Each unique → no player wears more than one vest across
    // both halves of the game.
    expect(new Set(picks).size).toBe(picks.length);
    expect(picks).toHaveLength(4);
  });

  it("returns null for a period's pick when the field is too shallow to satisfy the any-vest rule", () => {
    // Three on-field players, FR+DH required, 2 periods → 4 unique
    // wearers needed but only 3 candidates. Some periods will end
    // up with null picks rather than reusing a player.
    const players = [
      makePlayer("p1", 1),
      makePlayer("p2", 2),
      makePlayer("p3", 3),
    ];
    const rotation = suggestVestRotation({
      onFieldIds: players.map((p) => p.id),
      players,
      seasonEvents: [],
      requiredUnbrokenPeriods: 1,
      vestRequirements: { fr: true, dh: true },
      periodCount: 2,
    });
    const picks = [...rotation.fr, ...rotation.dh].filter(
      (id): id is string => Boolean(id),
    );
    expect(new Set(picks).size).toBe(picks.length);
    // 4 total slots, 3 unique candidates → exactly one slot is null.
    const nulls
      = rotation.fr.filter((x) => x === null).length
      + rotation.dh.filter((x) => x === null).length;
    expect(nulls).toBe(1);
  });
});
