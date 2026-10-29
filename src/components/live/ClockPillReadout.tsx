"use client";

/**
 * What's inside the scorebug's ink clock pill (not at the hooter): the
 * period with a live dot or a paused ▶, over the clock. AFL, soccer,
 * basketball and touch drew the same markup four times; this is it once.
 *
 * At full time it says "Full time" instead of the last clock reading
 * (design review, Oct 2026: the result link opened on "FT 15:00", the
 * clock frozen where the coach stopped it, in a pill that looked off).
 */
export function ClockPillReadout({
  periodTag,
  live,
  pausedIcon,
  readout,
  finished = false,
  overtime = false,
  animateClassName = "",
}: {
  periodTag: string;
  live: boolean;
  pausedIcon: string | null;
  readout: string;
  finished?: boolean;
  overtime?: boolean;
  /** The rise-in when the period changes (AFL). */
  animateClassName?: string;
}) {
  if (finished) {
    return (
      <span className="flex flex-col items-center">
        <span className="whitespace-nowrap text-lg font-bold leading-7 tracking-[-0.01em] text-warm">Full time</span>
      </span>
    );
  }
  return (
    <span className={`flex flex-col items-center ${animateClassName}`}>
      <span className="flex items-center gap-1.5 font-mono text-nano font-bold uppercase leading-3 tracking-micro text-warm/[0.72]">
        {live && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-mint" />}
        <span>{periodTag}</span>
        {pausedIcon && <span>{pausedIcon}</span>}
      </span>
      <span
        className={`nums mt-1 font-mono text-[28px] font-bold leading-7 tracking-[-0.03em] tabular-nums ${
          overtime ? "text-warn" : "text-warm"
        }`}
      >
        {readout}
      </span>
    </span>
  );
}
