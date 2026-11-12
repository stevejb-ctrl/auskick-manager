import type { ReactNode } from "react";

interface PhoneFrameProps {
  children: ReactNode;
  /**
   * What it lies on: the chalk page, or a field band, where the ink
   * bezel gets a faint chalk edge and a deeper shadow so it doesn't sink
   * into the grass.
   */
  on?: "page" | "band";
  className?: string;
}

// A phone for the app's screenshots (390 × 844, so the screen is
// 9 : 19.5). The bezel is the app's ink; the screenshots carry their own
// status bar, so there's no notch. The padding is thinner at the sides
// than at the ends, as a real phone's is, and keeps the screen at the
// screenshot's own shape so nothing is cropped. Width comes from the
// caller (a max-w on it or its wrapper).
export function PhoneFrame({ children, on = "page", className = "" }: PhoneFrameProps) {
  const edge =
    on === "band"
      ? "ring-1 ring-mark/25 shadow-[0_32px_64px_-24px_rgb(0_0_0_/_0.6),0_8px_20px_-8px_rgb(0_0_0_/_0.35)]"
      : "ring-1 ring-black/10 shadow-pop";
  return (
    <div className={`relative mx-auto aspect-[9/19.5] w-full rounded-[2.6rem] bg-ink px-[6px] py-[13px] ${edge} ${className}`}>
      <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-warm">{children}</div>
    </div>
  );
}
