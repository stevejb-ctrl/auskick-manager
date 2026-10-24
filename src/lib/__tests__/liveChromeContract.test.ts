// The live chrome contract (CLAUDE.md "Reuse before you fork"): every
// sport's live screen gives the coach the same shared behaviours AFL's
// does (LiveGame.tsx, the reference). The UX audit of 23 Oct 2026 found
// the newer sports had drifted on a dozen of them ("Drift from AFL");
// this test fails the moment a screen drops one again.
//
// It reads each screen's source, like soccer.test.ts's import checks.
// A piece a sport hasn't picked up yet sits in KNOWN_GAPS with the
// follow-up that owes it; the test fails when a gap closes too, so the
// list only ever shrinks.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_SPORT_IDS } from "@/lib/sports";
import type { SportId } from "@/lib/sports";

const src = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Every sport's live screen (the game in play). */
const LIVE_SCREEN: Record<SportId, string> = {
  afl: "src/components/live/LiveGame.tsx",
  netball: "src/components/netball/NetballLiveGame.tsx",
  rugby_league: "src/components/league/LeagueLiveGame.tsx",
  rugby_union: "src/components/league/LeagueLiveGame.tsx",
  soccer: "src/components/soccer/SoccerLiveGame.tsx",
  futsal: "src/components/soccer/SoccerLiveGame.tsx",
  hockey: "src/components/soccer/SoccerLiveGame.tsx",
  basketball: "src/components/basketball/BasketballLiveGame.tsx",
  touch: "src/components/touch/TouchLiveGame.tsx",
  oztag: "src/components/touch/TouchLiveGame.tsx",
};

/** Every sport's pre-game lineup picker (its long-press sheet). */
const PICKER: Record<SportId, string> = {
  afl: "src/components/live/LineupPicker.tsx",
  netball: "src/components/netball/LineupPicker.tsx",
  rugby_league: "src/components/league/LeagueLineupPicker.tsx",
  rugby_union: "src/components/league/LeagueLineupPicker.tsx",
  soccer: "src/components/soccer/SoccerLineupPicker.tsx",
  futsal: "src/components/soccer/SoccerLineupPicker.tsx",
  hockey: "src/components/soccer/SoccerLineupPicker.tsx",
  basketball: "src/components/basketball/BasketballLineupPicker.tsx",
  touch: "src/components/touch/TouchLineupPicker.tsx",
  oztag: "src/components/touch/TouchLineupPicker.tsx",
};

/** The JSX of each `<Tag …/>` in a file (to its first self-close). */
function blocks(source: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const end = source.indexOf("/>", m.index);
    out.push(source.slice(m.index, end === -1 ? undefined : end));
  }
  return out;
}

type Piece =
  | "lockModalLine"
  | "lockModalLoan"
  | "undoFlash"
  | "swapConfirm"
  | "settingsInRow"
  | "optimisticWrites";

/**
 * Each piece, as a check on a live screen's source. A screen without
 * the surface a piece speaks to (no long-press sheet) passes it.
 */
