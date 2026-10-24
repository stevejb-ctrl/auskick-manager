import { describe, expect, it } from "vitest";
import { isNotPlayed, notPlayedCutoffIso, playedInSiren, splitByNotPlayed } from "@/lib/games/notPlayed";

const NOW = new Date("2026-10-25T05:00:00Z").getTime(); // Sunday 4pm AEDT
const H = 3_600_000;
const game = (id: string, hoursFromNow: number, status: "upcoming" | "in_progress" | "completed" = "upcoming") => ({
  id,
  status,
  scheduled_at: new Date(NOW + hoursFromNow * H).toISOString(),
});

describe("isNotPlayed", () => {
  // Round 3 (24 Oct 2026): last Saturday's game the coach never ran was
  // still "Next up" a week later, over today's.
  it("is a game well past its start that was never started", () => {
    expect(isNotPlayed(game("a", -24 * 7), NOW)).toBe(true);
    expect(isNotPlayed(game("b", -13), NOW)).toBe(true);
  });

  it("isn't a game that's starting late today, live, finished or to come", () => {
    expect(isNotPlayed(game("a", -2), NOW)).toBe(false);
    expect(isNotPlayed(game("b", -48, "in_progress"), NOW)).toBe(false);
    expect(isNotPlayed(game("c", -48, "completed"), NOW)).toBe(false);
    expect(isNotPlayed(game("d", 24), NOW)).toBe(false);
  });
});

describe("splitByNotPlayed", () => {
  it("keeps the next game first and moves the missed ones out", () => {
    const { next, notPlayed } = splitByNotPlayed([game("old", -170), game("live", -1, "in_progress"), game("today", 3), game("soon", 72)], NOW);
    expect(next.map((g) => g.id)).toEqual(["live", "today", "soon"]);
    expect(notPlayed.map((g) => g.id)).toEqual(["old"]);
  });
});

describe("notPlayedCutoffIso", () => {
  it("is 12 hours ago", () => {
    expect(notPlayedCutoffIso(NOW)).toBe(new Date(NOW - 12 * H).toISOString());
  });
});

describe("playedInSiren", () => {
  it("is a game that kicked off (a game marked played has no events)", () => {
    expect(playedInSiren([{ type: "quarter_start" }, { type: "game_finalised" }])).toBe(true);
    expect(playedInSiren([{ type: "quarter_start" }, { type: "goal" }])).toBe(true);
    expect(playedInSiren([])).toBe(false);
  });
});
