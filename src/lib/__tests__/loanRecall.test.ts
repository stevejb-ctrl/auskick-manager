// Regression coverage for recalling lent (loaned) players.
//
// Bug (reported from real games): a player lent to the opposition BEFORE
// kickoff (toggled in the pre-game lineup picker) vanished at quarter breaks —
// the coach had to actually start the quarter to get them back. Two root
// causes, both covered here:
//
//   1. replayGame dropped any player_loan recorded before the first
//      lineup_set (the handler was gated on `state.lineup`), so a pre-game
//      loan never landed in loanedIds — the break UI had no idea the player
//      was lent, so couldn't offer to recall them.
//   2. The store's setLoaned(false) recall left a pre-game-lent player (who
//      was never placed in the lineup) nowhere — not on the bench — so there
//      was nothing to field.

import { describe, expect, it, beforeEach } from "vitest";
import { replayGame } from "@/lib/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { GameEvent, Lineup } from "@/lib/types";

let evCounter = 0;
function ev(
  type: GameEvent["type"],
  metadata: Record<string, unknown> = {},
  playerId: string | null = null,
): GameEvent {
  evCounter++;
  const t = new Date(2026, 0, 1, 12, 0, 0, evCounter).toISOString();
  return {
    id: `e${evCounter}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_at: t,
    created_by: "u1",
  } as GameEvent;
}

function freshLineup(): Lineup {
  return {
    back: ["bA", "bB"],
    hback: [],
    mid: ["mA", "mB"],
    hfwd: [],
    fwd: ["fA", "fB"],
    bench: ["x1"],
  };
}

describe("replayGame — loans recorded before lineup_set (pre-game lends)", () => {
  it("records a pre-kickoff loan in loanedIds even though no lineup exists yet", () => {
    evCounter = 0;
    const events = [
      // Coach lends 'lentGuy' in the pre-game picker, BEFORE the lineup
      // is saved and the game started.
      ev("player_loan", { loaned: true, quarter: 1, elapsed_ms: 0 }, "lentGuy"),
      ev("lineup_set", { lineup: freshLineup() }),
      ev("quarter_start", { quarter: 1, elapsed_ms: 0 }),
    ];
    const state = replayGame(events);
    expect(state.loanedIds).toContain("lentGuy");
  });

  it("still records an in-game loan and benches the on-field player (no regression)", () => {
    evCounter = 0;
    const events = [
      ev("lineup_set", { lineup: freshLineup() }),
      ev("quarter_start", { quarter: 1, elapsed_ms: 0 }),
      ev("player_loan", { loaned: true, quarter: 1, elapsed_ms: 30_000 }, "fA"),
    ];
    const state = replayGame(events);
    expect(state.loanedIds).toContain("fA");
    expect(state.lineup?.fwd).not.toContain("fA");
    expect(state.lineup?.bench).toContain("fA");
  });

  it("a pre-game loan then return clears loanedIds", () => {
    evCounter = 0;
    const events = [
      ev("player_loan", { loaned: true, quarter: 1, elapsed_ms: 0 }, "lentGuy"),
      ev("lineup_set", { lineup: freshLineup() }),
      ev("quarter_start", { quarter: 1, elapsed_ms: 0 }),
      ev("player_loan", { loaned: false, quarter: 1, elapsed_ms: 60_000 }, "lentGuy"),
    ];
    const state = replayGame(events);
    expect(state.loanedIds).not.toContain("lentGuy");
  });
});

describe("liveGameStore.setLoaned — recall restores to the bench", () => {
  beforeEach(() => {
    useLiveGame.setState({
      lineup: freshLineup(),
      currentQuarter: 1,
      clockStartedAt: null,
      accumulatedMs: 60_000,
      basePlayedZoneMs: {},
      basePlayedLoanMs: {},
      stintStartMs: {},
      stintZone: {},
      injuredIds: [],
      loanedIds: ["lentGuy"],
      loanStartMs: { lentGuy: 0 },
      swapCount: 0,
      selected: null,
    });
  });

  it("recalling a player who was never placed drops them onto the bench", () => {
    // 'lentGuy' is loaned but not in any zone or on the bench (pre-game lend).
    useLiveGame.getState().setLoaned("lentGuy", false);
    const s = useLiveGame.getState();
    expect(s.loanedIds).not.toContain("lentGuy");
    expect(s.lineup.bench).toContain("lentGuy");
  });

  it("recalling a player already on the bench doesn't duplicate them", () => {
    useLiveGame.setState({ lineup: { ...freshLineup(), bench: ["x1", "lentGuy"] } });
    useLiveGame.getState().setLoaned("lentGuy", false);
    const s = useLiveGame.getState();
    expect(s.lineup.bench.filter((id) => id === "lentGuy")).toHaveLength(1);
  });
});
