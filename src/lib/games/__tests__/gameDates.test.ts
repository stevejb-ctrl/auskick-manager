import { describe, expect, it } from "vitest";
import { formatGameDateTime, gameDateError, gameDateRange } from "@/lib/games/gameDates";

const NOW = new Date("2026-10-25T10:00:00+11:00").getTime();
const DAY = 86_400_000;

describe("gameDateError", () => {
  // Round 3 (24 Oct 2026): 2099-12-31 and 9999-12-31 were both accepted,
  // and a mistyped year kept the game in the wrong season for good.
  it("refuses a year typed wrong", () => {
    expect(gameDateError("9999-12-31T12:59:00.000Z", NOW)).toMatch(/more than 18 months away/);
    expect(gameDateError("2099-12-31T12:59:00.000Z", NOW)).toMatch(/more than 18 months away/);
    expect(gameDateError("2020-03-01T00:00:00.000Z", NOW)).toMatch(/more than 2 years ago/);
  });

  it("takes this season, next season's opener and last season's games", () => {
    expect(gameDateError(new Date(NOW + 7 * DAY).toISOString(), NOW)).toBeNull();
    expect(gameDateError(new Date(NOW - 7 * DAY).toISOString(), NOW)).toBeNull();
    expect(gameDateError(new Date(NOW + 400 * DAY).toISOString(), NOW)).toBeNull();
    expect(gameDateError(new Date(NOW - 400 * DAY).toISOString(), NOW)).toBeNull();
  });

  it("refuses something that isn't a date", () => {
    expect(gameDateError("", NOW)).toBe("Date and time are required.");
    expect(gameDateError("not a date", NOW)).toBe("Date and time are required.");
  });
});

describe("gameDateRange", () => {
  it("is the input's min and max, local time", () => {
    const { min, max } = gameDateRange(NOW);
    expect(min).toMatch(/^2024-10-\d\dT\d\d:\d\d$/);
    expect(max).toMatch(/^2028-04-\d\dT\d\d:\d\d$/);
  });
});

describe("formatGameDateTime", () => {
  const d = (iso: string) => new Date(iso);

  // Round 3: "Thu 31 Dec · 23:59" under the 2026 heading for a 2099 game.
  it("shows the year when it isn't this year", () => {
    expect(formatGameDateTime(d("2027-03-06T09:00:00+11:00"), "short", NOW, "en-AU")).toMatch(/2027/);
    expect(formatGameDateTime(d("2025-08-02T09:00:00+10:00"), "short", NOW, "en-AU")).toMatch(/2025/);
  });

  it("leaves this year's off a short date", () => {
    expect(formatGameDateTime(d("2026-11-07T09:00:00+11:00"), "short", NOW, "en-AU")).not.toMatch(/2026/);
  });

  it("always has the year in long form", () => {
    expect(formatGameDateTime(d("2026-11-07T09:00:00+11:00"), "long", NOW, "en-AU")).toMatch(/2026/);
  });
});
