import { describe, expect, it } from "vitest";
import {
  replaySeats,
  seatFill,
  seatLabels,
  seatMove,
  seatOf,
  seatSwap,
  seedSeats,
  type PositionSwapEvent,
  type SeatEvent,
  type SeatInput,
  type SeatPosition,
} from "@/lib/live/positionSeats";
import { assignPositionKeys, assignPositionLabels } from "@/lib/sports/afl/engine";
import { defaultAflPositions } from "@/lib/sports/afl/playbook";
import type { GameEvent, Lineup, Zone } from "@/lib/types";

const positions: SeatPosition[] = defaultAflPositions(18).map((p) => ({ key: p.key, label: p.label, line: p.line as Zone }));
const input: SeatInput = { positions };

// fwd keys in formation order: fp1 ff fp2 hff1 chf hff2 (LFP FF RFP LHF CHF RHF).
const lineup = (): Lineup => ({
  back: ["b1", "b2", "b3", "b4", "b5", "b6"],
  hback: [],
  mid: ["m1", "m2", "m3", "m4", "m5", "m6"],
  hfwd: [],
  fwd: ["f1", "f2", "f3", "f4", "f5", "f6"],
  bench: ["x1", "x2"],
});

let n = 0;
function ev(type: GameEvent["type"], metadata: Record<string, unknown> = {}, player_id: string | null = null): GameEvent {
  n++;
  return {
    id: `e${n}`,
    game_id: "g1",
    type,
    player_id,
    metadata,
    created_at: new Date(2026, 0, 1, 12, 0, n).toISOString(),
    created_by: "u1",
  } as GameEvent;
}
function positionSwap(meta: PositionSwapEvent["metadata"]): PositionSwapEvent {
  n++;
  return { type: "position_swap", player_id: meta.player_a_id, metadata: meta, created_at: new Date(2026, 0, 1, 12, 0, n).toISOString() };
}
const start = (l: Lineup = lineup()): SeatEvent[] => {
  n = 0;
  return [ev("lineup_set", { lineup: l }), ev("quarter_start", { quarter: 1 })];
};
const at = { quarter: 1, elapsed_ms: 60_000 };
const labelOf = (events: SeatEvent[], pid: string, inp: SeatInput = input) => seatLabels(replaySeats(events, inp), positions)[pid];

describe("seedSeats", () => {
  it("deals the seats assignPositionKeys does, and has a key for every position", () => {
    const seats = seedSeats(lineup(), input);
    expect(Object.keys(seats).sort()).toEqual(positions.map((p) => p.key).sort());
    for (const [pid, key] of Object.entries(assignPositionKeys(lineup(), input))) expect(seats[key]).toBe(pid);
    expect(seatLabels(seats, positions)).toEqual(assignPositionLabels(lineup(), input));
  });

  it("leaves positions nobody fills empty (a short side)", () => {
    const short = { ...lineup(), fwd: ["f1", "f2", "f3", "f4", "f5"] };
    const seats = seedSeats(short, input);
    expect(Object.values(seats).filter((p) => p === null)).toHaveLength(1);
  });
});

