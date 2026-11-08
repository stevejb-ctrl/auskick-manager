"use client";

// ─── PlanNextChip ────────────────────────────────────────────
// The Plan Q{n+1} chip at the right end of the live v3 info line, in
// the period's last sub window: tap it to plan the next period's lineup
// before the break. Once a plan is pinned it reads "Q3 ready ✓", with
// Clear beside it. AFL's (Phase 6) and netball's (Phase 7) info lines
// carry the same chip; the test ids are the planner's
// (plan-next-period-entry, planned-next-period-badge, plan-next-clear).

export interface PlanNextChipProps {
  /** The next period, short: "Q3". */
  next: string;
  /** A plan is pinned for it. */
  ready: boolean;
  /** "Plan Q3" / "Edit Q3 plan": the planner's name for it. */
  label: string;
  onOpen: () => void;
  onClear: () => void;
}

export function PlanNextChip({ next, ready, label, onOpen, onClear }: PlanNextChipProps) {
  if (ready) {
    return (
      <span
        data-testid="planned-next-period-badge"
        className="flex flex-none items-center gap-[4px] rounded-[11px] py-[2px] pl-[10px] pr-[4px] text-brand-700 shadow-[inset_0_0_0_1.5px_currentColor]"
      >
        <button
          type="button"
          data-testid="plan-next-period-entry"
          onClick={onOpen}
          aria-label={`${next} ready. ${label}`}
          className="min-h-[32px] font-display text-[0.78125rem] font-extrabold"
        >
          {next} ready ✓
        </button>
        <button
          type="button"
          data-testid="plan-next-clear"
          onClick={onClear}
          className="inline-flex min-h-[32px] items-center px-[6px] font-display text-[0.75rem] font-extrabold underline underline-offset-2"
        >
          Clear
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      data-testid="plan-next-period-entry"
      onClick={onOpen}
      className="inline-flex min-h-[36px] flex-none items-center rounded-[11px] px-[10px] font-display text-[0.78125rem] font-extrabold text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] hover:bg-surface-alt"
    >
      {label}
    </button>
  );
}
