"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { BAND_ACCENT } from "@/components/marketing/bandStyles";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { TitleAccent } from "@/components/marketing/TitleAccent";
import type { TitleParts } from "@/lib/sports/brand-copy";

export interface GameTourStep {
  key: string;
  /** The moment in the game: "Quarter time", "Full time". */
  stamp: string;
  title: TitleParts;
  body: string;
  image: string;
  alt: string;
}

interface GameTourProps {
  steps: readonly GameTourStep[];
}

/**
 * A sport page's tour: one game in six moments, down a chalk sideline
 * on the sport's surface (the FieldBand around it). It's a timeline
 * because the content is one, so each step is stamped with its moment
 * in the game rather than numbered.
 *
 * Wide screens keep one phone still beside the steps and change its
 * screen as each step reaches the middle of the window (a cross-fade,
 * instant with reduced motion). Narrower screens give each step its own
 * phone, so nothing sticks and nothing hides behind anything.
 */
export function GameTour({ steps }: GameTourProps) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.step));
        if (hit.length) setActive(Math.min(...hit));
      },
      // A band across the middle of the window: the step crossing it is the one on the phone.
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [steps]);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16 xl:gap-24">
      <ol className="relative ml-2 border-l-2 border-mark/25 sm:ml-3">
        {steps.map((step, i) => (
          <li
            key={step.key}
            data-step={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`relative pb-16 pl-7 last:pb-2 sm:pl-10 lg:flex lg:min-h-[64vh] lg:flex-col lg:justify-center lg:pb-0 lg:transition-opacity lg:duration-500 lg:ease-out-quart motion-reduce:transition-none ${
              i === active ? "lg:opacity-100" : "lg:opacity-45"
            }`}
          >
            <p className="relative font-display text-[0.9375rem] font-extrabold uppercase tracking-[0.08em] text-mark/80 stretch-72">
              {/* The step's mark on the sideline. */}
              <span
                aria-hidden="true"
                className="absolute -left-[calc(1.75rem+7px)] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-mark sm:-left-[calc(2.5rem+7px)]"
              />
              {step.stamp}
            </p>
            <h3 className="mt-2 max-w-[22ch] font-display text-[clamp(1.75rem,3.4vw,2.75rem)] font-extrabold leading-[1.02] stretch-80 [text-wrap:balance]">
              <TitleAccent parts={step.title} accentColor={BAND_ACCENT} />
            </h3>
            <p className="mt-4 max-w-[36rem] text-lg leading-relaxed text-mark/85">{step.body}</p>

            {/* Narrow screens: the step's own phone. */}
            <div className="mt-8 w-full max-w-[248px] sm:max-w-[272px] lg:hidden">
              <PhoneFrame on="band">
                <Image src={step.image} alt={step.alt} fill sizes="272px" className="object-cover object-top" />
              </PhoneFrame>
            </div>
          </li>
        ))}
      </ol>

      {/* Wide screens: one phone, kept in view, showing the step in the middle. */}
      <div className="relative hidden lg:block">
        <div className="sticky top-[calc(50vh-18.5rem)] mx-auto w-full max-w-[272px]">
          <PhoneFrame on="band">
            {steps.map((step, i) => (
              <Image
                key={step.key}
                src={step.image}
                alt={i === active ? step.alt : ""}
                aria-hidden={i !== active}
                fill
                sizes="272px"
                className={`object-cover object-top transition-opacity duration-500 ease-out-quart motion-reduce:transition-none ${
                  i === active ? "opacity-100" : "opacity-0"
                }`}
              />
            ))}
          </PhoneFrame>
        </div>
      </div>
    </div>
  );
}