describe("replaySeats", () => {
  it("is null before the first lineup, and for a team with no positions", () => {
    n = 0;
    expect(replaySeats([ev("quarter_start", { quarter: 1 })], input)).toBeNull();
    expect(replaySeats(start(), { positions: [] })).toBeNull();
  });

  it("seeds at the lineup: f1 at LFP, f2 at FF", () => {
    const events = start();
    expect(labelOf(events, "f1")).toBe("LFP");
    expect(labelOf(events, "f2")).toBe("FF");
  });

  it("a sub takes the off-going kid's seat, even where dealing afresh would move people", () => {
    // x1's home is FF. Dealing the lineup afresh would hand x1 FF and move f2.
    const withRoles: SeatInput = { positions, positionRoles: { x1: { home: "ff", also: [], never: [] } } };
    const events = [
      ...start(),
      ev("swap", { off_player_id: "f1", on_player_id: "x1", zone: "fwd", ...at }, "x1"),
    ];
    const seats = replaySeats(events, withRoles)!;
    expect(seatOf(seats, "x1")).toBe("fp1");
    expect(seatOf(seats, "f2")).toBe("ff");
    expect(seatOf(seats, "f1")).toBeNull();
  });

  it("a replayed duplicate sub changes nothing", () => {
    const sub = { off_player_id: "f1", on_player_id: "x1", zone: "fwd", ...at };
    const events = [...start(), ev("swap", sub, "x1"), ev("swap", sub, "x1")];
    expect(seatOf(replaySeats(events, input)!, "x1")).toBe("fp1");
  });

  it("a zone swap across lines trades seats", () => {
    const events = [
      ...start(),
      ev("field_zone_swap", { player_a_id: "f2", zone_a: "fwd", player_b_id: "b1", zone_b: "back", ...at }, "f2"),
    ];
    const before = seedSeats(lineup(), input);
    const seats = replaySeats(events, input)!;
    expect(seatOf(seats, "f2")).toBe(seatOf(before, "b1"));
    expect(seatOf(seats, "b1")).toBe("ff");
  });

  it("a zone swap inside one line trades seats", () => {
    const events = [
      ...start(),
      ev("field_zone_swap", { player_a_id: "f1", zone_a: "fwd", player_b_id: "f5", zone_b: "fwd", ...at }, "f1"),
    ];
    expect(labelOf(events, "f1")).toBe("CHF");
    expect(labelOf(events, "f5")).toBe("LFP");
  });

  it("a move into an empty spot on another line takes a free seat there and empties the old one", () => {
    const short = { ...lineup(), back: ["b1", "b2", "b3", "b4", "b5"] };
    const events = [
      ...start(short),
      ev("field_zone_swap", { player_a_id: "f6", zone_a: "fwd", player_b_id: null, zone_b: "back", ...at }, "f6"),
    ];
    const before = seedSeats(short, input);
    const emptyBack = positions.find((p) => p.line === "back" && before[p.key] === null)!.key;
    const seats = replaySeats(events, input)!;
    expect(seatOf(seats, "f6")).toBe(emptyBack);
    expect(seats.hff2).toBeNull();
  });

  it("a replacement for a hurt kid takes their seat, whichever event lands first", () => {
    const injury = (pid: string) => ev("injury", { injured: true, ...at }, pid);
    const sub = () => ev("swap", { off_player_id: "f2", on_player_id: "x2", zone: "fwd", ...at }, "x2");
    const injuryFirst = [...start(), injury("f2"), sub()];
    const subFirst = [...start(), sub(), injury("f2")];
    for (const events of [injuryFirst, subFirst]) {
      const seats = replaySeats(events, input)!;
      expect(seatOf(seats, "x2")).toBe("ff");
      expect(seatOf(seats, "f2")).toBeNull();
    }
  });

  it("a kid lent off the field leaves their seat empty, and the next kid on fills it", () => {
    const events = [
      ...start(),
      ev("player_loan", { loaned: true, ...at }, "m3"),
      ev("swap", { off_player_id: "", on_player_id: "x1", zone: "mid", ...at }, "x1"),
    ];
    const lentSeat = seatOf(seedSeats(lineup(), input), "m3");
    const seats = replaySeats(events, input)!;
    expect(seatOf(seats, "m3")).toBeNull();
    expect(seatOf(seats, "x1")).toBe(lentSeat);
  });

  it("back from the other team (loaned: false) or back on (injured: false) doesn't seat anyone", () => {
    const events = [
      ...start(),
      ev("player_loan", { loaned: true, ...at }, "m3"),
      ev("player_loan", { loaned: false, ...at }, "m3"),
      ev("injury", { injured: false, ...at }, "m1"),
    ];
    const seats = replaySeats(events, input)!;
    expect(seatOf(seats, "m3")).toBeNull();
    expect(seatOf(seats, "m1")).not.toBeNull();
  });

  it("roster_shrink empties the removed kids' seats", () => {
    const events = [...start(), ev("roster_shrink", { remove_player_ids: ["b1", "b2"], ...at })];
    const seats = replaySeats(events, input)!;
    expect(seatOf(seats, "b1")).toBeNull();
    expect(seatOf(seats, "b2")).toBeNull();
    expect(Object.values(seats).filter((p) => p === null)).toHaveLength(2);
  });

  it("a break lineup deals the seats again", () => {
    const next = { ...lineup(), fwd: ["f2", "f1", "f3", "f4", "f5", "f6"] };
    const events = [
      ...start(),
      ev("field_zone_swap", { player_a_id: "f1", zone_a: "fwd", player_b_id: "f5", zone_b: "fwd", ...at }, "f1"),
      ev("quarter_end", { quarter: 1, elapsed_ms: 720_000 }),
      ev("lineup_set", { lineup: next }),
    ];
    expect(labelOf(events, "f2")).toBe("LFP");
    expect(labelOf(events, "f1")).toBe("FF");
    expect(labelOf(events, "f5")).toBe("CHF");
  });

  it("reads the log in time order, whatever order it's passed in", () => {
    const events = [
      ...start(),
      ev("field_zone_swap", { player_a_id: "f1", zone_a: "fwd", player_b_id: "f5", zone_b: "fwd", ...at }, "f1"),
    ];
    expect(labelOf([...events].reverse(), "f1")).toBe("CHF");
  });
});

