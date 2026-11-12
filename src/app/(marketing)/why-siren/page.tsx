import type { Metadata } from "next";
import { BAND_ACCENT } from "@/components/marketing/bandStyles";
import { FieldBand } from "@/components/marketing/FieldBand";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { HOME_CONTENT } from "@/lib/marketing/homeContent";
import { baseOpenGraph } from "@/lib/seo";
import { MAKER, sportsSentence } from "@/lib/siren-facts";

// A function rather than a const: baseOpenGraph() reads the brand,
// and this page's openGraph would otherwise drop the shared site name
// and locale.
export function generateMetadata(): Metadata {
  return {
    title: "Why Siren · Built for junior coaches",
    description: `Siren tracks where every kid has played, not just how long they've been on, so every player gets a crack at every part of the game. For junior ${sportsSentence()}.`,
    alternates: { canonical: "/why-siren" },
    openGraph: {
      ...baseOpenGraph(),
      title: "Why Siren. Every kid. Every position. Every quarter.",
      description: `The sideline tool for junior coaches: fair rotations across every position, without the clipboard. For ${sportsSentence()}.`,
    },
  };
}

// The site's v3 look (docs/marketing/V3-SITE-DESIGN.md), as the homepage
// wears it: the hero and the sign-up on the grass in chalk, the reading
// in between on the light page. Archivo headings at 80% width, the accent
// word colour only (sun on the grass, brand green on the page).
const PAGE_HEADING =
  "font-display text-[clamp(2.25rem,4.6vw,3.5rem)] font-extrabold leading-[1] text-ink stretch-80 [text-wrap:balance]";
const PAGE_LABEL =
  "font-display text-[0.875rem] font-extrabold uppercase tracking-[0.08em] text-ink-mute stretch-72";
const PAGE_ACCENT = "text-brand-600";

/**
 * Why Siren: the long version of the pitch, for every sport. The hero is
 * short and has no action: the whole page is the setup, and the sign-up
 * at its foot is the action.
 */
