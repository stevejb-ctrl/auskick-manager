import Image from "next/image";
import { AppStoreBadge } from "@/components/marketing/AppStoreBadge";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { SportChips } from "@/components/marketing/SportChips";
import { HOME_CONTENT } from "@/lib/marketing/homeContent";
import { getMarketingSport, type MarketingSportId } from "@/lib/sports/marketing-sports";

/** The fan's phones, back left, back right, then front (netball, the
 *  most-played sport, in front). */
const FAN: ReadonlyArray<{ sport: MarketingSportId; place: "left" | "right" | "front" }> = [
  { sport: "afl", place: "left" },
  { sport: "football", place: "right" },
  { sport: "netball", place: "front" },
];

const PLACE = {
  left: "left-0 top-[46px] w-[214px] -rotate-[7deg]",
  right: "right-0 top-[46px] w-[214px] rotate-[7deg]",
  front: "left-1/2 top-0 w-[244px] -translate-x-1/2",
} as const;

const LABEL = {
  left: "left-5",
  right: "right-5",
  front: "left-1/2 -translate-x-1/2",
} as const;

/**
 * The homepage hero. One pitch for every sport, server-rendered and
 * still (it used to rotate through the sports every 4.5 s, which at ten
 * sports was a 45-second loop that showed most visitors someone else's
 * sport). Three phones in a fan show three sports at once; the "I coach"
 * chips under it go straight to each sport's page.
 *
 * The CTA row is the same either/or as before: the App Store, or the
 * web app. The demo lives in the header.
 */
export function HomeHero() {
  return (
    <section className="overflow-hidden border-b border-hairline">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-16 lg:pb-14 lg:pt-20">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="font-mono text-micro font-semibold uppercase tracking-[0.16em] text-brand-700">
              {HOME_CONTENT.hero.eyebrow}
            </p>
            <h1 className="mt-4 text-[clamp(2.75rem,6vw,4.75rem)] font-bold leading-[1.0] tracking-tightest text-ink [text-wrap:balance]">
              {HOME_CONTENT.hero.headline}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-dim sm:text-xl">
              {HOME_CONTENT.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <AppStoreBadge theme="light" />
              <MarketingAuthCTAs variant="hero" />
            </div>
          </div>

          <div className="hidden lg:flex lg:justify-center" aria-hidden="true">
            <div className="relative h-[560px] w-[470px]">
              {FAN.map(({ sport: id, place }) => {
                const sport = getMarketingSport(id);
                const front = place === "front";
                return (
                  <div
                    key={id}
                    className={`absolute rounded-[36px] bg-ink p-2 ${front ? "z-10 shadow-pop" : "shadow-card"} ${PLACE[place]}`}
                  >
                    <div className="relative aspect-[390/844] overflow-hidden rounded-[29px] bg-warm">
                      <Image
                        src={sport.liveScreenshot}
                        alt=""
                        fill
                        sizes="244px"
                        priority={front}
                        className="object-cover object-top"
                      />
                    </div>
                    {/* The front phone covers the back ones' middles, so
                        their labels sit at their outer edges. */}
                    <span className={`absolute -bottom-3.5 ${LABEL[place]} whitespace-nowrap rounded-full border border-hairline bg-surface px-3 py-1 font-mono text-micro font-bold uppercase tracking-[0.12em] text-ink`}>
                      {sport.short}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <SportChips label="I coach" className="mt-12 border-t border-hairline pt-7 lg:mt-14" />
      </div>
    </section>
  );
}
