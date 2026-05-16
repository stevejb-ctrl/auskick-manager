"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";

interface Feature {
  id: string;
  eyebrow: string;
  title: string;
  /** Substring of `title` to pull into the sport accent colour. Same
   *  Geist 700 weight as the rest of the title — the colour does all
   *  the work. Matched case-insensitively, first occurrence wins. */
  accentWord?: string;
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

// Wrap the accent substring inside the title in a `text-accent` span,
// preserving the original casing. No-ops if the word isn't found or
// no accentWord was provided — both safe fallbacks.
function renderTitleWithAccent(title: string, accentWord?: string): ReactNode {
  if (!accentWord) return title;
  const idx = title.toLowerCase().indexOf(accentWord.toLowerCase());
  if (idx === -1) return title;
  return (
    <>
      {title.slice(0, idx)}
      <span className="text-accent">
        {title.slice(idx, idx + accentWord.length)}
      </span>
      {title.slice(idx + accentWord.length)}
    </>
  );
}

interface ScrollingFeaturesProps {
  features: Feature[];
  /** Sport label shown in the section eyebrow, in accent colour. */
  sportLabel: string;
}

const PADDED = (n: number) => n.toString().padStart(2, "0");

/**
 * Feature showcase section.
 *
 * Two layouts, same data:
 *
 *   • **Desktop (lg+)** — sticky-phone scroll-reveal: phone pins to the
 *     right column, copy blocks scroll past on the left. An
 *     IntersectionObserver picks the block closest to the centre of the
 *     viewport and crossfades the phone screen to match. Pill stepper
 *     below the phone for jump-to-feature.
 *
 *   • **Mobile (< lg)** — same scroll-pin idea on a single column.
 *     Phone sticks below the marketing header. A tap-to-expand overlay
 *     card sits on the phone's bottom edge (01/08 + eyebrow + title;
 *     expanded shows body + bullets). Invisible 50vh scroll-spacers
 *     drive the IO. Horizontal pill stepper directly under the phone.
 *
 * Both layouts share an IO that observes both the desktop article
 * refs and the mobile spacer refs — only the visible layout's elements
 * intersect, so the inactive layout is harmless.
 *
 * Typography follows the Field Sunday spec: mono caps eyebrows, per-
 * feature index in the sport accent, no decorative dots flanking the
 * section eyebrow, no italic serif anywhere.
 */
export function ScrollingFeatures({ features, sportLabel }: ScrollingFeaturesProps) {
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
            Sticky phone with tap-to-expand overlay + pill stepper +
            invisible scroll-spacers driving the IO.
            ====================================================== */}
        <div className="mt-10 lg:hidden">
          {/* `top-16` clears the sticky marketing header (~52px + border). */}
          <div className="sticky top-16 z-10 mx-auto mb-6 flex w-full flex-col items-center">
            <PhoneFrame className="relative">
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
                      sizes="(max-width: 1023px) 360px, 280px"
                      priority={i === 0}
                      className="object-cover"
                    />
                  ) : null)}
                </div>
              ))}

              <MobileOverlayCard
                key={`overlay-${activeIndex}`}
                feature={features[activeIndex]}
                index={activeIndex}
                total={features.length}
              />
            </PhoneFrame>

            <PillStepper
              activeIndex={activeIndex}
              total={features.length}
              features={features}
              onJump={(i) => {
                mobileRefs.current[i]?.scrollIntoView({
                  block: "center",
                  behavior: prefersReducedMotion() ? "auto" : "smooth",
                });
              }}
            />
          </div>

          {/* Invisible scroll spacers — one per feature. Each is 50vh
              so the phone dwells on each feature for half a viewport
              of scrolling without making the section feel endless. */}
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
              assistive tech reads the same content desktop users see. */}
          <ul className="sr-only">
            {features.map((f) => (
              <li key={f.id}>
                <h3>{f.title}</h3>
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

        {/* ======================================================
            DESKTOP LAYOUT (lg+)
            Copy scrolls past on the left; sticky phone on the right.
            ====================================================== */}
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
                <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
                  <span className="mr-3 text-accent">{PADDED(i + 1)}</span>
                  <span>{f.eyebrow}</span>
                </p>
                <h3 className="mt-3 max-w-xl text-3xl font-bold tracking-tightest leading-[1.05] text-ink text-balance md:text-4xl lg:text-5xl">
                  {renderTitleWithAccent(f.title, f.accentWord)}
                </h3>
                <p className="mt-4 max-w-xl text-lg text-ink-dim">{f.body}</p>
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
                        {PADDED(j + 1)}
                      </span>
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
                <PhoneFrame className="relative">
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
                <PillStepper
                  activeIndex={activeIndex}
                  total={features.length}
                  features={features}
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

// ─── Overlay card pinned to the phone's bottom edge on mobile ──────────
//
// Collapsed: 01/08 · eyebrow + title.
// Expanded: same + body + bullets, accordion via grid-template-rows.
//
// Lifted to `bottom-12` (48px) so the card's bottom corners clear the
// phone screen's `rounded-[2.1rem]` (~33.6px) curve — otherwise the
// rectangle's corners get diagonally clipped on iPhone Safari.
function MobileOverlayCard({
  feature,
  index,
  total,
}: {
  feature: Feature;
  index: number;
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="absolute inset-x-3 bottom-12 z-10">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide feature details" : "Show feature details"}
        className="block w-full rounded-md bg-ink/[0.92] px-3 py-2.5 text-left text-warm shadow-modal backdrop-blur-sm transition-colors duration-fast ease-out-quart hover:bg-ink/[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-mono text-[9px] font-bold uppercase tracking-banner text-accent">
            {PADDED(index + 1)}/{PADDED(total)}
          </span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-banner text-warm/55">
            {feature.eyebrow}
          </span>
          <span
            aria-hidden="true"
            className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full bg-warm/10 font-mono text-[11px] font-bold leading-none text-warm/70"
          >
            {expanded ? "−" : "+"}
          </span>
        </div>
        <h3 className="mt-1 text-[13px] font-semibold tracking-tightest leading-tight text-warm text-balance">
          {renderTitleWithAccent(feature.title, feature.accentWord)}
        </h3>

        {/* Expandable body — grid-template-rows accordion trick so
            height animates smoothly between 0fr and 1fr. */}
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
                    className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent"
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

// ─── Horizontal pill stepper underneath the phone ──────────────────────
// Inactive items are 6×6 hairline dots; the active item is a 22×6 pill
// in the sport accent. Tapping jumps to that feature; the IO picks up
// the new active index from the scroll position automatically.
function PillStepper({
  activeIndex,
  total,
  features,
  onJump,
}: {
  activeIndex: number;
  total: number;
  features: Feature[];
  onJump: (index: number) => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Feature ${i + 1} of ${total}: ${features[i]?.eyebrow ?? ""}`}
          aria-current={i === activeIndex ? "true" : undefined}
          onClick={() => onJump(i)}
          className="flex h-8 w-8 items-center justify-center transition-colors duration-fast ease-out-quart"
        >
          <span
            aria-hidden="true"
            className={`block rounded-full transition-all duration-base ease-out-quart motion-reduce:transition-none ${
              i === activeIndex
                ? "h-1.5 w-[22px] bg-accent"
                : "h-1.5 w-1.5 bg-ink-mute"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
