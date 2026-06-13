// Rugby-league sub-due anchor — forced swaps must not reset the clock
// (AFL parity, issue 5). RED would be: a forced injury swap re-anchors
// the countdown.

import { describe, it, expect } from "vitest";
import { resolveLeagueSubAnchorElapsed } from "@/lib/sports/rugby_league/subAnchor";
import type { GameEvent } from "@/lib/types";

let seq = 0;
function ev(
  type: string,
  metadata: Record<string, unknown>,
  player_id: string | null = null,
): GameEvent {
  return {
    id: `e${seq++}`,
    game_id: "g1",
    type: type as GameEvent["type"],
    player_id,
    metadata,
    created_by: null,
    created_at: new Date(1_700_000_000_000 + seq).toISOString(),
  } as GameEvent;
}

const MIN = 60_000;

describe("resolveLeagueSubAnchorElapsed", () => {
  it("returns null before the period starts", () => {
    expect(resolveLeagueSubAnchorElapsed([], 0)).toBeNull();
  });

  it("anchors to the period start (0) when no swaps yet", () => {
    const events = [ev("quarter_start", { quarter: 1 })];
    expect(resolveLeagueSubAnchorElapsed(events, 1)).toBe(0);
  });

  it("anchors to the most recent PLANNED swap", () => {
    const events = [
      ev("quarter_start", { quarter: 1 }),
      ev("swap", { quarter: 1, elapsed_ms: 5 * MIN, off_player_id: "P1", on_player_id: "P9" }),
    ];
    expect(resolveLeagueSubAnchorElapsed(events, 1)).toBe(5 * MIN);
  });

  it("does NOT re-anchor on a forced injury swap (the fix)", () => {
    // Planned sub at 5:00, then an injury swap at 8:00 (injury event +
    // swap for the same player at the same elapsed). The anchor must stay
    // at the planned 5:00, not jump to 8:00.
    const events = [
      ev("quarter_start", { quarter: 1 }),
      ev("swap", { quarter: 1, elapsed_ms: 5 * MIN, off_player_id: "P1", on_player_id: "P9" }),
      ev("injury", { quarter: 1, elapsed_ms: 8 * MIN, injured: true }, "P2"),
      ev("swap", { quarter: 1, elapsed_ms: 8 * MIN, off_player_id: "P2", on_player_id: "P10" }),
    ];
    expect(resolveLeagueSubAnchorElapsed(events, 1)).toBe(5 * MIN);
  });

  it("falls back to the period start when the only swap is forced", () => {
    const events = [
      ev("quarter_start", { quarter: 1 }),
      ev("injury", { quarter: 1, elapsed_ms: 3 * MIN, injured: true }, "P2"),
      ev("swap", { quarter: 1, elapsed_ms: 3 * MIN, off_player_id: "P2", on_player_id: "P10" }),
    ];
    expect(resolveLeagueSubAnchorElapsed(events, 1)).toBe(0);
  });

  it("ignores events from other periods", () => {
    const events = [
      ev("quarter_start", { quarter: 1 }),
      ev("swap", { quarter: 1, elapsed_ms: 4 * MIN, off_player_id: "P1", on_player_id: "P9" }),
      ev("quarter_start", { quarter: 2 }),
    ];
    expect(resolveLeagueSubAnchorElapsed(events, 2)).toBe(0);
  });
});
