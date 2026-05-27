"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { TitleAccent } from "@/components/marketing/TitleAccent";
import type { FeatureCopy, TitleParts } from "@/lib/sports/brand-copy";

interface ScrollingFeaturesProps {
  features: FeatureCopy[];
  /** Editorial centrepiece heading. Single headline with an accent
   *  word pulled into the active sport's accent colour. */
  centerpiece: TitleParts;
  /**
   * Active sport's accent hex. Threaded down to every "the brand
   * colour" surface inside this section: centerpiece dots + accent
   * word, per-feature eyebrow numeral, accent word in each
   * feature title, bullet dots, dot-stepper active pill, mobile
   * overlay card label. Optional — when absent, components fall
   * back to the static `brand-500` token so dedicated brand sites
   * (sirenfooty.com.au etc.) still render correctly.
   */
  accent?: string;
}

const PADDED = (n: number) => n.toString().padStart(2, "0");

/**
 * Feature showcase section with the brand's editorial centrepiece on top
 * and a single sticky-phone scroll-pin pattern that adapts across breakpoints:
 *
 *   • **Desktop (lg+)** — phone sticks to the right column; copy blocks
 *     scroll past on the left, each one a viewport tall so the reader
 *     has time to register a feature before the phone crossfades.
 *
 *   • **Mobile (< lg)** — same scroll-pin idea on a single column. The
 *     phone sticks to the top of the viewport, with a dark overlay card
 *     pinned to the phone's bottom edge (showing 01/08 + eyebrow + title)
 *     and a vertical alarm progress pill on the right rim. Copy blocks
 *     scroll past underneath. One unified page scroll — no inner scroll
 *     layer.
 *
 * Both modes share an IntersectionObserver that picks the block closest
 * to the centre of the viewport and crossfades the active screenshot.
 *
 * **Important:** mobile and desktop articles each get their own ref array
 * so the observer can track whichever layout is currently rendered.
 * Sharing one ref array would let the desktop articles (which are
 * `display: none` on mobile) overwrite the mobile articles' refs, leaving
 * the observer with invisible elements that never intersect.
 */
