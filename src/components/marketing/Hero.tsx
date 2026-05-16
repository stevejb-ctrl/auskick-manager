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
  /** Decorative SVG motif rendered as a faint background flourish on
   *  desktop (e.g. <FieldOval /> for footy). Phone-only viewports skip
   *  this — the hero stack stays focused on copy. */
  bgMotif?: ReactNode;
}

// Above-the-fold. Stacked-copy on mobile (no phone — it competes with
// the sticky phone in the features section directly below). On desktop
// the phone returns to the right column with the sport's field motif
// behind it as a faint background flourish.
//
// Headline treatment follows the Field Sunday spec: line 1 in ink, line
// 2 in ink-dim, both Geist 700 with display tracking and tight leading
// so the lockup reads as one display unit.
export function Hero({ eyebrow, subhead, image, imageAlt, screen, bgMotif }: HeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-hairline">
      {/* Sport-themed background flourish — desktop only. Sits to the
          right of the copy column, very low opacity so it's a motif
          rather than competing with the headline. */}
      {bgMotif && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-12%] top-1/2 hidden -translate-y-1/2 opacity-[0.07] lg:block"
        >
          {bgMotif}
        </div>
      )}

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

        {/* Phone column — desktop only. Mobile skips the phone entirely
            so the hero copy lands quickly and the user scrolls into the
            features section's sticky phone (the dominant mobile beat)
            without a redundant phone above it. */}
        <RevealOnScroll delay={120} className="hidden lg:block">
          <div className="relative">
            <PhoneFrame tilt={2} className="relative">
              {screen ?? (image ? (
                <Image
                  src={image}
                  alt={imageAlt ?? ""}
                  fill
                  sizes="280px"
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
