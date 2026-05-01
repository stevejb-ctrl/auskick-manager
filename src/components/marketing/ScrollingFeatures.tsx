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
 * and two responsive layouts beneath, both driven from the same data:
 *
 *   • **Desktop (lg+)** — sticky-phone scroll-pin. The phone is locked to
 *     the right column; copy blocks scroll past on the left, each one a
 *     viewport tall so the reader has time to register a feature before
 *     the phone crossfades to the next one. An IntersectionObserver
 *     watches a tight band at the centre of the viewport.
 *
 *   • **Mobile (< lg)** — self-contained scroll-snap frame. A fixed
 *     phone mock holds in place; an invisible scroll-snap layer stacked
 *     on top of it captures the user's gesture. `scrollTop /
 *     clientHeight` rounds to the active feature index. Accessibility:
 *     the gesture surface is `aria-hidden`; the dot indicators below
 *     the frame are the keyboard-accessible nav with descriptive labels.
 */
export function ScrollingFeatures({ features, centerpiece }: ScrollingFeaturesProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Assign one ref per feature block. The callback form keeps the
  // array length in sync with the features prop.
  const setRef = useMemo(
    () =>
      features.map((_, i) => (el: HTMLDivElement | null) => {
        sectionRefs.current[i] = el;
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
        rootMargin: "-40% 0px -40% 0px",
        threshold: 0,
      },
    );

    sectionRefs.current.forEach((el) => {
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

        {/* MOBILE LAYOUT — scroll-snap frame */}
        <div className="mt-12 lg:hidden">
          <MobileScrollSnapFeatures features={features} />
        </div>

        {/* DESKTOP LAYOUT — sticky phone (right) + scrolling copy (left) */}
        <div className="mt-20 hidden lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
          {/* LEFT — scrolling feature copy */}
          <div>
            {features.map((f, i) => (
              <article
                key={f.id}
                data-index={i}
                ref={setRef[i]}
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
                <div
                  aria-hidden="true"
                  className="absolute -left-8 top-10 h-48 w-48 rounded-full bg-brand-200/50 blur-3xl"
                />
                <div
                  aria-hidden="true"
                  className="absolute -right-4 bottom-6 h-40 w-40 rounded-full bg-warn-soft/70 blur-3xl"
                />
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

// ─── Mobile scroll-snap features frame ────────────────────────────────
function MobileScrollSnapFeatures({ features }: { features: FeatureCopy[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
    const clamped = Math.max(0, Math.min(features.length - 1, idx));
    if (clamped !== activeIndex) setActiveIndex(clamped);
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    setProgress(Math.max(0, Math.min(1, el.scrollTop / max)));
  };

  const scrollToIndex = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: idx * el.clientHeight,
      behavior:
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
    });
  };

  return (
    <div className="mx-auto max-w-[340px]">
      <div className="relative mx-auto h-[560px] w-full">
        {/* Phone frame locked in centre — visual only, gestures pass through */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-full max-w-[280px]">
            <div
              aria-hidden="true"
              className="absolute -left-8 top-10 h-48 w-48 rounded-full bg-brand-200/50 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="absolute -right-4 bottom-6 h-40 w-40 rounded-full bg-warn-soft/70 blur-3xl"
            />
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
              <MobileOverlayCard
                key={`overlay-${activeIndex}`}
                feature={features[activeIndex]}
                index={activeIndex}
                total={features.length}
              />
            </PhoneFrame>
          </div>
        </div>

        {/* Vertical alarm progress pill on the right rim */}
        <div
          aria-hidden="true"
          className="absolute right-0 top-6 bottom-6 w-[3px] overflow-hidden rounded-full bg-hairline/60"
        >
          <div
            className="w-full rounded-full bg-alarm transition-[height] duration-200 ease-out-quart motion-reduce:transition-none"
            style={{ height: `${progress * 100}%` }}
          />
        </div>

        {/* Invisible scroll-snap gesture surface, stacked on top */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          aria-hidden="true"
          className="no-scrollbar absolute inset-0 h-full snap-y snap-mandatory overflow-y-auto"
        >
          {features.map((f, i) => (
            <div key={f.id} className="h-full snap-start" data-index={i} />
          ))}
        </div>
      </div>

      {/* Dot indicators — keyboard-accessible feature nav */}
      <div className="mt-6 flex items-center justify-center gap-2">
        {features.map((f, i) => (
          <button
            key={f.id}
            type="button"
            aria-label={`Feature ${i + 1}: ${f.eyebrow}`}
            aria-current={i === activeIndex ? "true" : undefined}
            onClick={() => scrollToIndex(i)}
            className={`flex h-8 w-8 items-center justify-center transition-colors duration-fast ease-out-quart`}
          >
            <span
              aria-hidden="true"
              className={`block rounded-full transition-all duration-base ease-out-quart motion-reduce:transition-none ${
                i === activeIndex
                  ? "h-1.5 w-5 bg-alarm"
                  : "h-1.5 w-1.5 bg-hairline"
              }`}
            />
          </button>
        ))}
      </div>

      {/* Screen-reader-only feature list — the visual frame is aria-hidden */}
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
  );
}

// ─── Overlay card pinned to the bottom of the phone screen on mobile ──
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
      className="absolute inset-x-0 bottom-0 z-10 px-3 pb-3 motion-safe:animate-fade-in"
      aria-hidden="true"
    >
      <div className="rounded-md bg-ink/[0.92] px-4 py-3 text-warm shadow-modal backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-alarm">
            {PADDED(index + 1)}/{PADDED(total)}
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-warm/55">
            {feature.eyebrow}
          </span>
        </div>
        <h3 className="mt-1 text-base font-semibold leading-snug tracking-tightest text-warm [text-wrap:balance]">
          <TitleAccent parts={feature.title} italicClassName="text-warm/90" />
        </h3>
      </div>
    </div>
  );
}
