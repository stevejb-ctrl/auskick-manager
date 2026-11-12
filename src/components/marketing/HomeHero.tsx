import Image from "next/image";
import { AppStoreBadge } from "@/components/marketing/AppStoreBadge";
import { FieldBand } from "@/components/marketing/FieldBand";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { SportChips } from "@/components/marketing/SportChips";
import { TrustBand } from "@/components/marketing/TrustBand";
import { HOME_CONTENT } from "@/lib/marketing/homeContent";
import { sportTour } from "@/lib/marketing/sportPages";
import { getMarketingSport, sportShot, type MarketingSportId } from "@/lib/sports/marketing-sports";

/**
 * Three phones on the grass, one per surface: netball's court, AFL's
 * oval in front, basketball's boards. They stand staggered, the way
 * the live screen staggers a line of kids, not fanned like cards.
 */
const PHONES: ReadonlyArray<{ id: MarketingSportId; place: "left" | "front" | "right" }> = [
  { id: "netball", place: "left" },
  { id: "basketball", place: "right" },
  { id: "afl", place: "front" },
];

const PLACE = {
  left: "left-0 top-[72px] w-[164px] sm:w-[196px] lg:left-[-8px] lg:top-[96px] lg:w-[220px]",
  right: "right-0 top-[40px] w-[164px] sm:w-[196px] lg:right-[-8px] lg:top-[56px] lg:w-[220px]",
  front: "left-1/2 top-0 z-10 w-[204px] -translate-x-1/2 sm:w-[240px] lg:w-[272px]",
} as const;

/**
 * The homepage hero: a grass band marked out as an oval, the one pitch
 * for every sport, the App Store or the web, and three phones lying on
 * the ground. The "I coach" chips go straight to each sport's page, and
 * the facts sit along the boundary.
 */
export function HomeHero() {
  const afl = getMarketingSport("afl");
  return (
    <FieldBand surface="field" marks="afl" drawIn markOpacity={0.15} labelledBy="home-hero-heading">
      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-16 lg:pt-20">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8">
          <div>
            <h1
              id="home-hero-heading"
              className="max-w-[13ch] font-display text-[clamp(3rem,7.4vw,5.25rem)] font-extrabold leading-[0.95] tracking-[-0.01em] stretch-80 [text-wrap:balance]"
            >
              {HOME_CONTENT.hero.headline}
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-mark/85 sm:text-xl">{HOME_CONTENT.hero.subtitle}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <AppStoreBadge theme="dark" />
              <MarketingAuthCTAs variant="hero" />
            </div>
          </div>

          <div className="relative mx-auto h-[452px] w-full max-w-[380px] sm:h-[540px] sm:max-w-[460px] lg:h-[600px] lg:max-w-[500px]">
            {PHONES.map(({ id, place }) => {
              const sport = getMarketingSport(id);
              const front = place === "front";
              return (
                <div key={id} className={`absolute ${PLACE[place]}`}>
                  <PhoneFrame on="band">
                    <Image
                      src={sportShot(sport, "live")}
                      alt={front ? sportTour(afl.sport).live.alt : ""}
                      fill
                      priority={front}
                      sizes={front ? "(min-width: 1024px) 272px, (min-width: 640px) 240px, 204px" : "(min-width: 1024px) 220px, (min-width: 640px) 196px, 164px"}
                      className="object-cover object-top"
                    />
                  </PhoneFrame>
                </div>
              );
            })}
          </div>
        </div>

        <SportChips label="I coach" on="band" className="mt-10 border-t border-mark/20 pt-7 lg:mt-4" />
        <TrustBand entries={HOME_CONTENT.trustBand} className="mt-8 border-t border-mark/20" />
      </div>
    </FieldBand>
  );
}
