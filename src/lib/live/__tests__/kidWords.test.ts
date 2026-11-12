import { describe, expect, it } from "vitest";
import { kidWords, outWords, type KidWordsInput } from "@/lib/live/kidWords";

const afl = (over: Partial<KidWordsInput>): KidWordsInput => ({ place: "field", rollingSubs: true, ...over });

describe("kidWords — the next sub", () => {
  it("field kid coming off: Off next, then Off now (hot) when due", () => {
    expect(kidWords(afl({ sub: { role: "off" } }))).toEqual({ text: "Off next", tone: "calm" });
    expect(kidWords(afl({ sub: { role: "off" }, subDue: true }))).toEqual({ text: "Off now", tone: "hot" });
  });

  it("bench kid going on says where: On next → LFP, then On now → LFP (hot)", () => {
    const on = { place: "bench" as const, sub: { role: "on" as const, to: "LFP" } };
    expect(kidWords(afl(on))).toEqual({ text: "On next → LFP", tone: "calm" });
    expect(kidWords(afl({ ...on, subDue: true }))).toEqual({ text: "On now → LFP", tone: "hot" });
  });

  it("a zone short works as the destination, and no destination says just On next", () => {
    expect(kidWords(afl({ place: "bench", sub: { role: "on", to: "FWD" } }))?.text).toBe("On next → FWD");
    expect(kidWords(afl({ place: "bench", sub: { role: "on" } }))?.text).toBe("On next");
  });

  it("the sub beats the minimum: a kid owed time who's going on says so", () => {
    expect(kidWords(afl({ place: "bench", sub: { role: "on", to: "CHB" }, needsMin: 6 }))?.text).toBe("On next → CHB");
  });

  it("after the period's last sub, the pairs go quiet", () => {
    expect(kidWords(afl({ sub: { role: "off" }, subsDoneThisPeriod: true }))).toBeNull();
    expect(kidWords(afl({ place: "bench", sub: { role: "on", to: "C" }, subsDoneThisPeriod: true }))).toEqual({
      text: "On after the break",
      tone: "calm",
    });
  });

  it("a sub that's due still shows, even past the period's last sub time", () => {
    expect(kidWords(afl({ sub: { role: "off" }, subDue: true, subsDoneThisPeriod: true }))).toEqual({ text: "Off now", tone: "hot" });
  });
});

describe("kidWords — the minimum", () => {
  it("a kid at risk: Needs 6′ more (sun), on the field or the bench", () => {
    expect(kidWords(afl({ needsMin: 6 }))).toEqual({ text: "Needs 6′ more", tone: "sun" });
    expect(kidWords(afl({ place: "bench", needsMin: 2 }))).toEqual({ text: "Needs 2′ more", tone: "sun" });
  });

  it("uses the prime mark for minutes", () => {
    expect(kidWords(afl({ needsMin: 6 }))?.text).toContain("′");
  });

  it("not at risk: nothing on the field", () => {
    expect(kidWords(afl({ needsMin: null }))).toBeNull();
    expect(kidWords(afl({ needsMin: 0 }))).toBeNull();
  });
});

describe("kidWords — bench kids not in the next sub", () => {
  it("rolling subs: Sub after next", () => {
    expect(kidWords(afl({ place: "bench" }))).toEqual({ text: "Sub after next", tone: "calm" });
    expect(kidWords(afl({ place: "bench", subDue: true }))).toEqual({ text: "Sub after next", tone: "calm" });
  });

  it("subs at the breaks (netball): On at the break, and pairs never show mid-period", () => {
    const netball = { rollingSubs: false };
    expect(kidWords({ place: "bench", ...netball })).toEqual({ text: "On at the break", tone: "calm" });
    expect(kidWords({ place: "bench", ...netball, sub: { role: "on", to: "GS" } })?.text).toBe("On at the break");
    expect(kidWords({ place: "field", ...netball, sub: { role: "off" } })).toBeNull();
  });

  it("subs at the breaks still say a field kid's owed time", () => {
    expect(kidWords({ place: "field", rollingSubs: false, needsMin: 4 })?.text).toBe("Needs 4′ more");
  });

  it("a field kid with nothing to say says nothing", () => {
    expect(kidWords(afl({}))).toBeNull();
  });
});

describe("kidWords — out of the rotation", () => {
  it("keeps the words the tiles use today", () => {
    expect(kidWords(afl({ place: "bench", out: { kind: "injured" } }))).toEqual({ text: "INJ", tone: "calm", spoken: "Injured" });
    expect(kidWords(afl({ place: "bench", out: { kind: "injured", wentHome: true } }))).toEqual({
      text: "HOME",
      tone: "calm",
      spoken: "Went home",
    });
    expect(kidWords(afl({ place: "bench", out: { kind: "lent" } }))).toEqual({ text: "LENT", tone: "calm", spoken: "Lent to opposition" });
  });

  it("sitting out counts down; fouled out says so", () => {
    expect(outWords({ kind: "sitOut", msLeft: 80_000 })).toEqual({ text: "SIT 1:20", tone: "calm", spoken: "Sitting out, 1:20 left" });
    expect(outWords({ kind: "fouledOut" })).toEqual({ text: "FOULED OUT", tone: "calm", spoken: "Fouled out" });
  });

  it("out beats everything: the sub, the minimum, the break", () => {
    expect(kidWords(afl({ place: "bench", out: { kind: "lent" }, sub: { role: "on", to: "FF" }, needsMin: 5, subDue: true }))?.text).toBe("LENT");
    expect(kidWords(afl({ place: "bench", out: { kind: "injured" }, inPlay: false }))?.text).toBe("INJ");
  });
});

describe("kidWords — outside play", () => {
  it("before kickoff and at the breaks only out kids get words", () => {
    expect(kidWords(afl({ place: "bench", inPlay: false }))).toBeNull();
    expect(kidWords(afl({ sub: { role: "off" }, inPlay: false }))).toBeNull();
    expect(kidWords(afl({ needsMin: 6, inPlay: false }))).toBeNull();
  });
});

describe("kidWords — the last period", () => {
  // Stagehand, 9 Nov 2026: "On after the break" late in the last half.
  it("promises no break after the last period", () => {
    expect(kidWords(afl({ place: "bench", subsDoneThisPeriod: true }))?.text).toBe("On after the break");
    expect(kidWords(afl({ place: "bench", subsDoneThisPeriod: true, lastPeriod: true }))).toBeNull();
    expect(kidWords(afl({ place: "bench", rollingSubs: false, lastPeriod: true }))).toBeNull();
    // The sub still to come in the last period says so as ever.
    expect(kidWords(afl({ place: "bench", lastPeriod: true }))?.text).toBe("Sub after next");
    expect(kidWords(afl({ place: "bench", sub: { role: "on", to: "FWD" }, lastPeriod: true }))?.text).toBe("On next → FWD");
  });
});
