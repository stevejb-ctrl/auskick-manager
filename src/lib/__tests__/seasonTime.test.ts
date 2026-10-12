import { describe, expect, it } from "vitest";
import type { GameEvent, GameEventType } from "@/lib/types";
import { seasonZoneMinutes } from "@/lib/fairness";
import { seasonPositionCounts } from "@/lib/sports/netball/fairness";
import { playerZoneMsOnField } from "@/lib/sports/rugby_league/fairness";
import { gameTimeByUnit, seasonTimeByUnit, totalTime } from "@/lib/playbook/seasonTime";
import {
  biggestSeasonGaps,
  periodsOwed,
  playersWithinAPeriod,
  seasonBalanceWeight,
} from "@/lib/playbook/seasonBalance";

const MIN = 60_000;
let ts = 0;
function ev(
  gameId: string,
  type: GameEventType,
  metadata: Record<string, unknown> = {},
  playerId: string | null = null,
  day = 1,
): GameEvent {
  ts++;
  return {
    id: `e${ts}`,
    game_id: gameId,
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(Date.UTC(2026, 3, day, 9, 0, 0, ts)).toISOString(),
  };
}

// ─── AFL fixture: two games, swaps across zones ───────────────
function aflGame(gameId: string, day: number): GameEvent[] {
  const lineup = {
    back: ["a", "b"],
    hback: [],
    mid: ["c", "d"],
    hfwd: [],
    fwd: ["e", "f"],
    bench: ["g"],
  };
  return [
    ev(gameId, "lineup_set", { lineup }, null, day),
    ev(gameId, "quarter_start", { quarter: 1 }, null, day),
    ev(gameId, "swap", { off_player_id: "a", on_player_id: "g", zone: "back", elapsed_ms: 4 * MIN }, null, day),
    ev(gameId, "quarter_end", { quarter: 1, elapsed_ms: 12 * MIN }, null, day),
    ev(gameId, "lineup_set", {
      lineup: { back: ["c", "g"], hback: [], mid: ["a", "e"], hfwd: [], fwd: ["b", "d"], bench: ["f"] },
    }, null, day),
    ev(gameId, "quarter_start", { quarter: 2 }, null, day),
    ev(gameId, "injury", { injured: true, elapsed_ms: 6 * MIN }, "e", day),
    ev(gameId, "quarter_end", { quarter: 2, elapsed_ms: 12 * MIN }, null, day),
  ];
}

describe("seasonTimeByUnit — AFL", () => {
  const events = [...aflGame("g1", 1), ...aflGame("g2", 8)];

  it("matches seasonZoneMinutes, in ms", () => {
    const zones = seasonTimeByUnit("afl", events, "zone");
    const legacy = seasonZoneMinutes(events);
    for (const [pid, zm] of Object.entries(legacy)) {
      for (const [z, mins] of Object.entries(zm)) {
        expect(zones[pid]?.[z] ?? 0).toBeCloseTo(mins * MIN, 3);
      }
    }
    expect(zones.a.back).toBe(2 * 4 * MIN);
    expect(zones.a.mid).toBe(2 * 12 * MIN);
  });

  it("folds half-zones into lines", () => {
    const halfZone = [
      ev("g3", "lineup_set", {
        lineup: { back: [], hback: ["x"], mid: [], hfwd: ["y"], fwd: [], bench: [] },
      }),
      ev("g3", "quarter_start", { quarter: 1 }),
      ev("g3", "quarter_end", { quarter: 1, elapsed_ms: 10 * MIN }),
    ];
    const lines = seasonTimeByUnit("afl", halfZone, "line");
    expect(lines.x).toEqual({ back: 10 * MIN });
    expect(lines.y).toEqual({ fwd: 10 * MIN });
  });

  it("counts only games since a reset, and can leave the current game out", () => {
    const since = new Date(Date.UTC(2026, 3, 5)).toISOString();
    const recent = seasonTimeByUnit("afl", events, "zone", { since });
    expect(recent.a.mid).toBe(12 * MIN);
    const withoutG2 = seasonTimeByUnit("afl", events, "zone", { excludeGameId: "g2" });
    expect(withoutG2.a.mid).toBe(12 * MIN);
  });
});

// ─── Netball fixture: full quarters, no mid-quarter subs ──────
function netballGame(gameId: string, day: number, rotate: boolean): GameEvent[] {
  const q1 = { gs: ["n1"], ga: ["n2"], wa: ["n3"], c: ["n4"], wd: ["n5"], gd: ["n6"], gk: ["n7"] };
  const q2 = rotate
    ? { gs: ["n7"], ga: ["n1"], wa: ["n2"], c: ["n3"], wd: ["n4"], gd: ["n5"], gk: ["n6"] }
    : q1;
  return [
    ev(gameId, "lineup_set", { lineup: { positions: q1, bench: ["n8"] } }, null, day),
    ev(gameId, "quarter_start", { quarter: 1 }, null, day),
    ev(gameId, "period_break_swap", { lineup: { positions: q2, bench: ["n8"] } }, null, day),
    ev(gameId, "quarter_start", { quarter: 2 }, null, day),
    ev(gameId, "game_finalised", {}, null, day),
  ];
}

