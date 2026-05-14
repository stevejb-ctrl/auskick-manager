"use client";

// ─── QuarterKickoffBar ───────────────────────────────────────
// Shared sticky-bottom kickoff bar for quarter-break flows. Used
// by both AFL `QuarterBreak.tsx` and netball `NetballQuarterBreak`.
//
// Single full-width primary CTA ("Ready for Q{n}"). The CTA opens
// the per-sport StartQuarterModal — the actual two-step kickoff
// (commit lineup → wait for whistle → start clock) is hosted by
// the sport-specific QB component, not here. This component is
// just the chrome.
//
// Differs from `LineupPickerFooter`:
//   - No counts row (Q-break has its own zone-time bars instead)
//   - No Save-plan opt-out (Q-break can't be "stashed and exited")
//   - Slightly more breathing room on top (pt-3 sm:pt-4) because
//     there's no secondary row eating the padding budget
//
// Steve 2026-05-15: Phase 4b of the netball-parity shell refactor.

import { SFButton } from "@/components/sf";

interface QuarterKickoffBarProps {
  /** Tapped to open the per-sport StartQuarterModal. */
  onConfirm: () => void;
  /** Button label, typically "Ready for Q{nextQuarter}". */
  confirmLabel: string;
  /** Disable gate — server write pending, missing lineup, etc. */
  disabled?: boolean;
  /** Loading state — shows the SFButton spinner. */
  loading?: boolean;
}

export function QuarterKickoffBar({
  onConfirm,
  confirmLabel,
  disabled = false,
  loading = false,
}: QuarterKickoffBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
      <div className="mx-auto max-w-4xl">
        <SFButton
          onClick={onConfirm}
          disabled={disabled}
          loading={loading}
          variant="accent"
          size="lg"
          full
        >
          {confirmLabel}
        </SFButton>
      </div>
    </div>
  );
}
