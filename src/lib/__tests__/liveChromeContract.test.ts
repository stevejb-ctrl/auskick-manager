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

import { existsSync, readFileSync } from "node:fs";
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
  | "swapUndo"
  | "settingsInRow"
  | "optimisticWrites"
  | "pauseFromEvents"
  | "summaryAtTop"
  | "scoresSheet";

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
  // The one Undo (useOneUndo, the shared chrome's undoStrip): the strip
  // names what it takes back, flashing when it's just been recorded, and
  // the swap toast has no Undo of its own (Stagehand round 9).
  undoFlash: (s) =>
    (/useOneUndo\(/.test(s) || /\.undoStrip\(/.test(s)) &&
    !/<UndoStrip\b/.test(s) &&
    blocks(s, "SwapDoneToast").every((b) => !/onUndo=/.test(b)),
  // A sub made by hand happens at once and the strip's Undo puts it back (live
  // v3, Steve 8 Nov 2026): no screen mounts the old "Manually sub…?"
  // confirm itself. The shared chrome's overlays still render, for the
  // one hand sub that asks first (touch's boys' cap).
  swapUndo: (s) =>
    /manualSwap\(/.test(s) &&
    !/<SwapConfirmDialog\b/.test(s) &&
    !/confirmSwap/.test(s) &&
    (!/useLiveChrome\(/.test(s) || /\.overlays\}/.test(s)),
  // Game settings (the sub interval) is a standard slot of the ⋯ game
  // menu (live v3; the utility row it sat in is gone).
  settingsInRow: (s) => blocks(s, "LiveGameMenu").some((b) => /settings=\{/.test(b)),
  // Score, undo and swap show at once: the AFL store, or optimistic
  // events over the replay — never a wait on the server first. League
  // reads the AFL store for its plan pin only, so the store alone
  // doesn't count where a screen waits on a save before refreshing.
  optimisticWrites: (s) =>
    (/useLiveGame\(/.test(s) && !/await flushed/.test(s)) || /useOptimisticEvents\(/.test(s),
  // A pause is a clock_pause event, so a reload or a second phone keeps
  // it (round 2, 24 Oct 2026): the period's pause comes from the events
  // (AFL's from the replay's mark), never from the page's own state.
  pauseFromEvents: (s) =>
    (/useEventPeriodPause\(/.test(s) || /initialState\.clockPause/.test(s)) &&
    !/useState<PeriodPause>/.test(s) &&
    !/usePeriodPause\(/.test(s),
  // The summary after Finish opens at the top (round 2).
  summaryAtTop: (s) => /useScrollToTopOnFinish\(/.test(s),
  // One Scores and fixes sheet (live/ScoresSheet) for whoever runs the
  // game: the shared chrome's, or AFL's and netball's own with their
  // Q-by-Q table (live v3, Steve 8 Nov 2026). The ⋯ menu and the score
  // header open it.
  scoresSheet: (s) =>
    blocks(s, "LiveGameMenu").length > 0 &&
    blocks(s, "LiveGameMenu").every((b) => /onScores=\{/.test(b)) &&
    // (Before kickoff a shell screen has nothing to fix: rugby passes
    // "onScores={!preKickoff ? chrome.openScores : undefined}".)
    (/<ScoresSheet\b/.test(s) || /onScores=\{[^}]*chrome\.openScores/.test(s)),
};

/**
 * Pieces a sport doesn't have the surface for (a reason each), and
 * pieces still owed (the follow-up named). Keyed by screen file.
 */
const NOT_APPLICABLE: Record<string, Partial<Record<Piece, string>>> = {
  "src/components/netball/NetballLiveGame.tsx": {
    swapUndo: "positions change at the breaks; mid-quarter Switch has its own flow",
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

/**
 * The old live chrome, gone with live v3 (Phase 12, Nov 2026): the sub
 * card, the due banner, the utility row, the sticky score bar and its
 * goal dock, and the zone-time legend the live screens no longer show.
 */
const RETIRED = [
  "NextSubCard",
  "SubDue",
  "SubDueBanner",
  "LiveAdminUtilityRow",
  "LiveStickyScoreBar",
  "ScoreRecordingDock",
  "ZoneTimePercents",
] as const;

describe("the live v3 shell", () => {
  // Every sport's game in play is the same screen (live v3, Steve 8 Nov
  // 2026): the shell, its top bar, the ⋯ menu, a score bug on the shared
  // frame split into a header and a bar, the one info line and the kid
  // bar. Only the field and the scoring buttons are the sport's own.
  for (const path of Array.from(new Set(Object.values(LIVE_SCREEN)))) {
    it(`${path} is on the shell`, () => {
      const source = src(path);
      for (const tag of ["LiveShell", "LiveTopBar", "LiveGameMenu", "InfoLine", "KidBar"]) {
        expect(source, `${path} renders <${tag}>`).toMatch(new RegExp(`<${tag}\\b`));
      }
      // The score bug's header (score and clock) and bar (the buttons).
      const bugs = new Set<string>();
      for (const part of ["header", "bar"]) {
        const at = source.indexOf(`part="${part}"`);
        expect(at, `${path} has a part="${part}" score bug`).toBeGreaterThan(-1);
        const tag = /<([A-Z]\w*)\b[^<]*$/.exec(source.slice(0, at))?.[1];
        expect(tag, `${path} part="${part}"`).toBeDefined();
        bugs.add(tag!);
      }
      expect(bugs.size, `${path}: header and bar are one score bug`).toBe(1);
      const [bug] = Array.from(bugs);
      // …drawn on the shared ScoreBugFrame, in the screen or its own file.
      const from = new RegExp(`import \\{[^}]*\\b${bug}\\b[^}]*\\} from "([^"]+)"`).exec(source)?.[1];
      const bugSource = from
        ? src(`${from.replace(/^@\//, "src/").replace(/^\.\//, `${path.slice(0, path.lastIndexOf("/") + 1)}`)}.tsx`)
        : source;
      expect(bugSource, `${bug} draws on ScoreBugFrame`).toMatch(/<ScoreBugFrame\b/);
    });

    it(`${path} imports none of the retired chrome`, () => {
      const source = src(path);
      for (const name of [...RETIRED, "ZoneTimeLegend"]) {
        expect(source, `${path} imports ${name}`).not.toMatch(new RegExp(`from "[^"]*/${name}"`));
      }
    });
  }

  it("the retired chrome stays deleted", () => {
    for (const name of RETIRED) {
      expect(existsSync(join(process.cwd(), `src/components/live/${name}.tsx`)), name).toBe(false);
    }
  });
});

describe("hand subs", () => {
  it("the shared chrome asks first only when a sub breaks a rule", () => {
    expect(src("src/components/live/useLiveChrome.tsx")).toMatch(
      /manualSwap: \(swap\) => \(swap\.ruleWarning \? setPendingSwap\(swap\) : makeSwap\(swap\)\)/,
    );
  });

  it("every screen's kid-for-kid hand sub carries an Undo", () => {
    for (const path of Array.from(new Set(Object.values(LIVE_SCREEN)))) {
      const source = src(path);
      if (!/chrome\.manualSwap\(/.test(source)) continue;
      // Each manualSwap that takes a kid off (offId isn't null) says how to put it back.
      const calls = source.split("chrome.manualSwap(").slice(1).map((c) => c.slice(0, c.indexOf("});") + 3));
      for (const c of calls.filter((c) => !/offId: null/.test(c))) expect(c, path).toMatch(/undo: /);
    }
  });
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

  it("the ⋯ menu hides late arrivals once the game is finished", () => {
    expect(src("src/components/live/LiveGameMenu.tsx")).toMatch(/if \(!finished && lateCandidates\.length > 0 && onLateArrival\)/);
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
    // Netball's too (10 Nov 2026): it was the older AFL-shaped review.
    "src/components/netball/NetballFullTimeReview.tsx": "NetballFullTimeReview",
  };

  for (const [path, name] of Object.entries(reviews)) {
    it(`${name} adjusts the score on the shared editor`, () => {
      const source = src(path);
      expect(source).toMatch(/<BreakScoreEditor\b/);
      expect(source).not.toMatch(/Score adjustments/);
      expect(source).not.toMatch(/<ScoreReviewPanel\b/);
    });
  }

  // Netball's full time wears the v3 header, as touch's and basketball's.
  it("netball's full time and finished game use the v3 score header", () => {
    const source = src("src/components/netball/NetballLiveGame.tsx");
    for (const label of ['quarterLabel="FT"']) {
      const bugs = source.split("<NetballScoreBug").slice(1).filter((s) => s.slice(0, 400).includes(label));
      expect(bugs.length).toBeGreaterThan(0);
      for (const b of bugs) expect(b.slice(0, 400)).toMatch(/part="header"/);
    }
  });

  // Finish game survives a dropped request: the review stays up, says
  // "Couldn't save — try again", and a retry can't finalise twice (round
  // 2, 24 Oct 2026: netball threw "Failed to fetch" into the boundary).
  it("every sport's Finish goes through the shared, retry-safe useFinishGame", () => {
    for (const path of ["src/components/live/FullTimeReview.tsx", ...Object.keys(reviews)]) {
      const source = src(path);
      expect(source, path).toMatch(/useFinishGame\(/);
      expect(source, path).not.toMatch(/await finalise\w*Game\(/);
    }
  });

  it("no one arrives late at a game that's over (the review, not just once it's finished)", () => {
    // Netball's full time is a page of its own, with no late-arrival menu on it.
    const withMenu = Object.keys(reviews).filter((p) => !p.includes("/netball/"));
    for (const path of withMenu.map((p) => p.replace(/(FullTime|FullTimeReview)\.tsx$/, "LiveGame.tsx"))) {
      const source = src(path);
      const at = source.indexOf("const lateArrivalCandidates");
      expect(at, path).toBeGreaterThan(-1);
      expect(source.slice(at, at + 300), path).toMatch(/if \(isFinished\) return \[\]/);
    }
  });
});
