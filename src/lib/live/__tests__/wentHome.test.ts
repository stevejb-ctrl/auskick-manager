import { describe, expect, it } from "vitest";
import { sidelinedAtEnd, sidelinedLabel, summaryStatusNote, wentHomeIds } from "@/lib/live/wentHome";

const injury = (player_id: string, injured: boolean, reason?: string) => ({
  type: "injury",
  player_id,
  metadata: { injured, quarter: 2, elapsed_ms: 0, ...(reason ? { reason } : {}) },
});

describe("wentHomeIds", () => {
  it("names the kids marked out (reason \"out\"), not the hurt ones", () => {
    const ids = wentHomeIds([injury("noah", true, "out"), injury("ava", true), { type: "goal", player_id: "mia" }]);
    expect(Array.from(ids)).toEqual(["noah"]);
  });

  it("clears a kid brought back, or hurt for real later", () => {
    expect(wentHomeIds([injury("noah", true, "out"), injury("noah", false)]).size).toBe(0);
    expect(wentHomeIds([injury("noah", true, "out"), injury("noah", false), injury("noah", true)]).size).toBe(0);
  });

  it("ignores a foul-out", () => {
    expect(wentHomeIds([injury("jack", true, "fouled_out")]).size).toBe(0);
  });
});

describe("sidelinedAtEnd", () => {
  it("is the kids still off at the end: hurt, and gone home", () => {
    const s = sidelinedAtEnd([
      injury("ava", true),
      injury("noah", true, "out"),
      injury("mia", true),
      injury("mia", false),
      injury("jack", true, "fouled_out"),
    ]);
    expect(Array.from(s.injured).sort()).toEqual(["ava", "noah"]);
    expect(Array.from(s.wentHome)).toEqual(["noah"]);
  });
});

describe("labels", () => {
  const sets = { injured: new Set(["ava", "noah"]), wentHome: new Set(["noah"]) };
  it("says went home for a kid who left, injured for a hurt kid", () => {
    expect(sidelinedLabel("noah", sets.wentHome)).toBe("Went home");
    expect(sidelinedLabel("ava", sets.wentHome)).toBe("Injured");
    expect(summaryStatusNote("noah", sets)).toBe(" · went home");
    expect(summaryStatusNote("ava", sets)).toBe(" · injured");
    expect(summaryStatusNote("mia", sets)).toBe("");
  });
});
