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
 * Renders an absolutely-positioned, transparent ring whose `box-shadow`
 * is animated by one of the `pulseRipple` keyframes defined in
 * `tailwind.config.ts`. The shadow uses `currentColor`, so the consumer
 * controls the hue by setting `text-alarm` (brand moments) or
 * `text-warn` (in-app signal moments) on the wrapping `relative` span.
 *
 * Usage:
 *
 *   <span className="relative inline-block text-alarm">
 *     <PulseRing variant="slow" radius="md" />
 *     <button className="relative rounded-md bg-brand-600 px-4 py-2">
 *       Open game
 *     </button>
 *   </span>
 *
 * The ring sits underneath the element. The button-or-similar child
 * MUST also be `position: relative` so it paints OVER the ring's
 * spreading box-shadow halo. `motion-reduce:hidden` drops the ring
 * for users who've opted out of motion.
 *
 * Re-triggering a `burst`: change the `key` on the PulseRing from the
 * parent when the moment should fire again (e.g. a counter that
 * increments on every goal) — React will remount it and the animation
 * starts over.
 *
 * The element carries `data-pulse-ring="<variant>"` so e2e tests can
 * pin the regression (the keyframes were missing from
 * `tailwind.config.ts` 2026-05-12 to 2026-05-14, which silently broke
 * every kickoff window pulse — see kickoff-pulse.spec.ts).
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
      data-pulse-ring={variant}
      className={`pointer-events-none absolute inset-0 ${corner} ${anim} motion-reduce:hidden ${className}`}
    />
  );
}
