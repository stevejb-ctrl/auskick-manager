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

  // Repro for the agent-flagged "STAYS at WD across Q1+Q2" symptom on
  // a 9-player squad (the typical netball roster: 7 court + 2 bench).
  // The greedy assigner can leave the LAST evaluated centre-third
  // player with no fresh-third option remaining, dropping them onto
  // WD or C two quarters running. We don't expect zero same-third
  // pairs (the structural constraint — 3 centre slots vs 2 attack
  // slots vs 2 defence slots — forces some recurrence) but we DO
  // expect no player to repeat the SAME EXACT POSITION across
  // consecutive quarters when alternatives exist (tier 2 -50000
  // should always lose to even tier 3 -10000 + tier-1 0 = -10000).
  it("with a 9-player squad, no player plays the same EXACT position in consecutive quarters", () => {
    const playerIds = Array.from({ length: 9 }, (_, i) => `p${i + 1}`);

    // Need a per-quarter snapshot of positions (not just thirds) so
    // we can check exact-position repeats. Reimplement simulate
    // inline since simulateFour() throws away position-level history.
    const seasonCounts: PlayerPositionCounts = {};
    const gameCounts: PlayerPositionCounts = {};
    for (const id of playerIds) {
      seasonCounts[id] = {};
      gameCounts[id] = {};
    }
    let lastQuarterThird: Record<
      string,
      "attack-third" | "centre-third" | "defence-third"
    > = {};
    let previousTeammates: Record<string, Set<string>> = {};
    // Per-player ms played this game — mirrors the production
    // call site (NetballQuarterBreak) which sources this from
    // playerStats. After Q1 with 7 players each playing the full
    // 10 minutes (600,000 ms) and 2 on the bench, the suggester
    // sorts the bench players first, then ties for the 7 court
    // players resolve via the seeded shuffle.
    const Q_LENGTH_MS = 10 * 60 * 1000;
    let thisGameTotalMs: Record<string, number> = {};
    for (const id of playerIds) thisGameTotalMs[id] = 0;

    // (player) → array of position id (or null if benched) per quarter.
    const positionHistory: Record<string, (string | null)[]> = {};
    for (const id of playerIds) positionHistory[id] = [];

    for (let q = 0; q < 4; q++) {
      const lineup = suggestNetballLineup({
        playerIds,
        positions: POSITIONS,
        season: seasonCounts,
        thisGame: gameCounts,
        isAllowed: alwaysAllowed,
        // Production uses `seed: nextQuarter` — quarters 2/3/4 →
        // seeds 2/3/4. The Q1 suggester is invoked with seed: 1
        // when the lineup picker first opens.
        seed: q + 1,
        thirdOf,
        lastQuarterThird,
        previousTeammates,
        thisGameTotalMs,
      });
      const thisQ: Record<string, string | null> = {};
      const teammatesByThird: Record<string, Set<string>> = {
        "attack-third": new Set(),
        "centre-third": new Set(),
        "defence-third": new Set(),
      };
      for (const [posId, ids] of Object.entries(lineup.positions)) {
        const t = thirdOf(posId);
        if (!t) continue;
        for (const pid of ids) {
          thisQ[pid] = posId;
          teammatesByThird[t].add(pid);
          gameCounts[pid][posId] = (gameCounts[pid][posId] ?? 0) + 1;
          seasonCounts[pid][posId] = (seasonCounts[pid][posId] ?? 0) + 1;
        }
      }
      for (const id of playerIds)
        positionHistory[id].push(thisQ[id] ?? null);

      // Update thisGameTotalMs: court players +Q_LENGTH_MS, bench
      // unchanged. This mirrors the live store's segment accounting
      // for a full-quarter stint.
      const newTotalMs: Record<string, number> = { ...thisGameTotalMs };
      for (const id of playerIds) {
        if (thisQ[id] != null) newTotalMs[id] += Q_LENGTH_MS;
      }
      thisGameTotalMs = newTotalMs;

      // Build next-quarter inputs.
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
      const filtered: Record<
        string,
        "attack-third" | "centre-third" | "defence-third"
      > = {};
      for (const [pid, posId] of Object.entries(thisQ)) {
        if (posId == null) continue;
        const t = thirdOf(posId);
        if (t) filtered[pid] = t;
      }
      lastQuarterThird = filtered;
    }

    // Check: for each player, no two consecutive quarters at the
    // same exact position.
    const repeats: string[] = [];
    for (const pid of playerIds) {
      for (let q = 1; q < 4; q++) {
        const prev = positionHistory[pid][q - 1];
        const curr = positionHistory[pid][q];
        if (prev != null && curr != null && prev === curr) {
          repeats.push(
            `${pid} played ${prev.toUpperCase()} in Q${q} and Q${q + 1}`,
          );
        }
      }
    }
    expect(repeats).toEqual([]);
  });

  // Fuzz: Stagehand explore agents flagged "STAYS at WD across Q1+Q2"
  // on a real netball game. The two deterministic tests above pass
  // for the trivial p1..p9 ID set but the seeded shuffle is
  // ID-content-dependent, so a different ID order could trigger the
  // greedy-assignment worst case where the last-evaluated centre-
  // Q1 player has only WD/C/WA left in `remaining`. Cycle through
  // 100 random permutations of UUID-shaped IDs to flush out
  // ID-specific edge cases.
  it("with a 9-player squad, fuzz 100 ID permutations — no exact-position consecutive repeats", () => {
    // Seeded RNG so failures are reproducible. Mulberry32 — small
    // and good enough for shuffle-uniqueness.
    function mulberry32(s: number) {
      return () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    const failures: { perm: number; repeats: string[] }[] = [];

    // 9 stable UUID-shaped IDs — same shape as the netball seed-team
    // produces. We permute the ORDER passed to the suggester so the
    // sort+shuffle exercises different worst-case orderings.
    const baseIds = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333",
      "44444444-4444-4444-4444-444444444444",
      "55555555-5555-5555-5555-555555555555",
      "66666666-6666-6666-6666-666666666666",
      "77777777-7777-7777-7777-777777777777",
      "88888888-8888-8888-8888-888888888888",
      "99999999-9999-9999-9999-999999999999",
    ];

    for (let perm = 0; perm < 100; perm++) {
      const rng = mulberry32(perm + 1);
      // Fisher–Yates with the seeded RNG.
      const playerIds = [...baseIds];
      for (let i = playerIds.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
      }

      const seasonCounts: PlayerPositionCounts = {};
      const gameCounts: PlayerPositionCounts = {};
      for (const id of playerIds) {
        seasonCounts[id] = {};
        gameCounts[id] = {};
      }
      let lastQuarterThird: Record<
        string,
        "attack-third" | "centre-third" | "defence-third"
      > = {};
      let previousTeammates: Record<string, Set<string>> = {};
      const Q_LENGTH_MS = 10 * 60 * 1000;
      let thisGameTotalMs: Record<string, number> = {};
      for (const id of playerIds) thisGameTotalMs[id] = 0;

      const positionHistory: Record<string, (string | null)[]> = {};
      for (const id of playerIds) positionHistory[id] = [];

      for (let q = 0; q < 4; q++) {
        const lineup = suggestNetballLineup({
          playerIds,
          positions: POSITIONS,
          season: seasonCounts,
          thisGame: gameCounts,
          isAllowed: alwaysAllowed,
          seed: q + 1,
          thirdOf,
          lastQuarterThird,
          previousTeammates,
          thisGameTotalMs,
        });
        const thisQ: Record<string, string | null> = {};
        const teammatesByThird: Record<string, Set<string>> = {
          "attack-third": new Set(),
          "centre-third": new Set(),
          "defence-third": new Set(),
        };
        for (const [posId, ids] of Object.entries(lineup.positions)) {
          const t = thirdOf(posId);
          if (!t) continue;
          for (const pid of ids) {
            thisQ[pid] = posId;
            teammatesByThird[t].add(pid);
            gameCounts[pid][posId] = (gameCounts[pid][posId] ?? 0) + 1;
            seasonCounts[pid][posId] = (seasonCounts[pid][posId] ?? 0) + 1;
          }
        }
        for (const id of playerIds)
          positionHistory[id].push(thisQ[id] ?? null);

        const newTotalMs: Record<string, number> = { ...thisGameTotalMs };
        for (const id of playerIds) {
          if (thisQ[id] != null) newTotalMs[id] += Q_LENGTH_MS;
        }
        thisGameTotalMs = newTotalMs;

        const nextPrev: Record<string, Set<string>> = {};
        for (const t of [
          "attack-third",
          "centre-third",
          "defence-third",
        ] as const) {
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
        const filtered: Record<
          string,
          "attack-third" | "centre-third" | "defence-third"
        > = {};
        for (const [pid, posId] of Object.entries(thisQ)) {
          if (posId == null) continue;
          const t = thirdOf(posId);
          if (t) filtered[pid] = t;
        }
        lastQuarterThird = filtered;
      }

      const repeats: string[] = [];
      for (const pid of playerIds) {
        for (let q = 1; q < 4; q++) {
          const prev = positionHistory[pid][q - 1];
          const curr = positionHistory[pid][q];
          if (prev != null && curr != null && prev === curr) {
            repeats.push(
              `${pid.slice(0, 8)} played ${prev.toUpperCase()} in Q${q} and Q${q + 1}`,
            );
          }
        }
      }
      if (repeats.length > 0) {
        failures.push({ perm, repeats });
      }
    }

    if (failures.length > 0) {
      const summary = failures
        .slice(0, 5)
        .map((f) => `perm ${f.perm}: ${f.repeats.join("; ")}`)
        .join("\n");
      throw new Error(
        `${failures.length}/100 permutations produced exact-position repeats. First few:\n${summary}`,
      );
    }
  });
});
