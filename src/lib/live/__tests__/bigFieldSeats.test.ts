// AFL big fields on the live screen (live v3, Phase 11): who's in which
// position as the game goes. The seat map is dealt at the lineup; a sub
// takes the off-going kid's seat; a position change (position_swap)
// moves seats, and across lines moves the kids between lines in every
// replay; Undo puts it back. The live store keeps the same seats as the
// server's replay, so a reload or the other phone draws what this phone
// does.

import { beforeEach, describe, expect, it } from "vitest";
import {
  fitSeats,
  replaySeats,
  seatLabels,
  seatOf,
  seedSeats,
  type SeatInput,
  type SeatPosition,
  type Seats,
} from "@/lib/live/positionSeats";
import { positionSwapAsZoneSwap, positionSwapToast } from "@/lib/live/positionSwap";
import { replayGame as replayFairness } from "@/lib/fairness";
import { replayGame as replayDashboard } from "@/lib/dashboard/eventReplay";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { defaultAflPositions } from "@/lib/sports/afl/playbook";
import { aflBigField, aflBigFieldPositions, aflMinTimeStates, AFL_BIG_FIELD_FROM } from "@/lib/sports/afl/bigField";
import { resolveTeamPlaybook } from "@/lib/playbook/team";
import type { GameEvent, Lineup, Zone } from "@/lib/types";

const positions: SeatPosition[] = defaultAflPositions(18).map((p) => ({ key: p.key, label: p.label, line: p.line as Zone }));
const input: SeatInput = { positions };
const labelOf = (key: string) => positions.find((p) => p.key === key)!.label;

