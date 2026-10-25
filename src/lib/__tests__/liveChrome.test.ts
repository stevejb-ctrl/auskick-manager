// The words and numbers the shared live chrome shows in every sport
// (useLiveChrome): the undo strip's "what was recorded", the swap
// toast, a kid's lent minutes on the long-press sheet, and the order of
// the scorer sheet. AFL's LiveGame is the reference (UX audit 23 Oct
// 2026, "Drift from AFL").

import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/lib/types";
import {
  liveLoanMinutes,
  squadLoanAverage,
  swapToastText,
  undoMessage,
} from "@/lib/live/liveChrome";
import { soccerLikelyScorers } from "@/lib/sports/soccer/scorers";

describe("undoMessage", () => {
  it("names the team, what was scored and who, as AFL's strip does", () => {
    expect(
      undoMessage({ side: "us", what: "goal", teamName: "Roos", opponentName: "Crabs", scorerName: "Mia" }),
    ).toBe("Roos goal — Mia");
  });

  it("leaves the scorer off when there's none (theirs, or not sure who)", () => {
    expect(undoMessage({ side: "them", what: "goal", teamName: "Roos", opponentName: "Crabs" })).toBe("Crabs goal");
    expect(undoMessage({ side: "us", what: "3 points", teamName: "Cobras", opponentName: "Rangers", scorerName: null })).toBe(
      "Cobras 3 points",
    );
  });
});

describe("swapToastText", () => {
  it("reads off → on, or who came on into an empty spot", () => {
    expect(swapToastText("Leo", "Ava")).toBe("Leo → Ava");
    expect(swapToastText(null, "Ava")).toBe("Ava on");
  });
});

describe("liveLoanMinutes", () => {
  const ev = (type: string, created_at: string, player_id: string | null, metadata: Record<string, unknown>): GameEvent => ({
    id: `${type}-${created_at}`,
    game_id: "g",
    type: type as GameEvent["type"],
    player_id,
    metadata,
    created_by: null,
    created_at,
  });

  it("adds this game's time lent, the open stint up to now, to the season's", () => {
    const events = [
      ev("quarter_start", "2026-10-23T08:00:00Z", null, { quarter: 1 }),
      ev("player_loan", "2026-10-23T08:02:00Z", "p1", { loaned: true, elapsed_ms: 120_000, quarter: 1 }),
    ];
    // Lent at 2:00, now 5:00 in the period: 3 minutes this game.
    expect(liveLoanMinutes({ seasonLoanMinutes: { p1: 10 }, events, playerId: "p1", openElapsedMs: 300_000 })).toBe(13);
  });

  it("counts a closed stint once, and nothing for a period that isn't running", () => {
    const events = [
      ev("quarter_start", "2026-10-23T08:00:00Z", null, { quarter: 1 }),
      ev("player_loan", "2026-10-23T08:02:00Z", "p1", { loaned: true, elapsed_ms: 120_000, quarter: 1 }),
      ev("player_loan", "2026-10-23T08:06:00Z", "p1", { loaned: false, elapsed_ms: 360_000, quarter: 1 }),
      ev("quarter_end", "2026-10-23T08:20:00Z", null, { quarter: 1, elapsed_ms: 1_200_000 }),
    ];
    expect(liveLoanMinutes({ seasonLoanMinutes: {}, events, playerId: "p1", openElapsedMs: null })).toBe(4);
  });

  it("is the season's alone for a kid never lent today", () => {
    expect(liveLoanMinutes({ seasonLoanMinutes: { p2: 7 }, events: [], playerId: "p2", openElapsedMs: 60_000 })).toBe(7);
  });
});

describe("squadLoanAverage", () => {
  it("averages the kids who've been lent, as AFL's sheet does", () => {
    expect(squadLoanAverage({ a: 10, b: 20, c: 0 })).toBe(15);
    expect(squadLoanAverage({})).toBe(0);
  });
});

describe("soccerLikelyScorers (the scorer sheet's order)", () => {
  it("lists attack first and the keeper last, then the bench", () => {
    const order = soccerLikelyScorers({
      keeper: "gk",
      lines: { def: ["d1"], mid: ["m1"], att: ["a1", "a2"], field: [] },
      bench: ["b1"],
    });
    expect(order.map((s) => s.id)).toEqual(["a1", "a2", "m1", "d1", "gk", "b1"]);
    expect(order.map((s) => s.unit)).toEqual(["att", "att", "mid", "def", "gk", null]);
  });

  it("puts a one-line field before the keeper", () => {
    const order = soccerLikelyScorers({ keeper: "gk", lines: { def: [], mid: [], att: [], field: ["f1", "f2"] }, bench: [] });
    expect(order.map((s) => s.id)).toEqual(["f1", "f2", "gk"]);
  });
});
