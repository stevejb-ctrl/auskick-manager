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

  it("skips blank lines and reports bad lines by line number", () => {
    const { players, errors } = parseSquadPaste("Ava #3\n\nBen #3\nCal #140");
    expect(players).toEqual([{ full_name: "Ava", jersey_number: 3 }]);
    expect(errors).toEqual([
      "Line 3: jersey #3 is listed twice.",
      "Line 4: jersey #140 must be 1–99.",
    ]);
  });

  // Round 3 (24 Oct 2026): the single add took a second "Jack Smith"
  // without a word, while the paste refused "Ava Smith #3" + "Ava Smith
  // #12" as "listed twice". Both warn now, and both add.
  it("warns about a name listed twice, and keeps both", () => {
    const { players, errors, warnings } = parseSquadPaste("Ava Smith #3\nAva Smith #12\nJack Smith\njack  smith");
    expect(errors).toEqual([]);
    expect(players).toEqual([
      { full_name: "Ava Smith", jersey_number: 3 },
      { full_name: "Ava Smith", jersey_number: 12 },
      { full_name: "Jack Smith", jersey_number: null },
      { full_name: "jack smith", jersey_number: null },
    ]);
    expect(warnings).toEqual([
      "Line 2: Ava Smith is listed twice.",
      "Line 4: jack smith is listed twice.",
    ]);
  });

  it("warns about a name already on the squad", () => {
    const { players, warnings } = parseSquadPaste("Mia Chen\nZoe", {
      withJersey: true,
      squad: [{ full_name: "Mia Chen", jersey_number: null, is_active: true }],
    });
    expect(players.map((p) => p.full_name)).toEqual(["Mia Chen", "Zoe"]);
    expect(warnings).toEqual(["Line 1: there's already a Mia Chen on the squad."]);
  });

  // Round 3: "One of those jersey numbers is already taken." (which one?
  // it belonged to a kid off the active list).
  it("names who has a number already, active or not", () => {
    const { players, errors } = parseSquadPaste("New Kid #8\nOther #9", {
      withJersey: true,
      squad: [{ full_name: "Sam Lee", jersey_number: 8, is_active: false }],
    });
    expect(players.map((p) => p.full_name)).toEqual(["Other"]);
    expect(errors).toEqual(["Line 1: #8 is Sam Lee's (inactive)."]);
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
