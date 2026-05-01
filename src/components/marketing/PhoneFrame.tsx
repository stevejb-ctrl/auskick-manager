import type { ReactNode } from "react";

interface PhoneFrameProps {
  children: ReactNode;
  /** Tilt the frame slightly for visual interest. Defaults to 0. */
  tilt?: number;
  className?: string;
  /**
   * Responsive sizing mode.
   * - `fluid` (mobile features section): scale with the viewport height so
   *   phone + dot-stepper + breathing always fit inside one screen, no
   *   matter the device. Phone width is `min(360px, dvh-based)`.
   * - `fixed` (hero, desktop features): use the supplied className/wrapper
   *   max-width as before. No dvh-based scaling.
   *
   * Defaults to `fixed` so existing call sites (hero, desktop sticky)
   * keep their previous behaviour.
   */
  size?: "fluid" | "fixed";
}

// Stylised phone bezel for wrapping product screenshots. Cream chassis
// with a hairline border per the marketing design handoff
// (`marketing_handoff/`). The prototype uses `t.color.bg` (warm
// off-white) for the chassis and `t.color.border` for the outline. No
// notch — screenshots are full-bleed, and a notch on a cream device
// reads as noise rather than a device cue.
//
// Padding is `14px` so the cream bezel reads as a real chassis around
// the screen — and the inner screen carries a darker `ring` so the
// screen edge stays delineated even when the screenshot's own
// background colour matches the cream bezel (which it usually does for
// the AFL/netball app screens).
export function PhoneFrame({
  children,
  tilt = 0,
  className = "",
  size = "fixed",
}: PhoneFrameProps) {
  // Fluid: derive width from viewport height so the phone + dot-stepper
  // + breathing always fit between the sticky header (top-16 ≈ 64px)
  // and the bottom of the screen. The reservation budget is:
  //   sticky offset (64) + dot-stepper (~30) + gap (~24) + breathing (~30)
  //   ≈ 148px. Round to 160px for safety.
  // Phone height = 100dvh - 160; phone width = height × 9/19.5.
  // Capped at 360px so it doesn't get goofy on tablets in portrait.
  const fluidMaxWidth = "min(360px, calc((100dvh - 160px) * 9 / 19.5))";
  return (
    <div
      className={[
        "relative mx-auto aspect-[9/19.5] w-full",
        size === "fixed" ? "max-w-[320px]" : "",
        "overflow-hidden rounded-[2.75rem] border border-hairline bg-warm p-[14px] shadow-pop",
        className,
      ].join(" ")}
      style={{
        maxWidth:
          size === "fluid"
            ? fluidMaxWidth
            : "min(320px, calc(72vh * 9 / 19.5))",
        ...(tilt ? { transform: `rotate(${tilt}deg)` } : {}),
      }}
    >
      {/* Screen — surface white so any image inside is full-bleed.
          `ring-ink/15` makes the screen edge visible against a cream
          screenshot background; `ring-inset` keeps the ring inside the
          rounded clip so it reads as a screen bezel, not a stroke. */}
      <div className="relative h-full w-full overflow-hidden rounded-[1.875rem] bg-surface ring-1 ring-inset ring-ink/15">
        {children}
      </div>
    </div>
  );
}
