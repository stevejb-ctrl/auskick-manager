"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { TitleAccent } from "@/components/marketing/TitleAccent";
import type { FeatureCopy } from "@/lib/sports/brand-copy";

interface ScrollingFeaturesProps {
  features: FeatureCopy[];
  /** Editorial centrepiece heading. Right half renders italic. */
  centerpiece: { left: string; right: string };
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
export function ScrollingFeatures({ features, centerpiece }: ScrollingFeaturesProps) {
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
      className="relative border-b border-hairline bg-warm py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Centerpiece left={centerpiece.left} right={centerpiece.right} />

        {/* MOBILE LAYOUT — single-column page scroll, sticky phone below
            the page header with overlay card + progress pill. */}
        <div className="mt-10 lg:hidden">
          {/* Sticky offset is `top-16` (64px) to clear the marketing
              header (sticky top-0, ~52px tall + hairline). At top-4 the
              phone slid behind the header on mobile. */}
          <div className="sticky top-16 z-10 mx-auto mb-6 w-full max-w-[260px]">
            <div className="relative">
              <PhoneFrame className="relative">
                {features.map((f, i) => (
                  <Image
                    key={f.id}
                    src={f.image}
                    alt={f.imageAlt}
                    fill
                    sizes="260px"
                    priority={i === 0}
                    className={`object-cover transition-opacity duration-500 ease-out-quart motion-reduce:transition-none ${
                      i === activeIndex ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden={i !== activeIndex}
                  />
                ))}
                {/* Dark overlay card pinned to the phone's bottom edge —
                    crossfades as activeIndex changes via the keyed wrapper. */}
                <MobileOverlayCard
                  key={`overlay-${activeIndex}`}
                  feature={features[activeIndex]}
                  index={activeIndex}
                  total={features.length}
                />
              </PhoneFrame>

              <ProgressPill
                activeIndex={activeIndex}
                total={features.length}
              />
            </div>
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
                <p className="font-mono text-[12px] font-bold uppercase tracking-micro text-alarm">
                  <span className="mr-3">{PADDED(i + 1)}</span>
                  <span className="text-ink-mute">{f.eyebrow}</span>
                </p>
                <h3 className="mt-3 max-w-xl text-3xl font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance] md:text-4xl lg:text-5xl">
                  <TitleAccent parts={f.title} />
                </h3>
                <p className="mt-4 max-w-xl text-lg text-ink-dim">{f.body}</p>
                <ul className="mt-6 space-y-3">
                  {f.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 text-base text-ink">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-alarm"
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          {/* RIGHT — sticky phone */}
          <div className="relative" aria-hidden="true">
            <div className="sticky top-[12vh] flex items-center justify-center">
              <div className="relative w-full max-w-[280px]">
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
                <ProgressPill
                  activeIndex={activeIndex}
                  total={features.length}
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
function Centerpiece({ left, right }: { left: string; right: string }) {
  return (
    <div className="mx-auto mb-4 max-w-4xl">
      {/* Eyebrow + alarm dots, centered */}
      <div className="flex items-center justify-center gap-3">
        <span aria-hidden="true" className="block h-1.5 w-1.5 rounded-full bg-alarm" />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-mute">
          What Siren does
        </span>
        <span aria-hidden="true" className="block h-1.5 w-1.5 rounded-full bg-alarm" />
      </div>

      {/* Phone: stacked, centered */}
      <div className="mt-5 text-center sm:hidden">
        <h2 className="text-3xl font-bold leading-[0.95] tracking-tightest text-ink [text-wrap:balance]">
          {left}
        </h2>
        <h2 className="mt-2 font-serif text-3xl font-normal italic leading-[0.95] tracking-tightest text-ink-dim [text-wrap:balance]">
          {right}
        </h2>
      </div>

      {/* Tablet+ : 3-up with vertical hairline rule between halves */}
      <div className="mt-5 hidden grid-cols-[1fr_auto_1fr] items-start gap-6 sm:grid md:gap-8 lg:gap-12">
        <h2 className="text-right text-[clamp(2.5rem,6vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.035em] text-ink [text-wrap:balance]">
          {left.split(" ").slice(0, 1).join(" ")}
          <br />
          {left.split(" ").slice(1).join(" ")}
        </h2>
        <span aria-hidden="true" className="block self-stretch w-px bg-hairline" />
        <h2 className="text-left font-serif text-[clamp(2.5rem,6vw,5.5rem)] font-normal italic leading-[0.92] tracking-tightest text-ink-dim [text-wrap:balance]">
          {right.split(" ").slice(0, 1).join(" ")}
          <br />
          {right.split(" ").slice(1).join(" ")}
        </h2>
      </div>
    </div>
  );
}

// ─── Overlay card pinned to the phone's bottom edge on mobile ──────────
//
// Inset on all four sides so the card stays clear of the phone screen's
// rounded corners (`rounded-[2.1rem]` on PhoneFrame). At zero inset the
// card's bottom corners get diagonally clipped by the curve and look
// chopped on iPhones. Text is sized so titles like "Set your squad
// before you leave home." wrap to 2-3 readable lines without overflowing
// the card's height.
function MobileOverlayCard({
  feature,
  index,
  total,
}: {
  feature: FeatureCopy;
  index: number;
  total: number;
}) {
  return (
    <div
      className="absolute inset-x-2 bottom-2 z-10 motion-safe:animate-fade-in"
      aria-hidden="true"
    >
      <div className="rounded-md bg-ink/[0.92] px-3 py-2.5 text-warm shadow-modal backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-alarm">
            {PADDED(index + 1)}/{PADDED(total)}
          </span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-warm/55">
            {feature.eyebrow}
          </span>
        </div>
        <h3 className="mt-1 text-[13px] font-semibold leading-tight tracking-tightest text-warm [text-wrap:balance]">
          <TitleAccent parts={feature.title} italicClassName="text-warm/90" />
        </h3>
      </div>
    </div>
  );
}

// ─── Vertical alarm progress pill on the right rim of the phone ─────────
// Tracks `activeIndex / (total - 1)` so it steps cleanly between features
// rather than jittering with raw scroll position. Used by both mobile and
// desktop layouts.
function ProgressPill({
  activeIndex,
  total,
}: {
  activeIndex: number;
  total: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute -right-2 top-6 bottom-6 w-[3px] overflow-hidden rounded-full bg-hairline/60"
    >
      <div
        className="w-full rounded-full bg-alarm transition-[height] duration-300 ease-out-quart motion-reduce:transition-none"
        style={{
          height: `${(activeIndex / Math.max(1, total - 1)) * 100}%`,
        }}
      />
    </div>
  );
}
