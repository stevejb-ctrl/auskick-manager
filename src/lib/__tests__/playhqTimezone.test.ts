// Steve 2026-05-10: PlayHQ imports were storing scheduled_at as
// `new Date("YYYY-MM-DDTHH:MM:SS").toISOString()`, which parses the
// string in the SERVER'S local timezone. On Vercel (UTC/US runners) a
// 10am Melbourne game saved as 10am US local → ~midnight UTC the same
// day → rendered as 8–10pm Melbourne time. ~10 hours late.
//
// wallClockToUTC anchors the wall-clock string to a specific IANA
// timezone via Intl.DateTimeFormat. These tests verify both AEST
// (winter, footy/netball season) and AEDT (summer / pre-season) cases
// + the QLD edge case + a midnight (no-time) case.

import { describe, expect, it } from "vitest";
import { wallClockToUTC } from "@/lib/playhq";

describe("wallClockToUTC", () => {
  it("treats a winter Melbourne 10am as AEST (UTC+10) → 00:00 UTC", () => {
    // 2026-05-17 is a Sunday in May — AEST in Melbourne (DST ended
    // first Sunday of April).
    expect(wallClockToUTC("2026-05-17", "10:00:00", "Australia/Melbourne"))
      .toBe("2026-05-17T00:00:00.000Z");
  });

  it("treats a summer Melbourne 10am as AEDT (UTC+11) → 23:00 prior day UTC", () => {
    // 2026-01-25 is high summer — AEDT in Melbourne. 10am local = 23:00
    // UTC the day before.
    expect(wallClockToUTC("2026-01-25", "10:00:00", "Australia/Melbourne"))
      .toBe("2026-01-24T23:00:00.000Z");
  });

  it("handles QLD year-round AEST (no DST) consistently", () => {
    // QLD never observes DST. 10am Brisbane = 00:00 UTC every day of
    // the year.
    expect(wallClockToUTC("2026-01-25", "10:00:00", "Australia/Brisbane"))
      .toBe("2026-01-25T00:00:00.000Z");
    expect(wallClockToUTC("2026-05-17", "10:00:00", "Australia/Brisbane"))
      .toBe("2026-05-17T00:00:00.000Z");
  });

  it("handles a midnight (00:00:00) wall-clock without dropping the day", () => {
    // PlayHQ sometimes returns no time, in which case the caller
    // passes "00:00:00". The result must still be the right calendar
    // day in the venue's zone, not the day before.
    const result = wallClockToUTC(
      "2026-05-17",
      "00:00:00",
      "Australia/Melbourne",
    );
    // 00:00 AEST = 14:00 UTC the day before.
    expect(result).toBe("2026-05-16T14:00:00.000Z");
    // Critically: when re-formatted in the Melbourne zone it should
    // read 2026-05-17, not 2026-05-16.
    const back = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(result));
    expect(back).toBe("2026-05-17");
  });

  it("survives a DST 'spring forward' wall-clock without infinite drift", () => {
    // Australia DST starts first Sunday of October — 2am AEST jumps
    // to 3am AEDT. The 2:30am wall-clock doesn't exist in Melbourne;
    // wallClockToUTC should still produce a valid ISO string within
    // a sensible window of the gap (Intl convention: returns the
    // post-jump value). The two-iteration loop must not diverge.
    const result = wallClockToUTC(
      "2026-10-04",
      "02:30:00",
      "Australia/Melbourne",
    );
    // Rough sanity: the result is somewhere around 2026-10-03 at
    // 15:30 UTC (the AEST instant) or 16:30 UTC (the AEDT instant).
    const ms = new Date(result).getTime();
    const aestEquivalent = new Date("2026-10-03T16:30:00Z").getTime();
    const tolerance = 2 * 60 * 60 * 1000; // 2 hours
    expect(Math.abs(ms - aestEquivalent)).toBeLessThan(tolerance);
  });
});
