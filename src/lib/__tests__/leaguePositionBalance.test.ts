// League named positions, position-level season balance (UX plan 5.7):
// lineups record each kid's slot, the stint walker counts time per
// slot, and the next lineup gives a kid the spot they've played least.

import { describe, expect, it } from "vitest";
import {
  assignLeaguePositionLabels,
  assignLeaguePositions,
  withLeagueSlots,
  type LeaguePlaybookInput,
} from "@/lib/sports/rugby_league/engine";
import { leagueSlotsNow, playerSlotMsOnField } from "@/lib/sports/rugby_league/fairness";
import { seasonTimeByUnit } from "@/lib/playbook/seasonTime";
import type { GameEvent, GameEventType } from "@/lib/types";

const MIN = 60_000;
const positions: LeaguePlaybookInput["positions"] = [
  { key: "pr", label: "PR", line: "forwards" },
  { key: "hk", label: "HK", line: "forwards" },
  { key: "lk", label: "LK", line: "forwards" },
  { key: "fb", label: "FB", line: "backs" },
  { key: "wg", label: "WG", line: "backs" },
];
const input = (over: Partial<LeaguePlaybookInput> = {}): LeaguePlaybookInput => ({
  strategy: "named-positions",
  seasonWeight: 300,
  periodMs: 20 * MIN,
  roles: {},
  vestStrategy: "auto",
  positions,
  positionRoles: {},
  ...over,
});

let ts = 0;
function ev(type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null, gameId = "g1"): GameEvent {
  ts++;
  return {
    id: `e${ts}`,
    game_id: gameId,
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(2026, 0, 1, 9, 0, ts).toISOString(),
  };
}

describe("assignLeaguePositions", () => {
  it("without season time, fills spots in catalogue order (unchanged)", () => {
    expect(assignLeaguePositions({ forwards: ["a", "b"], backs: ["c"] }, input())).toEqual({ a: "pr", b: "hk", c: "fb" });
  });

  it("keeps home spots and never-plays", () => {
    const pb = input({ positionRoles: { a: { home: "lk", also: [], never: [] }, b: { home: null, also: [], never: ["pr"] } } });
    expect(assignLeaguePositions({ forwards: ["a", "b", "c"], backs: [] }, pb)).toEqual({ a: "lk", b: "hk", c: "pr" });
  });

  it("with season balance on, gives each kid the spot they've played least", () => {
    const pb = input({ seasonPositions: { a: { pr: 40 * MIN, hk: 40 * MIN }, b: { lk: 30 * MIN } } });
    expect(assignLeaguePositions({ forwards: ["a", "b"], backs: [] }, pb)).toEqual({ a: "lk", b: "pr" });
    // Also-plays follow the same pull.
    const also = input({
      seasonPositions: { a: { pr: 40 * MIN } },
      positionRoles: { a: { home: null, also: ["pr", "hk"], never: [] } },
    });
    expect(assignLeaguePositions({ forwards: ["a"], backs: [] }, also)).toEqual({ a: "hk" });
  });

  it("with season balance off, season time is ignored", () => {
    const pb = input({ seasonWeight: 0, seasonPositions: { a: { pr: 40 * MIN } } });
    expect(assignLeaguePositions({ forwards: ["a"], backs: [] }, pb)).toEqual({ a: "pr" });
  });

  it("labels and recorded slots agree", () => {
    const lineup = { forwards: ["a"], backs: ["c"], bench: ["d"] };
    expect(assignLeaguePositionLabels(lineup, input())).toEqual({ a: "PR", c: "FB" });
    expect(withLeagueSlots(lineup, input())).toEqual({ ...lineup, slots: { a: "pr", c: "fb" } });
    expect(withLeagueSlots(lineup, input({ positions: undefined }))).toEqual(lineup);
  });
});