const PIECES: Record<Piece, (s: string) => boolean> = {
  // The long-press sheet knows the kid's line, so an on-field kid's
  // Switch hint reads "swap with a teammate", not "bring them on".
  lockModalLine: (s) =>
    blocks(s, "LockModal").every((b) => /currentLine=\{/.test(b) || /currentZone=\{(?!null\})/.test(b)),
  // …and the season's lent minutes, not a hard-coded 0.
  lockModalLoan: (s) => blocks(s, "LockModal").every((b) => /seasonLoanMins=\{(?!0\})/.test(b)),
  // The undo strip flashes with what was recorded ("Roos goal — Mia").
  undoFlash: (s) =>
    (/<UndoStrip\b/.test(s) || /\.undoStrip\(/.test(s)) && !/flashing=\{false\}/.test(s),
  // A tap-tap sub asks first, then toasts what changed.
  swapConfirm: (s) => /<SwapConfirmDialog\b/.test(s) || (/useLiveChrome\(/.test(s) && /\.overlays\}/.test(s)),
  // Game settings (the sub interval) is a standard slot of the row.
  settingsInRow: (s) => blocks(s, "LiveAdminUtilityRow").some((b) => /settings=\{/.test(b)),
  // Score, undo and swap show at once: the AFL store, or optimistic
  // events over the replay — never a wait on the server first. League
  // reads the AFL store for its plan pin only, so the store alone
  // doesn't count where a screen waits on a save before refreshing.
  optimisticWrites: (s) =>
    (/useLiveGame\(/.test(s) && !/await flushed/.test(s)) || /useOptimisticEvents\(/.test(s),
};

/**
 * Pieces a sport doesn't have the surface for (a reason each), and
 * pieces still owed (the follow-up named). Keyed by screen file.
 */
const NOT_APPLICABLE: Record<string, Partial<Record<Piece, string>>> = {
  "src/components/netball/NetballLiveGame.tsx": {
    swapConfirm: "positions change at the breaks; mid-quarter Switch has its own flow",
    settingsInRow: "no sub interval",
  },
};

// Empty since league and touch caught up (23 Oct 2026). A new gap needs
// a named follow-up beside it.
const KNOWN_GAPS: Record<string, Piece[]> = {};

const PICKER_GAPS: Record<string, Piece[]> = {};

describe("the live chrome contract", () => {
  it("knows every sport's live screen and picker", () => {
    for (const id of ALL_SPORT_IDS) {
      expect(LIVE_SCREEN[id], id).toBeDefined();
      expect(PICKER[id], id).toBeDefined();
    }
  });

  for (const path of Array.from(new Set(Object.values(LIVE_SCREEN)))) {
    it(`${path} has every shared piece (or a named gap)`, () => {
      const source = src(path);
      const na = NOT_APPLICABLE[path] ?? {};
      const missing = (Object.keys(PIECES) as Piece[]).filter((p) => !(p in na) && !PIECES[p](source));
      expect(missing).toEqual(KNOWN_GAPS[path] ?? []);
    });
  }

  for (const path of Array.from(new Set(Object.values(PICKER)))) {
    it(`${path}'s long-press sheet knows the kid's line and lent minutes`, () => {
      const source = src(path);
      const missing = (["lockModalLine", "lockModalLoan"] as Piece[]).filter((p) => !PIECES[p](source));
      expect(missing).toEqual(PICKER_GAPS[path] ?? []);
    });
  }
});

describe("shared sheets", () => {
  it("a picker sheet stays open on a stray tap unless it says it's safe to dismiss", () => {
    // The scorer sheet lost the goal on a backdrop tap in hockey and
    // basketball (P1): false is the default, true is opt-in.
    expect(src("src/components/ui/SlotFillSheet.tsx")).toMatch(/dismissOnBackdrop = false/);
  });

  it("no scorer sheet opts back in to dismissing on the backdrop", () => {
    for (const path of Array.from(new Set(Object.values(LIVE_SCREEN)))) {
      for (const b of blocks(src(path), "SlotFillSheet")) {
        if (/scor/i.test(b)) expect(/dismissOnBackdrop(?!=\{false\})/.test(b), path).toBe(false);
      }
    }
  });

  it("the newer sports' scorer sheets ask \"Who scored?\" and say what was scored above it", () => {
    // UX audit 23 Oct 2026: touch's read "WHO SCORED THE / Who scored the
    // try", and league's was a sheet of its own that a stray tap closed.
    const sheets = [
      "src/components/soccer/SoccerLiveGame.tsx",
      "src/components/basketball/BasketballLiveGame.tsx",
      "src/components/touch/TouchLiveGame.tsx",
      "src/components/league/LeagueScorerPicker.tsx",
    ];
    for (const path of sheets) {
      const scorers = blocks(src(path), "SlotFillSheet").filter((b) => /scored/i.test(b));
      expect(scorers.length, path).toBeGreaterThan(0);
      for (const b of scorers) {
        expect(b, path).toMatch(/title="Who scored\?"/);
        expect(b, path).toMatch(/eyebrow=/);
        expect(b, path).not.toMatch(/titleVerb=/);
      }
    }
  });

  it("the late-arrival sheet and the break's settings sheets are the safe-to-dismiss ones", () => {
    expect(blocks(src("src/components/live/LateArrivalMenu.tsx"), "SlotFillSheet").every((b) => /dismissOnBackdrop\b/.test(b))).toBe(
      true,
    );
    expect(
      blocks(src("src/components/quarter-break/BreakSettingsSheet.tsx"), "SlotFillSheet").every((b) =>
        /dismissOnBackdrop\b/.test(b),
      ),
    ).toBe(true);
  });

  it("the utility row hides late arrivals once the game is finished", () => {
    expect(src("src/components/live/LiveAdminUtilityRow.tsx")).toMatch(/showLate = candidates\.length > 0 && !finished/);
  });
});

describe("full time", () => {
  // At full time the review fixes a miscount: its buttons name their team
  // (BreakScoreEditor) and the live scorebug's chips and undo strip go,
  // as soccer's and basketball's do (UX audit 23 Oct 2026).
  const reviews = {
    "src/components/soccer/SoccerFullTime.tsx": "SoccerFullTimeReview",
    "src/components/basketball/BasketballFullTime.tsx": "BasketballFullTimeReview",
    "src/components/league/LeagueFullTimeReview.tsx": "LeagueFullTimeReview",
    "src/components/touch/TouchFullTime.tsx": "TouchFullTimeReview",
  };

  for (const [path, name] of Object.entries(reviews)) {
    it(`${name} adjusts the score on the shared editor`, () => {
      const source = src(path);
      expect(source).toMatch(/<BreakScoreEditor\b/);
      expect(source).not.toMatch(/Score adjustments/);
    });
  }

  it("no one arrives late at a game that's over (the review, not just once it's finished)", () => {
    for (const path of Object.keys(reviews).map((p) => p.replace(/(FullTime|FullTimeReview)\.tsx$/, "LiveGame.tsx"))) {
      const source = src(path);
      const at = source.indexOf("const lateArrivalCandidates");
      expect(at, path).toBeGreaterThan(-1);
      expect(source.slice(at, at + 300), path).toMatch(/if \(isFinished\) return \[\]/);
    }
  });
});
