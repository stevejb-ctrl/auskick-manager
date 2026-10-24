// Team home with nothing upcoming (round 2 usability, 24 Oct 2026):
// parents got "Add your first game → Add a game", which dead-ends on a
// games list they can't add to, and a coach after two games still read
// "Add your first game" above a "Get started · Add a game" card.

import { describe, expect, it } from "vitest";
import { emptyHeroCopy } from "@/lib/teamHome/emptyHero";

describe("emptyHeroCopy", () => {
  it("asks a coach with no games yet for their first", () => {
    const copy = emptyHeroCopy({ canAddGames: true, hasPlayed: false });
    expect(copy.body).toMatch(/first game/i);
    expect(copy.cta).toBe("Add a game");
  });

  it("asks a coach who has played for the next one, never the first", () => {
    const copy = emptyHeroCopy({ canAddGames: true, hasPlayed: true });
    expect(copy.body).not.toMatch(/first/i);
    expect(copy.cta).toBe("Add your next game");
  });

  it("gives a parent or manager no button, and says who adds games", () => {
    for (const hasPlayed of [false, true]) {
      const copy = emptyHeroCopy({ canAddGames: false, hasPlayed });
      expect(copy.cta).toBeNull();
      expect(copy.body).toMatch(/your coach will add/i);
      expect(copy.body).not.toMatch(/first/i);
    }
  });
});
