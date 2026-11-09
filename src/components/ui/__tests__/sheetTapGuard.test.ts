// The sheets' tap guard (Stagehand round 9): a sheet takes no taps
// until its own entrance has run, and the screen under a closed sheet
// ignores taps for a moment.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHEET_CLOSE_SHIELD_MS,
  SHEET_SETTLE_FALLBACK_MS,
  closeShieldUntil,
  entranceEnded,
  sheetEntrance,
} from "@/components/ui/sheetTapGuard";

describe("a sheet coming in", () => {
  it("waits for its entrance, unless there isn't one (reduced motion)", () => {
    expect(sheetEntrance(1000, true).done).toBe(false);
    expect(sheetEntrance(1000, false).done).toBe(true);
  });

  it("settles on the card's own animation end, not a row's inside it", () => {
    const open = sheetEntrance(1000, true);
    expect(entranceEnded(open, false).done).toBe(false);
    expect(entranceEnded(open, true).done).toBe(true);
    // Settled stays settled.
    expect(entranceEnded(entranceEnded(open, true), false).done).toBe(true);
  });

  it("falls back to settling after the longest entrance (SlotFillSheet's 240 ms rise)", () => {
    expect(SHEET_SETTLE_FALLBACK_MS).toBeGreaterThan(240);
    expect(SHEET_SETTLE_FALLBACK_MS).toBeLessThanOrEqual(400);
  });
});

describe("a sheet that has just closed", () => {
  it("shields the screen for a moment, and a second close extends it", () => {
    expect(closeShieldUntil(0, 5000)).toBe(5000 + SHEET_CLOSE_SHIELD_MS);
    expect(closeShieldUntil(5200, 5000, 100)).toBe(5200);
    expect(closeShieldUntil(5050, 5000, 100)).toBe(5100);
    expect(SHEET_CLOSE_SHIELD_MS).toBeGreaterThanOrEqual(250);
    expect(SHEET_CLOSE_SHIELD_MS).toBeLessThanOrEqual(350);
  });
});

describe("every sheet primitive has the guard", () => {
  // The live screen's sheets are all one of these three, in every sport:
  // the scorer picker (SlotFillSheet), PairsSheet, ScoresSheet and
  // LockModal (Modal), the game menu and clock sheet (ActionSheet).
  for (const file of ["Modal.tsx", "ActionSheet.tsx", "SlotFillSheet.tsx"]) {
    it(file, () => {
      const src = readFileSync(join(process.cwd(), "src/components/ui", file), "utf8");
      expect(src).toMatch(/useSheetTapGuard\(/);
      expect(src).toMatch(/<SheetEntranceShield on=\{entering\} \/>/);
    });
  }
});
