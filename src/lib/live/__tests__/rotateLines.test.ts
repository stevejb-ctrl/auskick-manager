// "Rotate lines" quarter rotation (Idea 2). Steve 2026-07-07.
import { describe, expect, it } from "vitest";
import { rotateLines } from "@/lib/live/rotateLines";
import type { ZoneCaps, ZoneMinutes } from "@/lib/fairness";
import type { Zone } from "@/lib/types";

const caps = (o: Partial<ZoneCaps>): ZoneCaps => ({
  back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0, ...o,
});
const zm = (o: Partial<ZoneMinutes>): ZoneMinutes => ({
  back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0, ...o,
});
const zoneOf = (lineup: ReturnType<typeof rotateLines>, pid: string): Zone | "bench" => {
  for (const z of ["back", "hback", "mid", "hfwd", "fwd"] as Zone[]) {
    if (lineup[z].includes(pid)) return z;
  }
  return "bench";
};

describe("rotateLines — even zones rotate cleanly (2/2/2)", () => {
  it("shifts every player one line: back→mid, mid→fwd, fwd→back", () => {
    const lineup = rotateLines({
      players: ["p1", "p2", "p3", "p4", "p5", "p6"],
      caps: caps({ back: 2, mid: 2, fwd: 2 }),
      zoneMins: {},
      lastZone: { p1: "back", p2: "back", p3: "mid", p4: "mid", p5: "fwd", p6: "fwd" },
    });
    // Nobody stays in the zone they just played.
    expect(zoneOf(lineup, "p1")).toBe("mid");
    expect(zoneOf(lineup, "p2")).toBe("mid");
    expect(zoneOf(lineup, "p3")).toBe("fwd");
    expect(zoneOf(lineup, "p4")).toBe("fwd");
    expect(zoneOf(lineup, "p5")).toBe("back");
    expect(zoneOf(lineup, "p6")).toBe("back");
    expect(lineup.bench).toEqual([]);
  });
});

describe("rotateLines — uneven zones overflow by least time in zone (3/4/3)", () => {
  it("keeps the most-played-forward mid in mid, rotates everyone else", () => {
    // 4 mids all want forward (cap 3). p7 has the most forward time, so
    // p7 is the one bumped — and drops into the open mid slot.
    const lineup = rotateLines({
      players: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"],
      caps: caps({ back: 3, mid: 4, fwd: 3 }),
      zoneMins: { p7: zm({ mid: 12, fwd: 12 }) },
      lastZone: {
        p1: "back", p2: "back", p3: "back",
        p4: "mid", p5: "mid", p6: "mid", p7: "mid",
        p8: "fwd", p9: "fwd", p10: "fwd",
      },
    });
    expect(lineup.back.sort()).toEqual(["p10", "p8", "p9"]); // fwd → back
    expect(lineup.fwd.sort()).toEqual(["p4", "p5", "p6"]); // the 3 least-fwd mids → fwd
    expect(lineup.mid.sort()).toEqual(["p1", "p2", "p3", "p7"]); // backs → mid, p7 overflow stays
    expect(zoneOf(lineup, "p7")).toBe("mid"); // the most-played-forward mid is the one who repeats
    expect(lineup.bench).toEqual([]);
  });
});

describe("rotateLines — bench folds in by most-played (13 players, 3/4/3)", () => {
  it("sits the three players with the most total on-field time", () => {
    const players = Array.from({ length: 13 }, (_, i) => `p${i + 1}`);
    // p1, p2, p3 have racked up the most minutes → they should rest.
    const zoneMins: Record<string, ZoneMinutes> = {
      p1: zm({ mid: 40 }), p2: zm({ back: 38 }), p3: zm({ fwd: 36 }),
    };
    const lineup = rotateLines({
      players,
      caps: caps({ back: 3, mid: 4, fwd: 3 }),
      zoneMins,
      lastZone: {},
    });
    expect(lineup.bench.sort()).toEqual(["p1", "p2", "p3"]);
    const onField = [...lineup.back, ...lineup.mid, ...lineup.fwd];
    expect(onField).toHaveLength(10);
  });
});

describe("rotateLines — short squad + determinism", () => {
  it("fills only what it can and leaves no phantom slots (7 players, 3/4/3)", () => {
    const lineup = rotateLines({
      players: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
      caps: caps({ back: 3, mid: 4, fwd: 3 }),
      zoneMins: {},
      lastZone: {},
    });
    const onField = [...lineup.back, ...lineup.mid, ...lineup.fwd];
    expect(onField).toHaveLength(7); // all 7 placed, no bench, no crash
    expect(lineup.bench).toEqual([]);
  });

  it("is pure + deterministic for equal inputs", () => {
    const input = {
      players: ["p1", "p2", "p3", "p4", "p5", "p6"],
      caps: caps({ back: 2, mid: 2, fwd: 2 }),
      zoneMins: { p3: zm({ mid: 5 }) },
      lastZone: { p1: "back", p2: "back", p3: "mid", p4: "mid", p5: "fwd", p6: "fwd" } as Record<string, Zone>,
    };
    expect(rotateLines(input)).toEqual(rotateLines(input));
  });
});
