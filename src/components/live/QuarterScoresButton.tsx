"use client";

// The text button under the clock pill that opens the quarter-by-quarter
// score table (AFL and netball). A 44pt target; the word "Quarters" in
// sentence case replaced the "Q-BY-Q" mono code (design review, Oct
// 2026: nobody outside the build knew what it meant).
export function QuarterScoresButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-1 px-3 text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
      aria-label="Show quarter-by-quarter scores"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <path d="M2 7h12M6 3v10M10 3v10" />
      </svg>
      Quarters
    </button>
  );
}
