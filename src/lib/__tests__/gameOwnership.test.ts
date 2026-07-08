import { describe, it, expect } from "vitest";
import { gameBelongsToTeam } from "@/lib/auth/gameOwnership";

// Guards the IDOR invariant for admin-client (RLS-bypassing) game mutations:
// a destructive op is only permitted when the target game belongs to the
// team the caller was authorised against.
describe("gameBelongsToTeam — IDOR guard for admin-client game mutations", () => {
  it("allows a game that belongs to the authorised team", () => {
    expect(gameBelongsToTeam("team-a", "team-a")).toBe(true);
  });

  it("rejects a game that belongs to a different team (the IDOR case)", () => {
    expect(gameBelongsToTeam("team-a", "team-b")).toBe(false);
  });

  it("rejects a missing / null / empty game team id", () => {
    expect(gameBelongsToTeam(null, "team-a")).toBe(false);
    expect(gameBelongsToTeam(undefined, "team-a")).toBe(false);
    expect(gameBelongsToTeam("", "team-a")).toBe(false);
  });
});
