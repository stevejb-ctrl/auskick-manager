import type { Metadata } from "next";
import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";

export const metadata: Metadata = {
  title: "Why Siren · Built for junior coaches",
  description:
    "Siren tracks where every kid has played, not just how long they've been on. Built for junior football and netball coaches who care about giving every player a crack at every part of the game.",
  alternates: { canonical: "/why-siren" },
  openGraph: {
    title: "Why Siren. Every kid. Every position. Every quarter.",
    description:
      "The sideline tool built for junior football and netball. Fair rotations across every position, without the clipboard.",
    type: "website",
  },
};

export default function WhySirenPage() {
  return (
    <>
      <MarketingBanner />
      <MarketingHeader />
      <main>
        {/* Page hero — short, no CTA. The whole page is the setup. */}
        <section className="relative overflow-hidden border-b border-hairline">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50/60 via-warm to-warm"
          />
          <div className="relative mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-24">
            <RevealOnScroll>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-micro text-alarm">
                Why Siren
              </p>
              <h1 className="mt-3 text-4xl font-bold leading-[1.02] tracking-tightest text-ink [text-wrap:balance] sm:text-5xl md:text-6xl">
                Built for the kid who&apos;s been{" "}
                <em className="font-serif font-normal italic">stuck</em>{" "}
                in the same spot all quarter.
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-ink-dim sm:text-xl">
                The sideline tool that tracks where every kid has played,
                not just how long they&apos;ve been on.
              </p>
            </RevealOnScroll>
          </div>
        </section>

        {/* The sideline reality — the emotional hook. */}
        <section className="border-b border-hairline bg-warm">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-20">
            <RevealOnScroll>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-micro text-alarm">
                The sideline reality
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance] sm:text-4xl md:text-5xl">
                Three minutes until the next{" "}
                <em className="font-serif font-normal italic">whistle</em>.
              </h2>
              <div className="mt-6 space-y-5 text-lg leading-relaxed text-ink-dim">
                <p>
                  You&apos;re coaching the U10s. Marcus has been pinned in
                  the same spot all quarter. Chloe just rolled in late. Your
                  shooter (or full-forward, depending which sport you&apos;re
                  reading this on) needs a spell. Jasper&apos;s dad is
                  yelling from the boundary that his son hasn&apos;t had a go
                  in the middle all game.
                </p>
                <p>
                  You&apos;ve got a whistle in one hand, a clipboard in the
                  other, and three minutes until the next break.
                </p>
                <p className="text-xl font-semibold text-ink sm:text-2xl">
                  Sound familiar?
                </p>
              </div>
            </RevealOnScroll>
          </div>
        </section>

        {/* Positions, not just minutes — the differentiator. */}
        <section className="border-b border-hairline bg-surface-alt">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
              <RevealOnScroll>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-micro text-alarm">
                  The difference
                </p>
                <h2 className="mt-3 text-3xl font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance] sm:text-4xl md:text-5xl">
                  Positions, not just{" "}
                  <em className="font-serif font-normal italic">minutes</em>.
                </h2>
                <div className="mt-6 space-y-5 text-base leading-relaxed text-ink-dim sm:text-lg">
                  <p>
                    A generic sports app can count minutes. But in junior
                    sport, fair isn&apos;t about how long a kid&apos;s been
                    on. It&apos;s about whether they&apos;ve had a crack at
                    every part of the game.
                  </p>
                  <p>
                    Siren tracks time per position area: attack, centre,
                    defence, and bench. Football coaches see forward, centre,
                    back, interchange. Netball coaches see attack third,
                    centre third, defence third, bench. When the rotation
                    suggester runs, it doesn&apos;t just look at who&apos;s
                    played the least — it looks at who&apos;s missed out on
                    where. The kid who spent the whole first quarter at
                    full-back (or stuck at goal keeper) gets their run up
                    front before the final siren.
                  </p>
                  <p className="text-ink">
                    This is how fairness in junior sport actually works.
                  </p>
                </div>
              </RevealOnScroll>

              <RevealOnScroll delay={120}>
                <PositionBarsDemo />
              </RevealOnScroll>
            </div>

            <RevealOnScroll>
              <p className="mx-auto mt-12 max-w-3xl rounded-md border border-brand-200/60 bg-brand-50/60 px-5 py-4 text-sm leading-relaxed text-ink-dim sm:text-base">
                Following your league&apos;s junior rotation policy (rotate
                every quarter, several positions, 50&ndash;75&#37; minimum
                game time) turns out to be a nice side effect. The point is
                that every kid leaves the ground feeling like they got a go.
              </p>
            </RevealOnScroll>
          </div>
        </section>

        {/* Built for our game — short reinforcement. */}
        <section className="border-b border-hairline bg-warm">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-20">
            <RevealOnScroll>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-micro text-alarm">
                Built for our game
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance] sm:text-4xl md:text-5xl">
                Not a{" "}
                <em className="font-serif font-normal italic">generic</em>{" "}
                rotation tracker.
              </h2>
              <div className="mt-6 space-y-5 text-lg leading-relaxed text-ink-dim">
                <p>
                  Junior football and netball have their own rhythms.
                  Quarters, not halves. Position areas the kids actually
                  recognise — attack/centre/back for football, three thirds
                  with seven bibs for netball. The &ldquo;everyone gets a
                  go&rdquo; ethos. Fixtures via PlayHQ. Lending a kid to the
                  opposition when numbers are uneven. Mid-quarter subs when
                  your league allows them, period-break subs when it
                  doesn&apos;t. Siren is shaped around those things, not
                  adapted from a soccer subs app.
                </p>
              </div>
            </RevealOnScroll>
          </div>
        </section>

        {/* Founder note — anchors trust to a real human before the CTA. */}
        <section className="border-b border-hairline bg-surface-alt">
          <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-20">
            <RevealOnScroll>
              <div className="rounded-lg border border-hairline bg-surface p-6 shadow-card sm:p-8">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-micro text-alarm">
                  A note from the coach who built it
                </p>
                <div className="mt-4 space-y-4 text-base leading-relaxed text-ink-dim">
                  <p>
                    I built Siren because I got sick of juggling a clipboard
                    on the sideline and couldn&apos;t find a tool built
                    properly for our game. I&apos;m a parent-coach in
                    Australia, not a SaaS company.
                  </p>
                  <p>
                    Siren is free for the entire 2026 season. No trial timer,
                    no paywall, no upsell. I&apos;m using this season to
                    learn from the coaches using it and make it better week
                    by week. Clubs who get on board now will be looked after
                    when paid options arrive.
                  </p>
                  <p className="text-ink">
                    If you want to be the coach whose kids all remember
                    getting a go, I&apos;d love your help shaping it.
                  </p>
                </div>
                <p className="mt-6 text-sm font-semibold text-ink">
                  Steve Bull
                </p>
                <p className="text-sm text-ink-mute">
                  Parent-coach &middot; Australia
                </p>
              </div>
            </RevealOnScroll>
          </div>
        </section>

        <FinalCTA />
      </main>
      <MarketingFooter />
    </>
  );
}

