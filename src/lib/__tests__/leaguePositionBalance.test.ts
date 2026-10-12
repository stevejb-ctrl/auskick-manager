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
import { playerSlotMsOnField } from "@/lib/sports/rugby_league/fairness";
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

  it("two spots of one role share their season time", () => {
    const props = input({
      positions: [
        { key: "pr1", label: "PR", line: "forwards" },
        { key: "hk", label: "HK", line: "forwards" },
        { key: "pr2", label: "PR", line: "forwards" },
      ],
      // Time as a prop is stored by role ("pr"), whichever prop spot.
      seasonPositions: { a: { pr: 40 * MIN } },
    });
    expect(assignLeaguePositions({ forwards: ["a", "b"], backs: [] }, props)).toEqual({ a: "hk", b: "pr1" });
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

  it("feeds season time by role", () => {
    const events = [
      lineup({ a: "pr2", c: "fb" }),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
    ];
    expect(seasonTimeByUnit("rugby_league", events, "position")).toEqual({ a: { pr: 20 * MIN }, c: { fb: 20 * MIN } });
  });
});
