import { describe, expect, it } from "vitest";
import { isFullScreenTeamPath, showsTeamBottomBar, teamIdFromPath } from "@/lib/nav";

const ID = "3f1e2d4c-5b6a-4789-8abc-def012345678";

describe("team navigation routes", () => {
  it("finds the team id in team routes only", () => {
    expect(teamIdFromPath(`/teams/${ID}`)).toBe(ID);
    expect(teamIdFromPath(`/teams/${ID}/games`)).toBe(ID);
    expect(teamIdFromPath("/teams/new")).toBeNull();
    expect(teamIdFromPath("/dashboard")).toBeNull();
  });

  it("hides the tab bar on game-day, live, availability and setup screens", () => {
    expect(showsTeamBottomBar(`/teams/${ID}`)).toBe(true);
    expect(showsTeamBottomBar(`/teams/${ID}/squad`)).toBe(true);
    expect(isFullScreenTeamPath(`/teams/${ID}/games/${ID}/live`)).toBe(true);
    expect(showsTeamBottomBar(`/teams/${ID}/games/${ID}/live`)).toBe(false);
    expect(showsTeamBottomBar(`/teams/${ID}/games/${ID}/availability`)).toBe(false);
    expect(showsTeamBottomBar(`/teams/${ID}/setup`)).toBe(false);
  });
});
