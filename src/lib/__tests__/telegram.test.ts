import { describe, expect, it } from "vitest";
import {
  formatGameStartedMessage,
  formatSignupMessage,
  formatTeamMessage,
} from "@/lib/notifications/telegram";

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

  it("omits the Provider line when no provider is supplied", () => {
    const msg = formatSignupMessage("u@x.com", "t");
    expect(msg).not.toContain("Provider");
  });

  it("includes the Provider line when supplied", () => {
    const msg = formatSignupMessage("u@x.com", "t", "google");
    expect(msg).toContain("Provider: google");
  });

  it("HTML-escapes the provider", () => {
    const msg = formatSignupMessage("u@x.com", "t", "<weird>");
    expect(msg).toContain("Provider: &lt;weird&gt;");
    expect(msg).not.toContain("Provider: <weird>");
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

  it("omits the Sport line when no sport is supplied", () => {
    const msg = formatTeamMessage("Lions", "U10", "x@x.com", "t");
    expect(msg).not.toContain("Sport");
  });

  it("includes the Sport line when supplied", () => {
    const msg = formatTeamMessage(
      "Lions",
      "U10",
      "x@x.com",
      "t",
      "Australian Rules Football",
    );
    expect(msg).toContain("Sport: Australian Rules Football");
  });

  it("HTML-escapes the sport", () => {
    const msg = formatTeamMessage("Lions", "U10", "x@x.com", "t", "<weird>");
    expect(msg).toContain("Sport: &lt;weird&gt;");
    expect(msg).not.toContain("Sport: <weird>");
  });
});

describe("formatGameStartedMessage", () => {
  const baseInput = {
    teamName: "Maroubra Saints",
    opponent: "Coogee Crows",
    sport: "afl",
    startedBy: "coach@example.com",
    time: "2026-05-23T10:30:00.000Z",
  };

  it("includes all fields", () => {
    const msg = formatGameStartedMessage(baseInput);
    expect(msg).toContain("Game started");
    expect(msg).toContain("Maroubra Saints");
    expect(msg).toContain("Coogee Crows");
    expect(msg).toContain("afl");
    expect(msg).toContain("coach@example.com");
    expect(msg).toContain("2026-05-23T10:30:00.000Z");
  });

  it("HTML-escapes the team name, opponent, sport, and starter", () => {
    const msg = formatGameStartedMessage({
      ...baseInput,
      teamName: "<Bold> & Co",
      opponent: "Rough <FC>",
      sport: "a&b",
      startedBy: "x<y>@x.com",
    });
    expect(msg).toContain("&lt;Bold&gt; &amp; Co");
    expect(msg).toContain("Rough &lt;FC&gt;");
    expect(msg).toContain("a&amp;b");
    expect(msg).toContain("x&lt;y&gt;@x.com");
    expect(msg).not.toContain("<Bold>");
    expect(msg).not.toContain("<FC>");
  });
});
