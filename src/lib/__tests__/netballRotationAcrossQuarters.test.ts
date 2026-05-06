// Steve flagged the chip-rotation bug for AFL. Sister-test for
// netball: does the netball suggester have a similar pattern?
//
// Netball's suggester (suggestNetballLineup) DOES NOT read player
// chips — those are AFL-only in the placement scoring, even though
// chips are visible on the squad page for netball teams. So the
// chip-induced cascade Steve hit on his AFL squad cannot recur in
// netball through the same path.
//
// HOWEVER, netball's tier-4 teammate-repeat penalty (-150000 per
// shared Q-1 mate) is intentionally LARGER than tier-1's
// fresh-third bonus (+100000), so a single Q-1 mate already placed
// in a fresh third forces the player back into their last
// quarter's third. This test catches the case where that penalty
// stacks and locks a player into one third for all four quarters.

import { describe, expect, it } from "vitest";
import {
  suggestNetballLineup,
  type PlayerPositionCounts,
} from "@/lib/sports/netball/fairness";

const POSITIONS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
const POSITION_THIRD: Record<string, "attack-third" | "centre-third" | "defence-third"> = {
  gs: "attack-third",
  ga: "attack-third",
  wa: "centre-third",
  c: "centre-third",
  wd: "centre-third",
  gd: "defence-third",
  gk: "defence-third",
};

function thirdOf(positionId: string) {
  return POSITION_THIRD[positionId] ?? null;
}

function alwaysAllowed() {
  return true;
}

function simulateFour(playerIds: string[]) {
  const seasonCounts: PlayerPositionCounts = {};
  const gameCounts: PlayerPositionCounts = {};
  for (const id of playerIds) {
    seasonCounts[id] = {};
    gameCounts[id] = {};
  }
  let lastQuarterThird: Record<string, "attack-third" | "centre-third" | "defence-third"> = {};
  let previousTeammates: Record<string, Set<string>> = {};

  // Per-player history of (quarter index 0..3) → third.
  const history: Record<string, ("attack-third" | "centre-third" | "defence-third" | null)[]> = {};
  for (const id of playerIds) history[id] = [];

  for (let q = 0; q < 4; q++) {
    const lineup = suggestNetballLineup({
      playerIds,
      positions: POSITIONS,
      season: seasonCounts,
      thisGame: gameCounts,
      isAllowed: alwaysAllowed,
      seed: 100 + q,
      thirdOf,
      lastQuarterThird,
      previousTeammates,
    });

    // Snapshot which third each player ended up in.
    const thirds: Record<string, "attack-third" | "centre-third" | "defence-third" | null> = {};
    const teammatesByThird: Record<string, Set<string>> = {
      "attack-third": new Set(),
      "centre-third": new Set(),
      "defence-third": new Set(),
    };
    for (const [posId, ids] of Object.entries(lineup.positions)) {
      const t = thirdOf(posId);
      if (!t) continue;
      for (const pid of ids) {
        thirds[pid] = t;
        teammatesByThird[t].add(pid);
        // Bump game + season counts.
        gameCounts[pid][posId] = (gameCounts[pid][posId] ?? 0) + 1;
        seasonCounts[pid][posId] = (seasonCounts[pid][posId] ?? 0) + 1;
      }
    }
    for (const id of playerIds) history[id].push(thirds[id] ?? null);

    // Build previousTeammates for next quarter.
    const nextPrev: Record<string, Set<string>> = {};
    for (const t of ["attack-third", "centre-third", "defence-third"] as const) {
      const set = teammatesByThird[t];
      set.forEach((pid) => {
        const mates = new Set<string>();
        set.forEach((other) => {
          if (other !== pid) mates.add(other);
        });
        nextPrev[pid] = mates;
      });
    }
    previousTeammates = nextPrev;
    // lastQuarterThird only includes players who actually played
    // last quarter. Strip any nulls (bench players).
    const filtered: Record<string, "attack-third" | "centre-third" | "defence-third"> = {};
    for (const [pid, t] of Object.entries(thirds)) {
      if (t !== null) filtered[pid] = t;
    }
    lastQuarterThird = filtered;
  }

  return history;
}

describe("Netball rotation across quarters", () => {
  it("with a 7-player squad (no bench), no player stays in the same third all 4 quarters", () => {
    const playerIds = Array.from({ length: 7 }, (_, i) => `p${i + 1}`);
    const history = simulateFour(playerIds);

    const stuck: string[] = [];
    for (const pid of playerIds) {
      const thirds = history[pid];
      if (thirds.some((t) => t === null)) continue;
      const allSame = thirds.every((t) => t === thirds[0]);
      if (allSame) stuck.push(`${pid} stuck in ${thirds[0]}`);
    }
    expect(stuck).toEqual([]);
  });
});
