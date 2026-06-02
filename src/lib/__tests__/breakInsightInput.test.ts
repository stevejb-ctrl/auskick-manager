// Quarter-break long-press player sheet (issues 8/9).
//
// The break sheet reuses the in-game PlayerInsightSummary, which formats
// `inGameZoneMs` as a clock — so it MUST be fed milliseconds. The trap:
// the break tile already has a minutes-scaled `currentGameZoneMins`, and
// feeding that would render every time 60× too small. `breakInsightInput`
// centralises the contract (ms in; no per-period; no last-sub) so the
// break sheet can't silently regress to minutes.

import { describe, it, expect } from "vitest";
import { breakInsightInput, buildPlayerInsight } from "@/lib/player-insight";
import type { ZoneDef } from "@/lib/sports/types";

const ZONES: ZoneDef[] = [
  { id: "mid", label: "Centre", shortLabel: "CEN" } as ZoneDef,
  { id: "fwd", label: "Forward", shortLabel: "FWD" } as ZoneDef,
];

describe("breakInsightInput", () => {
  it("passes the in-game zone MS straight through (not minutes)", () => {
    const input = breakInsightInput({
      zones: ZONES,
      inGameZoneMs: { mid: 300_000, fwd: 120_000 }, // 5:00 + 2:00
      seasonZoneMs: {},
    });
    const vm = buildPlayerInsight(input);
    expect(vm.inGameTotalMs).toBe(420_000); // 7:00 — not 7ms or 420ms
    expect(vm.inGameZones.find((z) => z.id === "mid")?.ms).toBe(300_000);
  });

  it("omits per-period and 'time since last sub' at the stopped break", () => {
    const vm = buildPlayerInsight(
      breakInsightInput({ zones: ZONES, inGameZoneMs: {}, seasonZoneMs: {} }),
    );
    expect(vm.perPeriod).toEqual([]);
    expect(vm.msSinceLastSub).toBeNull();
  });

  it("still computes the season mix as percentages", () => {
    const vm = buildPlayerInsight(
      breakInsightInput({
        zones: ZONES,
        inGameZoneMs: {},
        seasonZoneMs: { mid: 30, fwd: 10 }, // 75% / 25% — unit-agnostic
      }),
    );
    const pct = Object.fromEntries(vm.seasonZonePct.map((z) => [z.id, z.pct]));
    expect(pct.mid).toBe(75);
    expect(pct.fwd).toBe(25);
  });

  it("tolerates missing zone maps", () => {
    const vm = buildPlayerInsight(
      breakInsightInput({
        zones: ZONES,
        inGameZoneMs: undefined as unknown as Record<string, number>,
        seasonZoneMs: undefined as unknown as Record<string, number>,
      }),
    );
    expect(vm.inGameTotalMs).toBe(0);
  });
});
