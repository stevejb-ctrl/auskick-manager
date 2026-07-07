// Chat-text export for the Player statistics section. Steve 2026-07-07.
import { describe, expect, it } from "vitest";
import { buildChatText } from "@/lib/dashboard/playerStatsChat";
import type { PlayerSeasonStats } from "@/lib/dashboard/types";
import { emptyZoneMs } from "@/lib/dashboard/types";

const M = 60_000; // ms per minute

function row(over: Partial<PlayerSeasonStats>): PlayerSeasonStats {
  return {
    playerId: "p1",
    playerName: "Amos B",
    jerseyNumber: 11,
    gamesPlayed: 8,
    totalMs: 0,
    avgMsPerGame: 0,
    zoneMs: emptyZoneMs(),
    goals: 0,
    behinds: 0,
    subsIn: 0,
    subsOut: 0,
    teamGameTimePct: 0,
    loanMs: 0,
    ...over,
  };
}

describe("buildChatText — group-chat summary of player stats", () => {
  it("formats a player line with minutes, avg, % time, zone split and goals", () => {
    const p = row({
      totalMs: 300 * M,
      avgMsPerGame: 45 * M,
      teamGameTimePct: 96,
      goals: 3,
      zoneMs: { back: 90 * M, hback: 0, mid: 120 * M, hfwd: 0, fwd: 90 * M },
    });
    const text = buildChatText([p]);
    expect(text).toContain("Player stats — 8 games");
    expect(text).toContain(
      "Amos B: 300m · 45m/g · 96% time · Fwd 30% Cen 40% Back 30% · 3 goals",
    );
  });

  it("omits the zone split and goals when there's nothing to show", () => {
    const p = row({
      playerName: "New Kid",
      totalMs: 0,
      avgMsPerGame: 0,
      teamGameTimePct: 0,
    });
    const text = buildChatText([p]);
    expect(text).toContain("New Kid: 0m · 0m/g · 0% time");
    expect(text).not.toContain("Fwd");
    expect(text).not.toContain("goal");
  });

  it("keeps the row order it's given (so it follows the coach's sort)", () => {
    const a = row({ playerId: "a", playerName: "Zoe" });
    const b = row({ playerId: "b", playerName: "Alex" });
    const text = buildChatText([a, b]);
    expect(text.indexOf("Zoe")).toBeLessThan(text.indexOf("Alex"));
  });
});
