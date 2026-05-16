"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";

interface Feature {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  /** Real product screenshot path (under /public). Ignored when
   *  `screen` is provided. */
  image?: string;
  imageAlt?: string;
  /** Custom phone-mock contents — used by sport landings where real
   *  screenshots aren't ready yet. Takes precedence over `image`. */
  screen?: ReactNode;
}

interface ScrollingFeaturesProps {
  features: Feature[];
  /** Sport label shown in the section eyebrow, in accent colour. */
  sportLabel: string;
}

/**
 * Feature showcase section.
 *
 * Two layouts, same data:
 *
 *   • **Desktop (lg+)** — sticky-phone scroll-reveal (the Skylight
 *     Calendar pattern). Phone is pinned in the left column; the copy
 *     blocks scroll past on the right. An IntersectionObserver
 *     watches a tight horizontal "band" at the centre of the
 *     viewport and crossfades the phone screenshot to match the
 *     feature currently being read.
 *
 *   • **Mobile** — each feature is a self-contained, generously
 *     spaced section. Large phone visual (with brand-tinted accent
 *     blobs like the hero, and a slight alternating tilt for rhythm),
 *     then copy beneath. This is the dominant 2026 pattern on top
 *     product sites (Apple, Stripe, Linear): a stacked flow with
 *     prominent visuals beats faux scroll-coupling on a narrow
 *     viewport. No sticky tricks fighting native scroll; the reader
 *     dwells on one feature at a time and moves on when ready.
 *
 * The same IntersectionObserver runs on both layouts — it drives the
 * desktop phone crossfade, and is harmless on mobile (activeIndex is
 * unused there).
 *
 * Typography follows the Field Sunday spec: section heading splits
 * across a thin vertical rule (`Everything you need.` | `Nothing you
 * don't.`), per-feature index in mono caps coloured in the sport
 * accent, eyebrows in mono caps. No decorative dots flanking the
 * section eyebrow.
 */
