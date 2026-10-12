import { describe, expect, it } from "vitest";
import { parseSquadPaste } from "@/lib/squadPaste";

describe("parseSquadPaste", () => {
  it("reads the shapes coaches paste", () => {
    const { players, errors } = parseSquadPaste(
      ["Ava Smith #3", "7 Ben Jones", "Cara Lee, 12", "#14 Dev Patel", "Eli\t21", "Finn Ward"].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(players).toEqual([
      { full_name: "Ava Smith", jersey_number: 3 },
      { full_name: "Ben Jones", jersey_number: 7 },
      { full_name: "Cara Lee", jersey_number: 12 },
      { full_name: "Dev Patel", jersey_number: 14 },
      { full_name: "Eli", jersey_number: 21 },
      { full_name: "Finn Ward", jersey_number: null },
    ]);
  });

  it("skips blank lines and reports bad or duplicate lines by line number", () => {
    const { players, errors } = parseSquadPaste("Ava #3\n\nBen #3\nAva #4\nCal #140");
    expect(players).toEqual([{ full_name: "Ava", jersey_number: 3 }]);
    expect(errors).toEqual([
      "Line 3: jersey #3 is listed twice.",
      "Line 4: Ava is listed twice.",
      "Line 5: jersey #140 must be 1–99.",
    ]);
  });

  it("keeps numbers as part of the name when the sport has no jerseys", () => {
    const { players } = parseSquadPaste("Mia 2\nZoe", { withJersey: false });
    expect(players).toEqual([
      { full_name: "Mia 2", jersey_number: null },
      { full_name: "Zoe", jersey_number: null },
    ]);
  });
});