describe("playerSlotMsOnField", () => {
  const lineup = (slots?: Record<string, string>) =>
    ev("lineup_set", { lineup: { forwards: ["a"], backs: ["c"], bench: ["d"], ...(slots ? { slots } : {}) } });

  it("counts time in each recorded slot; a sub takes the slot over", () => {
    const events = [
      lineup({ a: "pr", c: "fb" }),
      ev("quarter_start", { quarter: 1 }),
      ev("swap", { off_player_id: "a", on_player_id: "d", quarter: 1, elapsed_ms: 5 * MIN }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
    ];
    expect(playerSlotMsOnField(events)).toEqual({
      a: { pr: 5 * MIN },
      d: { pr: 15 * MIN },
      c: { fb: 20 * MIN },
    });
  });

  it("a forward/back move leaves the kid unslotted; no slots, no time", () => {
    const moved = [
      lineup({ a: "pr", c: "fb" }),
      ev("quarter_start", { quarter: 1 }),
      ev("league_position_change", { quarter: 1, elapsed_ms: 8 * MIN, to_zone: "back" }, "a"),
      ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
    ];
    expect(playerSlotMsOnField(moved).a).toEqual({ pr: 8 * MIN });
    const plain = [lineup(), ev("quarter_start", { quarter: 1 }), ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN })];
    expect(playerSlotMsOnField(plain)).toEqual({});
  });

  it("feeds season time by position", () => {
    const events = [
      lineup({ a: "pr2", c: "fb" }),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
    ];
    expect(seasonTimeByUnit("rugby_league", events, "position")).toEqual({ a: { pr2: 20 * MIN }, c: { fb: 20 * MIN } });
  });
});

// Stagehand whole-game-union (16 Oct 2026): the hooker was hurt and the
// replacement came on, but the tiles re-dealt every position — the sub
// showed as a prop and another forward moved to hooker. Mid-period a
// sub takes over the slot of the kid they replace, as the season count
// already says; only kids without a held slot are dealt a free one.
describe("held slots mid-period", () => {
  const start = ev("lineup_set", {
    lineup: { forwards: ["a", "b", "c"], backs: ["x"], bench: ["s"], slots: { a: "pr", b: "hk", c: "lk", x: "fb" } },
  });

  it("the sub takes over the hurt kid's slot", () => {
    const events = [
      start,
      ev("quarter_start", { quarter: 1 }),
      ev("injury", { injured: true, quarter: 1, elapsed_ms: 6 * MIN }, "b"),
      ev("swap", { quarter: 1, elapsed_ms: 6 * MIN, off_player_id: "b", on_player_id: "s" }, "s"),
    ];
    const held = leagueSlotsNow(events);
    expect(held).toEqual({ a: "pr", s: "hk", c: "lk", x: "fb" });
    // The sub has played hooker all season: a fresh deal moves them.
    const pb = input({ seasonPositions: { s: { hk: 60 * MIN } } });
    const field = { forwards: ["a", "s", "c"], backs: ["x"] };
    expect(assignLeaguePositionLabels(field, pb).s).not.toBe("HK");
    expect(assignLeaguePositionLabels(field, pb, held)).toEqual({ a: "PR", s: "HK", c: "LK", x: "FB" });
  });

  it("a kid moved to the other line is dealt a free spot there", () => {
    const events = [
      start,
      ev("quarter_start", { quarter: 1 }),
      ev("league_position_change", { quarter: 1, elapsed_ms: 4 * MIN, to_zone: "back" }, "c"),
    ];
    const held = leagueSlotsNow(events);
    expect(held).toEqual({ a: "pr", b: "hk", x: "fb" });
    expect(assignLeaguePositions({ forwards: ["a", "b"], backs: ["x", "c"] }, input(), held)).toEqual({ a: "pr", b: "hk", x: "fb", c: "wg" });
  });

  it("a held slot from the wrong line is ignored", () => {
    expect(assignLeaguePositions({ forwards: ["a"], backs: ["x"] }, input(), { a: "fb", x: "pr" })).toEqual({ a: "pr", x: "fb" });
  });
});
