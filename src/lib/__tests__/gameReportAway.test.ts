// How we played held kids to the game-time floor over the whole game
// even when they couldn't play all of it (UX audit, 23 Oct 2026): an
// injured kid, a fouled-out kid, a kid lent to the other team and a late
// arrival each read "played under 50%" — "1 rule missed" in every sport.
// Their floor now counts only the time they were free to play.

import { describe, expect, it } from "vitest";
import { newRule } from "@/lib/playbook/rules";
import { gameReport } from "@/lib/playbook/gameReport";
import { awayMsByPeriod } from "@/lib/playbook/awayTime";
import type { GameEvent, GameEventType } from "@/lib/types";

const P = 12 * 60_000;
const MIN = 60_000;

let n = 0;
const ev = (type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent => ({
  id: `e${++n}`,
  game_id: "g1",
  type,
  player_id: playerId,
  metadata,
  created_by: null,
  created_at: new Date(2026, 0, 1, 9, 0, n).toISOString(),
});

const kickoff = (ids: string[]) => [
  ev("lineup_set", { lineup: { back: ids, hback: [], mid: [], hfwd: [], fwd: [], bench: [] } }),
  ev("quarter_start", { quarter: 1 }),
];
const len = () => P;

describe("awayMsByPeriod", () => {
  it("counts an injured kid away from the injury to full time", () => {
    const away = awayMsByPeriod(
      [...kickoff(["mia"]), ev("injury", { injured: true, quarter: 2, elapsed_ms: 3 * MIN }, "mia")],
      len,
      4,
    );
    expect(away).toEqual({ mia: { 2: 9 * MIN, 3: P, 4: P } });
  });

  it("stops counting when the kid is back from injury", () => {
    const away = awayMsByPeriod(
      [
        ...kickoff(["mia"]),
        ev("injury", { injured: true, quarter: 2, elapsed_ms: 3 * MIN }, "mia"),
        ev("injury", { injured: false, quarter: 2, elapsed_ms: P }, "mia"),
      ],
      len,
      4,
    );
    expect(away).toEqual({ mia: { 2: 9 * MIN } });
  });

  it("treats a foul-out as an injury", () => {
    const away = awayMsByPeriod(
      [...kickoff(["kai"]), ev("injury", { injured: true, reason: "fouled_out", quarter: 4, elapsed_ms: 2 * MIN }, "kai")],
      len,
      4,
    );
    expect(away).toEqual({ kai: { 4: 10 * MIN } });
  });

  it("counts a loan until the kid comes back", () => {
    const away = awayMsByPeriod(
      [
        ...kickoff(["ava"]),
        ev("player_loan", { loaned: true, quarter: 1, elapsed_ms: 6 * MIN }, "ava"),
        ev("player_loan", { loaned: false, quarter: 2, elapsed_ms: 0 }, "ava"),
      ],
      len,
      4,
    );
    expect(away).toEqual({ ava: { 1: 6 * MIN } });
  });

  it("counts a late arrival away from the start, and not a kid who was there at kickoff", () => {
    const away = awayMsByPeriod(
      [
        ...kickoff(["mia"]),
        ev("player_arrived", { quarter: 3, elapsed_ms: 0 }, "zoe"),
        ev("player_arrived", { quarter: 2, elapsed_ms: 0 }, "mia"),
      ],
      len,
      4,
    );
    expect(away).toEqual({ zoe: { 1: P, 2: P } });
  });

  it("measures each period by how long it ran", () => {
    const away = awayMsByPeriod(
      [...kickoff(["mia"]), ev("injury", { injured: true, quarter: 1, elapsed_ms: 20 * MIN }, "mia")],
      (p) => (p === 1 ? 8 * MIN : P),
      2,
    );
    // An elapsed past the period's end is the end.
    expect(away).toEqual({ mia: { 2: P } });
  });
});

describe("How we played with kids who couldn't play the whole game", () => {
  const base = {
    lines: ["back", "mid", "fwd"],
    lineLabel: (k: string) => k,
    lineWord: "line",
    periodLabel: (p: number) => `Q${p}`,
    periodCount: 4,
    periodMs: P,
    minGameTimePct: 50,
    name: (id: string) => id.charAt(0).toUpperCase() + id.slice(1),
  };
  // Mia plays the whole game; the others are the audit's kids.
  const byPeriod = {
    mia: { 1: { back: P }, 2: { mid: P }, 3: { fwd: P }, 4: { back: P } },
    // Hurt at the start of Q2 after a full Q1.
    matilda: { 1: { fwd: P } },
    // Fouled out early in Q2 after a full Q1.
    kai: { 1: { mid: P }, 2: { mid: 2 * MIN } },
    // Lent for Q2 and Q3, played Q1 and Q4.
    ava: { 1: { back: P }, 4: { fwd: P } },
    // Arrived at half time, played half of Q3 and all of Q4.
    zoe: { 3: { back: 6 * MIN }, 4: { mid: P } },
  };
  const away = {
    matilda: { 2: P, 3: P, 4: P },
    kai: { 2: 10 * MIN, 3: P, 4: P },
    ava: { 2: P, 3: P },
    zoe: { 1: P, 2: P },
  };

  it("holds each kid to the floor over the time they were free to play", () => {
    const report = gameReport({
      ...base,
      byPeriod,
      present: Object.keys(byPeriod),
      away,
      rules: [
        { ...newRule("max-bench-in-row"), strength: "must" },
        { ...newRule("every-line-per-game"), strength: "prefer" },
      ],
    });
    expect(report.items.map((i) => [i.status, i.text])).toEqual([
      ["ok", "Everyone played at least 50% of the time they could play"],
      ["ok", "Nobody sat out 2 in a row"],
      // Kids who missed time aren't held to the line rules.
      ["ok", "Everyone who could play all game played every line"],
    ]);
  });

  it("still flags a kid who was free to play and sat", () => {
    const report = gameReport({
      ...base,
      // Zoe arrived at half time and never got on.
      byPeriod: { mia: byPeriod.mia },
      present: ["mia", "zoe"],
      away: { zoe: { 1: P, 2: P } },
      rules: [{ ...newRule("max-bench-in-row"), strength: "must" }],
    });
    expect(report.items.map((i) => [i.status, i.text])).toEqual([
      ["fail", "Zoe played under 50% of the time they could play"],
      ["fail", "Zoe sat out 2 in a row"],
    ]);
  });

  it("says nothing new when everyone was free the whole game", () => {
    const report = gameReport({ ...base, byPeriod: { mia: byPeriod.mia }, away: {}, rules: [] });
    expect(report.items[0]).toMatchObject({ status: "ok", text: "Everyone played at least 50%" });
  });
});
