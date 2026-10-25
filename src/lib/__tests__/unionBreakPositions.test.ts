// ─── Union's named positions at the break ────────────────────
// Round 2 usability, 24 Oct 2026 (union P2):
//
//   - Repeat reshuffled the named positions (Liam 2R4 → BF6, the props
//     swapped) and still tagged everyone "Stays": the tag compared lines,
//     not positions. A kid who changes position in their line now reads
//     "From BF6"; Repeat keeps each kid's slot (LeagueBreak passes the
//     slots held at the hooter).
//   - Rotate sent the whole front row to the wings and dealt LHP1 to an
//     unpicked late arrival. Kids picked for a front-row spot in force
//     stay forwards, and a kid never playing a line isn't sent there.

import { describe, expect, it } from "vitest";
import { resolveTeamPlaybook } from "@/lib/playbook/team";
import { movementText, placeIndex } from "@/lib/live/break/board";
import { rugbyBreakZones } from "@/lib/sports/rugby/lines";
import { leagueBreakRotation } from "@/lib/sports/rugby/breakSuggestion";
import {
  assignLeaguePositions,
  leaguePlaybookInput,
  restrictedMisfits,
} from "@/lib/sports/rugby_league/engine";
import { getAgeGroupConfig } from "@/lib/sports";
import type { PlayerPositionPrefRow } from "@/lib/playbook/types";

const P = 25 * 60_000;
type Pref = Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">;
const home = (pid: string, key: string): Pref => ({ player_id: pid, position_key: key, line: null, kind: "home", rank: 0 });

describe("the break tile's movement line with named positions", () => {
  const ageGroup = getAgeGroupConfig("rugby_union", "U12");
  const places = placeIndex(rugbyBreakZones({ ageGroup, onFieldSize: 15 }));

  it("says the position a kid comes from in the same line", () => {
    expect(movementText("forwards", "forwards", places, { from: "BF6", to: "2R4" })).toBe("From BF6");
    expect(movementText("forwards", "forwards", places, { from: "2R4", to: "2R4" })).toBe("Stays");
  });

  it("a line change or the bench reads as before", () => {
    expect(movementText("backs", "forwards", places, { from: "FB15", to: "2R4" })).toBe("From FB15");
    expect(movementText(undefined, "forwards", places, { to: "2R4" })).toBe("From bench");
    expect(movementText("forwards", "forwards", places)).toBe("Stays");
  });
});

describe("union's Rotate", () => {
  // U12, 16 here, 15 on. The picked front row (lhp, hk, thp) and five
  // more forwards; seven backs; Tom, a late arrival with no role.
  const resolved = resolveTeamPlaybook({
    sport: "rugby_union",
    ageGroup: "U12",
    onFieldSize: 15,
    row: { strategy: "named-positions", policy_overrides: {}, season_balance: null, season_balance_since: null },
  });
  const forwards = ["lhp", "hk", "thp", "f4", "f5", "f6", "f7", "f8"];
  const backs = ["b9", "b10", "b11", "b12", "b13", "b14", "b15"];
  const pb = leaguePlaybookInput(
    resolved,
    [home("lhp", "ru-1"), home("hk", "ru-2"), home("thp", "ru-3")],
    [],
    undefined,
    P,
  );
  const ageGroup = getAgeGroupConfig("rugby_union", "U12");
  const ids = [...forwards, ...backs, "tom"];
  const rotate = (msByPlayer: Record<string, number>) =>
    leagueBreakRotation({
      ageGroup,
      previousLineup: { forwards, backs, bench: ["tom"] },
      injured: new Set(),
      loaned: new Set(),
      onFieldSize: 15,
      leaguePlaybook: pb,
      msByPlayer,
      lineMs: Object.fromEntries([
        ...forwards.map((id) => [id, { forwards: P, backs: 0 }]),
        ...backs.map((id) => [id, { forwards: 0, backs: P }]),
      ]),
    });

  it("keeps the picked front row in the forwards, and their spots theirs", () => {
    const next = rotate(Object.fromEntries(ids.map((id) => [id, id === "tom" ? 0 : P])));
    for (const pid of ["lhp", "hk", "thp"]) expect(next.forwards, pid).toContain(pid);
    // Everyone else swaps lines.
    for (const pid of ["f4", "f5", "f6", "f7", "f8"]) expect(next.forwards, pid).not.toContain(pid);
    expect(next.forwards).toHaveLength(8);
    const slots = assignLeaguePositions(next, pb);
    expect([slots.lhp, slots.hk, slots.thp]).toEqual(["ru-1", "ru-2", "ru-3"]);
    expect(restrictedMisfits(slots, pb)).toEqual([]);
    expect(slots.tom).not.toBe("ru-1");
  });

  it("brings a picked prop back on rather than leave an unpicked kid at loosehead", () => {
    // lhp played the most: least-played on would sit him.
    const next = rotate(Object.fromEntries(ids.map((id) => [id, id === "tom" ? 0 : id === "lhp" ? P : P - 60_000])));
    expect(next.forwards).toContain("lhp");
    expect(restrictedMisfits(assignLeaguePositions(next, pb), pb)).toEqual([]);
  });
});