export function ScrollingFeatures({
  features,
  centerpiece,
  accent,
}: ScrollingFeaturesProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const desktopRefs = useRef<Array<HTMLDivElement | null>>([]);
  const mobileRefs = useRef<Array<HTMLDivElement | null>>([]);

  const setDesktopRef = useMemo(
    () =>
      features.map((_, i) => (el: HTMLDivElement | null) => {
        desktopRefs.current[i] = el;
      }),
    [features],
  );

  const setMobileRef = useMemo(
    () =>
      features.map((_, i) => (el: HTMLDivElement | null) => {
        mobileRefs.current[i] = el;
      }),
    [features],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const candidates = entries
          .filter((e) => e.isIntersecting)
          .map((e) => {
            const rect = e.boundingClientRect;
            const mid = rect.top + rect.height / 2;
            const vpMid = window.innerHeight / 2;
            return {
              index: Number((e.target as HTMLElement).dataset.index),
              distance: Math.abs(mid - vpMid),
            };
          })
          .sort((a, b) => a.distance - b.distance);

        if (candidates.length > 0) {
          setActiveIndex(candidates[0].index);
        }
      },
      {
        // Centre band 20% of the viewport tall. Mobile sticky phone
        // takes the top ~50%, so the band sits roughly at the bottom
        // edge of the phone — copy blocks crossing it become "active".
        rootMargin: "-40% 0px -40% 0px",
        threshold: 0,
      },
    );

    // Observe both sets — display:none elements never report
    // intersections, so the inactive layout's articles are harmless.
    [...desktopRefs.current, ...mobileRefs.current].forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [features]);

  return (
    <section
      id="features"
      className="relative border-b border-hairline py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Centerpiece parts={centerpiece} accent={accent} />

        {/* MOBILE LAYOUT — single-column page scroll, sticky phone below
            the page header with overlay card + progress pill. */}
        <div className="mt-10 lg:hidden">
          {/* Sticky offset is `top-16` (64px) to clear the marketing
              header (sticky top-0, ~52px tall + hairline). At top-4 the
              phone slid behind the header on mobile. */}
          <div className="sticky top-16 z-10 mx-auto mb-6 flex w-full flex-col items-center">
            <PhoneFrame className="relative" size="fluid">
              {features.map((f, i) => (
                <Image
                  key={f.id}
                  src={f.image}
                  alt={f.imageAlt}
                  fill
                  sizes="(max-width: 1023px) 360px, 280px"
                  priority={i === 0}
                  className={`object-cover transition-opacity duration-500 ease-out-quart motion-reduce:transition-none ${
                    i === activeIndex ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden={i !== activeIndex}
                />
              ))}
              {/* Dark overlay card lifted high enough on the phone screen
                  to clear the rounded bottom corners on iPhone Safari. */}
              <MobileOverlayCard
                key={`overlay-${activeIndex}`}
                feature={features[activeIndex]}
                index={activeIndex}
                total={features.length}
                accent={accent}
              />
            </PhoneFrame>

            {/* Horizontal dot-stepper underneath the phone — replaces
                the right-rim vertical bar. Tap a dot to jump to that
                feature; the IO updates activeIndex automatically. */}
            <DotStepper
              activeIndex={activeIndex}
              total={features.length}
              features={features}
              accent={accent}
              onJump={(i) => {
                mobileRefs.current[i]?.scrollIntoView({
                  block: "center",
                  behavior: prefersReducedMotion() ? "auto" : "smooth",
                });
              }}
            />
          </div>

          {/* Invisible scroll spacers — one per feature. The overlay card
              on the phone carries the visible copy (eyebrow + italic title);
              full body and bullets are kept in a sr-only list below for
              screen readers. Visible copy blocks were removed because they
              overlapped the centred sticky phone column at narrow widths.
              Each spacer is 50vh — enough page-scroll for the phone to
              dwell on each feature without making the section feel endless
              (8 × 50vh ≈ 4 viewport heights total). */}
          <div className="space-y-0" aria-hidden="true">
            {features.map((f, i) => (
              <div
                key={f.id}
                data-index={i}
                ref={setMobileRef[i]}
                className="h-[50vh]"
              />
            ))}
          </div>

          {/* Screen-reader-only feature list — full body + bullets so
              assistive tech gets the same content desktop users see. */}
          <ul className="sr-only">
            {features.map((f) => (
              <li key={f.id}>
                <h3>
                  {f.title.before}
                  {f.title.italic}
                  {f.title.after}
                </h3>
                <p>{f.body}</p>
                <ul>
                  {f.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        {/* DESKTOP LAYOUT — sticky phone (right) + scrolling copy (left) */}
        <div className="mt-20 hidden lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
          {/* LEFT — scrolling feature copy */}
          <div>
            {features.map((f, i) => (
              <article
                key={f.id}
                data-index={i}
                ref={setDesktopRef[i]}
                className={`flex min-h-[80vh] flex-col justify-center transition-opacity duration-500 ease-out-quart motion-reduce:transition-none ${
                  i === activeIndex ? "opacity-100" : "opacity-40"
                }`}
              >
                <p
                  className="font-mono text-[12px] font-bold uppercase tracking-micro"
                  style={accent ? { color: accent } : undefined}
                >
                  <span className={accent ? "mr-3" : "mr-3 text-brand-500"}>
                    {PADDED(i + 1)}
                  </span>
                  <span className="text-ink-mute">{f.eyebrow}</span>
                </p>
                <h3 className="mt-3 max-w-xl text-3xl font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance] md:text-4xl lg:text-5xl">
                  <TitleAccent parts={f.title} accentColor={accent} />
                </h3>
                <p className="mt-4 max-w-xl text-lg text-ink-dim">{f.body}</p>
                <ul className="mt-6 space-y-3">
                  {f.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex gap-3 text-base text-ink-dim"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full ${accent ? "" : "bg-brand-500"}`}
                        style={accent ? { backgroundColor: accent } : undefined}
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          {/* RIGHT — sticky phone */}
          <div className="relative">
            <div className="sticky top-[12vh] flex flex-col items-center">
              <div className="w-full max-w-[280px]">
                <PhoneFrame className="relative">
                  {features.map((f, i) => (
                    <Image
                      key={f.id}
                      src={f.image}
                      alt={f.imageAlt}
                      fill
                      sizes="280px"
                      priority={i === 0}
                      className={`object-cover transition-opacity duration-500 ease-out-quart motion-reduce:transition-none ${
                        i === activeIndex ? "opacity-100" : "opacity-0"
                      }`}
                      aria-hidden={i !== activeIndex}
                    />
                  ))}
                </PhoneFrame>
                <DotStepper
                  activeIndex={activeIndex}
                  total={features.length}
                  features={features}
                  accent={accent}
                  onJump={(i) => {
                    desktopRefs.current[i]?.scrollIntoView({
                      block: "center",
                      behavior: prefersReducedMotion() ? "auto" : "smooth",
                    });
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Centerpiece editorial heading ────────────────────────────────────
//
// Single big headline above the features. The previous split-with-
// vertical-rule design only worked for short three-word phrases like
// "Everything you need" / "Nothing you don't" — the moment the copy
// grew ("To make game day a breeze") each word ended up on its own
// line in the narrow grid column. One flowing headline with text-wrap
// balance + an accent word handles any length cleanly.
function Centerpiece({
  parts,
  accent,
}: {
  parts: TitleParts;
  accent?: string;
}) {
  // Dot colour: inline-style with sport accent when present, else
  // fall back to the bg-brand-500 token so dedicated brand sites
  // keep rendering unchanged.
  const dotStyle = accent ? { backgroundColor: accent } : undefined;
  const dotClass = accent ? "" : "bg-brand-500";
  return (
    <div className="mx-auto mb-4 max-w-4xl text-center">
      <div className="flex items-center justify-center gap-3">
        <span
          aria-hidden="true"
          className={`block h-1.5 w-1.5 rounded-full ${dotClass}`}
          style={dotStyle}
        />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-mute">
          What Siren does
        </span>
        <span
          aria-hidden="true"
          className={`block h-1.5 w-1.5 rounded-full ${dotClass}`}
          style={dotStyle}
        />
      </div>

      <h2 className="mt-5 text-[clamp(2rem,5vw,4.5rem)] font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance]">
        <TitleAccent parts={parts} accentColor={accent} />
      </h2>
    </div>
  );
}

// ─── Overlay card sitting on the phone screen on mobile ────────────────
//
// Tap to expand — collapsed shows position counter + eyebrow + italic
// title; expanded reveals the same body paragraph and bullet list the
// desktop layout shows in its copy column. Resets to collapsed when
// `activeIndex` changes (the parent re-keys this component).
//
// Lifted to `bottom-12` (48px) to clear the phone screen's
// `rounded-[2.1rem]` (~33.6px) bottom corners — at lower offsets the
// rectangular card's bottom corners get diagonally clipped by the curve
// and look chopped on iPhone Safari.
function MobileOverlayCard({
  feature,
  index,
  total,
  accent,
}: {
  feature: FeatureCopy;
  index: number;
  total: number;
  accent?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="absolute inset-x-3 bottom-12 z-10 motion-safe:animate-fade-in">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide feature details" : "Show feature details"}
        className="block w-full rounded-md bg-ink/[0.92] px-3 py-2.5 text-left text-warm shadow-modal backdrop-blur-sm transition-colors duration-fast ease-out-quart hover:bg-ink/[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={`font-mono text-[9px] font-bold uppercase tracking-[0.18em] ${accent ? "" : "text-brand-500"}`}
            style={accent ? { color: accent } : undefined}
          >
            {PADDED(index + 1)}/{PADDED(total)}
          </span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-warm/55">
            {feature.eyebrow}
          </span>
          {/* Expand/collapse affordance */}
          <span
            aria-hidden="true"
            className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full bg-warm/10 font-mono text-[11px] font-bold leading-none text-warm/70"
          >
            {expanded ? "−" : "+"}
          </span>
        </div>
        <h3 className="mt-1 text-[13px] font-semibold leading-tight tracking-tightest text-warm [text-wrap:balance]">
          {/* Accent stays text-warm/90 on the dark card — sport
              accents (orange, green, purple) don't read on near-
              black backgrounds at this small size; cream is the
              legible choice. */}
          <TitleAccent parts={feature.title} italicClassName="text-warm/90" />
        </h3>

        {/* Expandable body — uses the grid-template-rows accordion trick
            so height animates smoothly between 0fr (collapsed) and 1fr
            (auto-fitting expanded). The inner div has overflow:hidden so
            partial heights clip cleanly during the transition. */}
        <div
          className={`grid transition-[grid-template-rows] duration-base ease-out-quart motion-reduce:transition-none ${
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <p className="mt-2.5 text-[12px] leading-snug text-warm/75">
              {feature.body}
            </p>
            <ul className="mt-2 space-y-1.5">
              {feature.bullets.map((b) => (
                <li
                  key={b}
                  className="flex gap-2 text-[12px] leading-snug text-warm/85"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-1 w-1 flex-shrink-0 rounded-full ${accent ? "" : "bg-brand-500"}`}
                    style={accent ? { backgroundColor: accent } : undefined}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </button>
    </div>
  );
}

// ─── Horizontal dot-stepper rendered underneath the phone ──────────────
// Replaces the previous vertical bar on the phone's right rim. Inactive
// items are 6×6 hairline dots; the active item is a 22×6 alarm pill.
// Tapping a dot scrolls the corresponding spacer/article into the centre
// of the viewport — the IO then updates activeIndex automatically.
function DotStepper({
  activeIndex,
  total,
  features,
  accent,
  onJump,
}: {
  activeIndex: number;
  total: number;
  features: FeatureCopy[];
  accent?: string;
  onJump: (index: number) => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={i}
            type="button"
            aria-label={`Feature ${i + 1} of ${total}: ${features[i]?.eyebrow ?? ""}`}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onJump(i)}
            className="flex h-8 w-8 items-center justify-center transition-colors duration-fast ease-out-quart"
          >
            {/* Inactive dots tint with the active sport's accent at
                ~55% alpha (hex `8C`) instead of bg-hairline. Same
                colour family as the active pill so the stepper
                reads as one unified component. 55% (was 35%) so
                inactives stay visible against the section's soft
                sport-tinted background — at 35% they were
                disappearing into it. */}
            <span
              aria-hidden="true"
              className={`block rounded-full transition-all duration-base ease-out-quart motion-reduce:transition-none ${
                isActive
                  ? `h-1.5 w-[22px] ${accent ? "" : "bg-brand-500"}`
                  : `h-1.5 w-1.5 ${accent ? "" : "bg-hairline"}`
              }`}
              style={
                accent
                  ? { backgroundColor: isActive ? accent : `${accent}8C` }
                  : undefined
              }
            />
          </button>
        );
      })}
    </div>
  );
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
