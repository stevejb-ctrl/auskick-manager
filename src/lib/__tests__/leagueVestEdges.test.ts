// ─── League: the vests in round 3's edge cases ───────────────
// Round 3 edge cases, 24 Oct 2026 (league P2s):
//
//   - The FR wearer was hurt with nobody on the bench: they stayed drawn
//     on the field in the vest and "Who takes the FR vest?" never came
//     up, so H2 had no First Receiver. An injured or lent wearer is off
//     the field for the vest.
//   - With one kid in, Start H1 was greyed out and nothing said why (the
//     FR and DH vests need two). The footer now says so.

import { describe, expect, it } from "vitest";
import { missingVestOnField, vestStartBlocker } from "@/lib/sports/rugby_league/vests";

describe("missingVestOnField", () => {
  const required = { fr: true, dh: true };
  it("an injured wearer still drawn on the field is missing from the vest", () => {
    expect(
      missingVestOnField({ vests: { fr: "noah", dh: "eli" }, onField: ["noah", "eli", "a"], injured: new Set(["noah"]), loaned: new Set(), required }),
    ).toBe("fr");
  });
  it("a lent wearer too; both on and fit, nothing missing", () => {
    expect(missingVestOnField({ vests: { fr: "noah", dh: "eli" }, onField: ["noah", "eli"], injured: new Set(), loaned: new Set(["eli"]), required })).toBe("dh");
    expect(missingVestOnField({ vests: { fr: "noah", dh: "eli" }, onField: ["noah", "eli"], injured: new Set(), loaned: new Set(), required })).toBeNull();
  });
});

describe("vestStartBlocker", () => {
  const reqs = { fr: true, dh: true };
  it("one kid in: the vests need two", () => {
    expect(vestStartBlocker({ onField: 1, required: reqs, fr: null, dh: null })).toBe("Need 2 on the field for the FR and DH vests");
  });
  it("enough kids, a vest unpicked: say which", () => {
    expect(vestStartBlocker({ onField: 8, required: reqs, fr: "a", dh: null })).toBe("Pick who wears the DH vest");
    expect(vestStartBlocker({ onField: 8, required: reqs, fr: "a", dh: "b" })).toBeNull();
    expect(vestStartBlocker({ onField: 1, required: { fr: true, dh: false }, fr: null, dh: null })).toBe("Pick who wears the FR vest");
  });
});
