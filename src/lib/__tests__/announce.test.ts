// What the live region says (UX round 3, e4: the toasts were live
// regions mounted with their text, so screen readers skipped them; the
// swap toast read "Archie right arrow Paddy").

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announce, joinSaid, setAnnouncer, swapSaid } from "@/lib/a11y/announce";

describe("swapSaid", () => {
  it("says a sub in words", () => {
    expect(swapSaid("Leo → Ava")).toBe("Leo off, Ava on");
    expect(swapSaid("Ava ⇄ Leo")).toBe("Ava and Leo swapped");
    expect(swapSaid("Ava on")).toBe("Ava on");
  });
});

describe("joinSaid", () => {
  it("ends each part as a sentence", () => {
    expect(joinSaid(["Roos goal — Mia", "Roos 7, Hawks 3"])).toBe("Roos goal — Mia. Roos 7, Hawks 3.");
    expect(joinSaid(["Half-time. 2nd half lineup.", " "])).toBe("Half-time. 2nd half lineup.");
  });
});

describe("announce", () => {
  const said: string[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    said.length = 0;
    setAnnouncer((t) => said.push(t));
  });
  afterEach(() => {
    setAnnouncer(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("says what's said together as one message, highest priority first", () => {
    announce("Roos 7, Hawks 3");
    announce("Roos goal — Mia", { priority: 1 });
    expect(said).toEqual([]);
    vi.advanceTimersByTime(200);
    expect(said).toEqual(["Roos goal — Mia. Roos 7, Hawks 3."]);
  });

  it("says the same words once in one moment, and again in the next", () => {
    announce("Hawks goal");
    announce("Hawks goal");
    vi.advanceTimersByTime(200);
    announce("Hawks goal");
    vi.advanceTimersByTime(200);
    expect(said).toEqual(["Hawks goal.", "Hawks goal."]);
  });

  it("says nothing for blank text", () => {
    announce("  ");
    vi.advanceTimersByTime(200);
    expect(said).toEqual([]);
  });
});