export default function WhySirenPage() {
  return (
    <main>
      <FieldBand surface="field" marks="afl" drawIn markOpacity={0.15} labelledBy="why-hero-heading">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16 lg:pt-20">
          <p className="inline-block rounded-[8px] bg-mark/[0.1] px-2.5 py-1.5 font-display text-[0.875rem] font-extrabold uppercase leading-none tracking-[0.06em] text-mark stretch-72">
            Why Siren
          </p>
          <h1
            id="why-hero-heading"
            className="mt-5 max-w-[16ch] font-display text-[clamp(2.75rem,6.4vw,5rem)] font-extrabold leading-[0.96] tracking-[-0.01em] stretch-80 [text-wrap:balance]"
          >
            Built for the kid who&apos;s been <span style={{ color: BAND_ACCENT }}>stuck</span> in the same spot all quarter.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-mark/85 sm:text-xl">
            The sideline tool that tracks where every kid has played, not just how long they&apos;ve been on.
          </p>
        </div>
      </FieldBand>

      {/* The sideline reality: the hook. */}
      <section aria-labelledby="reality-heading" className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <p className={PAGE_LABEL}>The sideline reality</p>
          <h2 id="reality-heading" className={`mt-3 ${PAGE_HEADING}`}>
            Three minutes until the next <span className={PAGE_ACCENT}>whistle</span>.
          </h2>
          <div className="mt-6 space-y-5 text-lg leading-relaxed text-ink-dim">
            <p>
              You&apos;re coaching the U10s. Marcus has been pinned in the same spot all quarter. Chloe just rolled in
              late. Your shooter (or full-forward, depending which sport you&apos;re reading this on) needs a spell.
              Jasper&apos;s dad is yelling from the boundary that his son hasn&apos;t had a go in the middle all game.
            </p>
            <p>
              You&apos;ve got a whistle in one hand, a clipboard in the other, and three minutes until the next break.
            </p>
            <p className="font-display text-[1.75rem] font-extrabold leading-tight text-ink stretch-80">
              Sound familiar?
            </p>
          </div>
        </div>
      </section>

      {/* Positions, not just minutes: the difference. */}
      <section aria-labelledby="difference-heading" className="border-t border-hairline py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="min-w-0">
              <p className={PAGE_LABEL}>The difference</p>
              <h2 id="difference-heading" className={`mt-3 ${PAGE_HEADING}`}>
                Positions, not just <span className={PAGE_ACCENT}>minutes</span>.
              </h2>
              <div className="mt-6 space-y-5 text-lg leading-relaxed text-ink-dim">
                <p>
                  A generic sports app can count minutes. But in junior sport, fair isn&apos;t about how long a
                  kid&apos;s been on. It&apos;s about whether they&apos;ve had a crack at every part of the game.
                </p>
                <p>
                  Siren tracks time per position area: attack, centre, defence, and bench. Football coaches see
                  forward, centre, back, interchange. Netball coaches see attack third, centre third, defence third,
                  bench. When the rotation suggester runs, it doesn&apos;t just look at who&apos;s played the least.
                  It looks at who&apos;s missed out on where. The kid who spent the whole first quarter at full-back
                  (or stuck at goal keeper) gets their run up front before the final siren.
                </p>
                <p className="font-semibold text-ink">This is how fairness in junior sport actually works.</p>
              </div>
            </div>

            <PositionBarsDemo />
          </div>

          <p className="mt-12 max-w-3xl border-l-2 border-brand-600 pl-5 text-base leading-relaxed text-ink-dim sm:text-lg">
            Following your league&apos;s junior rotation policy (rotate every quarter, several positions,
            50&ndash;75&#37; minimum game time) turns out to be a nice side effect. The point is that every kid leaves
            the ground feeling like they got a go.
          </p>
        </div>
      </section>

      {/* Built for our game. */}
      <section aria-labelledby="game-heading" className="border-t border-hairline py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <p className={PAGE_LABEL}>Built for our game</p>
          <h2 id="game-heading" className={`mt-3 ${PAGE_HEADING}`}>
            Not a <span className={PAGE_ACCENT}>generic</span> rotation tracker.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink-dim">
            Every junior code has its own rhythms. Quarters in AFL and netball, halves in league, union and soccer.
            Position areas the kids actually recognise: back, centre and forward in AFL, three thirds with seven bibs
            in netball, forwards and backs in rugby, a keeper and three lines in soccer. The &ldquo;everyone gets a
            go&rdquo; ethos, right down to a fair turn in goal. Fixtures via PlayHQ. Lending a kid to the opposition
            when numbers are uneven. Mid-period subs when your league allows them, break subs when it doesn&apos;t.
            Siren is shaped around each code&apos;s game, not one generic subs timer with a new name on it.
          </p>
        </div>
      </section>

      {/* The note from the coach who built it, before the sign-up. */}
      <section aria-labelledby="founder-heading" className="border-t border-hairline py-16 sm:py-24">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="rounded-[18px] border border-hairline bg-surface p-6 sm:p-8">
            <h2 id="founder-heading" className={PAGE_LABEL}>
              A note from the coach who built it
            </h2>
            <div className="mt-4 space-y-4 text-base leading-relaxed text-ink-dim sm:text-lg">
              <p>
                I built Siren because I got sick of juggling a clipboard on the sideline and couldn&apos;t find a tool
                built properly for our game. I&apos;m a parent-coach in Australia, not a SaaS company.
              </p>
              <p>
                Siren is free for the entire 2026 season. No trial timer, no paywall, no upsell. I&apos;m using this
                season to learn from the coaches using it and make it better week by week. Clubs who get on board now
                will be looked after when paid options arrive.
              </p>
              <p className="text-ink">
                If you want to be the coach whose kids all remember getting a go, I&apos;d love your help shaping it.
              </p>
            </div>
            <p className="mt-6 font-display text-[1.3125rem] font-extrabold text-ink stretch-80">{MAKER.name}</p>
            <p className="text-sm text-ink-mute">
              {MAKER.role.charAt(0).toUpperCase() + MAKER.role.slice(1)} &middot; {MAKER.country}
            </p>
          </div>
        </div>
      </section>

      <FinalCTA copy={HOME_CONTENT.finalCta} showAppStoreBadge />
    </main>
  );
}

// Four players' time across the four position areas. Built from
// primitives so it stays crisp at any size and adds no image weight.
// ATK / CEN / DEF / BENCH read for football (forward / centre / back /
// interchange) and netball (attack / centre / defence thirds / bench)
// alike; the colours are the live field's zone tokens.
function PositionBarsDemo() {
  const AREAS = [
    { id: "A", label: "ATK", colour: "bg-zone-f" },
    { id: "C", label: "CEN", colour: "bg-zone-c" },
    { id: "D", label: "DEF", colour: "bg-zone-b" },
    { id: "B", label: "BENCH", colour: "bg-ink-mute" },
  ] as const;

  // Balanced: each kid has about the same time in each area, out of 48.
  const PLAYERS = [
    { name: "Marcus", mins: [12, 13, 11, 12] },
    { name: "Chloe", mins: [11, 12, 13, 12] },
    { name: "Jasper", mins: [13, 11, 12, 12] },
    { name: "Priya", mins: [12, 12, 12, 12] },
  ];

  return (
    <div className="min-w-0 rounded-[18px] border border-hairline bg-surface p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[1.3125rem] font-extrabold text-ink stretch-80">Time per area</h3>
        <span className={PAGE_LABEL}>48 min game</span>
      </div>

      <div className="mt-5 space-y-4">
        {PLAYERS.map((p) => {
          const total = p.mins.reduce((a, b) => a + b, 0);
          return (
            <div key={p.name}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-semibold text-ink">{p.name}</span>
                <span className="text-ink-mute">{total} min</span>
              </div>
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-surface-alt"
                role="img"
                aria-label={`${p.name}: ${p.mins.map((m, i) => `${AREAS[i].label} ${m} min`).join(", ")}`}
              >
                {p.mins.map((m, i) => (
                  <div key={AREAS[i].id} className={AREAS[i].colour} style={{ width: `${(m / total) * 100}%` }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-hairline pt-4">
        {AREAS.map((a) => (
          <div key={a.id} className="flex items-center gap-1.5 text-sm text-ink-dim">
            <span className={`h-2.5 w-2.5 rounded-sm ${a.colour}`} aria-hidden="true" />
            <span className="font-semibold">{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
