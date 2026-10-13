// AFL replay, robust to the order sideline events land in. The live game
// queued each action kind in its own lane, so an injury and its
// replacement swap (or a swap and the hooter) could reach the server in
// either order. Found by the sideline-combos walks (harness in
// __tests__/sideline).

import { describe, expect, it } from "vitest";
import { replayGame } from "@/lib/fairness";
import type { GameEvent, GameEventType } from "@/lib/types";

let n = 0;
const ev = (type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent => ({
  id: `e${++n}`,
  game_id: "g1",
  type,
  player_id: playerId,
  metadata,
  created_by: null,
  created_at: new Date(Date.UTC(2026, 9, 10, 9, 0, n)).toISOString(),
});

const kickoff = () => [
  ev("lineup_set", { lineup: { back: ["a", "b"], hback: [], mid: ["c", "d"], hfwd: [], fwd: ["e", "f"], bench: ["x", "y"] } }),
  ev("quarter_start", { quarter: 1 }),
];
const total = (zm: Record<string, number> | undefined) => Object.values(zm ?? {}).reduce((s, v) => s + v, 0);

describe("replayGame: injury and its replacement swap, in either order", () => {
  for (const injuryFirst of [true, false]) {
    it(injuryFirst ? "injury lands first (the order the coach acted)" : "swap lands first", () => {
      const at = { quarter: 1, elapsed_ms: 300_000 };
      const injury = () => ev("injury", { injured: true, ...at }, "c");
      const swap = () => ev("swap", { off_player_id: "c", on_player_id: "x", zone: "mid", ...at }, "x");
      const s = replayGame([...kickoff(), ...(injuryFirst ? [injury(), swap()] : [swap(), injury()]), ev("quarter_end", { quarter: 1, elapsed_ms: 720_000 })]);
      // Before: injury-first lost the replacement and benched c twice.
      expect(s.lineup!.mid.sort()).toEqual(["d", "x"]);
      expect(s.lineup!.bench.filter((p) => p === "c")).toHaveLength(1);
      expect(s.injuredIds).toEqual(["c"]);
      expect(total(s.basePlayedZoneMs.c)).toBe(300_000);
      expect(total(s.basePlayedZoneMs.x)).toBe(420_000);
    });
  }
});

describe("replayGame: an off-the-field event after the hooter credits nothing more", () => {
  it("a swap landing after quarter_end doesn't re-credit the quarter", () => {
    const s = replayGame([
      ...kickoff(),
      ev("quarter_end", { quarter: 1, elapsed_ms: 720_000 }),
      ev("swap", { off_player_id: "a", on_player_id: "x", zone: "back", quarter: 1, elapsed_ms: 700_000 }, "x"),
    ]);
    // Before: a got the quarter again (720k + 700k).
    expect(total(s.basePlayedZoneMs.a)).toBe(720_000);
  });
});

describe("replayGame: kids coming and going", () => {
  it("a kid lent before kickoff and recalled is back on the bench", () => {
    const s = replayGame([
      ev("player_loan", { loaned: true, quarter: 0, elapsed_ms: 0 }, "z"),
      ...kickoff(),
      ev("player_loan", { loaned: false, quarter: 1, elapsed_ms: 60_000 }, "z"),
    ]);
    expect(s.lineup!.bench).toContain("z");
    expect(s.loanedIds).toEqual([]);
  });

  it("a late arrival already fielded isn't on the bench as well", () => {
    const s = replayGame([
      ...kickoff(),
      ev("lineup_set", { lineup: { back: ["a", "late"], hback: [], mid: ["c", "d"], hfwd: [], fwd: ["e", "f"], bench: ["b", "x", "y"] } }),
      ev("player_arrived", { quarter: 1, elapsed_ms: 0 }, "late"),
    ]);
    expect(s.lineup!.bench).not.toContain("late");
    expect(s.lineup!.back).toContain("late");
  });
});
