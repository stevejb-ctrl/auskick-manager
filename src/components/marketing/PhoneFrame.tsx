import type { ReactNode } from "react";

interface PhoneFrameProps {
  children: ReactNode;
  /** Tilt the frame slightly for visual interest. Defaults to 0. */
  tilt?: number;
  className?: string;
}

// Stylised phone bezel for wrapping product screenshots. Cream chassis
// with a hairline border per the marketing design handoff
// (`marketing_handoff/`). The prototype uses `t.color.bg` (warm
// off-white) for the chassis and `t.color.border` for the outline. No
// notch — screenshots are full-bleed, and a notch on a cream device
// reads as noise rather than a device cue.
//
// Padding is `12px` so the cream bezel reads as a real chassis around
// the screen — at 10px the screenshot's edge often visually merged with
// the bezel. The inner screen carries a subtle hairline `ring` to
// delineate the screen edge cleanly even when the screenshot's own
// background colour matches the bezel cream.
export function PhoneFrame({ children, tilt = 0, className = "" }: PhoneFrameProps) {
  return (
    <div
      className={[
        "relative mx-auto aspect-[9/19.5] w-full max-w-[320px]",
        "overflow-hidden rounded-[2.75rem] border border-hairline bg-warm p-[12px] shadow-pop",
        className,
      ].join(" ")}
      style={{
        // Cap the width so the frame height never exceeds ~72 % of the
        // viewport. Without this, on short phones the 9:19.5 aspect
        // frame can exceed the visible screen height.
        maxWidth: "min(320px, calc(72vh * 9 / 19.5))",
        ...(tilt ? { transform: `rotate(${tilt}deg)` } : {}),
      }}
    >
      {/* Screen — surface white so any image inside is full-bleed.
          The hairline ring keeps the screen edge visible even when the
          screenshot's own background blends with the cream chassis. */}
      <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-surface ring-1 ring-hairline">
        {children}
      </div>
    </div>
  );
}
