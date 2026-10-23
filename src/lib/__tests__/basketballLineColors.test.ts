// UX audit 23 Oct 2026: basketball's guards were green on court (the
// tile's zone-c) and blue at the break (zone3 = zone-b). One token per
// line, everywhere: the break's zones and the tile both read it from
// BASKETBALL_LINE_ZONE.

import { describe, expect, it } from "vitest";
import { getAgeGroupConfig } from "@/lib/sports";
import { breakConfigFor } from "@/lib/sports/break";
import { BASKETBALL_LINE_ZONE } from "@/lib/sports/basketball";
import { ZONE_TEXT } from "@/components/quarter-break/breakZoneTokens";

describe("basketball line colours", () => {
  it("guards are green and forwards orange, as on court", () => {
    expect(ZONE_TEXT[BASKETBALL_LINE_ZONE.guard]).toBe("text-zone-c");
    expect(ZONE_TEXT[BASKETBALL_LINE_ZONE.forward]).toBe("text-zone-f");
  });

  it("the break colours each line with the line's own token", () => {
    const { zones } = breakConfigFor("basketball", getAgeGroupConfig("basketball", "U12"), { onFieldSize: 5 });
    for (const z of zones) expect(z.color, z.key).toBe(BASKETBALL_LINE_ZONE[z.key as keyof typeof BASKETBALL_LINE_ZONE]);
    expect(zones.find((z) => z.key === "guard")?.color).toBe("zone2");
  });
});
