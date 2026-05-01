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
export function PhoneFrame({ children, tilt = 0, className = "" }: PhoneFrameProps) {
  return (
    <div
      className={[
        "relative mx-auto aspect-[9/19.5] w-full max-w-[280px]",
        "overflow-hidden rounded-[2.75rem] border border-hairline bg-warm p-[10px] shadow-pop",
        className,
      ].join(" ")}
      style={{
        // Cap the width so the frame height never exceeds ~72 % of the
        // viewport. Without this, on short phones (≤ 844 px tall) the
        // 9:19.5 aspect frame is taller than the visible screen.
        // min(280px, 72vh × 9/19.5) resolves to the 280px hard cap on
        // tall screens and to the viewport-relative value on short ones.
        maxWidth: "min(280px, calc(72vh * 9 / 19.5))",
        ...(tilt ? { transform: `rotate(${tilt}deg)` } : {}),
      }}
    >
      {/* Screen — surface white so any image inside is full-bleed. */}
      <div className="relative h-full w-full overflow-hidden rounded-[2.1rem] bg-surface">
        {children}
      </div>
    </div>
  );
}
