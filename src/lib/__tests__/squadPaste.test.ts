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

  it("keeps a bare trailing number when the sport has no jerseys (it may tell two Mias apart)", () => {
    const { players } = parseSquadPaste("Mia 2\nZoe", { withJersey: false });
    expect(players).toEqual([
      { full_name: "Mia 2", jersey_number: null },
      { full_name: "Zoe", jersey_number: null },
    ]);
  });

  // UX audit 23 Oct 2026: a netball paste kept "Sienna Brooks #1".
  it("leaves jersey numbers off the names when the sport has no jerseys, and counts them", () => {
    const { players, numbersLeftOff, errors } = parseSquadPaste(
      ["Sienna Brooks #1", "2 Ava Smith", "#3. Cara Lee", "Dev Patel, 4", "Eli\t5", "Finn"].join("\n"),
      { withJersey: false },
    );
    expect(errors).toEqual([]);
    expect(players.map((p) => p.full_name)).toEqual(["Sienna Brooks", "Ava Smith", "Cara Lee", "Dev Patel", "Eli", "Finn"]);
    expect(players.every((p) => p.jersey_number === null)).toBe(true);
    expect(numbersLeftOff).toBe(5);
  });

  it("doesn't check numbers it leaves off", () => {
    // Two kids both "#1" in a list from two clubs: no jerseys, no clash.
    const { players, errors } = parseSquadPaste("Ava #1\nBen #1\nCal #140", { withJersey: false });
    expect(errors).toEqual([]);
    expect(players.map((p) => p.full_name)).toEqual(["Ava", "Ben", "Cal"]);
  });
});
