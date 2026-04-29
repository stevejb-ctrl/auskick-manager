// ─── Netball walkthrough steps ───────────────────────────────
// First-time onboarding for the netball live shell. Mirrors AFL's
// buildWalkthroughSteps in src/components/live/WalkthroughModal.tsx
// but the body copy is netball-specific:
//   - Three thirds, seven named positions (GS / GA / WA / C / WD /
//     GD / GK).
//   - Substitutions are PERIOD-BREAK-ONLY — there's no rolling sub
//     mid-play, so the AFL "tap to swap" walkthrough doesn't apply.
//   - Only GS and GA can score.
//   - Coach affordances unique to netball: lend to opposition,
//     lock-for-next-break, late arrivals, mid-quarter
//     replacement-on-injury.
//
// Returned shape matches what the existing WalkthroughModal in
// /components/live expects, so the modal renders sport-agnostically
// — it's just text content here.

export interface WalkthroughStep {
  emoji: string;
  title: string;
  body: string;
}

export function buildNetballWalkthroughSteps(opts: {
  trackScoring: boolean;
}): WalkthroughStep[] {
  const steps: WalkthroughStep[] = [
    {
      emoji: "⏱️",
      title: "Starting the game",
      body: "Tap Start Q1 to begin the first quarter. The clock counts down and ends the quarter automatically when it hits zero. Tap the clock pill to pause if there's a stoppage in play, then tap it again to resume.",
    },
    {
      emoji: "🏐",
      title: "Court & bench",
      body: "The court runs top-to-bottom: attack third (GS, GA), centre third (WA, C, WD), defence third (GD, GK). Anyone not on the court sits in the bench strip below.",
    },
    {
      emoji: "🔁",
      title: "Substitutions are period-break-only",
      body: "Netball doesn't allow rolling subs — players can only be swapped between quarters. At each break the suggester offers a fair next-quarter lineup based on minutes-played, position rotation, and friend pairs from last quarter. Tap two players to swap them, or tap a bench player and then an empty slot to fill it.",
    },
    {
      emoji: "👇",
      title: "Long-press for player actions",
      body: "Hold a player for half a second to open the actions sheet. From here you can Mark injured, Lend to opposition, or 🔒 Keep at this position next break (a soft signal the suggester respects across all subsequent quarters).",
    },
    {
      emoji: "🏥",
      title: "Mid-quarter injuries & loans",
      body: "If a player is injured or lent during a quarter, their slot empties and a picker pops to choose a bench replacement. You can also tap an empty slot at any time to fill it — useful if you cancelled the picker earlier and want to bring someone in later in the quarter.",
    },
    {
      emoji: "↩️",
      title: "Bringing a sidelined player back",
      body: "At the next Q-break, the Sidelined strip shows everyone with INJ or LENT. Long-press their tile to Mark recovered or Bring back from loan — they default to the bench so you decide if and when to bring them on.",
    },
    {
      emoji: "👋",
      title: "Late arrivals & fill-ins",
      body: "If a regular squad member shows up after the umpire's first whistle, tap + Add late arrival under the bench strip to slot them in. Fill-ins (someone who isn't on the permanent squad but joins for the day) are added on the game-detail page before kick-off.",
    },
  ];

  if (opts.trackScoring) {
    steps.push({
      emoji: "🥅",
      title: "Recording scores",
      body: "Only GS and GA can score in netball. Tap their token, confirm the goal sheet, and the score updates. For an opposition goal, tap +G beside their score in the header. An Undo chip appears for 8 seconds after every score; tap it to roll back the last goal.",
    });
  }

  steps.push({
    emoji: "🏁",
    title: "Ending a quarter & the post-game summary",
    body: "When the clock hits zero the Q-break screen appears with the suggested next-quarter lineup. After Q4 the game is marked complete and a summary card appears at full time — total minutes per player, per-third %, top scorers, and a Copy for group chat button so you can paste it into the team thread.",
  });

  return steps;
}
