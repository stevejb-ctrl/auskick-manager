"use client";

// ─── StartBarButton ──────────────────────────────────────────
// The live v3 bar before the first siren: one hi-vis "Start Q1" (the
// act-now colour), the same place every sport starts from, with "the
// clock starts when you confirm" under it. The tap opens the sport's
// StartQuarterModal; its "Start Q1 now" starts the clock. AFL's (Phase
// 5) and netball's (Phase 7) pre-kickoff bars are this.

export function StartBarButton({
  label,
  onClick,
  disabled = false,
}: {
  /** "Start Q1", "Start H1". */
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex min-h-[58px] w-full flex-col items-center justify-center gap-[3px] rounded-[16px] bg-hivis px-[8px] font-display stretch-75 text-[1.1875rem] font-extrabold uppercase leading-none text-hivis-ink transition-[background-color,transform] duration-tap ease-out-quart hover:bg-hivis/90 motion-safe:active:scale-[0.98] disabled:opacity-60"
    >
      {label}
      <span className="font-sans text-[0.6875rem] font-normal normal-case opacity-80">the clock starts when you confirm</span>
    </button>
  );
}
