import { describe, expect, it } from "vitest";
import { runLinkTitle } from "@/lib/share/runLinkTitle";

describe("runLinkTitle", () => {
  it("names the game, not a sport's brand", () => {
    expect(runLinkTitle("Dandenong Dingoes", "Frankston Flyers")).toBe("Dandenong Dingoes v Frankston Flyers · Siren");
  });

  it("names the team alone with no opponent", () => {
    expect(runLinkTitle("Dandenong Dingoes", "  ")).toBe("Dandenong Dingoes · Siren");
    expect(runLinkTitle("Dandenong Dingoes", null)).toBe("Dandenong Dingoes · Siren");
  });
});
