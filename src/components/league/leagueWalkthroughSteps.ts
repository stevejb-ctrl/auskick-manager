// ─── Rugby league walkthrough steps ──────────────────────────
// First-time onboarding for the rugby league live shell. Mirrors
// AFL's `buildWalkthroughSteps` (src/components/live/WalkthroughModal.tsx)
// and netball's `buildNetballWalkthroughSteps` but the body copy is
// RL-specific:
//   - Two on-field zones (Forwards / Backs) — no native centre zone.
//   - FR (First Receiver) and DH (Dummy Half) vests must rotate
//     each period; same player can't wear a given vest twice.
//   - Scoring: try (4) + conversion (2). U6/U7 default to no
//     scoring.
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

export interface WalkthroughStep {
  emoji: string;
  title: string;
  body: string;
}

export function buildLeagueWalkthroughSteps(opts: {
  trackScoring: boolean;
  /** "quarter" or "half" — drives the start/end-period copy so the
   *  modal reads "Start Q1" at U6–U9 and "Start H1" at U10+. */
  periodLabel: "quarter" | "half" | "period";
  /** Whether the age group uses FR / DH vests at all (U6/U7 don't). */
  vestsEnabled: boolean;
  /** Whether the age group attempts conversions (kicking turns on at U8+). */
  kickingAllowed: boolean;
  /** Whether this team has track_zone_time on. When false, the F/C/B
   *  bar isn't visible so the walkthrough skips that step. */
  trackZoneTime: boolean;
  /** Whether this team / game has the §6 unbroken-period rule on. */
  enforceUnbrokenPeriods: boolean;
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
      body: "The field splits into Forwards (top) and Backs (bottom). Anyone not on the field sits in the bench strip below. Junior RL is positionless within each zone — coaches can drag players to rebalance the forward/back ratio at any time.",
    },
    {
      emoji: "🔁",
      title: "Rolling subs",
      body: "Tap a field player to select them, then tap a bench player to swap. A confirmation appears before anything changes. The app tracks how long each player has been on and suggests fair next rotations — players due to come off get an amber ↓ badge, players ready to come on get a brand ↑ badge.",
    },
    {
      emoji: "🔔",
      title: "Sub timer alert",
      body: `When the sub interval is up, a pop-up shows the suggested swaps for the whole bench. Tap "Do all swaps" to rotate everyone in one go, or dismiss and pick your own. The interval is configurable per team and per ${periodWord} in Game settings.`,
    },
    {
      emoji: "👇",
      title: "Long-press for player actions",
      body: "Hold a player tile for half a second to open the actions sheet. From here you can Switch (enter swap mode), Move to Forwards / Backs, Mark injured (slot stays empty for a replacement), or Lend to opposition. One gesture, same options across field and bench.",
    },
  ];

  if (opts.vestsEnabled) {
    steps.push({
      emoji: "🦺",
      title: "FR & DH vests",
      body: `${
        opts.kickingAllowed
          ? "First Receiver (FR) and Dummy Half (DH)"
          : "First Receiver (FR)"
      } wear coloured vests and must rotate each period — no player can wear the same vest twice in one game. At the start of each ${periodWord} a vest assignment card prompts you to pick the wearer; the suggester defaults to whoever's least used that vest across the season.`,
    });
  }

  if (opts.trackScoring) {
    steps.push({
      emoji: "🏆",
      title: "Recording tries & conversions",
      body: opts.kickingAllowed
        ? "Tap a field player, then tap Try at the bottom to credit them with 4 points. A conversion picker then opens — pick the kicker. The app enforces the goal-kick rotation: every on-field player must attempt a conversion before anyone gets a second. For an opponent score, tap +T or +C beside their score in the header. Undo chip appears for 8 seconds after every score."
        : "Tap a field player, then tap Try at the bottom to credit them with 4 points. For an opponent try, tap +T beside their score in the header. Undo chip appears for 8 seconds after every score.",
    });
  }

  if (opts.trackZoneTime) {
    steps.push({
      emoji: "📊",
      title: "Forward / Centre / Back time",
      body: "Each player tile shows a thin stacked bar at the bottom — green segment is time in the Forwards zone, blue is Backs, and the brand-coloured Centre segment is time wearing the FR or DH vest. Turn this off in Game settings if you don't rotate the vest as a real position.",
    });
  }

  if (opts.enforceUnbrokenPeriods) {
    steps.push({
      emoji: "📏",
      title: "Unbroken-period rule",
      body: `Junior League §6 requires each player to play an unbroken ${
        periodWord === "half" ? "half" : "two quarters"
      } each game — no subs during that period. The rotation planner respects this and avoids breaking a player's unbroken run. Turn it off in Team or Game settings if your league plays casually.`,
    });
  }

  steps.push({
    emoji: "🏁",
    title: `Ending the ${periodWord} & full time`,
    body: `When the clock hits zero the ${periodWord}-break view appears with the score and a "Ready for ${abbr}${
      periodWord === "half" ? 2 : 2
    }" prompt — tap it when the siren goes for kickoff of the next ${periodWord}. After the final ${periodWord} the Full-Time review opens so you can fix any score errors before tapping Finalise, then the share card appears with a "Copy for group chat" button.`,
  });

  return steps;
}
