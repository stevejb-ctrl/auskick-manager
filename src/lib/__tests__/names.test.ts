import { describe, expect, it } from "vitest";
import { distinctFullNames, firstName, shortName, shortNames } from "@/lib/names";

const kid = (id: string, full_name: string, jersey_number: number | null = null) => ({ id, full_name, jersey_number });

describe("firstName", () => {
  it("is the first word", () => {
    expect(firstName("Ava Smith")).toBe("Ava");
    expect(firstName("  Ava   Smith ")).toBe("Ava");
  });

  // Round 3 (24 Oct 2026): "😀 Emoji Kid" showed as "😀 K" on tiles and
  // "#11 😀" in the share text.
  it("skips a leading emoji or symbol", () => {
    expect(firstName("😀 Emoji Kid")).toBe("Emoji");
    expect(firstName("🏉 Noah")).toBe("Noah");
    expect(firstName("#3 Ava")).toBe("Ava");
  });

  it("keeps a name with no letters whole", () => {
    expect(firstName("😀")).toBe("😀");
    expect(firstName("")).toBe("");
  });
});

describe("shortName", () => {
  it("is first name plus the surname's initial for a tile", () => {
    expect(shortName("Ava Smith", "initial")).toBe("Ava S");
    expect(shortName("Ava", "initial")).toBe("Ava");
    expect(shortName("😀 Emoji Kid", "initial")).toBe("Emoji K");
    expect(shortName("Mary Jane O'Neil", "initial")).toBe("Mary O");
  });
});

describe("shortNames", () => {
  it("leaves names that don't clash alone", () => {
    const names = shortNames([kid("a", "Ava Smith"), kid("b", "Ben Jones")]);
    expect(names.get("a")).toBe("Ava");
    expect(names.get("b")).toBe("Ben");
  });

  // Round 3: "Ava → Olivia" on the sub card with two Avas on the field.
  it("adds the surname's initial when first names clash", () => {
    const names = shortNames([kid("a", "Ava Smith"), kid("b", "Ava Martin"), kid("c", "Ben Jones")]);
    expect(names.get("a")).toBe("Ava S");
    expect(names.get("b")).toBe("Ava M");
    expect(names.get("c")).toBe("Ben");
  });

  it("adds more of the surname until the clash goes", () => {
    const names = shortNames([kid("a", "Jack Smith"), kid("b", "Jack Stone"), kid("c", "Jack Brown")]);
    expect(names.get("a")).toBe("Jack Sm");
    expect(names.get("b")).toBe("Jack St");
    expect(names.get("c")).toBe("Jack B");
  });

  it("starts a tile's clash from the initial", () => {
    const names = shortNames([kid("a", "Jack Smith"), kid("b", "Jack Stone"), kid("c", "Ava Lee")], "initial");
    expect(names.get("a")).toBe("Jack Sm");
    expect(names.get("b")).toBe("Jack St");
    expect(names.get("c")).toBe("Ava L");
  });

  // Round 3: 'Jack S' #5 and 'Jack S.' #6 read as two "Jack S" tiles.
  it("falls back to the jersey number when the names are the same", () => {
    const names = shortNames([kid("a", "Jack S", 5), kid("b", "Jack S.", 6), kid("c", "Jack Smith", 9)], "initial");
    expect(names.get("a")).toBe("Jack S #5");
    expect(names.get("b")).toBe("Jack S #6");
    expect(names.get("c")).toBe("Jack Sm");
  });

  it("doesn't add a number the surface already prints", () => {
    const names = shortNames([kid("a", "Jack S", 5), kid("b", "Jack S.", 6), kid("c", "Mia"), kid("d", "Mia")], "first", {
      numberShown: true,
    });
    // "#5 Jack" and "#6 Jack": the printed number tells them apart.
    expect(names.get("a")).toBe("Jack");
    expect(names.get("b")).toBe("Jack");
    expect(names.get("c")).toBe("Mia (1)");
    expect(names.get("d")).toBe("Mia (2)");
  });

  it("numbers two kids with the same name and no jersey, in squad order", () => {
    const names = shortNames([kid("a", "Mia Chen"), kid("b", "Mia Chen"), kid("c", "Zoe")]);
    expect(names.get("a")).toBe("Mia (1)");
    expect(names.get("b")).toBe("Mia (2)");
    expect(names.get("c")).toBe("Zoe");
  });

  // Review: the count followed each page's query order, so one Mia was
  // "(1)" live and "(2)" on the game page.
  it("numbers the same way whatever order the squad comes in", () => {
    const a = shortNames([kid("id-2", "Mia Chen"), kid("id-1", "Mia Chen")]);
    const b = shortNames([kid("id-1", "Mia Chen"), kid("id-2", "Mia Chen")]);
    expect(a.get("id-1")).toBe("Mia (1)");
    expect(b.get("id-1")).toBe("Mia (1)");
    const c = distinctFullNames([kid("id-2", "Mia Chen"), kid("id-1", "Mia Chen")]);
    expect(c.get("id-1")).toBe("Mia Chen (1)");
  });

  it("tells a kid with no surname from one with", () => {
    const names = shortNames([kid("a", "Mia"), kid("b", "Mia Chen")]);
    expect(names.get("a")).toBe("Mia");
    expect(names.get("b")).toBe("Mia C");
  });

  it("ignores case when it looks for a clash", () => {
    const names = shortNames([kid("a", "ava smith"), kid("b", "Ava Jones")]);
    expect(names.get("a")).toBe("ava s");
    expect(names.get("b")).toBe("Ava J");
  });
});

describe("distinctFullNames", () => {
  it("adds the jersey number, else a count, to the same full name", () => {
    const names = distinctFullNames([
      kid("a", "Ava Smith", 3),
      kid("b", "Ava Smith", 12),
      kid("c", "Jack Smith"),
      kid("d", "jack smith"),
      kid("e", "Ben"),
    ]);
    expect(names.get("a")).toBe("Ava Smith #3");
    expect(names.get("b")).toBe("Ava Smith #12");
    expect(names.get("c")).toBe("Jack Smith (1)");
    expect(names.get("d")).toBe("jack smith (2)");
    expect(names.get("e")).toBe("Ben");
  });
});
