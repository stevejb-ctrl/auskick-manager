import Image from "next/image";
import { SHARED_FEATURES } from "@/lib/marketing/sportPages";
import { SIREN_SPORTS } from "@/lib/siren-facts";
import { MARKETING_SPORTS } from "@/lib/sports/marketing-sports";
import type { SportId } from "@/lib/sports/types";

/** The sport as prose names it: "AFL", "football (soccer)". */
function sportName(id: SportId): string {
  return SIREN_SPORTS.find((s) => s.id === id)?.name ?? id;
}

interface SharedFeaturesProps {
  /** Small caps over the heading. */
  eyebrow: string;
  /** The heading, with one word in the accent colour. */
  heading: { before: string; accent: string; after: string };
  intro: string;
  /** The accent word's colour: Siren green, or a sport page's own. */
  accent?: string;
}

/**
 * The six things Siren does in every sport, as a grid of cards, each
 * over a screenshot from a different sport and labelled with it. The
 * homepage's features section, and the tour on sport pages that have
 * no feature copy of their own.
 */
export function SharedFeatures({ eyebrow, heading, intro, accent }: SharedFeaturesProps) {
  return (
    <section id="features" className="border-y border-hairline bg-surface py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-dim">
            {eyebrow}
          </p>
          <h2 className="mt-3 text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance]">
            {heading.before}
            <span className={accent ? undefined : "text-brand-600"} style={accent ? { color: accent } : undefined}>
              {heading.accent}
            </span>
            {heading.after}
          </h2>
          <p className="mt-4 text-lg text-ink-dim">{intro}</p>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-4 sm:mt-14 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SHARED_FEATURES.map((feature) => {
            const sport = MARKETING_SPORTS.find((s) => s.sport === feature.shownIn);
            return (
              <li
                key={feature.title}
                className="flex flex-row items-center gap-4 overflow-hidden rounded-2xl border border-hairline bg-warm p-3 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0"
              >
                <div className="h-[150px] w-[92px] shrink-0 overflow-hidden rounded-xl bg-surface-alt sm:h-[280px] sm:w-auto sm:rounded-none sm:px-8 sm:pt-6">
                  <div className="relative h-full w-full overflow-hidden sm:rounded-t-[18px] sm:border sm:border-b-0 sm:border-hairline">
                    <Image
                      src={feature.image}
                      alt={feature.imageAlt}
                      fill
                      sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 92px"
                      className="object-cover"
                      style={{ objectPosition: feature.focus }}
                    />
                  </div>
                </div>
                <div className="min-w-0 sm:px-6 sm:pb-7 sm:pt-5">
                  <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-dim sm:text-[11px]">
                    <span
                      aria-hidden="true"
                      className="h-[7px] w-[7px] rounded-full bg-ink"
                      style={sport ? { backgroundColor: sport.accent } : undefined}
                    />
                    {feature.shownIn ? `Shown in ${sportName(feature.shownIn)}` : "Every sport"}
                  </p>
                  <h3 className="mt-2 text-lg font-bold tracking-tight text-ink sm:text-xl">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-dim sm:text-[15px]">{feature.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
