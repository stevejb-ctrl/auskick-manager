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

  const steps: WalkthroughStep[] = [
    {
      emoji: "⏱️",
      title: "Starting the game",
      body: `Tap Start ${abbr}1 when the siren goes for kickoff. The clock counts down and ends the ${periodWord} automatically when it hits zero. Tap the clock pill to pause if there's a stoppage, then tap it again to resume.`,
    },
    {
      emoji: "🏉",
      title: "Field & bench",
      body: "The field splits into Forwards (top) and Backs (bottom). Anyone not on the field sits in the bench strip below. Junior rugby is positionless within each line — coaches can drag players to rebalance the forward/back ratio at any time.",
    },
    {
      emoji: "🔁",
      title: "Rolling subs",
      body: "Tap a field player to select them, then tap a bench player to swap. A confirmation appears before anything changes. The app tracks how long each player has been on and suggests fair next rotations — players due to come off get an amber ↓ badge, players ready to come on get a brand ↑ badge.",
    },
    {
      emoji: "🔔",
      title: "Sub timer alert",
      body: `When the sub interval is up, a Sub due banner appears under the top bar and the sub card opens with the suggested swaps for the whole bench. Tap "Make all swaps" to rotate everyone in one go, or pick your own. The banner never blocks scoring. The interval is configurable per team and per ${periodWord} in Game settings.`,
    },
    {
      emoji: "👇",
      title: "Long-press for player actions",
      body: "Hold a player tile for half a second to open the actions sheet. From here you can Switch (enter swap mode), Move to Forwards / Backs, Mark injured (slot stays empty for a replacement), or Lend to opposition. One gesture, same options across field and bench.",
    },
  ];

  if (opts.vests.fr || opts.vests.dh) {
    steps.push({
      emoji: "🦺",
      title: opts.vests.dh ? "FR & DH vests" : "FR vest",
      body: `${
        opts.vests.dh
          ? "First Receiver (FR) and Dummy Half (DH) wear coloured vests"
          : "First Receiver (FR) wears a coloured vest"
      } that must rotate each ${periodWord} — no player can wear the same vest twice in one game. At the start of each ${periodWord} a vest assignment card prompts you to pick the wearer; the suggester defaults to whoever's least used that vest across the season.`,
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
        ? `Tap a field player, then Try, ${pg.label} (${points.penaltyGoal}) or ${fg.label} (${points.fieldGoal}) at the bottom. After a try the conversion picker opens — pick the kicker${kickerRule ? `; ${kickerRule}` : ""}. +${pg.short} and +${fg.short} beside our score ask who kicked. For an opponent score, tap +T, +C, +${pg.short} or +${fg.short} beside their score. Undo takes back the latest score.`
        : opts.kickingAllowed
        ? `Tap a field player, then tap Try at the bottom to credit them with ${points.try} points. A conversion picker then opens — pick the kicker.${
            opts.kickRotations ? ` The app enforces the goal-kick rotation: ${rotation}.` : ""
          } For an opponent score, tap +T or +C beside their score in the header. Undo takes back the latest score.`
        : `Tap a field player, then tap Try at the bottom to credit them with ${points.try} points. For an opponent try, tap +T beside their score in the header. Undo takes back the latest score.`,
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
            body: `Each player tile shows a thin stacked bar at the bottom — green segment is time in the Forwards zone, blue is Backs, and the brand-coloured Centre segment is time wearing ${vest}. Turn this off in Game settings if you don't rotate the vest as a real position.`,
          }
        : {
            emoji: "📊",
            title: "Forward / Back time",
            body: "Each player tile shows a thin stacked bar at the bottom — green segment is time in the Forwards, blue is Backs. Turn this off in Game settings if you don't keep players to a line.",
          },
    );
  }

  if (opts.unbrokenPeriods) {
    steps.push({
      emoji: "📏",
      title: "Unbroken-period rule",
      body: `Junior League §6 requires each player to play an unbroken ${
        periodWord === "half" ? "half" : "two quarters"
      } each game — no subs during that period. The sub card never takes a player off when this is their last chance at it, and the live screen names who must stay on.`,
    });
  }

  steps.push({
    emoji: "🏁",
    title: `Ending the ${periodWord} & full time`,
    body: `When the clock hits zero the ${periodWord}-break view appears with the score and a "Start ${abbr}2" button — tap it, then confirm when the siren goes for the next ${periodWord}. After the final ${periodWord} the Full-Time review opens so you can fix any score errors before tapping Finish game, then the share card appears with a "Copy for group chat" button.`,
  });

  return steps;
}