const lineup = (): Lineup => ({
  back: ["b1", "b2", "b3", "b4", "b5", "b6"],
  hback: [],
  mid: ["m1", "m2", "m3", "m4", "m5", "m6"],
  hfwd: [],
  fwd: ["f1", "f2", "f3", "f4", "f5", "f6"],
  bench: ["x1", "x2", "x3"],
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
const at = { quarter: 1, elapsed_ms: 60_000 };
const start = (l: Lineup = lineup()): GameEvent[] => {
  n = 0;
  return [ev("lineup_set", { lineup: l }), ev("quarter_start", { quarter: 1 })];
};
const seated = (events: GameEvent[]) => replaySeats(events, input)!;
const keyOf = (seats: Seats, pid: string) => seatOf(seats, pid)!;
function posSwap(a: string, b: string | null, posA: string, posB: string, zoneA: Zone, zoneB: Zone, undo = false): GameEvent {
  return ev(
    "position_swap",
    { player_a_id: a, player_b_id: b, position_a: posA, position_b: posB, zone_a: zoneA, zone_b: zoneB, ...at, ...(undo ? { undo: true } : {}) },
    a,
  );
}

describe("seat replay: subs, position changes, undo", () => {
  it("a sub takes the off-going kid's seat", () => {
    const events = start();
    const chb = keyOf(seated(events), "b2");
    events.push(ev("swap", { off_player_id: "b2", on_player_id: "x1", zone: "back", ...at }, "x1"));
    expect(seatOf(seated(events), "x1")).toBe(chb);
    expect(seatOf(seated(events), "b2")).toBeNull();
  });

  it("two subs on one line (Make all) each take their own kid's seat", () => {
    const events = start();
    const [s1, s2] = [keyOf(seated(events), "f1"), keyOf(seated(events), "f5")];
    events.push(ev("swap", { off_player_id: "f5", on_player_id: "x1", zone: "fwd", ...at }, "x1"));
    events.push(ev("swap", { off_player_id: "f1", on_player_id: "x2", zone: "fwd", ...at }, "x2"));
    const seats = seated(events);
    expect(seatOf(seats, "x1")).toBe(s2);
    expect(seatOf(seats, "x2")).toBe(s1);
  });

  it("a kid on into an empty spot takes the one the coach tapped (the swap's position)", () => {
    const short = { ...lineup(), back: ["b1", "b2", "b3", "b4"] };
    const events = start(short);
    const empty = Object.entries(seated(events)).filter(([k, p]) => p === null && positions.find((x) => x.key === k)!.line === "back").map(([k]) => k);
    expect(empty.length).toBe(2);
    events.push(ev("swap", { off_player_id: "", on_player_id: "x1", zone: "back", position: empty[1], ...at }, "x1"));
    expect(seatOf(seated(events), "x1")).toBe(empty[1]);
  });

  it("a position change swaps the seats, and its undo puts them back", () => {
    const events = start();
    const before = seated(events);
    const [pa, pb] = [keyOf(before, "b2"), keyOf(before, "b5")];
    events.push(posSwap("b2", "b5", pa, pb, "back", "back"));
    const after = seated(events);
    expect(seatOf(after, "b2")).toBe(pb);
    expect(seatOf(after, "b5")).toBe(pa);
    // Undo: b2 goes back to where b5 is now.
    events.push(posSwap("b2", "b5", pb, pa, "back", "back", true));
    expect(seated(events)).toEqual(before);
  });

  it("a sub after a position change takes the changed seat", () => {
    const events = start();
    const before = seated(events);
    const [pa, pb] = [keyOf(before, "b2"), keyOf(before, "b5")];
    events.push(posSwap("b2", "b5", pa, pb, "back", "back"));
    events.push(ev("swap", { off_player_id: "b2", on_player_id: "x3", zone: "back", ...at }, "x3"));
    expect(seatOf(seated(events), "x3")).toBe(pb);
  });
});

describe("a position change across lines", () => {
  const cross = () => {
    const events = start();
    const seats = seated(events);
    // b2 (a back) and m2 (a mid) trade positions.
    events.push(posSwap("b2", "m2", keyOf(seats, "b2"), keyOf(seats, "m2"), "back", "mid"));
    events.push(ev("quarter_end", { quarter: 1, elapsed_ms: 120_000 }));
    return { events, seats };
  };

  it("is a zone swap to the lineup, and nothing inside one line", () => {
    const { events } = cross();
    const zoneSwap = positionSwapAsZoneSwap(events[2])!;
    expect(zoneSwap.type).toBe("field_zone_swap");
    expect(zoneSwap.metadata).toMatchObject({ player_a_id: "b2", zone_a: "back", player_b_id: "m2", zone_b: "mid" });
    expect(positionSwapAsZoneSwap(posSwap("b2", "b5", "x", "y", "back", "back"))).toBeNull();
    expect(positionSwapAsZoneSwap(ev("swap", {}))).toBeNull();
  });

  it("moves the kids between lines in the fairness replay, with their time split at the change", () => {
    const { events } = cross();
    const state = replayFairness(events);
    expect(state.lineup?.mid).toContain("b2");
    expect(state.lineup?.back).toContain("m2");
    expect(state.lineup?.back).not.toContain("b2");
    expect(state.basePlayedZoneMs.b2.back).toBe(60_000);
    expect(state.basePlayedZoneMs.b2.mid).toBe(60_000);
  });

  it("moves them in the dashboard replay too", () => {
    const { events } = cross();
    const snap = replayDashboard("g1", events);
    expect(snap.playerZoneMs.b2.back).toBe(60_000);
    expect(snap.playerZoneMs.b2.mid).toBe(60_000);
  });

  it("a position change inside one line leaves the lineup as it was", () => {
    const events = start();
    const seats = seated(events);
    events.push(posSwap("b2", "b5", keyOf(seats, "b2"), keyOf(seats, "b5"), "back", "back"));
    expect(replayFairness(events).lineup?.back).toEqual(lineup().back);
  });
});

describe("fitSeats", () => {
  it("empties the seat of a kid who's left the field and seats a kid with none on their line", () => {
    const seats = seedSeats(lineup(), input);
    const key = keyOf(seats, "f3");
    const l = { ...lineup(), fwd: ["f1", "f2", "x1", "f4", "f5", "f6"], bench: ["f3", "x2", "x3"] };
    const { seats: fit, spare } = fitSeats(seats, l, positions);
    expect(seatOf(fit, "f3")).toBeNull();
    expect(fit[key]).toBe("x1");
    expect(spare).toEqual({});
  });

  it("leaves seats that fit alone, and fits again unchanged", () => {
    const seats = seedSeats(lineup(), input);
    expect(fitSeats(seats, lineup(), positions).seats).toEqual(seats);
    const once = fitSeats(null, lineup(), positions).seats;
    expect(fitSeats(once, lineup(), positions).seats).toEqual(once);
  });

  it("a kid on the wrong line for their seat moves to a free one on theirs", () => {
    const seats = seedSeats(lineup(), input);
    const l = { ...lineup(), back: ["b1", "m2", "b3", "b4", "b5", "b6"], mid: ["m1", "b2", "m3", "m4", "m5", "m6"] };
    const fit = fitSeats(seats, l, positions).seats;
    expect(positions.find((p) => p.key === seatOf(fit, "b2"))!.line).toBe("mid");
    expect(positions.find((p) => p.key === seatOf(fit, "m2"))!.line).toBe("back");
  });

  it("more kids on a line than its positions: the extra one is spare", () => {
    const l = { ...lineup(), fwd: [...lineup().fwd, "x1"], bench: ["x2", "x3"] };
    const { spare } = fitSeats(seedSeats(lineup(), input), l, positions);
    expect(spare).toEqual({ fwd: ["x1"] });
  });
});

describe("the live store keeps the seats", () => {
  beforeEach(() => {
    useLiveGame.getState().init({
      activeGameId: "g-seats",
      lineup: lineup(),
      currentQuarter: 1,
      clockStartedAt: null,
      accumulatedMs: 60_000,
      seats: seedSeats(lineup(), input),
      seatPositions: positions,
    });
  });
  const storeSeat = (pid: string) => seatOf(useLiveGame.getState().seats!, pid);

  it("a sub takes the off-going kid's seat; two on one line each take their own", () => {
    const [s1, s5] = [storeSeat("f1"), storeSeat("f5")];
    useLiveGame.getState().applySwap("f5", "x1", "fwd");
    useLiveGame.getState().applySwap("f1", "x2", "fwd");
    expect(storeSeat("x1")).toBe(s5);
    expect(storeSeat("x2")).toBe(s1);
  });

  it("a position change across lines moves the kids between lines and seats; undo puts both back", () => {
    const before = useLiveGame.getState().seats;
    const [pa, pb] = [storeSeat("b2")!, storeSeat("m2")!];
    useLiveGame.getState().applyPositionSwap("b2", "back", "m2", "mid", pb);
    const st = useLiveGame.getState();
    expect(st.lineup.mid).toContain("b2");
    expect(st.lineup.back).toContain("m2");
    expect(storeSeat("b2")).toBe(pb);
    expect(storeSeat("m2")).toBe(pa);
    // It's not a sub: no new stint for anyone but the two.
    expect(st.stintZone.b2).toBe("mid");
    useLiveGame.getState().applyPositionSwap("b2", "mid", "m2", "back", pa);
    expect(useLiveGame.getState().seats).toEqual(before);
    expect(useLiveGame.getState().lineup.back).toContain("b2");
  });

  it("a kid moved to an empty position leaves theirs empty", () => {
    useLiveGame.getState().setInjured("b6", true);
    const empty = storeSeat("b6");
    expect(empty).toBeNull();
    const freeKey = Object.entries(useLiveGame.getState().seats!).find(([, p]) => p === null)![0];
    const from = storeSeat("b1")!;
    useLiveGame.getState().applyPositionSwap("b1", "back", "", "back", freeKey);
    expect(storeSeat("b1")).toBe(freeKey);
    expect(useLiveGame.getState().seats![from]).toBeNull();
  });

  it("a replacement for a hurt kid takes their seat", () => {
    const key = storeSeat("m4");
    useLiveGame.getState().applyInjurySwap("m4", "x3");
    expect(storeSeat("x3")).toBe(key);
  });

  it("the store's seats match the server's replay of the same changes", () => {
    const events = start();
    const s0 = seated(events);
    const [pa, pb] = [keyOf(s0, "b2"), keyOf(s0, "m2")];
    events.push(posSwap("b2", "m2", pa, pb, "back", "mid"));
    events.push(ev("swap", { off_player_id: "f5", on_player_id: "x1", zone: "fwd", ...at }, "x1"));
    useLiveGame.getState().applyPositionSwap("b2", "back", "m2", "mid", pb);
    useLiveGame.getState().applySwap("f5", "x1", "fwd");
    const server = fitSeats(seated(events), replayFairness(events).lineup!, positions).seats;
    expect(useLiveGame.getState().seats).toEqual(server);
  });
});

describe("aflBigField", () => {
  const resolved = (ageGroup: string, onFieldSize: number) =>
    resolveTeamPlaybook({ sport: "afl", ageGroup, onFieldSize, row: null });

  it("is drawn from 14 on, for ages with positions on a three-line field", () => {
    expect(AFL_BIG_FIELD_FROM).toBe(14);
    expect(aflBigFieldPositions(resolved("U16_boys", 18), 18, "zones3")?.map((p) => p.label)).toEqual(
      defaultAflPositions(18).map((p) => p.label),
    );
    expect(aflBigFieldPositions(resolved("U13", 15), 15, "zones3")).toHaveLength(15);
    // Small sides and the zoned ages keep their zone lines.
    expect(aflBigFieldPositions(resolved("U12", 12), 12, "zones3")).toBeNull();
    expect(aflBigFieldPositions(resolved("U10", 12), 18, "zones3")).toBeNull();
    expect(aflBigFieldPositions(resolved("U16_boys", 18), 18, "positions5")).toBeNull();
  });

  it("seats the kids from the game's log, fitted to the lineup", () => {
    const events = start();
    const seats = seated(events);
    events.push(posSwap("b2", "b5", keyOf(seats, "b2"), keyOf(seats, "b5"), "back", "back"));
    const big = aflBigField({
      playbook: resolved("U16_boys", 18),
      onFieldSize: 18,
      zoneModel: "zones3",
      events,
      lineup: lineup(),
    })!;
    expect(big.positions).toHaveLength(18);
    expect(seatOf(big.seats!, "b2")).toBe(keyOf(seats, "b5"));
    expect(seatLabels(big.seats, positions).b2).toBe(labelOf(keyOf(seats, "b5")));
  });
});

describe("the minimum, live", () => {
  // U16: 4 × 20 min, 50 %, 5-minute subs.
  const base = { minPct: 50, quarterMs: 20 * 60_000, periodCount: 4, soonMs: 5 * 60_000, out: new Set<string>() };

  it("flags nobody at the first bounce", () => {
    const states = aflMinTimeStates({ ...base, playedMs: {}, elapsedMs: 0, playerIds: ["a", "b"] });
    expect(Array.from(states.values()).some((s) => s.atRisk)).toBe(false);
  });

  it("flags a kid who can't wait out another sub and still reach half the game", () => {
    // 38 minutes gone, 42 left: Hamish (2 played) needs 38, so he can't
    // sit 5 more; Ben (20 played) needs 20 and has time.
    const states = aflMinTimeStates({ ...base, playedMs: { h: 2 * 60_000, b: 20 * 60_000 }, elapsedMs: 38 * 60_000, playerIds: ["h", "b"] });
    expect(states.get("h")).toMatchObject({ atRisk: true, neededMin: 38 });
    expect(states.get("b")?.atRisk).toBe(false);
  });

  it("time a kid couldn't play comes off their game, and a kid who's out isn't flagged", () => {
    const states = aflMinTimeStates({
      ...base,
      playedMs: { late: 2 * 60_000, hurt: 0 },
      awayMs: { late: 30 * 60_000 },
      elapsedMs: 36 * 60_000,
      playerIds: ["late", "hurt"],
      out: new Set(["hurt"]),
    });
    expect(states.get("late")?.atRisk).toBe(false);
    expect(states.get("hurt")?.atRisk).toBe(false);
  });

  it("no minimum, no states", () => {
    expect(aflMinTimeStates({ ...base, minPct: 0, playedMs: {}, elapsedMs: 0, playerIds: ["a"] }).size).toBe(0);
  });
});

describe("the toast", () => {
  it("says who went where, and that it's logged", () => {
    expect(positionSwapToast({ name: "Jack S", to: "FB" }, { name: "Tom", to: "CHB" })).toBe(
      "Jack S to FB · Tom to CHB · position change logged",
    );
    expect(positionSwapToast({ name: "Jack S", to: "FB" }, null)).toBe("Jack S to FB · position change logged");
  });
});
