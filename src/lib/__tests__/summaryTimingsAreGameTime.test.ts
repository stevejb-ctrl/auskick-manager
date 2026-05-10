// Steve flagged the end-of-game summary timings looking off and
// suspected pause-between-quarters time leaks into player minutes.
// This test pins the property: time accumulated to basePlayedZoneMs
// (the value GameSummaryCard renders) is the SUM OF IN-QUARTER
// stint durations only — the wall-clock gap between quarter_end and
// the next quarter_start is excluded.
//
// Mechanism: replayGame's quarter_start handler resets stintStartMs
// to 0 for on-field players, so subsequent in-quarter elapsed_ms
// values are measured from quarter start — not cumulative game ms.
// This test holds that contract under a realistic timeline where
// breaks between quarters are arbitrarily long in wall-clock terms.

import { describe, it, expect } from "vitest";
import { replayGame } from "@/lib/fairness";
import type { GameEvent } from "@/lib/types";

const QUARTER_MS = 12 * 60 * 1000;

let evCounter = 0;
function ev(
  type: GameEvent["type"],
  metadata: Record<string, unknown> = {},
  player_id: string | null = null,
  // Real-world wall-clock seconds elapsed since game open. Goes into
  // created_at so events sort correctly. NOT the same as the
  // metadata.elapsed_ms — that's per-quarter.
  wallClockSeconds: number = evCounter,
): GameEvent {
  evCounter++;
  const baseDate = new Date(2026, 0, 1, 12, 0, 0);
  baseDate.setSeconds(baseDate.getSeconds() + wallClockSeconds);
  return {
    id: `e${evCounter}`,
    game_id: "g1",
    type,
    player_id,
    metadata,
    created_at: baseDate.toISOString(),
    created_by: "u1",
  } as GameEvent;
}

describe("summary timings reflect game time only, never pause time", () => {
  it("a 4-quarter game with a 30-MINUTE break between quarters still credits each player only one quarter per quarter", () => {
    evCounter = 0;
    // Squad: 3 players, all on field together (one zone for simplicity).
    const lineup = { back: [], hback: [], mid: ["p1", "p2", "p3"], hfwd: [], fwd: [], bench: [] };
    const events: GameEvent[] = [];

    // lineup_set + Q1 cycle.
    events.push(ev("lineup_set", { lineup }, null, 0));
    events.push(ev("quarter_start", { quarter: 1 }, null, 1));
    // Q1 quarter_end at in-quarter elapsed_ms = QUARTER_MS, but
    // wall-clock 12 min after the start.
    events.push(
      ev("quarter_end", { quarter: 1, elapsed_ms: QUARTER_MS }, null, 12 * 60),
    );

    // 30-MINUTE break between Q1 and Q2 in wall-clock terms.
    // No events fire during this break — it's just dead time in the
    // QuarterBreak UI while the coach configures the next quarter.
    // (We jump created_at forward by 30*60 seconds.)

    // Q2 cycle. Wall-clock now 12 + 30 = 42 min from game open.
    events.push(ev("quarter_start", { quarter: 2 }, null, 42 * 60));
    events.push(
      ev(
        "quarter_end",
        { quarter: 2, elapsed_ms: QUARTER_MS },
        null,
        (42 + 12) * 60,
      ),
    );

    // Another 30-min break.
    events.push(ev("quarter_start", { quarter: 3 }, null, (42 + 12 + 30) * 60));
    events.push(
      ev(
        "quarter_end",
        { quarter: 3, elapsed_ms: QUARTER_MS },
        null,
        (42 + 12 + 30 + 12) * 60,
      ),
    );

    // Another 30-min break.
    events.push(
      ev("quarter_start", { quarter: 4 }, null, (42 + 12 + 30 + 12 + 30) * 60),
    );
    events.push(
      ev(
        "quarter_end",
        { quarter: 4, elapsed_ms: QUARTER_MS },
        null,
        (42 + 12 + 30 + 12 + 30 + 12) * 60,
      ),
    );

    const state = replayGame(events);

    // Wall-clock total: 12 + 30 + 12 + 30 + 12 + 30 + 12 = 138 min.
    // BUT each on-field player should accumulate exactly 4 quarters
    // worth of mid-zone time = 4 × QUARTER_MS = 48 min.
    for (const pid of ["p1", "p2", "p3"]) {
      const zoneMs = state.basePlayedZoneMs[pid];
      const total =
        zoneMs.back + zoneMs.hback + zoneMs.mid + zoneMs.hfwd + zoneMs.fwd;
      expect(total).toBe(4 * QUARTER_MS);
      // All time should land in the mid zone — they never moved.
      expect(zoneMs.mid).toBe(4 * QUARTER_MS);
    }
  });

  it("a player sub-d off mid-quarter is credited only the time they were on", () => {
    evCounter = 0;
    const lineup = { back: ["p4"], hback: [], mid: ["p1", "p2", "p3"], hfwd: [], fwd: [], bench: [] };
    const events: GameEvent[] = [];

    events.push(ev("lineup_set", { lineup }, null, 0));
    events.push(ev("quarter_start", { quarter: 1 }, null, 1));
    // 6 min into Q1, swap p1 off (back) and p4 on. Wait — p1 is in
    // mid. Adjusting: p4 on field at back. Let me sub p1 off mid for
    // a new bench player. Re-setup: bench has p5.
    // (Simplifying: keep p4 in back, move p5 from bench to mid in
    // place of p1.)

    // Actually our lineup was: back=[p4], mid=[p1,p2,p3], rest empty,
    // bench=[]. With no bench, no subs to model. Add p5 to bench.
    // Re-do via lineup_set adjustment? Not needed — replay reads
    // the swap event directly.
    events.push(
      ev(
        "swap",
        {
          off_player_id: "p1",
          on_player_id: "p5",
          zone: "mid",
          elapsed_ms: 6 * 60 * 1000, // 6 min in
        },
        "p5",
        6 * 60 + 1, // wall clock
      ),
    );
    events.push(
      ev("quarter_end", { quarter: 1, elapsed_ms: QUARTER_MS }, null, 12 * 60),
    );

    // 30-min break, then 3 more quarters where everyone stays put.
    let wall = 12 * 60;
    for (let q = 2; q <= 4; q++) {
      wall += 30 * 60;
      events.push(ev("quarter_start", { quarter: q }, null, wall));
      wall += 12 * 60;
      events.push(
        ev("quarter_end", { quarter: q, elapsed_ms: QUARTER_MS }, null, wall),
      );
    }

    const state = replayGame(events);

    // p1 played the FIRST 6 minutes of Q1, then sat out everything
    // else. Total time = 6 min, all in mid.
    expect(state.basePlayedZoneMs.p1.mid).toBe(6 * 60 * 1000);
    const p1Total =
      state.basePlayedZoneMs.p1.back +
      state.basePlayedZoneMs.p1.mid +
      state.basePlayedZoneMs.p1.fwd;
    expect(p1Total).toBe(6 * 60 * 1000);

    // p5 came on at 6 min and never came off again, so they played
    // the LAST 6 min of Q1 + all of Q2 + Q3 + Q4 = 6 + 12*3 = 42 min.
    expect(state.basePlayedZoneMs.p5.mid).toBe((6 + 12 * 3) * 60 * 1000);
  });
});
