// Hockey's kit-up heads-up ("Harper's in goal next half: start kitting
// up"). The audit (23 Oct 2026) found only Suggested honoured it: Repeat
// kept last half's keeper, and Fix put someone else in goal.

import { describe, expect, it } from "vitest";
import { breakPlansWithKeeper, preferAnnouncedKeeper } from "@/components/soccer/keeperKitUp";
import type { SoccerLineup } from "@/lib/sports/soccer/lineup";
import type { BoardSlot } from "@/lib/live/break/board";

const LAST_HALF: SoccerLineup = {
  keeper: "mia",
  lines: { def: ["jack", "d2"], mid: ["harper", "m2"], att: ["a1", "a2"], field: [] },
  bench: ["b1", "b2"],
};
const EMPTY: SoccerLineup = { keeper: null, lines: { def: [], mid: [], att: [], field: [] }, bench: ["mia", "jack", "harper"] };

describe("breakPlansWithKeeper", () => {
  it("puts the kitted-up kid in goal in every plan but Manual", () => {
    const plans = breakPlansWithKeeper(
      { suggested: LAST_HALF, rotate: LAST_HALF, repeat: LAST_HALF, manual: EMPTY },
      "harper",
      new Set(),
    );
    expect(plans.suggested.keeper).toBe("harper");
    expect(plans.rotate.keeper).toBe("harper");
    expect(plans.repeat.keeper).toBe("harper");
    // Last half's keeper takes their place.
    expect(plans.repeat.lines.mid).toContain("mia");
    // Manual starts empty, for the coach to fill.
    expect(plans.manual).toBe(EMPTY);
  });

  it("leaves the plans alone with no heads-up, or when the kid can't play", () => {
    const plans = { suggested: LAST_HALF, rotate: LAST_HALF, repeat: LAST_HALF, manual: EMPTY };
    expect(breakPlansWithKeeper(plans, null, new Set()).repeat.keeper).toBe("mia");
    expect(breakPlansWithKeeper(plans, "harper", new Set(["harper"])).repeat.keeper).toBe("mia");
  });
});

describe("preferAnnouncedKeeper", () => {
  const slot = (group: string, playerId: string | null, index = 0): BoardSlot => ({ zone: group, group, index, playerId });

  it("ranks the swap that puts them in goal first, and one that takes them out last", () => {
    const rank = preferAnnouncedKeeper("harper");
    expect(rank(slot("gk", "mia"), slot("mid", "harper"))).toBeGreaterThan(rank(slot("gk", "mia"), slot("def", "jack")));
    expect(rank(slot("mid", "harper"), slot("gk", "mia"))).toBeGreaterThan(0);
    expect(rank(slot("gk", "harper"), slot("def", "jack"))).toBeLessThan(0);
    expect(rank(slot("def", "jack"), slot("bench", "b1"))).toBe(0);
    expect(preferAnnouncedKeeper(null)(slot("gk", "mia"), slot("mid", "harper"))).toBe(0);
  });
});
