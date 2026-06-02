// PLAYERVIEW-01 + PLAYERVIEW-02 / F3 (plan 12-01) — RED-FIRST.
//
// `buildPlayerInsight` is the SHARED, sport-agnostic, pure view-model
// builder behind the long-press player summary. It turns config-derived
// labelled zones + in-game per-zone ms + a per-period breakdown + season
// per-zone ms + lastSubbedOnMs into a presentational view-model.
//
// Locked contract (12-CONTEXT.md):
//   D-03 zones come from the passed ZoneDef[] (config), in order — never a
//        hardcoded ALL_ZONES.
//   D-04 season output is PERCENTAGES ONLY — no raw season-minutes field.
//   D-06 msSinceLastSub = max(0, nowAbsMs - lastSubbedOnMs); null when the
//        player was never subbed on.
//
// These tests are RED until Task 2 implements `buildPlayerInsight`.

import { describe, expect, it } from "vitest";
import { buildPlayerInsight, type PlayerInsightInput } from "@/lib/player-insight";
import type { ZoneDef } from "@/lib/sports/types";

const ZONES_3: ZoneDef[] = [
  { id: "back", label: "Back", shortLabel: "B" },
  { id: "mid", label: "Mid", shortLabel: "M" },
  { id: "fwd", label: "Forward", shortLabel: "F" },
];

const ZONES_5: ZoneDef[] = [
  { id: "back", label: "Back", shortLabel: "B" },
  { id: "hback", label: "Half Back", shortLabel: "HB" },
  { id: "mid", label: "Mid", shortLabel: "M" },
  { id: "hfwd", label: "Half Forward", shortLabel: "HF" },
  { id: "fwd", label: "Forward", shortLabel: "F" },
];

// Minimal valid input; tests override only what they exercise.
function baseInput(overrides: Partial<PlayerInsightInput> = {}): PlayerInsightInput {
  return {
    zones: ZONES_3,
    inGameZoneMs: {},
    perPeriod: [],
    seasonZoneMs: {},
    lastSubbedOnMs: null,
    nowAbsMs: 0,
    ...overrides,
  };
}

describe("buildPlayerInsight — season percentages only (PLAYERVIEW-02 / D-04)", () => {
  it("converts season per-zone ms to percentages of the player's season total", () => {
    const vm = buildPlayerInsight(
      baseInput({
        seasonZoneMs: { back: 600_000, mid: 1_800_000, fwd: 600_000 }, // 10/30/10 min → 20/60/20%
      }),
    );

    const byId = Object.fromEntries(vm.seasonZonePct.map((r) => [r.id, r.pct]));
    expect(byId.back).toBe(20);
    expect(byId.mid).toBe(60);
    expect(byId.fwd).toBe(20);

    const sum = vm.seasonZonePct.reduce((a, r) => a + r.pct, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1);
  });

  it("exposes NO raw season-minutes field on any season row (percentages only)", () => {
    const vm = buildPlayerInsight(
      baseInput({ seasonZoneMs: { back: 600_000, mid: 600_000, fwd: 600_000 } }),
    );
    for (const row of vm.seasonZonePct) {
      expect(row).not.toHaveProperty("ms");
      expect(row).not.toHaveProperty("minutes");
      expect(row).toHaveProperty("pct");
    }
  });

  it("all-zero season → every pct is 0 (no NaN)", () => {
    const vm = buildPlayerInsight(baseInput({ seasonZoneMs: {} }));
    expect(vm.seasonZonePct).toHaveLength(3);
    for (const row of vm.seasonZonePct) {
      expect(row.pct).toBe(0);
      expect(Number.isNaN(row.pct)).toBe(false);
    }
  });
});

