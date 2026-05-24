import Image from "next/image";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { FieldOval } from "@/components/marketing/FieldOval";
import { CourtMotif } from "@/components/marketing/CourtMotif";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { TitleAccent } from "@/components/marketing/TitleAccent";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { AppStoreBadge } from "@/components/marketing/AppStoreBadge";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

// Above-the-fold. Two-column on desktop, copy-only on mobile (the phone
// mock returns later in the features section). The auth-aware CTA pair
// lives in MarketingAuthCTAs (client island) so this tree stays static.
export function Hero() {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return (
    <section className="relative overflow-hidden border-b border-hairline">
      {/* Decorative court / oval motif behind the hero on desktop
          only — quiet target/oval cue on AFL, court rectangle on
          netball, ultra-low opacity in both cases. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden items-center lg:flex"
        style={{ transform: "translate(15%, 0)" }}
      >
        {brand.id === "netball" ? (
          <CourtMotif size={900} className="opacity-[0.07]" />
        ) : (
          <FieldOval size={900} className="opacity-[0.07]" />
        )}
      </div>

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:py-28">
        <div>
          <RevealOnScroll>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-micro text-ink-dim">
              {copy.heroEyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-[1.02] tracking-tightest text-ink [text-wrap:balance] sm:text-5xl md:text-6xl lg:text-7xl">
              <TitleAccent parts={copy.heroTitle} />
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-dim sm:text-xl">
              {copy.heroSubtitle}
            </p>

            {/* Binary CTA row: install the iOS app OR use the web app.
                App Store leads (the newer of the two paths); web sign-in
                is the equal-weight alternative. The "Try the demo" path
                stays reachable via the marketing header nav. iOS app is
                footy-only in v1 (see mobile/capacitor.config.ts) so the
                badge only renders on the AFL brand for now. */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {brand.id === "afl" && <AppStoreBadge theme="light" />}
              <MarketingAuthCTAs variant="hero" />
            </div>

            <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              {copy.heroTrust}
            </p>
          </RevealOnScroll>
        </div>

        {/* Desktop-only phone mock — mobile drops the hero phone entirely
            and reintroduces it in the sticky features section below, so
            the above-the-fold mobile view stays compact. */}
        <div className="hidden lg:block">
          <RevealOnScroll delay={120}>
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute -left-8 top-10 h-48 w-48 rounded-full bg-brand-200/50 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="absolute -right-4 bottom-6 h-40 w-40 rounded-full bg-warn-soft/70 blur-3xl"
              />
              <PhoneFrame tilt={2} className="relative">
                <Image
                  src={
                    brand.id === "netball"
                      ? "/marketing/screenshots/netball/live-game.png"
                      : "/marketing/screenshots/live-game.png"
                  }
                  alt={`${copy.productName} live game view`}
                  fill
                  sizes="280px"
                  priority
                  className="object-cover"
                />
              </PhoneFrame>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}
