// How we play × the AFL suggesters (UX plan 3.6): strategies, roles and
// season balance change WHERE kids play; with no playbook input the
// suggesters behave exactly as before (the rest of the suite).

import { describe, expect, it } from "vitest";
import {
  emptyZoneMs,
  suggestStartingLineup,
  suggestSwaps,
  type PlayerZoneMinutes,
  type ZoneCaps,
} from "@/lib/fairness";
import {
  assignPositionLabels,
  type AflLineRole,
  type AflPlaybookInput,
} from "@/lib/sports/afl/engine";
import type { Lineup, Player, Zone } from "@/lib/types";

const CAPS: ZoneCaps = { back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4 };
const ZONES: Zone[] = ["back", "mid", "fwd"];
const PERIOD_MS = 12 * 60_000;

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    team_id: "t",
    full_name: `P${i + 1}`,
    jersey_number: i + 1,
    is_active: true,
    created_by: "o",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  })) as Player[];
}

function zoneOf(lineup: Lineup, pid: string): Zone | "bench" {
  for (const z of ZONES) if (lineup[z].includes(pid)) return z;
  return "bench";
}

function role(r: Partial<AflLineRole>): AflLineRole {
  return { home: null, also: [], never: [], keepOn: false, ...r };
}

/** Plays four quarters, re-suggesting at each break like the app does. */
function playGame(
  squad: Player[],
  playbook: AflPlaybookInput | undefined,
  season: PlayerZoneMinutes = {},
  seed = 3,
): Lineup[] {
  const game: PlayerZoneMinutes = {};
  let prev: Record<string, Zone> = {};
  const out: Lineup[] = [];
  for (let q = 0; q < 4; q++) {
    const lineup = suggestStartingLineup(
      squad,
      season,
      seed + q,
      CAPS,
      game,
      {},
      prev,
      {},
      {},
      {},
      {},
      PERIOD_MS,
      playbook,
    );
    out.push(lineup);
    prev = {};
    for (const z of ZONES) {
      for (const pid of lineup[z]) {
        game[pid] ??= emptyZoneMs();
        game[pid][z] += 12;
        prev[pid] = z;
      }
    }
  }
  return out;
}

const base = (strategy: string, roles: Record<string, AflLineRole> = {}, seasonWeight = 0): AflPlaybookInput => ({
  strategy,
  seasonWeight,
  roles,
});

describe("season balance", () => {
  it("sends a kid to the line they're owed this season", () => {
    const squad = players(12);
    // p1 has played 6 quarters of back and none forward this season.
    const season: PlayerZoneMinutes = { p1: { ...emptyZoneMs(), back: 72, mid: 36 } };
    for (const seed of [1, 2, 3, 4, 5]) {
      const [q1] = playGame(squad, base("suggested", {}, 300), season, seed);
      expect(zoneOf(q1, "p1")).toBe("fwd");
    }
  });
});

describe("preferred lines", () => {
  it("leans to the home line but still gets a stint elsewhere", () => {
    const squad = players(12);
    const game = playGame(squad, base("preferred-lines", { p1: role({ home: "fwd" }) }));
    const zones = game.map((l) => zoneOf(l, "p1"));
    expect(zones.filter((z) => z === "fwd").length).toBeGreaterThanOrEqual(2);
    expect(zones.some((z) => z !== "fwd")).toBe(true);
  });
});

describe("set positions", () => {
  it("keeps kids in their home line all game", () => {
    const squad = players(12);
    const roles: Record<string, AflLineRole> = {};
    squad.forEach((p, i) => (roles[p.id] = role({ home: ZONES[i % 3] })));
    const game = playGame(squad, base("set-positions", roles));
    for (const lineup of game) {
      squad.forEach((p, i) => expect(zoneOf(lineup, p.id)).toBe(ZONES[i % 3]));
    }
  });

  it("labels each player with a position in their line, home first", () => {
    const lineup: Lineup = { back: ["a", "b"], hback: [], mid: ["c"], hfwd: [], fwd: ["d"], bench: ["e"] };
    const labels = assignPositionLabels(lineup, {
      ...base("set-positions"),
      positions: [
        { key: "fb", label: "FB", line: "back" },
        { key: "chb", label: "CHB", line: "back" },
        { key: "c", label: "C", line: "mid" },
        { key: "ff", label: "FF", line: "fwd" },
      ],
      positionRoles: { b: { home: "fb", also: [], never: [] } },
    });
    expect(labels).toEqual({ b: "FB", a: "CHB", c: "C", d: "FF" });
  });
});

