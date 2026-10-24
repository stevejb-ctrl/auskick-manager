// The top-bar "Sub due — rotate a player off" banner speaks for a due sub
// with no card to show it. It fired with nobody on the bench who could
// come on (round-3 edge testing, 24 Oct 2026, basketball: everyone left
// on the bench fouled out, or all three lent), telling the coach to take
// a kid off with nobody to bring on. League's already waited for a legal
// swap; every sport's now waits for a bench kid who can play.

import { describe, expect, it } from "vitest";
import { subDueBannerShows } from "@/lib/live/subDueBanner";

describe("subDueBannerShows", () => {
  it("speaks for a due sub with no card, when someone on the bench can come on", () => {
    expect(subDueBannerShows(true, 0, true)).toBe(true);
  });

  it("stays quiet with nobody on the bench who can play (fouled out, lent, hurt, sitting out)", () => {
    expect(subDueBannerShows(true, 0, false)).toBe(false);
  });

  it("leaves a sub with pairs to the card, and a sub not yet due alone", () => {
    expect(subDueBannerShows(true, 2, true)).toBe(false);
    expect(subDueBannerShows(false, 0, true)).toBe(false);
  });
});
