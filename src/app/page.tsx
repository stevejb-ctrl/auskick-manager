import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PulseMark } from "@/components/brand/PulseMark";

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

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <MarketingBanner />

      {/* Sticky nav */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-warm/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Siren home">
            <SirenWordmark size="sm" />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/demo"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
            >
              Try demo
            </Link>
            <Link
              href="/help"
              className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink sm:block"
            >
              Help
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink sm:block"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="bg-warm px-4 py-20 text-center sm:px-6 md:py-28 lg:py-36">
          <div className="mx-auto max-w-4xl">
            <div className="mx-auto mb-6 flex items-center justify-center">
              <span className="text-alarm">
                <PulseMark size={48} pulsing />
              </span>
            </div>
            <h1 className="text-4xl font-bold tracking-tightest text-ink sm:text-5xl md:text-6xl lg:text-7xl">
              Run your Auskick team
              <br className="hidden sm:block" /> from the sideline.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-dim sm:text-xl">
              Lineups, rotations, scores, and stats — on the phone in your
              pocket. Free for the whole season.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {user ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-md bg-brand-600 px-6 py-3 text-base font-semibold text-warm shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-700"
                >
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center rounded-md bg-brand-600 px-6 py-3 text-base font-semibold text-warm shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-700"
                  >
                    Create your team — it&apos;s free
                  </Link>
                  <Link
                    href="/demo"
                    className="inline-flex items-center justify-center rounded-md border border-hairline bg-surface px-6 py-3 text-base font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
                  >
                    Try the demo
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        <ScrollingFeatures features={FEATURES} />
        <FinalCTA />
      </main>

      <MarketingFooter />
    </>
  );
}
