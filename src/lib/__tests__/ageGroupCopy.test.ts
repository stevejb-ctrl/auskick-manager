// Usability run (13 Oct 2026): the U15 age-group note said "3 zones"
// while How we play said "No zones at this age". Zones end at U10 by
// default (UX plan §7.2), so the copy mustn't promise them later.

import { describe, expect, it } from "vitest";
import { AGE_GROUPS } from "@/lib/ageGroups";
import { effectivePolicy } from "@/lib/playbook";

describe("AFL age-group notes", () => {
  it("only mention zones where zones are on by default", () => {
    for (const [id, cfg] of Object.entries(AGE_GROUPS)) {
      if (effectivePolicy("afl", id).zonesEnforced) continue;
      expect(cfg.notes.replace(/no zones/i, ""), `${id}: ${cfg.notes}`).not.toMatch(/zone/i);
    }
  });
});

describe("league age-group labels", () => {
  it("read like AFL's (Under 10), not U10", async () => {
    const { rugbyLeagueSport } = await import("@/lib/sports/rugby_league");
    for (const ag of rugbyLeagueSport.ageGroups) expect(ag.label).toMatch(/^Under \d+/);
  });
});
