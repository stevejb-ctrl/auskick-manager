interface PulseRingProps {
  /**
   * Which pulse animation to run.
   *   • `burst` — 3 iterations then stops (opacity 0, `forwards`).
   *     For transient "just happened" moments: goal scored, quarter
   *     siren, full-time card arrival.
   *   • `slow`  — ambient infinite, slower cadence. For sustained
   *     urgency: final 10 sec of Q, start-game in kickoff window.
   *   • `steady` — ambient infinite, standard cadence. For running
   *     status indicators (LIVE / share-link-in-use).
   */
  variant?: "burst" | "slow" | "steady";
  /**
   * Corner radius, matched to the wrapped element. Defaults to `md`
   * (8px) which lines up with most of the app's chip / button radii.
   */
  radius?: "md" | "lg" | "xl" | "full";
  className?: string;
}

/**
 * A brand siren moment around an existing UI element.
 *
 * Renders an absolutely-positioned ring painted in `currentColor` with
 * one of the `pulseRipple` animations defined in tailwind.config. The
 * consumer wraps the target element in a `relative` container that
 * sets the colour (usually `text-alarm` for brand moments, `text-warn`
 * for in-app signal moments) and drops a `<PulseRing>` inside.
 *
 * Usage:
 *
 *   <span className="relative inline-block text-alarm">
 *     <PulseRing variant="burst" radius="md" />
 *     <button className="relative rounded-md bg-brand-600 px-4 py-2">
 *       Start game
 *     </button>
 *   </span>
 *
 * The ring sits underneath the element. It inherits the wrapper's
 * `text-*` hue via `bg-current`. `motion-reduce:hidden` drops it for
 * users who've opted out of motion.
 *
 * Re-triggering a `burst`: change the `key` on the PulseRing from the
 * parent when the moment should fire again (e.g. a counter that
 * increments on every goal) — React will remount it and the animation
 * starts over.
 */
export function PulseRing({
  variant = "burst",
  radius = "md",
  className = "",
}: PulseRingProps) {
  const anim = {
    burst:  "motion-safe:animate-pulse-ripple-burst",
    slow:   "motion-safe:animate-pulse-ripple-slow",
    steady: "motion-safe:animate-pulse-ripple",
  }[variant];

  const corner = {
    md:   "rounded-md",
    lg:   "rounded-lg",
    xl:   "rounded-xl",
    full: "rounded-full",
  }[radius];

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${corner} bg-current ${anim} motion-reduce:hidden ${className}`}
    />
  );
}
