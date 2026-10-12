"use client";

// ─── RotationModeToggle ──────────────────────────────────────
// Shared three-mode segmented toggle used at the top of both AFL
// and netball quarter breaks to pick HOW the next quarter's lineup
// is built:
//
//   - Suggested: run the fairness rebalancer for the next quarter
//     (the default — what coaches who don't micromanage want).
//   - Keep:      carry the current lineup forward unchanged. Useful
//     when the rotation already feels right and the coach just
//     wants to keep playing.
//   - Manual:    clear the court entirely, park the candidate pool
//     on the bench, and let the coach build the lineup themselves
//     position-by-position.
//
// Renders the shared 44 pt SegmentedControl (UX plan Phase 6); the
// selected mode is the checked radio.
//
// Both sports persist "Suggested" and "Manual" choices to the live
// store so the same mode survives across Q-breaks, while "Keep" is
// a per-Q decision that doesn't round-trip through the store. The
// shell doesn't enforce that — the caller's `onChange` handler
// decides what to persist (mirrors how the two sports differ
// today: AFL inlines `setPersistedRotationMode`, netball wraps it
// in `handleModeChange`).
//
// Steve 2026-05-15: Phase 4a of the netball-parity shell refactor.
// Six button declarations × two sports collapse to one source of
// truth; future copy / styling tweaks now land in one place.

import { SegmentedControl } from "@/components/ui/SegmentedControl";

// "rotate" (AFL only for now) shifts everyone one line each break —
// see lib/live/rotateLines. Netball/league don't offer it yet, so they
// render the default three and never emit it.
export type RotationMode = "suggested" | "keep" | "manual" | "rotate";

interface ModeOption {
  value: RotationMode;
  label: string;
}

interface RotationModeToggleProps {
  mode: RotationMode;
  onChange: (next: RotationMode) => void;
  /**
   * Which modes to show. Defaults to Suggested / Keep / Set manually.
   * AFL passes an extended list that includes "Rotate lines".
   */
  options?: ModeOption[];
  /** Optional disable gate for the entire toggle (e.g. while a server write is pending). */
  disabled?: boolean;
}

const DEFAULT_OPTIONS: ModeOption[] = [
  { value: "suggested", label: "Suggested" },
  { value: "keep", label: "Keep last quarter" },
  { value: "manual", label: "Set manually" },
];

export function RotationModeToggle({
  mode,
  onChange,
  options = DEFAULT_OPTIONS,
  disabled = false,
}: RotationModeToggleProps) {
  return (
    <SegmentedControl
      className="mt-2"
      label="How the next lineup is built"
      options={options.map((o) => ({ id: o.value, label: o.label }))}
      value={mode}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