describe("buildPlayerInsight — zones enumerated from config (D-03 / criterion #3)", () => {
  it("emits exactly the passed 3 zones, in order, with their labels", () => {
    const vm = buildPlayerInsight(
      baseInput({ zones: ZONES_3, inGameZoneMs: { mid: 300_000 } }),
    );
    expect(vm.inGameZones.map((z) => z.id)).toEqual(["back", "mid", "fwd"]);
    expect(vm.inGameZones.map((z) => z.label)).toEqual(["Back", "Mid", "Forward"]);
    expect(vm.seasonZonePct.map((z) => z.id)).toEqual(["back", "mid", "fwd"]);
  });

  it("emits exactly the passed 5 zones for a 5-zone age group", () => {
    const vm = buildPlayerInsight(baseInput({ zones: ZONES_5 }));
    expect(vm.inGameZones.map((z) => z.id)).toEqual([
      "back",
      "hback",
      "mid",
      "hfwd",
      "fwd",
    ]);
    expect(vm.seasonZonePct.map((z) => z.id)).toEqual([
      "back",
      "hback",
      "mid",
      "hfwd",
      "fwd",
    ]);
  });

  it("a zone with no ms still appears with ms 0 / pct 0", () => {
    const vm = buildPlayerInsight(
      baseInput({ zones: ZONES_3, inGameZoneMs: { mid: 120_000 } }),
    );
    const back = vm.inGameZones.find((z) => z.id === "back");
    expect(back).toBeDefined();
    expect(back!.ms).toBe(0);
  });
});

describe("buildPlayerInsight — in-game totals + msSinceLastSub (PLAYERVIEW-01 / D-06)", () => {
  it("inGameTotalMs equals the sum of the in-game zone ms", () => {
    const vm = buildPlayerInsight(
      baseInput({ inGameZoneMs: { back: 120_000, mid: 300_000, fwd: 60_000 } }),
    );
    expect(vm.inGameTotalMs).toBe(480_000);
  });

  it("msSinceLastSub = nowAbsMs - lastSubbedOnMs", () => {
    const vm = buildPlayerInsight(
      baseInput({ lastSubbedOnMs: 120_000, nowAbsMs: 300_000 }),
    );
    expect(vm.msSinceLastSub).toBe(180_000);
  });

  it("msSinceLastSub is null when the player was never subbed on", () => {
    const vm = buildPlayerInsight(baseInput({ lastSubbedOnMs: null, nowAbsMs: 300_000 }));
    expect(vm.msSinceLastSub).toBeNull();
  });

  it("msSinceLastSub clamps to 0 when nowAbsMs < lastSubbedOnMs", () => {
    const vm = buildPlayerInsight(
      baseInput({ lastSubbedOnMs: 400_000, nowAbsMs: 300_000 }),
    );
    expect(vm.msSinceLastSub).toBe(0);
  });
});

describe("buildPlayerInsight — per-period breakdown (PLAYERVIEW-01 / D-05)", () => {
  it("preserves period order and lists config zones with their ms + a per-period total", () => {
    const vm = buildPlayerInsight(
      baseInput({
        zones: ZONES_3,
        perPeriod: [
          { period: 1, periodLabel: "Q1", zoneMs: { back: 600_000 } },
          { period: 2, periodLabel: "Q2", zoneMs: { mid: 300_000, fwd: 300_000 } },
        ],
      }),
    );

    expect(vm.perPeriod.map((p) => p.period)).toEqual([1, 2]);
    expect(vm.perPeriod[0].periodLabel).toBe("Q1");

    // Each period lists every config zone, in order.
    expect(vm.perPeriod[0].zones.map((z) => z.id)).toEqual(["back", "mid", "fwd"]);
    const q1Back = vm.perPeriod[0].zones.find((z) => z.id === "back");
    expect(q1Back!.ms).toBe(600_000);
    expect(vm.perPeriod[0].totalMs).toBe(600_000);

    expect(vm.perPeriod[1].totalMs).toBe(600_000);
  });
});

describe("buildPlayerInsight — purity", () => {
  it("does not mutate its input and returns equal output on repeated calls", () => {
    const input = baseInput({
      zones: ZONES_3,
      inGameZoneMs: { back: 120_000, mid: 300_000 },
      perPeriod: [{ period: 1, periodLabel: "Q1", zoneMs: { back: 120_000, mid: 300_000 } }],
      seasonZoneMs: { back: 600_000, mid: 1_400_000 },
      lastSubbedOnMs: 100_000,
      nowAbsMs: 500_000,
    });
    const snapshot = JSON.parse(JSON.stringify(input));

    const a = buildPlayerInsight(input);
    const b = buildPlayerInsight(input);

    expect(input).toEqual(snapshot); // inputs untouched
    expect(a).toEqual(b); // deterministic
  });
});
