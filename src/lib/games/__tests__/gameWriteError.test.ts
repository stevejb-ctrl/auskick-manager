// A coach never reads a constraint's name (UX round 3, 24 Oct 2026): a
// futsal team set to 3 on court got 'new row for relation "games"
// violates check constraint "games_on_field_size_check"' when making a
// game, and nothing else.

import { describe, expect, it } from "vitest";
import { gameWriteError } from "@/lib/games/gameWriteError";

const refused = {
  code: "23514",
  message: 'new row for relation "games" violates check constraint "games_on_field_size_check"',
};

describe("gameWriteError", () => {
  it("says what's wrong with the number on the field, in the sport's words", () => {
    const text = gameWriteError(refused, { size: 3, onSurface: "on court" });
    expect(text).toBe("Siren can't save a game with 3 on court. Pick another number in Game settings, or in Team › Season.");
    expect(text).not.toMatch(/constraint|relation|games_/);
  });

  it("never passes on another constraint's name", () => {
    const text = gameWriteError({ code: "23514", message: 'violates check constraint "games_sub_interval_check"' });
    expect(text).toBe("Siren couldn't save that game: one of its settings is out of range.");
  });

  it("passes on anything else as it is (a dropped connection, say)", () => {
    expect(gameWriteError({ message: "Failed to fetch" })).toBe("Failed to fetch");
  });
});
