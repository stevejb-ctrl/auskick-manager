// The season picker read "2026 (4 games)" beside "3 completed games":
// it counted next week's fixture (Stagehand round 7, 28 Oct 2026).

import { describe, expect, it } from "vitest";
import { deriveSeasons } from "@/lib/dashboard/aggregators";
import type { Game } from "@/lib/types";

const game = (scheduled_at: string, status: Game["status"]) => ({ scheduled_at, status }) as Game;

describe("deriveSeasons", () => {
  it("counts the games played, not the fixtures still to come", () => {
    const seasons = deriveSeasons([
      game("2026-10-03T09:00:00Z", "completed"),
      game("2026-10-10T09:00:00Z", "completed"),
      game("2026-10-17T09:00:00Z", "completed"),
      game("2026-10-31T09:00:00Z", "upcoming"),
    ]);
    expect(seasons).toEqual([{ year: 2026, gameCount: 3 }]);
  });

  it("still lists a season with nothing played yet, newest first", () => {
    const seasons = deriveSeasons([game("2026-10-03T09:00:00Z", "completed"), game("2027-04-10T09:00:00Z", "upcoming")]);
    expect(seasons).toEqual([
      { year: 2027, gameCount: 0 },
      { year: 2026, gameCount: 1 },
    ]);
  });
});
