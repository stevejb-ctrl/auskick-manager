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
 *     phone sticks to the top of the viewport (vertically centred under
 *     the navbar); copy blocks scroll past underneath. One unified page
 *     scroll — no inner scroll layer, no overlay card, no progress pill.
 *
 * Both modes share an IntersectionObserver that picks the block closest
 * to the centre of the viewport and crossfades the active screenshot.
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

        {/* MOBILE LAYOUT — single-column page scroll, sticky phone at top. */}
        <div className="mt-10 lg:hidden">
          {/* Sticky phone — stays pinned while the user scrolls the
              feature blocks beneath. Sticky context is this <div>; the
              phone unsticks when the last copy block exits the viewport. */}
          <div className="pointer-events-none sticky top-4 z-10 mx-auto mb-6 w-full max-w-[220px]">
            <PhoneFrame className="relative">
              {features.map((f, i) => (
                <Image
                  key={f.id}
                  src={f.image}
                  alt={f.imageAlt}
                  fill
                  sizes="220px"
                  priority={i === 0}
                  className={`object-cover transition-opacity duration-500 ease-out-quart motion-reduce:transition-none ${
                    i === activeIndex ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden={i !== activeIndex}
                />
              ))}
            </PhoneFrame>
          </div>

          {/* Copy blocks — generous min-height so each feature dominates
              one screen worth of scroll while the phone stays pinned. */}
          <div className="space-y-0">
            {features.map((f, i) => (
              <article
                key={f.id}
                data-index={i}
                ref={setRef[i]}
                className={`flex min-h-[70vh] flex-col justify-center py-8 transition-opacity duration-500 ease-out-quart motion-reduce:transition-none ${
                  i === activeIndex ? "opacity-100" : "opacity-50"
                }`}
              >
                <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-alarm">
                  <span className="mr-3">{PADDED(i + 1)}</span>
                  <span className="text-ink-mute">{f.eyebrow}</span>
                </p>
                <h3 className="mt-3 text-2xl font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance] sm:text-3xl">
                  <TitleAccent parts={f.title} />
                </h3>
                <p className="mt-4 text-base text-ink-dim sm:text-lg">{f.body}</p>
                <ul className="mt-5 space-y-2.5">
                  {f.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 text-sm text-ink sm:text-base">
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

