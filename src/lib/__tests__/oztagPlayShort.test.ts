// ─── Oztag over the boys' cap: play one short ────────────────
// Round 2 usability, 24 Oct 2026 (Oztag P1): a hand sub put a 5th boy
// on (Swap anyway), then a girl was hurt and the only bench girl came
// on for her. 7 on, 5 boys and 2 girls: the banner said "You can field
// 6: 4 boys and 2 girls", but the strip said "nobody on the bench can
// fix it", the suggestions swapped boy for boy, and nothing could take a
// kid off without a replacement. The fix is to take a boy off and play
// the 6 the rule allows: the boy on longest, written as a lineup with
// him on the bench (he then rests like any kid taken off).

import { describe, expect, it } from "vitest";
import { touchMixFix, suggestTouchSubs, type TouchMixed } from "@/lib/sports/touch/suggest";
import { replayTouchGame } from "@/lib/sports/touch/replay";
import { touchOnField } from "@/lib/sports/touch/lineup";
import { benchInTouchLineup } from "@/lib/sports/touch/live";
import { mixedFieldBreach } from "@/lib/sports/touch/mixed";
import { game, MIN } from "@/lib/sports/touch/__tests__/touchGame";
import type { MixedGroup } from "@/lib/types";

const GROUPS: Record<string, MixedGroup> = { b1: "boy", b2: "boy", b3: "boy", b4: "boy", b5: "boy", b6: "boy", g1: "girl", g2: "girl", g3: "girl" };
const mixed: TouchMixed = { rule: { maxBoys: 4, minGirls: 2, minBoys: 0 }, groupOf: (id) => GROUPS[id] ?? null };

function overTheCap() {
  const g = game();
  g.lineup({ lines: { middle: [], link: [], wing: [], field: ["b1", "b2", "b3", "b4", "g1", "g2", "g3"] }, bench: ["b5", "b6"] });
  g.start(1);
  // 2:00 Swap anyway: a 5th boy on for a girl.
  g.swap("g3", "b5", 2);
  // 5:00 g1 hurt; the only bench girl comes on for her.
  g.injure("g1", 5);
  g.swap("g1", "g3", 5);
  return g;
}

describe("touchMixFix", () => {
  it("with no girl to swap in, takes the boy on longest off: play 6", () => {
    const g = overTheCap();
    const state = replayTouchGame(g.events, { nowMs: 6 * MIN });
    expect(mixedFieldBreach(touchOnField(state.lineup!), mixed.rule, mixed.groupOf)?.short).toBe("5 boys on · rule 4");
    const fix = touchMixFix({ state, nowMs: 6 * MIN, strategy: "minutes", mixed });
    expect(fix.subs).toEqual([]);
    expect(fix.off).toEqual(["b1"]);
    const after = benchInTouchLineup(state.lineup!, "b1");
    expect(touchOnField(after)).toHaveLength(6);
    expect(mixedFieldBreach(touchOnField(after), mixed.rule, mixed.groupOf)).toBeNull();
  });

  it("swaps first when a girl can come on, and takes nobody off", () => {
    const g = game();
    g.lineup({ lines: { middle: [], link: [], wing: [], field: ["b1", "b2", "b3", "b4", "g1", "g2", "g3"] }, bench: ["b5", "b6"] });
    g.start(1);
    g.swap("g3", "b5", 2);
    const state = replayTouchGame(g.events, { nowMs: 3 * MIN });
    const fix = touchMixFix({ state, nowMs: 3 * MIN, strategy: "minutes", mixed });
    expect(fix.subs.map((s) => s.on_player_id)).toEqual(["g3"]);
    expect(fix.off).toEqual([]);
  });

  it("a boy taken off with no replacement rests like any kid taken off", () => {
    const g = overTheCap();
    const state = replayTouchGame(g.events, { nowMs: 6 * MIN });
    g.add("lineup_set", { lineup: benchInTouchLineup(state.lineup!, "b1"), quarter: 1, elapsed_ms: 6 * MIN });
    const after = replayTouchGame(g.events, { nowMs: 6 * MIN + 10_000 });
    expect(after.lastSubbedOffMs.b1).toBe(6 * MIN);
    const subs = suggestTouchSubs({ state: after, nowMs: 6 * MIN + 10_000, strategy: "minutes", mixed, restMs: 4 * MIN });
    expect(subs.map((s) => s.on_player_id)).not.toContain("b1");
  });
});
