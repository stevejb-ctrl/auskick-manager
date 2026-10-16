// Saved holds (UX plan §6 Live: "keep-on and fixed are saved, not
// browser-only"). A coach's Keep on / Keep in {zone} / Keep in
// {position} is a `player_lock` event, so a reload or a co-manager's
// phone replays the same holds.

import { describe, expect, it } from "vitest";
import { replayGame } from "@/lib/fairness";
import { aflStoreLocks, netballPositionLocks, replayLocks } from "@/lib/live/locks";
import type { GameEvent } from "@/lib/types";

let evCounter = 0;
function ev(
  type: GameEvent["type"],
  metadata: Record<string, unknown> = {},
  player_id: string | null = null,
): GameEvent {
  evCounter++;
  const t = new Date(2026, 0, 1, 12, 0, evCounter).toISOString();
  return {
    id: `e${evCounter}`,
    game_id: "g1",
    type,
    player_id,
    metadata,
    created_at: t,
    created_by: "u1",
  } as GameEvent;
}
const lock = (pid: string, l: unknown) => ev("player_lock", { lock: l, quarter: 1, elapsed_ms: 0 }, pid);

describe("replayLocks", () => {
  it("keeps each player's latest hold and drops cleared ones", () => {
    const locks = replayLocks([
      lock("a", { kind: "field" }),
      lock("b", { kind: "zone", zone: "back" }),
      lock("a", { kind: "zone", zone: "fwd" }),
      lock("b", null),
    ]);
    expect(locks).toEqual({ a: { kind: "zone", zone: "fwd" } });
  });

  it("ignores holds it doesn't understand", () => {
    expect(replayLocks([lock("a", { kind: "nonsense" }), lock("b", { kind: "zone" })])).toEqual({});
  });
});

describe("aflStoreLocks", () => {
  it("splits holds into the live store's field and zone locks", () => {
    expect(
      aflStoreLocks({ a: { kind: "field" }, b: { kind: "zone", zone: "mid" }, c: { kind: "position", position: "gs" } }),
    ).toEqual({ lockedIds: ["a"], zoneLockedPlayers: { b: "mid" } });
  });
});

describe("netballPositionLocks", () => {
  it("maps bibs to players, the latest hold on a bib winning", () => {
    const locks = replayLocks([
      lock("a", { kind: "position", position: "gs" }),
      lock("b", { kind: "position", position: "gk" }),
      lock("c", { kind: "position", position: "gs" }),
      lock("d", { kind: "field" }),
    ]);
    expect(netballPositionLocks(locks)).toEqual({ gs: "c", gk: "b" });
  });
});

describe("replayGame", () => {
  it("carries saved holds only once the game has some", () => {
    expect(replayGame([ev("quarter_start", { quarter: 1 })]).locks).toBeUndefined();
    const state = replayGame([ev("quarter_start", { quarter: 1 }), lock("a", { kind: "field" })]);
    expect(state.locks).toEqual({ a: { kind: "field" } });
  });
});
