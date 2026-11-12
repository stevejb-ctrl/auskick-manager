import { describe, expect, it } from "vitest";
import { formationRows } from "@/lib/live/formationRows";
import { defaultAflPositions, layoutAflPositions } from "@/lib/sports/afl/playbook";
import { unionCatalogue } from "@/lib/sports/rugby_union/playbook";
import type { PositionDef } from "@/lib/playbook/types";

const labels = (positions: PositionDef[]) =>
  formationRows(positions).map((l) => ({ line: l.line, rows: l.rows.map((r) => r.map((p) => p.label)) }));

describe("formationRows — AFL default formations", () => {
  it("18: three lines of two rows of three, sided left to right", () => {
    expect(labels(defaultAflPositions(18))).toEqual([
      { line: "fwd", rows: [["LFP", "FF", "RFP"], ["LHF", "CHF", "RHF"]] },
      { line: "mid", rows: [["LW", "C", "RW"], ["R", "RR", "ROV"]] },
      { line: "back", rows: [["LHB", "CHB", "RHB"], ["LBP", "FB", "RBP"]] },
    ]);
  });

  it("16: the centre line is two pairs", () => {
    expect(labels(defaultAflPositions(16))).toEqual([
      { line: "fwd", rows: [["LFP", "FF", "RFP"], ["LHF", "CHF", "RHF"]] },
      { line: "mid", rows: [["C", "R"], ["RR", "ROV"]] },
      { line: "back", rows: [["LHB", "CHB", "RHB"], ["LBP", "FB", "RBP"]] },
    ]);
  });

  it("15: a lone flank and wing keep their plain labels", () => {
    expect(labels(defaultAflPositions(15))).toEqual([
      { line: "fwd", rows: [["LFP", "FF", "RFP"], ["HFF", "CHF"]] },
      { line: "mid", rows: [["W", "C"], ["R", "RR", "ROV"]] },
      { line: "back", rows: [["CHB", "HBF"], ["LBP", "FB", "RBP"]] },
    ]);
  });

  it("12: the short row sits nearest the centre", () => {
    expect(labels(defaultAflPositions(12))).toEqual([
      { line: "fwd", rows: [["LFP", "FF", "RFP"], ["CHF"]] },
      { line: "mid", rows: [["W", "C"], ["R", "RR"]] },
      { line: "back", rows: [["CHB"], ["LBP", "FB", "RBP"]] },
    ]);
  });

  it("every position comes out exactly once", () => {
    for (const size of [12, 15, 16, 18]) {
      const all = defaultAflPositions(size);
      const out = formationRows(all).flatMap((l) => l.rows.flat());
      expect(out.map((p) => p.key).sort()).toEqual(all.map((p) => p.key).sort());
    }
  });

  it("a coach's own list, laid out on the oval, reads the same way", () => {
    const own = layoutAflPositions([
      { key: "a", label: "KF", name: "Key forward", line: "fwd" },
      { key: "b", label: "SF", name: "Small forward", line: "fwd" },
      { key: "c", label: "MID", name: "Mid", line: "mid" },
      { key: "d", label: "KB", name: "Key back", line: "back" },
    ]);
    expect(labels(own)).toEqual([
      { line: "fwd", rows: [["KF", "SF"]] },
      { line: "mid", rows: [["MID"]] },
      { line: "back", rows: [["KB"]] },
    ]);
  });
});

describe("formationRows — rugby union", () => {
  it("15: front, second and back rows; halves, centres and wings, fullback", () => {
    expect(labels(unionCatalogue(15))).toEqual([
      { line: "forwards", rows: [["LHP1", "HK2", "THP3"], ["2R4", "2R5"], ["BF6", "N8", "OF7"]] },
      { line: "backs", rows: [["HB9", "FE10"], ["LW11", "IC12", "OC13", "RW14"], ["FB15"]] },
    ]);
  });

  it("12: one centre between the wings", () => {
    expect(labels(unionCatalogue(12))).toEqual([
      { line: "forwards", rows: [["LHP1", "HK2", "THP3"], ["2R4", "2R5"], ["N8"]] },
      { line: "backs", rows: [["HB9", "FE10"], ["LW11", "C12", "RW14"], ["FB15"]] },
    ]);
  });
});

describe("formationRows — order", () => {
  const spot = (label: string, line: string, x: number, y: number) => ({ label, line, x, y });

  it("draws lines top first, whatever order they come in", () => {
    const out = formationRows([spot("B", "back", 0.5, 0.9), spot("F", "fwd", 0.5, 0.1)]);
    expect(out.map((l) => l.line)).toEqual(["fwd", "back"]);
  });

  it("orders a row left to right, ties in list order", () => {
    const out = formationRows([spot("R", "l", 0.9, 0.5), spot("L", "l", 0.1, 0.5), spot("M1", "l", 0.5, 0.5), spot("M2", "l", 0.5, 0.52)]);
    expect(out[0].rows.map((r) => r.map((p) => p.label))).toEqual([["L", "M1", "M2", "R"]]);
  });

  it("keeps two lone spots far apart as two rows", () => {
    const out = formationRows([spot("A", "l", 0.5, 0.1), spot("B", "l", 0.5, 0.4)]);
    expect(out[0].rows.map((r) => r.map((p) => p.label))).toEqual([["A"], ["B"]]);
  });

  it("returns nothing for no positions", () => {
    expect(formationRows([])).toEqual([]);
  });
});
