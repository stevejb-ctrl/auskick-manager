import { describe, expect, it } from "vitest";
import { defaultTrackScoring } from "@/lib/sports";

// The setup wizard tells the coach "Default for {age}: on/off" and
// createTeam must store exactly that, for every sport (UX plan C4).
describe("defaultTrackScoring", () => {
  it("follows the age-group default for AFL", () => {
    expect(defaultTrackScoring("afl", "U8")).toBe(false);
    expect(defaultTrackScoring("afl", "U9")).toBe(false);
    expect(defaultTrackScoring("afl", "U10")).toBe(false);
    expect(defaultTrackScoring("afl", "U11")).toBe(true);
    expect(defaultTrackScoring("afl", "U14")).toBe(true);
  });

  it("follows the age-group default for netball", () => {
    expect(defaultTrackScoring("netball", "set")).toBe(false);
    expect(defaultTrackScoring("netball", "go")).toBe(true);
    expect(defaultTrackScoring("netball", "open")).toBe(true);
  });

  it("follows the age-group default for rugby league", () => {
    expect(defaultTrackScoring("rugby_league", "U6")).toBe(false);
    expect(defaultTrackScoring("rugby_league", "U8")).toBe(true);
  });

  it("is off for an unknown age group", () => {
    expect(defaultTrackScoring("afl", "U99")).toBe(false);
  });
});
