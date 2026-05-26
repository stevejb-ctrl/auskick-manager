"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { MarketingAuthCTAs } from "@/components/marketing/MarketingAuthCTAs";
import { AppStoreBadge } from "@/components/marketing/AppStoreBadge";
import {
  HERO_SHARED_HEADLINE,
  HERO_SHARED_SUBTITLE,
  HERO_SHARED_TRUST,
  MARKETING_SPORTS,
  type MarketingSportConfig,
} from "@/lib/sports/marketing-sports";
import {
  AflOvalField,
  LeagueRectField,
  NetballCourtField,
  RugbyUnionField,
} from "@/components/marketing/sport-fields";

/** Auto-advance interval — Claude Design pattern is "a few seconds
 *  per slide". 4500ms is long enough to read the eyebrow + glance at
 *  the phone mock, short enough that all four sports cycle inside
 *  the average above-the-fold dwell time (~20s). */
const ROTATE_INTERVAL_MS = 4500;

/** Sport-themed placeholder card shown inside PhoneFrame when a
 *  sport doesn't have a dedicated live-game screenshot yet. Mirrors
 *  Claude Design's "real <sport> screenshot lands here" mock so the
 *  carousel reads as deliberate (rather than broken) while we wait
 *  for actual captures. */
function ScreenshotPlaceholder({ sport }: { sport: MarketingSportConfig }) {
  const fieldTintOpacity = sport.fieldTintOpacity;
  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ backgroundColor: "#F2EEE4" }}
    >
      {/* Status bar mock. */}
      <div className="flex items-center justify-between px-5 pt-3 font-mono text-[10px] font-semibold text-ink-dim">
        <span>9:41</span>
        <span className="inline-block h-2.5 w-6 rounded-sm border border-ink-dim" />
      </div>
      {/* Header strip — sport code + period + "Live game" label. */}
      <div className="px-5 pt-4">
        <p
          className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute"
          style={{ color: sport.accent }}
        >
          {sport.code} · {sport.label.toUpperCase()} · ROUND 5
        </p>
        <p className="mt-1 text-lg font-bold tracking-tightest text-ink">
          Live game
        </p>
      </div>
      {/* Field decoration centered in the body so the placeholder
          screen still feels sport-specific even without an actual
          screenshot. */}
      <div className="relative flex-1 px-5">
        <div className="absolute inset-x-5 inset-y-2 opacity-60">
          <SportFieldPlaceholder sport={sport} tintOpacity={fieldTintOpacity} />
        </div>
      </div>
      {/* Tab bar mock. */}
      <div className="grid grid-cols-4 gap-1 border-t border-hairline px-3 py-2 text-center font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink-mute">
        <span style={{ color: sport.accent }}>Game</span>
        <span>Squad</span>
        <span>Season</span>
        <span>More</span>
      </div>
    </div>
  );
}

/** Same switch shape as the picker cards' FieldForSport — kept local
 *  rather than imported so the placeholder can use a different tint
 *  policy without coupling to the picker's render. */
function SportFieldPlaceholder({
  sport,
  tintOpacity,
}: {
  sport: MarketingSportConfig;
  tintOpacity: number;
}) {
  switch (sport.id) {
    case "afl":
      return <AflOvalField accent={sport.accent} tintOpacity={tintOpacity} />;
    case "league":
      return (
        <LeagueRectField accent={sport.accent} tintOpacity={tintOpacity} />
      );
    case "union":
      return (
        <RugbyUnionField accent={sport.accent} tintOpacity={tintOpacity} />
      );
    case "netball":
      return (
        <NetballCourtField accent={sport.accent} tintOpacity={tintOpacity} />
      );
  }
}

/**
 * Auto-rotating multi-sport hero. Replaces the host-resolved
 * <Hero /> on the unified `/` homepage per Claude Design's
 * carousel concept.
 *
 * Behaviour:
 *   - Cycles through the shipped sports every ~4.5s. Coming-soon
 *     sports (config flag) are filtered out — they don't show up
 *     in the rotation or in the pagination dots.
 *   - User clicks a pagination dot → jumps immediately + resets the
 *     timer (so the next auto-advance starts a fresh 4.5s from the
 *     manual pick, not whatever was left).
 *   - Pointer hover on the carousel pauses auto-rotation; leaving
 *     resumes (matches Claude Design's "let the reader linger if
 *     they're engaged").
 *   - `prefers-reduced-motion: reduce` disables auto-rotation
 *     entirely — visitors who've asked for less motion see only
 *     the slide they manually pick (default AFL on first load).
 *   - Phone mock cross-fades on rotation. Sports without a captured
 *     screenshot fall back to ScreenshotPlaceholder.
 *
 * Shared headline + subtitle don't change between sports — only the
 * eyebrow and the phone mock swap. CTAs + trust line are
 * sport-agnostic too (single platform pitch).
 */
