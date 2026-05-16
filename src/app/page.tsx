import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { TrustBand } from "@/components/marketing/TrustBand";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FieldOval } from "@/components/marketing/FieldOval";
import { SportThemeProvider, SPORT_THEMES } from "@/components/marketing/SportTheme";

const TRUST_STATS = [
  { stat: "1,200+", label: "Coaches" },
  { stat: "38k", label: "Games tracked" },
  { stat: "4.9★", label: "Parent rating" },
  { stat: "0", label: "Clipboards" },
] as const;

const FEATURES = [
  {
    id: "rotations",
    eyebrow: "Fair rotations",
    title: "Every player gets a fair run.",
    accentWord: "fair",
    body: "The rotation engine tracks minutes in each zone across every quarter and nudges you toward balanced playing time, without you having to count.",
    bullets: [
      "Per-zone minute bars visible at a glance",
      "Colour-coded fairness indicators",
      "Season totals carry across all games",
    ],
    image: "/marketing/screenshots/rotations.png",
    imageAlt: "Live game field with suggested-swap card and zone-coloured player tiles",
  },
  {
    id: "scoring",
    eyebrow: "Score tracking",
    title: "Keep the scoreboard honest, if you want to.",
    accentWord: "honest",
    body: "Scoring is completely optional. If you do use it, log goals and behinds for both sides with one tap. A goal song can play automatically, or not. Your call.",
    bullets: [
      "Score tracking is opt-in. Skip it if you don't need it",
      "Opponent score tracked alongside yours",
      "Optional goal song. Enable it or leave it off",
    ],
    image: "/marketing/screenshots/scoring.png",
    imageAlt: "Live game with the record-score panel open showing +Goal and +Behind for the selected player",
  },
  {
    id: "availability",
    eyebrow: "Availability",
    title: "Set your squad before you leave home.",
    accentWord: "before",
    body: "Mark each player available or unavailable the night before. If the other team is running short, drop your numbers to match, and Siren rebalances rotations automatically.",
    bullets: [
      "One tap to mark a player available or unavailable",
      "Run a smaller squad to match the opposition",
      "Last-minute changes and fill-ins handled on the day",
    ],
    image: "/marketing/screenshots/availability.png",
    imageAlt: "Pre-game availability list showing available and unavailable players",
  },
  {
    id: "flexibility",
    eyebrow: "Full control",
    title: "Handle anything the game throws at you.",
    accentWord: "anything",
    body: "Long-press any player to lock them to a zone, flag an injury, or lend them to the opposition. Siren adapts mid-game without losing track of the rotation.",
    bullets: [
      "Lock a player always-on or to a specific zone",
      "Injured players skip the rotation automatically",
      "Lend a player to the opposition and track their time separately",
    ],
    image: "/marketing/screenshots/flexibility.png",
    imageAlt: "Player actions modal with switch, always-on-field, lock-to-zone, mark-injured, and lend-to-opposition options",
  },
  {
    id: "quarterly",
    eyebrow: "Quarter breaks",
    title: "Walk into every quarter with a plan.",
    accentWord: "plan",
    body: "At the break, Siren suggests a reshuffle to balance zone minutes. One tap to accept, or rearrange manually. The fairness score updates live as you adjust.",
    bullets: [
      "Suggested lineup based on zone equity",
      "One tap to accept or drag to customise",
      "Fairness score updates as you swap players",
    ],
    image: "/marketing/screenshots/quarterly.png",
    imageAlt: "Quarter break screen with zone assignments per player and per-zone time bars",
  },
  {
    id: "share",
    eyebrow: "Share with parents",
    title: "Hand scoring to any parent in one tap.",
    accentWord: "one tap",
    body: "Send the run-link to a parent on the sideline and they become the scorer for the day. No app download, no account, no setup. A magic link gets them straight in.",
    bullets: [
      "Full scoring access via a single shareable link",
      "No app download or account needed",
      "Coach stays focused on the field",
    ],
    image: "/marketing/screenshots/share.png",
    imageAlt: "Game admin page with a shareable run-link callout coaches can hand to a parent on the sideline",
  },
  {
    id: "playhq",
    eyebrow: "PlayHQ integration",
    title: "Fixtures imported automatically.",
    accentWord: "automatically",
    body: "Connect your PlayHQ club URL and Siren pulls in your draw. Rounds, opponents, and results stay in sync so you never have to enter a game twice.",
    bullets: [
      "Fixtures imported from PlayHQ automatically",
      "Round results synced after each game",
      "Works alongside manually created games",
    ],
    image: "/marketing/screenshots/fixtures.png",
    imageAlt: "Team games list with upcoming and completed fixtures",
  },
  {
    id: "stats",
    eyebrow: "Game summary",
    title: "Game's done. Stats are already in.",
    accentWord: "Stats",
    body: "Scorers, game time, zone percentages, every sub. Captured live as you play. Drop the recap into the team chat without typing a thing.",
    bullets: [
      "Scoreline, scorers, and minutes captured live",
      "Per-player zone breakdowns",
      "One tap to copy a group-chat recap",
    ],
    image: "/marketing/screenshots/stats.png",
    imageAlt: "Full-time game summary with scoreline, scorers, and per-player game time",
  },
];

export default function Home() {
  const theme = SPORT_THEMES.footy;
  return (
    <SportThemeProvider sport="footy">
      <MarketingBanner />
      <MarketingHeader />
      <main>
        <Hero
          eyebrow={theme.eyebrow}
          subhead="Three-zone rotations. Fair game time across the quarters. Late arrivals, injuries, fill-ins. Siren knows the intricacies of junior AFL that generic sub-timers miss. So you can stop juggling a clipboard and watch your kid play."
          image="/marketing/screenshots/live-game.png"
          imageAlt="Siren live game showing score, rotation suggestions, color-coded zone tiles, and bench — all on one screen"
          bgMotif={<FieldOval size={900} />}
        />
        <TrustBand stats={TRUST_STATS} />
        <ScrollingFeatures features={FEATURES} sportLabel={theme.label} />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </SportThemeProvider>
  );
}