describe("roles", () => {
  it("never places a kid on a line they never play", () => {
    const squad = players(14);
    for (const seed of [1, 2, 3, 4]) {
      const game = playGame(squad, base("free", { p1: role({ never: ["back"] }) }), {}, seed);
      for (const lineup of game) expect(zoneOf(lineup, "p1")).not.toBe("back");
    }
  });

  it("keeps a keep-on kid off the bench", () => {
    const squad = players(15);
    const game = playGame(squad, base("free", { p7: role({ keepOn: true }) }));
    for (const lineup of game) expect(lineup.bench).not.toContain("p7");
  });
});

describe("zoned strategies", () => {
  it("Rotate lines moves everyone up a line each break", () => {
    const squad = players(12);
    const game = playGame(squad, base("rotate"));
    const next: Record<string, Zone> = { back: "mid", mid: "fwd", fwd: "back" };
    for (const p of squad) {
      for (let q = 1; q < 4; q++) {
        expect(zoneOf(game[q], p.id)).toBe(next[zoneOf(game[q - 1], p.id) as Zone]);
      }
    }
  });

  it("Keep last quarter keeps the lineup", () => {
    const squad = players(12);
    const game = playGame(squad, base("keep"));
    for (const p of squad) expect(zoneOf(game[2], p.id)).toBe(zoneOf(game[1], p.id));
  });
});

describe("rolling subs", () => {
  const lineup: Lineup = {
    back: ["b1", "b2"],
    hback: [],
    mid: ["m1", "m2"],
    hfwd: [],
    fwd: ["f1", "f2"],
    bench: ["x"],
  };

  it("sub like-for-like into the home line for set positions", () => {
    const swaps = suggestSwaps(lineup, { b1: 600_000, m1: 700_000, f1: 800_000 }, 0, [], ZONES, [], {}, {}, {}, 0, 0, {}, {
      ...base("set-positions", { x: role({ home: "back" }) }),
    });
    expect(swaps[0]).toMatchObject({ on_player_id: "x", zone: "back" });
  });

  it("skip lines the incoming kid never plays, and leave keep-on kids on", () => {
    const swaps = suggestSwaps(
      lineup,
      { f1: 900_000, f2: 900_000, m1: 100_000, m2: 100_000, b1: 100_000, b2: 100_000 },
      0,
      [],
      ZONES,
      [],
      {},
      {},
      {},
      0,
      0,
      {},
      base("free", { x: role({ never: ["back", "mid"] }), f1: role({ keepOn: true }) }),
    );
    expect(swaps[0]).toMatchObject({ on_player_id: "x", zone: "fwd", off_player_id: "f2" });
  });
});

describe("season balance over a season (Vitest fixture for the weights)", () => {
  /** Mean over players of (max − min) quarters across the three lines. */
  function seasonSpread(playbook: AflPlaybookInput | undefined): number {
    const squad = players(15);
    const season: PlayerZoneMinutes = {};
    for (let g = 0; g < 10; g++) {
      // Two kids miss each game, so seasons drift like real ones.
      const here = squad.filter((_, i) => (i + g) % 15 >= 2);
      const game = playGame(here, playbook, season, g * 7 + 1);
      for (const lineup of game) {
        for (const z of ZONES) {
          for (const pid of lineup[z]) {
            season[pid] ??= emptyZoneMs();
            season[pid][z] += 12;
          }
        }
      }
    }
    const spreads = squad.map((p) => {
      const q = ZONES.map((z) => (season[p.id]?.[z] ?? 0) / 12);
      return Math.max(...q) - Math.min(...q);
    });
    return spreads.reduce((a, b) => a + b, 0) / spreads.length;
  }

  // Measured (12 Oct): off 2.47 · legacy SEASON_DIVERSITY 1.07 · Light
  // 0.67 · Balanced 0.67 · Strong 0.93 quarters of spread per kid.
  it("evens out lines across the season better than the old nudge", () => {
    const legacy = seasonSpread(undefined);
    const off = seasonSpread(base("suggested", {}, 0));
    const balanced = seasonSpread(base("suggested", {}, 300));
    const strong = seasonSpread(base("suggested", {}, 600));
    expect(balanced).toBeLessThan(legacy);
    expect(strong).toBeLessThan(legacy);
    expect(off).toBeGreaterThan(legacy);
    // Within a quarter of even per kid after ten games.
    expect(balanced).toBeLessThan(1);
  });
});