// Sports the carousel actually rotates through. Coming-soon sports
// stay visible in the picker (as disabled "Coming soon" cards) but
// don't get a hero slot until they launch — the hero is the
// "available now" pitch.
const HERO_CAROUSEL_SPORTS = MARKETING_SPORTS.filter(
  (s) => !s.comingSoon,
);

export function HeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-advance loop. Skips when paused OR when the user prefers
  // reduced motion. Re-arms whenever activeIndex changes — which
  // means a manual click also resets the 4.5s countdown.
  useEffect(() => {
    if (paused) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      setActiveIndex((i) => (i + 1) % HERO_CAROUSEL_SPORTS.length);
    }, ROTATE_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [activeIndex, paused]);

  const handlePick = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const active = HERO_CAROUSEL_SPORTS[activeIndex];

  return (
    <section
      className="relative overflow-hidden border-b border-hairline"
      // Hover pauses rotation so the visitor can read the eyebrow +
      // phone mock without it switching out from under them. Touch
      // devices don't fire mouseenter so the timer keeps running on
      // mobile — which matches the carousel's "scan-friendly"
      // intent on phones (you're swiping the page anyway).
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Decorative motif behind the hero (desktop only) — swaps to
          the active sport's field at very low opacity so it feels
          like a watermark, not a competing visual. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden items-center lg:flex"
        style={{ transform: "translate(15%, 0)" }}
      >
        <div className="h-[900px] w-[900px] opacity-[0.07]">
          <SportFieldPlaceholder sport={active} tintOpacity={0} />
        </div>
      </div>

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:py-28">
        <div>
          <RevealOnScroll>
            {/* Eyebrow swaps per active sport. Smooth colour
                transition matches the sport-accent cascade pattern
                used by MultiSportSection's headline word. */}
            <p
              key={`eyebrow-${active.id}`}
              className="font-mono text-[11px] font-semibold uppercase tracking-micro text-ink-dim motion-safe:animate-[sirenFieldFadeIn_320ms_cubic-bezier(0.2,0.8,0.2,1)_forwards]"
            >
              {active.heroEyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-[1.02] tracking-tightest text-ink [text-wrap:balance] sm:text-5xl md:text-6xl lg:text-7xl">
              {HERO_SHARED_HEADLINE}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-dim sm:text-xl">
              {HERO_SHARED_SUBTITLE}
            </p>

            {/* Binary CTA row: iOS app OR web app. AppStoreBadge
                renders on every carousel slide — Steve 2026-05-26:
                show the App Store path on all sport variants, not
                just AFL. The iOS app itself is footy-only in v1
                (per mobile/capacitor.config.ts), but a visitor on
                a non-AFL slide tapping the badge still lands on a
                legitimate destination (the Siren listing), which
                is better than a missing affordance that makes the
                hero feel sport-gated. */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <AppStoreBadge theme="light" />
              <MarketingAuthCTAs variant="hero" />
            </div>

            <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              {HERO_SHARED_TRUST}
            </p>

            {/* Pagination dots — one per sport. Active dot fills with
                the sport accent; inactive dots stay neutral. Layout
                mirrors Claude Design's horizontal pill row. */}
            <div
              role="tablist"
              aria-label="Hero carousel — pick a sport"
              className="mt-8 flex items-center gap-2"
            >
              {HERO_CAROUSEL_SPORTS.map((sport, i) => {
                const isActive = i === activeIndex;
                return (
                  <button
                    key={sport.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Show ${sport.label} hero`}
                    data-testid={`hero-carousel-dot-${sport.id}`}
                    onClick={() => handlePick(i)}
                    className="
                      group inline-flex h-6 w-12 items-center justify-center
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2
                    "
                  >
                    <span
                      className="
                        block h-1 w-full rounded-full
                        transition-colors duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]
                        group-hover:opacity-80
                      "
                      style={{
                        backgroundColor: isActive
                          ? sport.accent
                          : "rgba(15,18,17,0.18)",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </RevealOnScroll>
        </div>

        {/* Desktop-only phone mock — mobile drops the hero phone
            entirely (and reintroduces it in the sticky features
            section below) to keep above-the-fold compact. */}
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
                {/* Per-sport screenshot, or a placeholder card if no
                    capture exists yet. Keyed by sport id so React
                    remounts the inner content on switch — clean
                    fade-in via the keyframe rather than a stale
                    intermediate state. */}
                <div
                  key={`screen-${active.id}`}
                  className="absolute inset-0 motion-safe:animate-[sirenFieldFadeIn_320ms_cubic-bezier(0.2,0.8,0.2,1)_forwards]"
                >
                  {active.heroScreenshot ? (
                    <Image
                      src={active.heroScreenshot}
                      alt={active.heroScreenshotAlt}
                      fill
                      sizes="280px"
                      priority={active.id === "afl"}
                      className="object-cover"
                    />
                  ) : (
                    <ScreenshotPlaceholder sport={active} />
                  )}
                </div>
              </PhoneFrame>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}
