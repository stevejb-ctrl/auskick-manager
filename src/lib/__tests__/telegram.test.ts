import { describe, expect, it } from "vitest";
import { formatSignupMessage, formatTeamMessage } from "@/lib/notifications/telegram";

describe("formatSignupMessage", () => {
  it("includes the email and timestamp", () => {
    const msg = formatSignupMessage("user@example.com", "2024-01-01T00:00:00.000Z");
    expect(msg).toContain("user@example.com");
    expect(msg).toContain("2024-01-01T00:00:00.000Z");
    expect(msg).toContain("New Siren Footy signup");
  });

  it("HTML-escapes special characters in the email", () => {
    const msg = formatSignupMessage("a&b<c>d@example.com", "2024-01-01T00:00:00.000Z");
    expect(msg).toContain("a&amp;b&lt;c&gt;d@example.com");
    expect(msg).not.toContain("a&b");
  });
});

describe("formatTeamMessage", () => {
  it("includes all fields", () => {
    const msg = formatTeamMessage("Fitzroy Lions", "U10", "coach@example.com", "2024-06-15T10:30:00.000Z");
    expect(msg).toContain("Fitzroy Lions");
    expect(msg).toContain("U10");
    expect(msg).toContain("coach@example.com");
    expect(msg).toContain("2024-06-15T10:30:00.000Z");
    expect(msg).toContain("New team created");
  });

  it("HTML-escapes the team name", () => {
    const msg = formatTeamMessage("<Bold> & Co", "U12", "x@x.com", "t");
    expect(msg).toContain("&lt;Bold&gt; &amp; Co");
    expect(msg).not.toContain("<Bold>");
  });
});
