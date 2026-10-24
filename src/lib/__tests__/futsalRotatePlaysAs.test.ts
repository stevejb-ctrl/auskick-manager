// ─── Futsal: Rotate and the rule check keep "Plays as" ───────
// Round 2 usability, 24 Oct 2026 (futsal P2): Ruby's role is "Plays
// as: Wings — Siren suggests them only here". Rotate moved everyone up a
// line and put her at Back, and the break showed no rule check for it.
// Rotate now moves a kid only to a line they play (or keeps them in
// theirs), and the check fails a kid placed in a line their "Plays as"
// leaves out, with the swap that fixes it.

import { describe, expect, it } from "vitest";
import { rotateGroups } from "@/lib/live/break/rotateGroups";
import { soccerBreakCheck } from "@/lib/sports/soccer/breakCheck";
import { soccerFamilyAgeGroup, soccerFamilyRules } from "@/lib/sports/soccer/family";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import type { SoccerLineup } from "@/lib/sports/soccer/lineup";
import { MIN, game } from "@/lib/sports/soccer/__tests__/soccerGame";

// Futsal's diamond (1-2-1) behind a keeper; Ruby plays the wings only.
const H1: SoccerLineup = {
  keeper: "k",
  lines: { def: ["d1"], mid: ["ruby", "m2"], att: ["a1"], field: [] },
  bench: ["b1"],
};
const notInLine = { ruby: ["def", "att"] as const };
const plays = (pid: string, line: string) => !(notInLine as Record<string, readonly string[]>)[pid]?.includes(line);

describe("Rotate with Plays as", () => {
  it("keeps a wings-only kid on the wings while the rest move up a line", () => {
    const out = rotateGroups({
      players: ["d1", "ruby", "m2", "a1"],
      cycle: ["def", "mid", "att"],
      caps: { def: 1, mid: 2, att: 1 },
      // m2 has played up front; on time alone Ruby would take the front.
      timeIn: (pid, line) => (pid === "m2" && line === "att" ? 5 * MIN : 0),
      total: () => 20 * MIN,
      lastGroup: { d1: "def", ruby: "mid", m2: "mid", a1: "att" },
      plays,
    });
    expect(out.groups.mid).toContain("ruby");
    expect(out.groups.def).toEqual(["a1"]);
    expect(out.groups.att).toEqual(["m2"]);
  });
});

describe("the futsal break check", () => {
  const ageGroup = soccerFamilyAgeGroup("futsal", "U10");
  const g = game();
  g.lineup(H1);
  g.start(1);
  g.end(1, 20);

  it("fails a kid placed in a line their Plays as leaves out", () => {
    const lineup: SoccerLineup = { keeper: "k", lines: { def: ["ruby"], mid: ["d1", "m2"], att: ["a1"], field: [] }, bench: ["b1"] };
    const items = soccerBreakCheck({
      lineup,
      state: replaySoccerGame(g.events),
      ageGroup,
      rules: soccerFamilyRules("futsal"),
      onFieldSize: 5,
      period: 2,
      periodMs: 20 * MIN,
      names: { ruby: "Ruby" },
      keeperStrategy: "turns",
      prefs: { notInLine },
    });
    const item = items.find((i) => i.id === "plays-as-ruby");
    expect(item).toMatchObject({ status: "fail", text: "Ruby plays Wings only", playerIds: ["ruby"] });
  });
});
