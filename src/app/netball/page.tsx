import type { Metadata } from "next";
import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PhonePlaceholder } from "@/components/marketing/PhonePlaceholder";
import { SportThemeProvider, SPORT_THEMES } from "@/components/marketing/SportTheme";

export const metadata: Metadata = {
  title: "Siren Netball",
  description: "Junior netball team and rotation manager — preview",
};

// Netball variant of the marketing landing. Same shell, plum accent
// instead of alarm orange. No real screenshots yet — every phone-mock
// renders the `PhonePlaceholder` (a sport-tinted header band with the
// screen name), per the Field Sunday handoff: "real screenshots will
// be dropped in later by the team."
//
// Feature copy is netball-flavoured but deliberately conservative —
// the actual product doesn't ship netball-specific logic yet, so claims
// here stay generic (rotations, fairness, share-with-parents) rather
// than promising netball positions or specific scoring rules.

const FEATURES = [
  {
    id: "rotations",
    eyebrow: "Fair rotations",
    title: "Every player gets a fair run on court.",
    body: "Siren tracks minutes across the quarters and nudges you toward balanced playing time — without you having to count on a clipboard between centre passes.",
    bullets: [
      "Per-position minute bars visible at a glance",
      "Colour-coded fairness indicators",
      "Season totals carry across all games",
    ],
    screen: <PhonePlaceholder label="Live game" />,
  },
  {
    id: "scoring",
    eyebrow: "Score tracking",
    title: "Keep the scoreboard honest — if you want to.",
    body: "Scoring is optional. Log goals for both sides with one tap, or skip it entirely — Siren stays useful either way.",
    bullets: [
      "Score tracking is opt-in — skip it if you don't need it",
      "Opponent score tracked alongside yours",
      "Goal-shooter leaderboard updates live",
    ],
    screen: <PhonePlaceholder label="Scoring" />,
  },
  {
    id: "availability",
    eyebrow: "Availability",
    title: "Set your squad before you leave home.",
    body: "Mark each player available or unavailable the night before. If you're short, drop your numbers to match — Siren rebalances the rotation automatically.",
    bullets: [
      "One tap to mark a player available or unavailable",
      "Run a smaller squad when numbers are tight",
      "Last-minute changes and fill-ins handled on the day",
    ],
    screen: <PhonePlaceholder label="Availability" />,
  },
  {
    id: "flexibility",
    eyebrow: "Full control",
    title: "Handle anything the game throws at you.",
    body: "Long-press any player to lock them to a position, flag an injury, or substitute them out. Siren adapts mid-game without losing track of the rotation.",
    bullets: [
      "Lock a player always-on or to a specific position",
      "Injured players skip the rotation automatically",
      "Quick swaps without redoing the whole lineup",
    ],
    screen: <PhonePlaceholder label="Player actions" />,
  },
  {
    id: "quarterly",
    eyebrow: "Quarter breaks",
    title: "Walk into every quarter with a plan.",
    body: "At the break, Siren suggests a reshuffle to balance court time. One tap to accept, or rearrange manually — the fairness score updates live as you adjust.",
    bullets: [
      "Suggested lineup based on minute equity",
      "One tap to accept or drag to customise",
      "Fairness score updates as you swap players",
    ],
    screen: <PhonePlaceholder label="Quarter break" />,
  },
  {
    id: "share",
    eyebrow: "Share with parents",
    title: "Hand scoring to any parent in one tap.",
    body: "Send the run-link to a parent on the sideline and they become the scorer for the day — no app download, no account, no setup. A magic link gets them straight in.",
    bullets: [
      "Full scoring access via a single shareable link",
      "No app download or account needed",
      "Coach stays focused on the court",
    ],
    screen: <PhonePlaceholder label="Run link" />,
  },
  {
    id: "stats",
    eyebrow: "Season stats",
    title: "See how the season is going.",
    body: "After every game, minute stats update automatically. Spot who's been stuck on the bench and fix it before next week.",
    bullets: [
      "Minutes equity across the whole squad",
      "Per-player position breakdowns",
      "Top goal-shooter leaderboard",
    ],
    screen: <PhonePlaceholder label="Season stats" />,
  },
];

export default function NetballHome() {
  const theme = SPORT_THEMES.netball;
  return (
    <SportThemeProvider sport="netball">
      <MarketingBanner />
      <MarketingHeader />
      <main>
        <Hero
          eyebrow={theme.eyebrow}
          subhead="Court rotations. Fair game time across the quarters. Late arrivals, injuries, fill-ins. Siren handles the chaos of junior netball so you can stop juggling a clipboard and watch your kid play."
          screen={<PhonePlaceholder label="Live game" />}
        />
        <ScrollingFeatures features={FEATURES} sportLabel={theme.label} />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </SportThemeProvider>
  );
}