describe("seasonTimeByUnit — netball", () => {
  const events = [...netballGame("n-g1", 1, true), ...netballGame("n-g2", 8, false)];
  const periodSeconds = 600;

  it("matches seasonPositionCounts × period length for whole quarters", () => {
    const bibs = seasonTimeByUnit("netball", events, "bib", { periodSeconds });
    const counts = seasonPositionCounts(events);
    for (const [pid, byBib] of Object.entries(counts)) {
      for (const [bib, n] of Object.entries(byBib)) {
        expect(bibs[pid]?.[bib] ?? 0).toBe(n * periodSeconds * 1000);
      }
    }
    expect(bibs.n1.gs).toBe(3 * 10 * MIN);
    expect(bibs.n8).toBeUndefined();
  });

  it("rolls bibs up into thirds", () => {
    const thirds = seasonTimeByUnit("netball", events, "third", { periodSeconds });
    // n1: GS ×3 + GA ×1 → four quarters in the attack third.
    expect(thirds.n1).toEqual({ "attack-third": 4 * 10 * MIN });
    // n4: C ×3 + WD ×1 → centre third.
    expect(thirds.n4).toEqual({ "centre-third": 4 * 10 * MIN });
  });

  it("uses each game's own period length", () => {
    const bibs = seasonTimeByUnit("netball", events, "bib", {
      periodSeconds: (id) => (id === "n-g1" ? 600 : 480),
    });
    expect(bibs.n1.gs).toBe(10 * MIN + 2 * 8 * MIN);
  });
});

// ─── Rugby league fixture ─────────────────────────────────────
function leagueGame(gameId: string, day: number): GameEvent[] {
  return [
    ev(gameId, "lineup_set", { lineup: { forwards: ["r1", "r2"], backs: ["r3"], bench: ["r4"] } }, null, day),
    ev(gameId, "quarter_start", { quarter: 1 }, null, day),
    ev(gameId, "swap", { off_player_id: "r1", on_player_id: "r4", quarter: 1, elapsed_ms: 5 * MIN }, null, day),
    ev(gameId, "quarter_end", { quarter: 1, elapsed_ms: 15 * MIN }, null, day),
  ];
}

describe("seasonTimeByUnit — rugby league", () => {
  const g1 = leagueGame("l-g1", 1);
  const g2 = leagueGame("l-g2", 8);

  it("matches playerZoneMsOnField summed per game", () => {
    const lines = seasonTimeByUnit("rugby_league", [...g1, ...g2], "line");
    const one = playerZoneMsOnField(g1, Number.MAX_SAFE_INTEGER, 0);
    expect(lines.r1.forwards).toBe(2 * one.r1.forwards);
    expect(lines.r4.forwards).toBe(2 * 10 * MIN);
    expect(lines.r3.backs).toBe(2 * 15 * MIN);
  });

  it("returns nothing for units the sport doesn't track yet", () => {
    expect(gameTimeByUnit("rugby_league", g1, "position")).toEqual({});
    expect(gameTimeByUnit("afl", g1, "bib")).toEqual({});
  });
});

describe("periodsOwed", () => {
  const P = 12 * MIN;

  it("is zero for an even season and for a new player", () => {
    const even = periodsOwed({ byUnit: { back: P, mid: P, fwd: P }, units: ["back", "mid", "fwd"], periodMs: P });
    expect(even).toEqual({ back: 0, mid: 0, fwd: 0 });
    const fresh = periodsOwed({ byUnit: undefined, units: ["back", "mid", "fwd"], periodMs: P });
    expect(fresh).toEqual({ back: 0, mid: 0, fwd: 0 });
  });

  it("owes the unit a player has missed, capped at two periods", () => {
    const owed = periodsOwed({ byUnit: { back: 6 * P, mid: 3 * P }, units: ["back", "mid", "fwd"], periodMs: P });
    expect(owed.fwd).toBe(2); // 3 owed, capped
    expect(owed.mid).toBe(0);
    expect(owed.back).toBe(-2); // 3 over, capped
  });

  it("balances against a preferred split", () => {
    const owed = periodsOwed({
      byUnit: { fwd: 6 * P, mid: 2 * P, back: 2 * P },
      units: ["back", "mid", "fwd"],
      periodMs: P,
      target: { fwd: 0.6, mid: 0.2, back: 0.2 },
    });
    expect(owed).toEqual({ back: 0, mid: 0, fwd: 0 });
  });

  it("ignores units the player may not play", () => {
    const owed = periodsOwed({ byUnit: { back: 2 * P, fwd: 2 * P, mid: 0 }, units: ["back", "fwd"], periodMs: P });
    expect(owed).toEqual({ back: 0, fwd: 0 });
  });
});

describe("season gaps and summary", () => {
  const P = 10 * MIN;
  const season = {
    mia: { "attack-third": 4 * P, "centre-third": 2 * P },
    ava: { "attack-third": 2 * P, "centre-third": 2 * P, "defence-third": 2 * P },
  };
  const units = ["attack-third", "centre-third", "defence-third"];

  it("names the biggest gap first", () => {
    const gaps = biggestSeasonGaps(season, ["mia", "ava"], units, P);
    expect(gaps).toEqual([{ playerId: "mia", unit: "defence-third", owed: 2, never: true }]);
  });

  it("counts players within a period of even", () => {
    expect(playersWithinAPeriod(season, ["mia", "ava"], units, P)).toEqual({ within: 1, total: 2 });
  });

  it("has a weight per strength and none when off", () => {
    expect(seasonBalanceWeight("afl", "balanced")).toBe(300);
    expect(seasonBalanceWeight("netball", "strong")).toBe(40_000);
    expect(seasonBalanceWeight("afl", null)).toBe(0);
    expect(totalTime(season.mia)).toBe(6 * P);
  });
});
