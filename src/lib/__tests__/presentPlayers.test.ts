import { describe, expect, it } from "vitest";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import type { GameEvent, GameEventType } from "@/lib/types";

let n = 0;
const ev = (type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent => ({
  id: `e${++n}`,
  game_id: "g1",
  type,
  player_id: playerId,
  metadata,
  created_by: null,
  created_at: new Date(2026, 0, 1, 9, 0, n).toISOString(),
});

describe("presentPlayerIds", () => {
  it("collects everyone in any sport's lineups, and late arrivals", () => {
    const ids = presentPlayerIds([
      // AFL zones + bench
      ev("lineup_set", { lineup: { back: ["a1"], hback: [], mid: ["a2"], hfwd: [], fwd: [], bench: ["a3"] } }),
      // Netball positions + bench, at a break
      ev("period_break_swap", { lineup: { positions: { gs: ["n1"], gk: ["n2"] }, bench: ["n3"] } }),
      ev("player_arrived", {}, "late"),
    ]);
    expect(ids.sort()).toEqual(["a1", "a2", "a3", "late", "n1", "n2", "n3"]);
  });

  it("ignores a league lineup's position slots (keys, not kids)", () => {
    // Before: every string in the lineup counted, so "hk" and "fb" became
    // phantom kids — How we played named "A fill-in" under 50 %.
    const ids = presentPlayerIds([
      ev("lineup_set", { lineup: { forwards: ["l1"], backs: ["l2"], bench: ["l3"], slots: { l1: "hk", l2: "fb" } } }),
    ]);
    expect(ids.sort()).toEqual(["l1", "l2", "l3"]);
  });
});
