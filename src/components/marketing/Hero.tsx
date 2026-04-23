import Image from "next/image";
import Link from "next/link";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { PulseMark } from "@/components/brand/PulseMark";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

// Above-the-fold. Two-column on desktop, stacked on mobile. Copy on the
// left, phone mockup on the right with a subtle tilt for visual energy.
// The auth-aware "Start free / Go to dashboard" CTA lives in
// MarketingAuthCTAs so this component stays a pure server component —
// the page prerenders statically.
export function Hero() {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return (
    <section className="relative overflow-hidden border-b border-hairline">
      {/* Soft field-green wash behind the content */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50/60 via-warm to-warm"
      />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div>
          <RevealOnScroll>
            <span className="inline-flex items-center gap-2 rounded-full border border-warn/30 bg-warn-soft px-3 py-1 text-[11px] font-bold uppercase tracking-micro text-warn">
              <PulseMark size={12} pulsing />
              <span>{copy.banner}</span>
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tightest text-ink sm:text-5xl md:text-6xl">
              {copy.heroTitle[0]}
              <br />
              {copy.heroTitle[1]}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-dim sm:text-xl">
              {copy.heroSubtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <MarketingAuthCTAs variant="hero" />
              <Link
                href="/demo"
                className="inline-flex items-center justify-center rounded-md border border-hairline bg-surface px-5 py-2.5 text-base font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
              >
                Try the demo
              </Link>
            </div>

            <p className="mt-4 text-sm text-ink-mute">
              Free for the entire 2026 season. Works on any phone.
              No app to install.
            </p>
          </RevealOnScroll>
        </div>

        <RevealOnScroll delay={120}>
          <div className="relative">
            {/* Accent blobs behind the phone */}
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
                src="/marketing/screenshots/live-game.png"
                alt={`${copy.productName} live game view`}
                fill
                sizes="(max-width: 1024px) 300px, 280px"
                priority
                className="object-cover"
              />
            </PhoneFrame>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
