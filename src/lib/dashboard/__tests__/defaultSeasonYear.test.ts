// Stats opens on the season the coach is playing (UX round 3, 24 Oct
// 2026): it opened on the newest year with any game, so one mistyped
// 9999 fixture (or next season's first, added in December) showed "0
// completed games" and hid the season just played.

import { describe, expect, it } from "vitest";
import { defaultSeasonYear } from "@/lib/dashboard/aggregators";

const NOW = new Date("2026-10-24T09:00:00+11:00");
const game = (scheduled_at: string, status: "upcoming" | "in_progress" | "completed") => ({ scheduled_at, status });

describe("defaultSeasonYear", () => {
  it("opens on the season of the latest game played, not a far-off fixture", () => {
    expect(
      defaultSeasonYear([game("2026-10-17T09:00:00Z", "completed"), game("9999-12-31T12:59:00Z", "upcoming")], NOW),
    ).toBe(2026);
  });

  it("opens on the season just played when next season's first game is in", () => {
    expect(
      defaultSeasonYear([game("2026-09-12T09:00:00Z", "completed"), game("2027-04-10T09:00:00Z", "upcoming")], new Date("2026-12-05T09:00:00Z")),
    ).toBe(2026);
  });

  it("opens on this year before anything's been played, else the soonest season", () => {
    expect(defaultSeasonYear([game("2026-11-01T09:00:00Z", "upcoming"), game("2027-04-10T09:00:00Z", "upcoming")], NOW)).toBe(2026);
    expect(defaultSeasonYear([game("2028-04-10T09:00:00Z", "upcoming"), game("2027-04-10T09:00:00Z", "upcoming")], NOW)).toBe(2027);
  });

  it("is null with no games", () => {
    expect(defaultSeasonYear([], NOW)).toBeNull();
  });
});
