import { describe, expect, it } from "vitest";
import { outcomeOf, scoreFromEvents, seasonRecord } from "@/lib/results";
import type { GameEvent } from "@/lib/types";

let seq = 0;
function ev(type: string, metadata: Record<string, unknown> = {}, player_id: string | null = "p1"): GameEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    game_id: "g1",
    type,
    player_id,
    metadata,
    created_by: "u",
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
  } as unknown as GameEvent;
}

describe("scoreFromEvents", () => {
  it("adds AFL goals and behinds as 6 + 1 and keeps the G.B breakdown", () => {
    const s = scoreFromEvents("afl", [
      ev("quarter_start", { quarter: 1 }, null),
      ev("goal"),
      ev("goal"),
      ev("behind"),
      ev("opponent_goal", {}, null),
    ]);
    expect(s).toEqual({ us: 13, them: 6, usDetail: "2.1", themDetail: "1.0" });
  });

  it("counts netball goals", () => {
    const s = scoreFromEvents("netball", [
      ev("quarter_start", { quarter: 1 }, null),
      ev("goal"),
      ev("opponent_goal", {}, null),
      ev("opponent_goal", {}, null),
    ]);
    expect(s.us).toBe(1);
    expect(s.them).toBe(2);
  });
});

describe("outcome and season record", () => {
  it("classifies wins, losses and draws", () => {
    expect(outcomeOf({ us: 10, them: 4 })).toBe("W");
    expect(outcomeOf({ us: 4, them: 10 })).toBe("L");
    expect(outcomeOf({ us: 7, them: 7 })).toBe("D");
    expect(seasonRecord([{ us: 10, them: 4 }, { us: 1, them: 2 }, { us: 3, them: 3 }])).toEqual({
      played: 3,
      won: 1,
      lost: 1,
      drawn: 1,
    });
  });
});
