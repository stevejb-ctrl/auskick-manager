// UX audit 23 Oct 2026: on the netball stats page a kid's position %
// disagreed with their thirds %. Thirds came from time on court (mid-
// quarter subs included); positions from counting quarter-start lineups,
// so a replacement's stint never reached the position split. Positions
// now share the thirds' time: the same segments, split by bib.

import { describe, expect, it } from "vitest";
import { computeNetballPlayerStats, replayNetballGameForStats } from "@/lib/dashboard/netballAggregators";
import type { GameEvent, Player } from "@/lib/types";

const POS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
const ids = Array.from({ length: 9 }, (_, i) => `p${i}`);
const lineup = (over: Record<string, string> = {}, bench = ["p7", "p8"]) => ({
  positions: Object.fromEntries(POS.map((p, i) => [p, [over[p] ?? ids[i]]])),
  bench,
});

function ev(type: string, i: number, metadata: Record<string, unknown> = {}): GameEvent {
  return {
    id: `e${i}`,
    game_id: "g1",
    type,
    player_id: null,
    metadata,
    created_by: "u",
    created_at: new Date(Date.UTC(2026, 9, 23, 9, 0, i)).toISOString(),
  } as GameEvent;
}

describe("netball stats: position time", () => {
  // p7: GS for the second half of Q1 (a replacement), WA all of Q2.
  const events = [
    ev("lineup_set", 0, { lineup: lineup() }),
    ev("quarter_start", 1, { quarter: 1 }),
    ev("period_break_swap", 2, {
      lineup: lineup({ wa: "p7" }, ["p2", "p8"]),
      midQuarterSubs: [
        { positionId: "gs", outPlayerId: "p0", inPlayerId: null, atMs: 300_000 },
        { positionId: "gs", outPlayerId: null, inPlayerId: "p7", atMs: 300_000 },
      ],
    }),
    ev("quarter_start", 3, { quarter: 2 }),
    ev("period_break_swap", 4, { lineup: lineup(), midQuarterSubs: [] }),
    ev("quarter_start", 5, { quarter: 3 }),
    ev("period_break_swap", 6, { lineup: lineup(), midQuarterSubs: [] }),
    ev("quarter_start", 7, { quarter: 4 }),
    ev("game_finalised", 8, { midQuarterSubs: [] }),
  ];

  it("credits a replacement's stint to the bib they played", () => {
    const snap = replayNetballGameForStats("g1", events, 600);
    expect(snap.playerPositionMs.p7).toEqual({ gs: 300_000, wa: 600_000 });
    expect(snap.playerPositionMs.p0.gs).toBe(300_000 + 3 * 600_000);
  });

  it("each kid's position time adds up to their thirds' time", () => {
    const snap = replayNetballGameForStats("g1", events, 600);
    for (const pid of ids) {
      const t = snap.playerThirdMs[pid];
      const thirds = t ? t.attack + t.centre + t.defence : 0;
      const bibs = Object.values(snap.playerPositionMs[pid] ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      expect(bibs, pid).toBe(thirds);
    }
  });

  it("the season rollup carries position time", () => {
    const players = ids.map((id) => ({ id, full_name: id }) as Player);
    const snap = replayNetballGameForStats("g1", events, 600);
    const p7 = computeNetballPlayerStats(players, [snap]).find((s) => s.playerId === "p7")!;
    expect(p7.positionMs).toEqual({ gs: 300_000, wa: 600_000 });
    expect(p7.thirdMs).toEqual({ attack: 300_000, centre: 600_000, defence: 0 });
  });
});
