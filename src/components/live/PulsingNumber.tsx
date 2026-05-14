"use client";

import { useEffect, useRef, useState } from "react";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { countUpAt } from "@/lib/animation/countUp";

interface PulsingNumberProps {
  /**
   * Target value to render. When this changes, the displayed digit
   * counts up to the new value (200ms cubic-out) and a one-shot
   * brand halo fires around the number via SirenPulseHalo.
   */
  value: number;
  /**
   * className applied to the displayed-number span. The component
   * is layout-agnostic so callers control sizing/colour/font —
   * pass the same className you'd use on a plain `<span>{value}</span>`.
   */
  className?: string;
  /**
   * Halo size. `md` (default) fits the live-game score totals.
   * `sm` for chips, `lg` for full-time hero.
   */
  haloSize?: "sm" | "md" | "lg";
  /**
   * Count-up duration in ms. Defaults to 200ms — the plan's
   * "state change inside the screen" speed budget.
   */
  durationMs?: number;
}

// Pure math (`countUpAt`, `easeOutCubic`) lives in
// `src/lib/animation/countUp.ts` so it's importable from vitest
// (which can't parse this .tsx file in the Node-environment
// test runner). The component imports the function from there
// and the unit tests pin the curve behaviour independently.

/**
 * Score numeral that counts up to a new value with a brand halo
 * when it changes. Used by GameHeader (AFL points totals) and the
 * netball scorebug (goal counts). Wraps the rendered digit in
 * `SirenPulseHalo` so the halo radiates from the digit's bounding
 * box — drawing the eye to the moment of change.
 *
 * Reduced-motion:
 *   - prefers-reduced-motion users get the final value instantly
 *     (no count-up).
 *   - SirenPulseHalo disables its halo at the CSS level under
 *     reduced-motion, so the halo also no-ops automatically.
 *
 * Rapid-fire scoring (two goals within 250ms) — the in-flight
 * count-up is cancelled and a new animation kicks off from the
 * mid-animation displayed value to the new target. Net result:
 * the user sees a smooth continuous ramp, never a snap-then-ramp.
 *
 * P0-6 from .planning/MICRO-INTERACTIONS-PLAN.md.
 */
export function PulsingNumber({
  value,
  className = "",
  haloSize = "md",
  durationMs = 200,
}: PulsingNumberProps) {
  const [displayed, setDisplayed] = useState(value);
  // null until the user causes a value change — guarantees the
  // halo doesn't fire on page load (every freshly-mounted live
  // game would otherwise pulse on its 0-0 scoreboard). After the
  // first value-change effect-run, this gets bumped and stays
  // bumped, so subsequent changes fire halos normally.
  const [triggerKey, setTriggerKey] = useState<number | null>(null);

  // displayedRef mirrors `displayed` so the count-up effect can
  // snapshot the CURRENT rendered value when `value` changes,
  // without needing `displayed` in its dependency array (which
  // would re-fire the effect on every animation tick and create
  // a feedback loop).
  const displayedRef = useRef(value);
  useEffect(() => {
    displayedRef.current = displayed;
  });

  // First-mount sentinel — skip the very first effect run so a
  // freshly-mounted PulsingNumber doesn't pulse just because it
  // appeared on screen. Only real subsequent value changes fire.
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    // Real value change after mount → fire halo, start count-up.
    setTriggerKey(value);

    if (typeof window === "undefined") {
      setDisplayed(value);
      return;
    }
    // Reduced motion → snap to the new value, skip the count-up.
    // SirenPulseHalo also disables its halo under the same CSS
    // media query, so the moment is communicated by the static
    // number change alone.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayed(value);
      return;
    }
    if (displayedRef.current === value) return;

    const fromValue = displayedRef.current;
    let start: number | null = null;
    let rafId = 0;
    const animate = (t: number) => {
      if (start === null) start = t;
      const k = (t - start) / durationMs;
      setDisplayed(countUpAt(fromValue, value, k));
      if (k < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  return (
    <SirenPulseHalo triggerKey={triggerKey} size={haloSize}>
      <span className={className}>{displayed}</span>
    </SirenPulseHalo>
  );
}
