import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";

export const metadata: Metadata = {
  title: "Why Siren · Built for junior AFL",
  description:
    "Siren tracks where every kid has played, not just how long they've been on. Built for junior AFL coaches who care about giving every player a crack at every part of the ground.",
  openGraph: {
    title: "Why Siren. Every kid. Every zone. Every quarter.",
    description:
      "The sideline tool built for junior AFL. Fair rotations across forward, centre and back, without the clipboard.",
    type: "website",
  },
};

export default function WhySirenPage() {
  return (
    <>
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
              <span className="inline-flex items-center rounded-full border border-warn/30 bg-warn-soft px-3 py-1 text-[11px] font-bold uppercase tracking-micro text-warn">
                Why Siren
              </span>
              <h1 className="mt-5 text-4xl font-bold tracking-tightest text-ink sm:text-5xl md:text-6xl">
                Built for the kid who&apos;s been at full-back all quarter.
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
              <span className="text-[11px] font-bold uppercase tracking-micro text-brand-700">
                The sideline reality
              </span>
              <h2 className="mt-3 text-3xl font-bold tracking-tightest text-ink sm:text-4xl">
                Three minutes until the next siren.
              </h2>
              <div className="mt-6 space-y-5 text-lg leading-relaxed text-ink-dim">
                <p>
                  You&apos;re coaching the U10s. Marcus has been in the forward
                  line all quarter. Chloe just rolled in late. Your full-forward
                  needs a spell. Jasper&apos;s dad is yelling from the boundary
                  that his son hasn&apos;t played centre all game.
                </p>
                <p>
                  You&apos;ve got a whistle in one hand, a clipboard in the
                  other, and three minutes until the next siren goes.
                </p>
                <p className="text-xl font-semibold text-ink sm:text-2xl">
                  Sound familiar?
                </p>
              </div>
            </RevealOnScroll>
          </div>
        </section>

        {/* Zones, not just minutes — the differentiator. */}
        <section className="border-b border-hairline bg-surface-alt">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
              <RevealOnScroll>
                <span className="text-[11px] font-bold uppercase tracking-micro text-brand-700">
                  The difference
                </span>
                <h2 className="mt-3 text-3xl font-bold tracking-tightest text-ink sm:text-4xl">
                  Zones, not just minutes.
                </h2>
                <div className="mt-6 space-y-5 text-base leading-relaxed text-ink-dim sm:text-lg">
                  <p>
                    A generic sports app can count minutes. But in junior AFL,
                    fair isn&apos;t about how long a kid&apos;s been on the
                    field. It&apos;s about whether they&apos;ve had a
                    crack at every part of the ground.
                  </p>
                  <p>
                    Siren tracks time per zone: forward, centre, back, and
                    interchange. When you rotate, it doesn&apos;t just look at
                    who&apos;s played the least. It looks at who&apos;s
                    missed out on where. The kid who spent the whole first
                    quarter at full-back gets their run up forward before the
                    final siren.
                  </p>
                  <p className="text-ink">
                    This is how fairness in junior AFL actually works.
                  </p>
                </div>
              </RevealOnScroll>

              <RevealOnScroll delay={120}>
                <ZoneBarsDemo />
              </RevealOnScroll>
            </div>

            <RevealOnScroll>
              <p className="mx-auto mt-12 max-w-3xl rounded-md border border-brand-200/60 bg-brand-50/60 px-5 py-4 text-sm leading-relaxed text-ink-dim sm:text-base">
                Following the AFL junior rotation policy (rotate every
                quarter, several positions, 50&ndash;75&#37; minimum game
                time) turns out to be a nice side effect. The point is
                that every kid leaves the ground feeling like they got a go.
              </p>
            </RevealOnScroll>
          </div>
        </section>

        {/* Built for our game — short reinforcement. */}
        <section className="border-b border-hairline bg-warm">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-20">
            <RevealOnScroll>
              <span className="text-[11px] font-bold uppercase tracking-micro text-brand-700">
                Built for our game
              </span>
              <h2 className="mt-3 text-3xl font-bold tracking-tightest text-ink sm:text-4xl">
                Not a generic rotation tracker.
              </h2>
              <div className="mt-6 space-y-5 text-lg leading-relaxed text-ink-dim">
                <p>
                  Junior AFL has its own rhythms. Quarters, not halves. Five
                  zones, not three lines. The &ldquo;everyone gets a go&rdquo;
                  ethos. Fixtures via PlayHQ. Lending a kid to the opposition
                  when numbers are uneven. Siren is shaped around those things,
                  not adapted from a soccer subs app.
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
                <span className="text-[11px] font-bold uppercase tracking-micro text-brand-700">
                  A note from the coach who built it
                </span>
                <div className="mt-4 space-y-4 text-base leading-relaxed text-ink-dim">
                  <p>
                    I built Siren because I got sick of juggling a clipboard on
                    the sideline and couldn&apos;t find a tool built properly
                    for our game. I&apos;m a parent-coach in Australia, not a
                    SaaS company.
                  </p>
                  <p>
                    Siren is free for the entire 2026 season. No trial timer,
                    no paywall, no upsell. I&apos;m using this season to learn
                    from the coaches using it and make it better week by week.
                    Clubs who get on board now will be looked after when paid
                    options arrive.
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

// Visual: four players × four zone segments. Built from primitives so it
// stays crisp at any size and adds zero image weight to the page.
// Uses the same zone-colour tokens (`zone-f`, `zone-c`, `zone-b`) the live
// app uses, so the visual matches what a coach will see post-signup.
function ZoneBarsDemo() {
  const ZONES = [
    { id: "F", label: "FWD", colour: "bg-zone-f" },
    { id: "C", label: "CTR", colour: "bg-zone-c" },
    { id: "B", label: "BCK", colour: "bg-zone-b" },
    { id: "I", label: "INT", colour: "bg-ink-mute" },
  ] as const;

  // Balanced rosters — each player has roughly equal time across zones.
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
        <h3 className="text-sm font-semibold text-ink">Time per zone</h3>
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
                  .map((m, i) => `${ZONES[i].label} ${m} min`)
                  .join(", ")}`}
              >
                {p.mins.map((m, i) => (
                  <div
                    key={ZONES[i].id}
                    className={ZONES[i].colour}
                    style={{ width: `${(m / total) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-hairline pt-4">
        {ZONES.map((z) => (
          <div
            key={z.id}
            className="flex items-center gap-1.5 text-[11px] text-ink-dim"
          >
            <span
              className={`h-2.5 w-2.5 rounded-sm ${z.colour}`}
              aria-hidden="true"
            />
            <span className="font-medium">{z.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
