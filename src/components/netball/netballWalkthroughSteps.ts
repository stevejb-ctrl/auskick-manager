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
      body: "Tap Start Q1 on the bar at the bottom, then Start Q1 now when the umpire calls play. The clock counts down and ends the quarter at zero. Tap it to pause for a stoppage, then again to go on.",
    },
    {
      emoji: "🏐",
      title: "Court & bench",
      body: "The court runs top to bottom: attack third (GS, GA), centre third (WA, C, WD), defence third (GD, GK). Anyone not on the court is on the bench underneath.",
    },
    {
      emoji: "🔁",
      title: "Subs happen at the break",
      body: "Netball subs happen at the break, so bench kids say On at the break (unless your team allows subs mid-quarter). At each break Siren suggests a fair lineup for the next quarter from minutes, positions and who played together. Tap two kids to swap them, or a bench kid then an empty bib to fill it.",
    },
    {
      emoji: "👆",
      title: "Tap a kid for their bar",
      body: "Tapping a kid opens their bar at the bottom, with their minutes this game. GS and GA get + Goal. Then Injured, or More to Lend them to the other team or 🔒 Keep them at this position next break. Tap × to put them down.",
    },
    {
      emoji: "🏥",
      title: "Mid-quarter injuries & loans",
      body: "If a kid is hurt or lent during a quarter, Siren asks who comes on at their bib (or go without). Tap an empty bib any time to fill it later.",
    },
    {
      emoji: "↩️",
      title: "Bringing someone back",
      body: "Injured and lent kids sit on the bench marked INJ or LENT. Tap them to Mark recovered or Bring back; they stay on the bench until you put them on.",
    },
    {
      emoji: "⋯",
      title: "The ⋯ menu",
      body: "Late arrivals, scores and fixes, this tour and the game-day link (so another parent can run the clock) are under ⋯ at the top. Fill-ins who aren't in the squad are added on the game page before the game.",
    },
  ];

  if (opts.trackScoring) {
    steps.push({
      emoji: "🥅",
      title: "Recording scores",
      body: "Only GS and GA can score. Tap + Goal on the bar and pick the shooter, or tap GS or GA first. For the other team, tap their +G. Undo under the score takes back the latest; tap the score to fix any of them, quarter by quarter.",
    });
  }

  steps.push({
    emoji: "🏁",
    title: "Ending a quarter & the post-game summary",
    body: "When the clock hits zero the break shows the suggested lineup for the next quarter. After Q4, check the full-time review and tap Finish game. The summary shows minutes per kid, time in each third, top scorers, and Copy for group chat to paste into the team thread.",
  });

  return steps;
}