describe("position_swap (the coming position change)", () => {
  it("two kids trade named positions", () => {
    const events: SeatEvent[] = [
      ...start(),
      positionSwap({ player_a_id: "f2", player_b_id: "b2", position_a: "ff", position_b: seatOf(seedSeats(lineup(), input), "b2")! }),
    ];
    const before = seedSeats(lineup(), input);
    const seats = replaySeats(events, input)!;
    expect(seatOf(seats, "f2")).toBe(seatOf(before, "b2"));
    expect(seatOf(seats, "b2")).toBe("ff");
  });

  it("a kid moves to an empty position and their old one empties", () => {
    const short = { ...lineup(), fwd: ["f1", "f2", "f3", "f4", "f5"] };
    const free = Object.entries(seedSeats(short, input)).find(([, p]) => p === null)![0];
    const events: SeatEvent[] = [...start(short), positionSwap({ player_a_id: "f1", position_a: "fp1", position_b: free })];
    const seats = replaySeats(events, input)!;
    expect(seatOf(seats, "f1")).toBe(free);
    expect(seats.fp1).toBeNull();
  });

  it("goes by where the kid stands now, not the event's position_a", () => {
    const events: SeatEvent[] = [
      ...start(),
      ev("field_zone_swap", { player_a_id: "f1", zone_a: "fwd", player_b_id: "f5", zone_b: "fwd", ...at }, "f1"),
      // Stale: says f1 is at fp1, but the swap put f1 at chf.
      positionSwap({ player_a_id: "f1", player_b_id: "f2", position_a: "fp1", position_b: "ff" }),
    ];
    const seats = replaySeats(events, input)!;
    expect(seatOf(seats, "f1")).toBe("ff");
    expect(seatOf(seats, "f2")).toBe("chf");
    expect(seatOf(seats, "f5")).toBe("fp1");
  });

  it("an unknown position changes nothing", () => {
    const events: SeatEvent[] = [...start(), positionSwap({ player_a_id: "f1", position_a: "fp1", position_b: "nope" })];
    expect(replaySeats(events, input)).toEqual(seedSeats(lineup(), input));
  });
});

describe("seat helpers", () => {
  it("seatSwap: a kid with no seat takes the other's", () => {
    const seats = seatSwap(seedSeats(lineup(), input), "x1", "f1");
    expect(seatOf(seats, "x1")).toBe("fp1");
    expect(seatOf(seats, "f1")).toBeNull();
  });

  it("seatFill prefers the seat named, if it's free and on the line", () => {
    const seats = { ...seedSeats(lineup(), input), ff: null, fp1: null };
    expect(seatOf(seatFill(seats, "x1", "fwd", positions, "ff"), "x1")).toBe("ff");
    expect(seatOf(seatFill(seats, "x1", "fwd", positions, "fb"), "x1")).toBe("fp1");
    expect(seatFill(seedSeats(lineup(), input), "x1", "fwd", positions)).toEqual(seedSeats(lineup(), input));
  });

  it("seatMove to the seat the kid holds changes nothing", () => {
    const seats = seedSeats(lineup(), input);
    expect(seatMove(seats, "f1", "fp1")).toBe(seats);
  });

  it("seatLabels: null seats give no labels", () => {
    expect(seatLabels(null, positions)).toEqual({});
  });
});
