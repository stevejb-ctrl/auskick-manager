import Image from "next/image";
import { SHARED_FEATURES } from "@/lib/marketing/sportPages";
import { SIREN_SPORTS } from "@/lib/siren-facts";
import { MARKETING_SPORTS, type MarketingSurface } from "@/lib/sports/marketing-sports";
import type { SportId } from "@/lib/sports/types";

/** The sport as prose names it: "AFL", "football (soccer)". */
function sportName(id: SportId): string {
  return SIREN_SPORTS.find((s) => s.id === id)?.name ?? id;
}

const SURFACE_BG: Record<MarketingSurface, string> = {
  field: "bg-field",
  court: "bg-court",
  wood: "bg-wood",
};

interface SharedFeaturesProps {
  /** The heading, with one word in the accent colour. */
  heading: { before: string; accent: string; after: string };
  intro: string;
}

/**
 * The six things Siren does in every sport (the homepage), each on a
 * small piece of the ground it's shown in: the card is that sport's
 * surface, chalk words on it, and its phone rising off the bottom edge
 * as if lying on the grass, the court or the boards.
 */
export function SharedFeatures({ heading, intro }: SharedFeaturesProps) {
  return (
    <section id="features" aria-labelledby="features-heading" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2
            id="features-heading"
            className="font-display text-[clamp(2.25rem,4.6vw,3.5rem)] font-extrabold leading-[1] text-ink stretch-80 [text-wrap:balance]"
          >
            {heading.before}
            <span className="text-brand-600">{heading.accent}</span>
            {heading.after}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-dim">{intro}</p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SHARED_FEATURES.map((feature) => {
            const sport = MARKETING_SPORTS.find((s) => s.sport === feature.shownIn);
            return (
              <li
                key={feature.title}
                className={`field-band relative flex h-[27.5rem] flex-col overflow-hidden rounded-[24px] text-mark ${SURFACE_BG[sport?.surface ?? "field"]}`}
              >
                <div className="px-6 pt-6">
                  <p className="font-display text-[0.875rem] font-extrabold uppercase tracking-[0.08em] text-mark/75 stretch-72">
                    {feature.shownIn ? `Shown in ${sportName(feature.shownIn)}` : "Every sport"}
                  </p>
                  <h3 className="mt-2 font-display text-[1.75rem] font-extrabold leading-[1.02] stretch-80">{feature.title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-mark/85">{feature.body}</p>
                </div>
                {/* The phone, its top half above the card's foot. */}
                <div className="relative mx-auto mt-auto h-[15.5rem] w-[15rem] shrink-0">
                  <div className="absolute inset-x-0 top-0 aspect-[9/19.5] rounded-t-[2.4rem] bg-ink px-[6px] pt-[12px] ring-1 ring-mark/25">
                    <div className="relative h-full w-full overflow-hidden rounded-t-[1.9rem] bg-warm">
                      <Image
                        src={feature.image}
                        alt={feature.imageAlt}
                        fill
                        sizes="240px"
                        className="object-cover object-top"
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
