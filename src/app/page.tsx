import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

const FEATURES = [
  {
    id: "live",
    eyebrow: "Live game",
    title: "Run the game from your phone.",
    body: "Set the lineup, track quarter time, and make substitutions — all from the sideline.",
    bullets: [
      "Drag players between zones in seconds",
      "Clock counts down each quarter automatically",
      "Share a read-only link with parents",
    ],
    image: "/marketing/screenshots/live-game.png",
    imageAlt: "Live game field view",
  },
  {
    id: "rotations",
    eyebrow: "Fair rotations",
    title: "Every player gets a fair run.",
    body: "The rotation engine tracks minutes in each zone and nudges you toward balanced playing time.",
    bullets: [
      "Per-zone minute bars at a glance",
      "Colour-coded fairness indicators",
      "Season totals across all games",
    ],
    image: "/marketing/screenshots/rotations.png",
    imageAlt: "Player rotation view",
  },
  {
    id: "scoring",
    eyebrow: "Score tracking",
    title: "Keep the scoreboard honest.",
    body: "Log goals and behinds for both sides as they happen. No clipboard required.",
    bullets: [
      "One tap for a goal, one tap for a behind",
      "Opponent score tracked alongside yours",
      "Goal song plays on every score",
    ],
    image: "/marketing/screenshots/scoring.png",
    imageAlt: "Scoring view",
  },
  {
    id: "stats",
    eyebrow: "Season stats",
    title: "See how the season is going.",
    body: "After every game, zone-minute stats update automatically so you can spot patterns over time.",
    bullets: [
      "Minutes equity across the whole squad",
      "Per-player zone breakdowns",
      "Works across any number of games",
    ],
    image: "/marketing/screenshots/stats.png",
    imageAlt: "Stats dashboard",
  },
  {
    id: "availability",
    eyebrow: "Availability",
    title: "Know who's coming before you arrive.",
    body: "Share a link with parents so they can mark availability the night before. No group chat chaos.",
    bullets: [
      "Parents mark via a shareable link — no app install needed",
      "Availability list is ready when you arrive",
      "Late arrivals can be added on the day",
    ],
    image: "/marketing/screenshots/availability.png",
    imageAlt: "Availability list",
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
