// The touch family's planning-screen edits and the full-time summary.

import { describe, expect, it } from "vitest";
import type { Player } from "@/lib/types";
import {
  benchInTouchLineup,
  benchOutInTouchLineup,
  placeInTouchLineup,
  reshapeTouchLineup,
  swapInTouchLineup,
  withEveryoneInTouchLineup,
} from "@/lib/sports/touch/live";
import { buildTouchSummary } from "@/lib/sports/touch/summary";
import { replayTouchGame } from "@/lib/sports/touch/replay";
import { FIELD, LANES, game } from "./touchGame";

describe("planning edits", () => {
  it("swaps two kids wherever they are", () => {
    const lu = swapInTouchLineup(LANES, "a", "e");
    expect(lu.lines.middle).toEqual(["e", "b"]);
    expect(lu.lines.wing).toEqual(["a", "f"]);
    const sub = swapInTouchLineup(LANES, "g", "c");
    expect(sub.lines.link).toEqual(["g", "d"]);
    expect(sub.bench[0]).toBe("c");
    expect(swapInTouchLineup(LANES, "g", "h")).toBe(LANES);
  });

  it("places a kid in a lane, benches the hurt, and adds kids the draft missed", () => {
    expect(placeInTouchLineup(LANES, "g", "wing").lines.wing).toEqual(["e", "f", "g"]);
    const out = benchOutInTouchLineup(LANES, new Set(["a", "c"]));
    expect(out.lines.middle).toEqual(["b"]);
    expect(out.bench.slice(-2)).toEqual(["a", "c"]);
    const draft = { ...LANES, bench: LANES.bench.slice(0, 2) };
    expect(withEveryoneInTouchLineup(draft, LANES).bench).toEqual(LANES.bench);
  });

  it("reshapes between Minutes only and lanes, keeping lanes where they fit", () => {
    expect(reshapeTouchLineup(LANES, { middle: 0, link: 0, wing: 0, field: 6 }).lines.field).toEqual(["a", "b", "c", "d", "e", "f"]);
    const lanes = reshapeTouchLineup(FIELD, { middle: 2, link: 2, wing: 2, field: 0 });
    expect(lanes.lines).toEqual({ middle: ["a", "b"], link: ["c", "d"], wing: ["e", "f"], field: [] });
    // A kid comes off: 2-1-2 goes to 1-2-2, a middle moving to the links.
    const narrower = reshapeTouchLineup(benchInTouchLineup(LANES, "c"), { middle: 1, link: 2, wing: 2, field: 0 });
    expect(narrower.lines.middle).toEqual(["a"]);
    expect(narrower.lines.link).toEqual(["d", "b"]);
  });
});

describe("buildTouchSummary", () => {
  const squad: Player[] = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => ({
    id,
    team_id: "t1",
    full_name: `${id.toUpperCase()}lex Smith`,
    jersey_number: i + 1,
    is_active: true,
    mixed_group: i < 3 ? "girl" : "boy",
    created_by: "u1",
    created_at: "",
    updated_at: "",
  }));

  it("gives the result, the try scorers and the game time, and never a group", () => {
    const g = game();
    g.lineup(LANES);
    g.start(1);
    g.score("girls_try", 3, "a");
    g.score("try", 4, "a");
    g.score("opponent_try", 5);
    g.move("a", "e", "wing", 10);
    g.end(1, 20);
    g.add("game_finalised");
    const text = buildTouchSummary({
      teamName: "Sharks",
      opponentName: "Rays",
      trackScoring: true,
      state: replayTouchGame(g.events),
      squad,
      presentIds: ["a", "b", "c", "d", "e", "f", "g"],
    });
    expect(text).toContain("Sharks 3 def Rays 1");
    expect(text).toContain("Tries: Alex (#1) 2");
    expect(text).toContain("#1 Alex — 20:00 (M 10:00, W 10:00)");
    expect(text).toContain("#7 Glex — 0:00 (didn't get on)");
    expect(text).not.toMatch(/girl|boy/i);
  });
});
