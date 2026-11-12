// Netball's "Player chemistry — top pairs" credited every lineup with a
// full nominal quarter, so a game whose quarters ended early read "Ava
// Nguyen + Mia Patel 30 min" when the whole game ran 19:47 (Stagehand
// round 11, 11 Nov 2026). A pair's time together is the time their
// quarters actually ran.

import { describe, expect, it } from "vitest";
import { computeNetballChemistry, replayNetballGameForStats } from "@/lib/dashboard/netballAggregators";
import type { GameEvent } from "@/lib/types";

const POS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
const ids = ["ava", "mia", "p2", "p3", "p4", "p5", "p6"];
const lineup = () => ({ positions: Object.fromEntries(POS.map((p, i) => [p, [ids[i]]])), bench: ["b1"] });

let n = 0;
function ev(type: string, metadata: Record<string, unknown> = {}): GameEvent {
  n++;
  return {
    id: `e${n}`,
    game_id: "g1",
    type,
    player_id: null,
    metadata,
    created_by: "u",
    created_at: new Date(Date.UTC(2026, 10, 11, 9, 0, n)).toISOString(),
  } as GameEvent;
}

const Q_SECONDS = 600;
const pairMs = (events: GameEvent[]) => {
  const pairs = computeNetballChemistry([replayNetballGameForStats("g1", events, Q_SECONDS)]);
  return pairs.find((p) => [p.playerAId, p.playerBId].sort().join(":") === "ava:mia")?.durationMs ?? 0;
};

describe("netball chemistry: a pair's time is the time their quarters ran", () => {
  it("credits a quarter ended early with its elapsed time, not the full quarter", () => {
    const events = [
      ev("lineup_set", { lineup: lineup() }),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 287_728 }),
      ev("period_break_swap", { lineup: lineup(), midQuarterSubs: [] }),
      ev("quarter_start", { quarter: 2 }),
      ev("quarter_end", { quarter: 2, elapsed_ms: 369_520 }),
      ev("game_finalised", { quarter: 2 }),
    ];
    // GS and GA share the attack third for both quarters.
    expect(pairMs(events)).toBe(287_728 + 369_520);
  });

  it("doesn't count a quarter twice when the lineup was set twice before it", () => {
    const events = [
      ev("lineup_set", { lineup: lineup() }),
      ev("lineup_set", { lineup: lineup() }),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 600_000 }),
      ev("game_finalised", { quarter: 1 }),
    ];
    expect(pairMs(events)).toBe(600_000);
  });

  it("a lineup that never started a quarter adds nothing", () => {
    expect(pairMs([ev("lineup_set", { lineup: lineup() })])).toBe(0);
  });
});
