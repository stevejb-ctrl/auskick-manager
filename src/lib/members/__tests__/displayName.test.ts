// Team members had no name (round 2 usability, 24 Oct 2026): email
// sign-ups get profiles.full_name = '' (not null), so `full_name ?? email`
// rendered '' and the confirm read "Remove  from the team?".

import { describe, expect, it } from "vitest";
import { cleanDisplayName, hasDisplayName, memberDisplayName } from "@/lib/members/displayName";

describe("memberDisplayName", () => {
  it("uses the name when there is one", () => {
    expect(memberDisplayName({ full_name: "Sam Helper", email: "sam@example.com" })).toBe("Sam Helper");
  });

  it("falls back to the email for an empty or blank name", () => {
    expect(memberDisplayName({ full_name: "", email: "sam@example.com" })).toBe("sam@example.com");
    expect(memberDisplayName({ full_name: "   ", email: "sam@example.com" })).toBe("sam@example.com");
    expect(memberDisplayName({ full_name: null, email: "sam@example.com" })).toBe("sam@example.com");
  });

  it("never returns an empty label", () => {
    expect(memberDisplayName({ full_name: "", email: null })).toBe("A team member");
  });
});

describe("hasDisplayName", () => {
  it("treats blank as no name", () => {
    expect(hasDisplayName("")).toBe(false);
    expect(hasDisplayName("  ")).toBe(false);
    expect(hasDisplayName(null)).toBe(false);
    expect(hasDisplayName("Pat")).toBe(true);
  });
});

describe("cleanDisplayName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanDisplayName("  Pat   Parent ")).toEqual({ ok: true, name: "Pat Parent" });
  });

  it("refuses a blank or overlong name", () => {
    expect(cleanDisplayName("   ")).toEqual({ ok: false, error: "Please add your name." });
    expect(cleanDisplayName("x".repeat(61))).toEqual({ ok: false, error: "Keep your name under 60 characters." });
  });
});
