import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";

interface HeroProps {
  /** Eyebrow text shown above the headline. Sport-specific. */
  eyebrow: string;
  /** Sub-headline body copy. Sport-specific. */
  subhead: string;
  /** Phone-mock screenshot path (under /public). Ignored when `screen`
   *  is provided. */
  image?: string;
  imageAlt?: string;
  /** Custom phone-mock contents (e.g. a PhonePlaceholder). Takes
   *  precedence over `image` when both are set — used by sport landings
   *  where real screenshots aren't ready yet. */
  screen?: ReactNode;
}

// Above-the-fold. Two-column on desktop, stacked on mobile. Copy on the
// left, phone mockup on the right with a subtle tilt for visual energy.
// The auth-aware "Start free / Go to dashboard" CTA lives in
// MarketingAuthCTAs so this component stays a pure server component —
// the page prerenders statically.
//
// Headline treatment follows the Field Sunday spec: line 1 in ink, line
// 2 in ink-dim, both Geist 700 with display tracking and tight leading
// so the lockup reads as one display unit.
export function Hero({ eyebrow, subhead, image, imageAlt, screen }: HeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-hairline">
      {/* Soft accent wash behind the content — picks up the per-sport
          accent so the hero band carries the sport's identity even on
          its own (above the phone mockup). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent-soft/60 via-warm to-warm"
      />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div>
          <RevealOnScroll>
            <span className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
              />
              {eyebrow}
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-display leading-[0.98] text-ink text-balance sm:text-5xl md:text-6xl">
              Run game day.
              <br />
              <span className="text-ink-dim">Keep your head up.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-dim sm:text-xl">
              {subhead}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <MarketingAuthCTAs variant="hero" />
              <Link
                href="/demo"
                className="inline-flex items-center justify-center rounded-md border border-hairline bg-surface px-5 py-2.5 text-base font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
              >
                Try the demo →
              </Link>
            </div>

            <p className="mt-5 font-mono text-[11px] uppercase tracking-banner text-ink-mute">
              Free 2026 season · Works on any phone · No app to install
            </p>
          </RevealOnScroll>
        </div>

        <RevealOnScroll delay={120}>
          <div className="relative">
            {/* Accent blobs behind the phone — both blobs now pull from
                the per-sport accent so adjacent sports get distinct
                visual halos, not a hardcoded green wash. */}
            <div
              aria-hidden="true"
              className="absolute -left-8 top-10 h-48 w-48 rounded-full bg-accent-soft/70 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="absolute -right-4 bottom-6 h-40 w-40 rounded-full bg-warn-soft/70 blur-3xl"
            />
            <PhoneFrame tilt={2} className="relative">
              {screen ?? (image ? (
                <Image
                  src={image}
                  alt={imageAlt ?? ""}
                  fill
                  sizes="(max-width: 1024px) 300px, 280px"
                  priority
                  className="object-cover"
                />
              ) : null)}
            </PhoneFrame>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
