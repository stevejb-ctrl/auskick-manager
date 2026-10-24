// The Fix-scores list (ScoreReviewPanel): who each score is put down to,
// and the periods it's grouped by. The audit (23 Oct 2026) found AFL's
// rushed behind listed as "Player", and soccer's half-time list grouped
// under "Q1" with a Q1–Q4 picker for a game of two halves.

import { describe, expect, it } from "vitest";
import { groupScoreLog, scoreEntryWho, type ScoreLogLike } from "@/lib/live/scoreLog";

const entry = (over: Partial<ScoreLogLike> & Pick<ScoreLogLike, "id" | "type">): ScoreLogLike => ({
  player_id: null,
  quarter: 1,
  created_at: "2026-10-23T09:00:00.000Z",
  ...over,
});

describe("scoreEntryWho", () => {
  const nameOf = (id: string) => (id === "p1" ? "Mia Jones" : undefined);

  it("names the kicker, and the opposition", () => {
    expect(scoreEntryWho(entry({ id: "a", type: "goal", player_id: "p1" }), nameOf)).toBe("Mia Jones");
    expect(scoreEntryWho(entry({ id: "b", type: "opponent_behind" }), nameOf)).toBe("Opposition");
  });

  it("says a rushed behind was rushed, not 'Player'", () => {
    expect(scoreEntryWho(entry({ id: "c", type: "behind", rushed: true }), nameOf)).toBe("Rushed");
  });

  it("says nobody was credited when the coach didn't see who scored", () => {
    expect(scoreEntryWho(entry({ id: "d", type: "goal", unattributed: true }), nameOf)).toBe("No scorer");
    expect(scoreEntryWho(entry({ id: "e", type: "goal" }), nameOf)).toBe("No scorer");
    // A kid no longer in the squad list.
    expect(scoreEntryWho(entry({ id: "f", type: "goal", player_id: "gone" }), nameOf)).toBe("—");
  });
});

describe("groupScoreLog", () => {
  it("groups by the game's own periods, newest first, without undone scores", () => {
    const log: ScoreLogLike[] = [
      entry({ id: "g1", type: "goal", player_id: "p1", quarter: 1, created_at: "2026-10-23T09:01:00.000Z" }),
      entry({ id: "g2", type: "opponent_goal", quarter: 1, created_at: "2026-10-23T09:02:00.000Z" }),
      entry({ id: "g3", type: "goal", player_id: "p1", quarter: 2, created_at: "2026-10-23T09:30:00.000Z" }),
      entry({ id: "u1", type: "score_undo", quarter: 2, target_event_id: "g3", created_at: "2026-10-23T09:31:00.000Z" }),
    ];
    const halves = groupScoreLog(log, 2);
    expect(halves.map((g) => [g.period, g.entries.map((e) => e.id)])).toEqual([
      [1, ["g2", "g1"]],
      [2, []],
    ]);
    // A score booked to no period counts in the first.
    expect(groupScoreLog([entry({ id: "x", type: "goal", quarter: null })], 4)[0].entries.map((e) => e.id)).toEqual(["x"]);
  });
});