// Visual: four players × four position-area segments. Built from primitives so it
// stays crisp at any size and adds zero image weight to the page. Labels use
// ATK / CEN / DEF / BENCH which read naturally for both football (forward /
// centre / back / interchange) and netball (attack third / centre third /
// defence third / bench). Colours come from the existing zone-* tokens —
// they're sport-stable visual differentiators here, not sport identifiers.
function PositionBarsDemo() {
  const AREAS = [
    { id: "A", label: "ATK", colour: "bg-zone-f" },
    { id: "C", label: "CEN", colour: "bg-zone-c" },
    { id: "D", label: "DEF", colour: "bg-zone-b" },
    { id: "B", label: "BENCH", colour: "bg-ink-mute" },
  ] as const;

  // Balanced rosters — each player has roughly equal time across areas.
  // Numbers are minutes (out of 48 total per game).
  const PLAYERS = [
    { name: "Marcus", mins: [12, 13, 11, 12] },
    { name: "Chloe", mins: [11, 12, 13, 12] },
    { name: "Jasper", mins: [13, 11, 12, 12] },
    { name: "Priya", mins: [12, 12, 12, 12] },
  ];

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Time per area</h3>
        <span className="text-[11px] font-medium text-ink-mute">
          48 min game
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {PLAYERS.map((p) => {
          const total = p.mins.reduce((a, b) => a + b, 0);
          return (
            <div key={p.name}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-ink">{p.name}</span>
                <span className="text-ink-mute">{total} min</span>
              </div>
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-surface-alt"
                role="img"
                aria-label={`${p.name}: ${p.mins
                  .map((m, i) => `${AREAS[i].label} ${m} min`)
                  .join(", ")}`}
              >
                {p.mins.map((m, i) => (
                  <div
                    key={AREAS[i].id}
                    className={AREAS[i].colour}
                    style={{ width: `${(m / total) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-hairline pt-4">
        {AREAS.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-1.5 text-[11px] text-ink-dim"
          >
            <span
              className={`h-2.5 w-2.5 rounded-sm ${a.colour}`}
              aria-hidden="true"
            />
            <span className="font-medium">{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
