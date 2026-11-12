// ─── Rugby walkthrough steps (league and union) ──────────────
// First-time onboarding for the rugby live shell. Mirrors
// AFL's `buildWalkthroughSteps` (src/components/live/WalkthroughModal.tsx)
// and netball's `buildNetballWalkthroughSteps` but the body copy is
// RL-specific:
//   - Two on-field zones (Forwards / Backs) — no native centre zone.
//   - FR (First Receiver) and DH (Dummy Half) vests must rotate
//     each period; same player can't wear a given vest twice.
//   - Scoring in the sport's own points and words (league: try
//     4, conversion 2; union: try 5, drop goals). League U6/U7
//     default to no scoring.
//   - Goal-kick rotation — every on-field player attempts a
//     conversion before any player gets a second.
//   - Unbroken-period rule (Junior League §6) — opt-in per team /
//     game; when on, the rotation planner avoids breaking a
//     player's unbroken run.
//   - U6–U9 plays four quarters; U10–U12 plays two halves. The
//     "period" copy below stays sport-neutral so a single set of
//     strings covers both shapes.
//
// Returned shape matches `WalkthroughModal`'s `Step` type so the
// modal renders sport-agnostically — text content lives here.

import { getSportConfig, type RugbySport } from "@/lib/sports/registry";
import { rugbyPoints, rugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import { centreVest } from "@/lib/sports/rugby/zoneTime";

export interface WalkthroughStep {
  emoji: string;
  title: string;
  body: string;
}

export function buildLeagueWalkthroughSteps(opts: {
  /** The team's rugby sport: its points and goal names. */
  sport: RugbySport;
  trackScoring: boolean;
  /** "quarter" or "half" — drives the start/end-period copy so the
   *  modal reads "Start Q1" at U6–U9 and "Start H1" at U10+. */
  periodLabel: "quarter" | "half" | "period";
  /** The age group's vests: none at U6–U7, FR only at U8, FR and DH from U9. */
  vests: { fr: boolean; dh: boolean };
  /** Whether the age group attempts conversions (kicking turns on at U8+). */
  kickingAllowed: boolean;
  /** Whether this team has track_zone_time on. When false, the F/C/B
   *  bar isn't visible so the walkthrough skips that step. */
  trackZoneTime: boolean;
  // The age group's law knobs; an omitted one is off.
  /** Penalty and field goals score (AgeGroupConfig.goalsFromPlay; league U13+). */
  goalsFromPlay?: boolean;
  /** The goal-kick and kickoff rotations apply (AgeGroupConfig.kickRotations; league U6–U12). */
  kickRotations?: boolean;
  /** The §6 unbroken-period law applies (AgeGroupConfig.unbrokenPeriods; league U6–U12). Always enforced. */
  unbrokenPeriods?: boolean;
}): WalkthroughStep[] {
  const abbr = opts.periodLabel.charAt(0).toUpperCase();
  const periodWord = opts.periodLabel === "half" ? "half" : "quarter";
  // The sport's own start cue ("whistle goes"), never AFL's siren.
  const { startCue } = getSportConfig(opts.sport).words;
  const vested = opts.vests.fr || opts.vests.dh;

  const steps: WalkthroughStep[] = [
    {
      emoji: "⏱️",
      title: "Starting the game",
      body: `Tap Start ${abbr}1 on the bar at the bottom, then Start ${abbr}1 now when the ${startCue} for kickoff. The clock counts down and ends the ${periodWord} at zero. Tap it to pause for a stoppage, then again to go on.`,
    },
    {
      emoji: "🏉",
      title: "Field & bench",
      body: "The field splits into Forwards (top) and Backs (bottom), each with a count beside it. Anyone not on the field is on the bench underneath. To move a kid between the lines, tap them, then the kid they swap with.",
    },
    {
      emoji: "🔁",
      title: "Rolling subs",
      body: "The app tracks everyone's minutes and plans fair subs. The Next sub line under the score counts down and says how many swaps; tap it to see the pairs. The kids in it say Off next or On next → FWD, with the same number on both kids of a pair. To swap just one, tap a kid, then another: it happens straight away, with Undo for a few seconds.",
    },
    {
      emoji: "🔔",
      title: "Sub due",
      body: "When it's time, the clock turns orange, the kids say Off now and On now, and the bar shows Make all swaps. Tap it to rotate everyone in one go, or Pairs to check or change them first. You can still score. Set the interval in Game settings, under ⋯.",
    },
    {
      emoji: "👇",
      title: "Tap a kid for their bar",
      // Only the actions the rugby sheet has: no keep-on, no line move.
      body: `Tapping a kid opens their bar at the bottom, with their minutes this game: score for them, Injured, or More to Switch${
        vested ? ", Replace the vest wearer" : ""
      } or Lend to the other team. Tap × to put them down.`,
    },
  ];

  if (vested) {
    steps.push({
      emoji: "🦺",
      title: opts.vests.dh ? "FR & DH vests" : "FR vest",
      body: `${
        opts.vests.dh
          ? "First Receiver (FR) and Dummy Half (DH) wear coloured vests"
          : "First Receiver (FR) wears a coloured vest"
      } that must rotate each ${periodWord} — no player can wear the same vest twice in one game. The wearer has a small flag on their tile. Each ${periodWord} the app picks whoever's worn it least this season; if the wearer comes off, it asks who takes the vest.`,
    });
  }

  if (opts.trackScoring) {
    // Each law writes its own part: goals from play the goal buttons,
    // the kick rotations the rotation sentence.
    const rotation = "every on-field player must attempt a conversion before anyone gets a second";
    const points = rugbyPoints(opts.sport);
    const words = rugbyScoreWords(opts.sport);
    const pg = words.penaltyGoal;
    const fg = words.fieldGoal;
    // "No rotation at this age" only where younger ages had one (league
    // U13+); union never rotates kickers.
    const kickerRule = opts.kickRotations
      ? `the app enforces the goal-kick rotation: ${rotation}`
      : getSportConfig(opts.sport).ageGroups.some((a) => a.kickRotations)
        ? "there's no kicking rotation at this age"
        : "";
    steps.push({
      emoji: "🏆",
      title: opts.goalsFromPlay ? "Recording tries & goals" : "Recording tries & conversions",
      body: opts.goalsFromPlay
        ? `Tap a kid, then Try, ${pg.label} (${points.penaltyGoal}) or ${fg.label} (${points.fieldGoal}) in their bar. After a try the conversion sheet opens — pick the kicker${kickerRule ? `; ${kickerRule}` : ""}. +${pg.short} and +${fg.short} on the bar ask who kicked. For the other team, tap their +T, +C, +${pg.short} or +${fg.short}. Undo under the score takes back the latest; tap the score to fix any of them.`
        : opts.kickingAllowed
        ? `Tap + Try on the bar and pick who scored (or tap a kid first) to credit them with ${points.try} points. The conversion sheet then opens — pick the kicker, or Skip.${
            opts.kickRotations ? ` The app enforces the goal-kick rotation: ${rotation}.` : ""
          } For the other team, tap their +T or +C. Undo under the score takes back the latest; tap the score to fix any of them.`
        : `Tap + Try on the bar and pick who scored (or tap a kid first) to credit them with ${points.try} points. For the other team, tap their +T. Undo under the score takes back the latest; tap the score to fix any of them.`,
    });
  }

  if (opts.trackZoneTime) {
    // The Centre segment is vest time, so it only shows where vests are
    // worn (league U8+); union has no vests.
    const vest = centreVest(opts.vests);
    steps.push(
      vest
        ? {
            emoji: "📊",
            title: "Forward / Centre / Back time",
            body: `Tap a kid to see their time split in their bar: green is time in the Forwards, blue the Backs, and the brand-coloured Centre is time wearing ${vest}. Turn this off in Game settings if you don't rotate the vest as a real position.`,
          }
        : {
            emoji: "📊",
            title: "Forward / Back time",
            body: "Tap a kid to see their time split in their bar: green is time in the Forwards, blue the Backs. Turn this off in Game settings if you don't keep players to a line.",
          },
    );
  }

  if (opts.unbrokenPeriods) {
    steps.push({
      emoji: "📏",
      title: "Unbroken-period rule",
      body: `Junior League §6 requires each player to play an unbroken ${
        periodWord === "half" ? "half" : "two quarters"
      } each game — no coming off during it. The planned sub never takes a kid off when this is their last chance at it, and a note at the top names who must stay on.`,
    });
  }

  steps.push({
    emoji: "🏁",
    title: `Ending the ${periodWord} & full time`,
    body: `When the clock hits zero the break shows the score and the next lineup. Tap Start ${abbr}2, then Start ${abbr}2 now when the ${startCue} for the next ${periodWord}. After the final ${periodWord} the full-time review lets you fix any score before Finish game, then the share card has Copy for group chat.`,
  });

  return steps;
}
