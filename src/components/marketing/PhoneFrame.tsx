import type { ReactNode } from "react";

interface PhoneFrameProps {
  children: ReactNode;
  /** Tilt the frame slightly for visual interest. Defaults to 0. */
  tilt?: number;
  className?: string;
}

// Stylised phone bezel for wrapping product screenshots. Pure CSS — no
// external PNG frame required. The outer ring uses ink (near-black) for a
// modern dark bezel; the inside shows whatever screenshot is passed in.
export function PhoneFrame({ children, tilt = 0, className = "" }: PhoneFrameProps) {
  return (
    <div
      className={[
        "relative mx-auto aspect-[9/19.5] w-full max-w-[280px]",
        "overflow-hidden rounded-[2.75rem] bg-ink p-[10px] shadow-pop",
        "ring-1 ring-black/10",
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
      {/* Screen */}
      <div className="relative h-full w-full overflow-hidden rounded-[2.1rem] bg-warm">
        {/* Notch */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-ink"
        />
        {children}
      </div>
    </div>
  );
}
