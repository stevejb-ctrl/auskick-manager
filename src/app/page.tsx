import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

const FEATURES = [
  {
    id: "rotations",
    eyebrow: "Fair rotations",
    title: "Every player gets a fair run.",
    body: "The rotation engine tracks minutes in each zone across every quarter and nudges you toward balanced playing time — without you having to count.",
    bullets: [
      "Per-zone minute bars visible at a glance",
      "Colour-coded fairness indicators",
      "Season totals carry across all games",
    ],
    image: "/marketing/screenshots/rotations.png",
    imageAlt: "Player rotation view showing zone minute bars",
  },
  {
    id: "scoring",
    eyebrow: "Score tracking",
    title: "Keep the scoreboard honest.",
    body: "Log goals and behinds for both sides as they happen. The goal song plays automatically — no clipboard, no app switching.",
    bullets: [
      "One tap for a goal, one for a behind",
      "Opponent score tracked alongside yours",
      "Goal song fires on every score",
    ],
    image: "/marketing/screenshots/scoring.png",
    imageAlt: "Score tracking with celebration chip visible",
  },
  {
    id: "availability",
    eyebrow: "Availability",
    title: "Know who's coming before you arrive.",
    body: "Share a link with parents so they can mark availability the night before. Injuries, late arrivals, and fill-ins handled on the day.",
    bullets: [
      "Parents mark via a link — no app install needed",
      "Injured and late players flagged before kick-off",
      "Fill-ins added on the spot",
    ],
    image: "/marketing/screenshots/availability.png",
    imageAlt: "Pre-game availability list with injured and fill-in players",
  },
  {
    id: "flexibility",
    eyebrow: "Full control",
    title: "Handle anything the game throws at you.",
    body: "Long-press any player to lock them to a zone, flag an injury, or lend them to the opposition. Siren adapts mid-game without losing track of the rotation.",
    bullets: [
      "Lock a player always-on or to a specific zone",
      "Injured players skip the rotation automatically",
      "Lend a player to the opposition and track their time separately",
    ],
    image: "/marketing/screenshots/flexibility.png",
    imageAlt: "Player actions sheet showing lock, injury, and lend options",
  },
  {
    id: "quarterly",
    eyebrow: "Quarter breaks",
    title: "Walk into every quarter with a plan.",
    body: "At the break, Siren suggests a reshuffle to balance zone minutes. One tap to accept, or rearrange manually — the fairness score updates live as you adjust.",
    bullets: [
      "Suggested lineup based on zone equity",
      "One tap to accept or drag to customise",
      "Fairness score updates as you swap players",
    ],
    image: "/marketing/screenshots/quarterly.png",
    imageAlt: "Quarter break screen with suggested reshuffle and fairness bars",
  },
  {
    id: "share",
    eyebrow: "Share with parents",
    title: "Hand scoring to any parent in one tap.",
    body: "Send the run-link to a parent on the sideline and they become the scorer for the day — no app download, no account, no setup. A magic link gets them straight in.",
    bullets: [
      "Full scoring access via a single shareable link",
      "No app download or account needed",
      "Coach stays focused on the field",
    ],
    image: "/marketing/screenshots/share.png",
    imageAlt: "Public run-link scoring view for parents",
  },
  {
    id: "playhq",
    eyebrow: "PlayHQ integration",
    title: "Fixtures imported automatically.",
    body: "Connect your PlayHQ club URL and Siren pulls in your draw. Rounds, opponents, and results stay in sync so you never have to enter a game twice.",
    bullets: [
      "Fixtures imported from PlayHQ automatically",
      "Round results synced after each game",
      "Works alongside manually created games",
    ],
    image: "/marketing/screenshots/fixtures.png",
    imageAlt: "Fixtures list showing PlayHQ-imported rounds",
  },
  {
    id: "stats",
    eyebrow: "Season stats",
    title: "See how the season is going.",
    body: "After every game, zone-minute stats update automatically. Spot who's been stuck on the bench and fix it before next week.",
    bullets: [
      "Minutes equity across the whole squad",
      "Per-player zone breakdowns",
      "Top goal-kicker leaderboard",
    ],
    image: "/marketing/screenshots/stats.png",
    imageAlt: "Season stats dashboard with minutes equity and goal-kicker leaderboard",
  },
];

export default function Home() {
  return (
    <>
      <MarketingBanner />
      <MarketingHeader />
      <main>
        <Hero />
        <ScrollingFeatures features={FEATURES} />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </>
  );
}
