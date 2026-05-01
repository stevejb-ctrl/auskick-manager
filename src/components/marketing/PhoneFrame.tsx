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
// with a hairline border per the marketing design handoff. No notch —
// screenshots are full-bleed, and a notch on a cream device reads as
// noise rather than a device cue.
//
// Padding is asymmetric — `px-[6px] py-[14px]` — so the inner screen's
// aspect ratio matches the screenshot aspect ratio (9:19.5). With
// symmetric `p-[14px]` the inner aspect (276 × 622 ≈ 0.444) was narrower
// than the screenshot (0.461), forcing `object-cover` to crop the
// vertical edges of the image (e.g., chopping the "S" off "Siren Footy"
// in the top-left of the app screen). The asymmetric ratio
// (px:py = 6:14 ≈ 9:19.5 × 0.7) keeps the inner aspect at ~0.460, so
// the screenshot fills the screen with no side cropping.
//
// Real-phone bezels are also asymmetric (thinner sides, thicker
// top/bottom) so this looks more device-like, not less.
export function PhoneFrame({
  children,
  tilt = 0,
  className = "",
  size = "fixed",
}: PhoneFrameProps) {
  // Fluid: derive width from viewport height so the phone + dot-stepper
  // + breathing always fit between the sticky header (top-16 ≈ 64px)
  // and the bottom of the screen. Reservation budget ≈ 160px.
  const fluidMaxWidth = "min(360px, calc((100dvh - 160px) * 9 / 19.5))";
  return (
    <div
      className={[
        "relative mx-auto aspect-[9/19.5] w-full",
        size === "fixed" ? "max-w-[320px]" : "",
        "overflow-hidden rounded-[2.75rem] border border-hairline bg-warm px-[6px] py-[14px] shadow-pop",
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
          `ring-ink/25` is dark enough to be visible against the cream
          screenshot backgrounds; `ring-inset` keeps the ring inside the
          rounded clip so it reads as a screen bezel, not a stroke. */}
      <div className="relative h-full w-full overflow-hidden rounded-[1.875rem] bg-surface ring-1 ring-inset ring-ink/25">
        {children}
      </div>
    </div>
  );
}