export function ScrollingFeatures({ features, sportLabel }: ScrollingFeaturesProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Assign one ref per feature block. The callback form keeps the
  // array length in sync with the features prop.
  const setRef = useMemo(
    () => features.map((_, i) => (el: HTMLDivElement | null) => {
      sectionRefs.current[i] = el;
    }),
    [features],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    // Narrow horizontal band across the centre of the viewport. A
    // block becomes "active" when its midpoint crosses this band.
    // Drives the desktop sticky-phone crossfade.
    const observer = new IntersectionObserver(
      (entries) => {
        // Of the blocks currently intersecting the centre band,
        // pick the one closest to the centre. Handles fast scrolls
        // where multiple blocks transit the band on the same tick.
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
        // top / right / bottom / left. -40% on top and bottom leaves
        // a 20% centre band. Blocks are "active" when they cross it.
        rootMargin: "-40% 0px -40% 0px",
        threshold: 0,
      },
    );

    sectionRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [features]);

  // Zero-padded index for the mono caps treatment ("01", "02", …).
  const featureIdx = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <section
      id="features"
      className="relative border-b border-hairline bg-warm py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section intro. Eyebrow: WHAT SIREN DOES · [SPORT] with the
            sport label in accent — no flanking dots per the spec.
            Heading splits across a thin vertical rule. */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
            What Siren does · <span className="text-accent">{sportLabel}</span>
          </p>
          <h2 className="mt-4 flex flex-col items-center justify-center gap-3 text-3xl font-bold tracking-section leading-[0.98] text-ink sm:flex-row sm:gap-5 sm:text-4xl md:text-5xl">
            <span className="text-balance">Everything you need.</span>
            <span
              aria-hidden="true"
              className="hidden h-10 w-px bg-hairline sm:inline-block md:h-12"
            />
            <span className="text-ink-dim text-balance">Nothing you don&rsquo;t.</span>
          </h2>
        </div>

        {/* ======================================================
            MOBILE LAYOUT (< lg)
            Stacked sections. Each feature is fully self-contained:
            accent-tinted phone mockup, then copy. Generous spacing
            so each one reads as its own beat.
            ====================================================== */}
        <div className="mt-12 space-y-24 sm:space-y-28 lg:hidden">
          {features.map((f, i) => {
            // Alternate tilt direction so the rhythm down the page
            // isn't mechanical. Zero tilt on the first one — it sets
            // the baseline — then ±1.5° after that.
            const tilt = i === 0 ? 0 : i % 2 === 0 ? -1.5 : 1.5;
            // Swap which side the accent blob sits on so adjacent
            // sections don't look identical.
            const blobOnRight = i % 2 === 1;

            return (
              <article key={f.id} className="relative">
                {/* Phone + accent blobs, matching the hero treatment
                    so the aesthetic is consistent across the page. */}
                <div className="relative mx-auto mb-8 w-full max-w-[300px]">
                  <div
                    aria-hidden="true"
                    className={`absolute ${
                      blobOnRight ? "-right-8" : "-left-8"
                    } top-8 h-48 w-48 rounded-full bg-accent-soft/70 blur-3xl`}
                  />
                  <div
                    aria-hidden="true"
                    className={`absolute ${
                      blobOnRight ? "-left-6" : "-right-6"
                    } bottom-4 h-40 w-40 rounded-full bg-warn-soft/70 blur-3xl`}
                  />
                  <PhoneFrame tilt={tilt} className="relative">
                    {f.screen ?? (f.image ? (
                      <Image
                        src={f.image}
                        alt={f.imageAlt ?? ""}
                        fill
                        sizes="(max-width: 640px) 300px, 280px"
                        priority={i === 0}
                        className="object-cover"
                      />
                    ) : null)}
                  </PhoneFrame>
                </div>

                {/* Copy — centred on mobile so the section reads as
                    one unified card-like beat rather than a left-
                    aligned text block underneath a centred phone. */}
                <div className="mx-auto max-w-xl px-1 text-center">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
                    <span className="text-accent">{featureIdx(i)}</span> · {f.eyebrow}
                  </p>
                  <h3 className="mt-3 text-2xl font-bold tracking-tightest leading-[1.05] text-ink text-balance sm:text-3xl">
                    {f.title}
                  </h3>
                  <p className="mt-4 text-base text-ink-dim sm:text-lg">
                    {f.body}
                  </p>
                  <ul className="mx-auto mt-6 max-w-md space-y-3 text-left">
                    {f.bullets.map((bullet, j) => (
                      <li
                        key={bullet}
                        className="flex gap-3 text-sm text-ink-dim sm:text-base"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-0.5 font-mono text-[11px] font-bold uppercase tracking-micro text-accent"
                        >
                          {String(j + 1).padStart(2, "0")}
                        </span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>

        {/* ======================================================
            DESKTOP LAYOUT (lg+)
            Sticky phone on the left, copy scrolls past on the right.
            Scroll-coupled crossfade driven by the IntersectionObserver
            above.
            ====================================================== */}
        <div className="mt-20 hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          {/* LEFT — sticky phone */}
          <div className="relative">
            <div className="sticky top-24 flex items-center justify-center">
              {/* The outer sticky is a flex container — its child is
                  a flex item and will shrink to fit content unless we
                  give it an explicit width. Without this, the inner
                  PhoneFrame's `w-full` resolves to 0 and the whole
                  device collapses to the notch. */}
              <div className="relative w-full max-w-[280px]">
                {/* Accent blobs behind the phone */}
                <div
                  aria-hidden="true"
                  className="absolute -left-8 top-10 h-48 w-48 rounded-full bg-accent-soft/70 blur-3xl"
                />
                <div
                  aria-hidden="true"
                  className="absolute -right-4 bottom-6 h-40 w-40 rounded-full bg-warn-soft/70 blur-3xl"
                />
                <PhoneFrame tilt={1.5} className="relative">
                  {/* All screens are stacked; only the active one is
                      opacity: 1. Keeps images pre-loaded for a snappy
                      crossfade instead of a flash-of-missing-image. */}
                  {features.map((f, i) => (
                    <div
                      key={f.id}
                      aria-hidden={i !== activeIndex}
                      className={`absolute inset-0 transition-opacity duration-500 ease-out-quart motion-reduce:transition-none ${
                        i === activeIndex ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {f.screen ?? (f.image ? (
                        <Image
                          src={f.image}
                          alt={f.imageAlt ?? ""}
                          fill
                          sizes="280px"
                          priority={i === 0}
                          className="object-cover"
                        />
                      ) : null)}
                    </div>
                  ))}
                </PhoneFrame>
              </div>
            </div>
          </div>

          {/* RIGHT — scrolling feature copy */}
          <div className="space-y-36">
            {features.map((f, i) => (
              <article
                key={f.id}
                data-index={i}
                ref={setRef[i]}
                className={`transition-opacity duration-500 ease-out-quart motion-reduce:transition-none ${
                  i === activeIndex ? "opacity-100" : "opacity-40"
                }`}
              >
                <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
                  <span className="text-accent">{featureIdx(i)}</span> · {f.eyebrow}
                </p>
                <h3 className="mt-3 text-3xl font-bold tracking-tightest leading-[1.05] text-ink text-balance md:text-4xl">
                  {f.title}
                </h3>
                <p className="mt-4 text-lg text-ink-dim">{f.body}</p>
                <ul className="mt-6 space-y-3">
                  {f.bullets.map((bullet, j) => (
                    <li
                      key={bullet}
                      className="flex gap-3 text-base text-ink-dim"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1 font-mono text-[11px] font-bold uppercase tracking-micro text-accent"
                      >
                        {String(j + 1).padStart(2, "0")}
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
