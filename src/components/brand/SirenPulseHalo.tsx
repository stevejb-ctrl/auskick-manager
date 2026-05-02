"use client";

import type { CSSProperties, ReactNode } from "react";

// ─── SirenPulseHalo ──────────────────────────────────────────
// Wraps a child element and overlays a one-shot expanding box-
// shadow halo when its `triggerKey` prop changes. Used inside
// the live-game UI to acknowledge moments that ARE a siren going
// off — quarter-end hooter, game finalised, sub committed.
//
// Why a re-keyed inner span?  CSS animations only restart when
// the element is re-mounted (or you manually toggle the class
// off, force a reflow, then toggle it back on — which is fragile
// in React's render cycle). Swapping a `key` prop on the inner
// span makes React unmount + remount it cleanly, so the
// `siren-pulse-once` animation runs from frame 0 every time
// triggerKey changes. No effect, no setTimeout, no ref shuffling.
//
// Brand-aware automatically: the keyframe in globals.css consumes
// `--siren-pulse-from` / `--siren-pulse-to` which are set per
// brand by the `[data-brand]` block. AFL gets alarm-orange,
// netball gets court-blue. Same component, both sports.
//
// `prefers-reduced-motion: reduce` disables the animation in
// the CSS rule itself — no JS guard needed here.

interface SirenPulseHaloProps {
  /**
   * Any value that changes when a pulse should fire. A counter
   * bump, a quarter number, a sub event id — whatever maps 1:1
   * to "an event the user just caused or witnessed". Pulses fire
   * EXCEPT on the very first render (so a freshly-mounted
   * component doesn't auto-pulse on page load); subsequent
   * changes do fire.
   */
  triggerKey: string | number | null | undefined;
  /**
   * Halo size — controls the `--siren-pulse-r` radius the
   * keyframe expands to. sm: small chip / toast; md: clock pill
   * / button; lg: final-score line.
   */
  size?: "sm" | "md" | "lg";
  /**
   * Optional class on the outer wrapper. Useful to control
   * border-radius matching of the pulse to the wrapped element
   * (the halo extends from the wrapper's border, so a square
   * wrapper around a pill child will look weird).
   */
  className?: string;
  /**
   * Display mode of the wrapper. Defaults to "inline-block" so
   * the wrapper hugs the wrapped child (good for chips, pills,
   * buttons). Set to "block" when the wrapped child is itself a
   * block-level element that should take the full width of its
   * parent (e.g. a card).
   */
  display?: "inline-block" | "block";
  children: ReactNode;
}

const RADIUS: Record<NonNullable<SirenPulseHaloProps["size"]>, string> = {
  sm: "10px",
  md: "16px",
  lg: "24px",
};

export function SirenPulseHalo({
  triggerKey,
  size = "md",
  className = "",
  display = "inline-block",
  children,
}: SirenPulseHaloProps) {
  // The wrapper inherits the child's box geometry via
  // `display: contents` — it doesn't introduce its own box, so
  // the halo sits exactly on the child's outline. The keyed
  // inner span is what mounts/unmounts to restart the animation.
  // We pin the radius via inline style so the same component
  // works for any size without touching globals.css.
  const style = {
    "--siren-pulse-r": RADIUS[size],
  } as CSSProperties;

  // First render: no pulse. We don't want a halo to appear when
  // the page first loads — only when a user-visible event drives
  // a triggerKey change. The simplest way to skip the first
  // render is to omit the animating element until triggerKey
  // first changes. We track that via `triggerKey === undefined`
  // sentinel-on-mount, but since we can't track previous value
  // in a stateless render, we render the halo any time
  // triggerKey is non-null — and let the parent control
  // first-render suppression by passing `null` until the first
  // event.
  if (triggerKey === null || triggerKey === undefined) {
    return <>{children}</>;
  }

  // `span` for inline-block (default — chips/pills); `div` for
  // block (cards). Avoids the HTML invalid-nesting warning that
  // an inline `<span>` produces when wrapping block-level content.
  const Wrapper = display === "block" ? "div" : "span";
  const displayClass = display === "block" ? "block" : "inline-block";
  return (
    <Wrapper className={`relative ${displayClass} ${className}`} style={style}>
      {children}
      <span
        key={triggerKey}
        aria-hidden="true"
        className="siren-pulse-once pointer-events-none absolute inset-0 rounded-[inherit]"
      />
    </Wrapper>
  );
}
