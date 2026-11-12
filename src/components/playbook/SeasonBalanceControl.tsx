"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { BalanceUnit, SeasonBalanceSetting } from "@/lib/playbook/types";

const OPTIONS: { id: SeasonBalanceSetting; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "light", label: "Light" },
  { id: "balanced", label: "Balanced" },
  { id: "strong", label: "Strong" },
];

const UNIT_WORD: Record<BalanceUnit, string> = {
  zone: "zone",
  line: "line",
  third: "third",
  bib: "position",
  position: "position",
};

interface SeasonBalanceControlProps {
  unit: BalanceUnit;
  value: SeasonBalanceSetting;
  since: string | null;
  disabled?: boolean;
  /** Hide the reset (the wizard: a new team has no season yet). */
  showReset?: boolean;
  onChange: (next: SeasonBalanceSetting) => void;
  onReset: () => void;
}

/**
 * Season balance, the core rule (UX plan §7.5): evens out each kid's
 * time in each zone / line / third / position across the season, at a
 * strength the coach picks. Resettable from now on, e.g. after grading.
 */
export function SeasonBalanceControl({
  unit,
  value,
  since,
  disabled = false,
  showReset = true,
  onChange,
  onReset,
}: SeasonBalanceControlProps) {
  const [confirming, setConfirming] = useState(false);
  const word = UNIT_WORD[unit];
  const sinceLabel = since
    ? new Date(since).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <p className="text-sm font-semibold text-ink">Season balance</p>
      <p className="mt-0.5 text-xs text-ink-dim">
        Evens out each player&apos;s time in each {word} across the season. It decides where
        kids play, never how much.
      </p>
      <SegmentedControl
        className="mt-3"
        label="Season balance"
        options={OPTIONS}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
      {showReset && value !== "off" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-mute">
          <span>{sinceLabel ? `Counting games since ${sinceLabel}` : "Counting every game this season"}</span>
          {/* Says the history stays: a coach wouldn't press it in case it
              wiped the stats (Stagehand round 7, 28 Oct 2026). */}
          {!disabled && confirming && (
            <span data-testid="season-balance-reset-note" className="w-full text-ink-dim">
              Balance counts from today. Past games and their stats stay as they are.
            </span>
          )}
          {!disabled &&
            (confirming ? (
              <span className="flex items-center gap-1">
                <span className="text-ink-dim">Start counting from now?</span>
                <button
                  type="button"
                  className="min-h-[44px] px-2 font-semibold text-brand-600 hover:text-brand-700"
                  onClick={() => {
                    setConfirming(false);
                    onReset();
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="min-h-[44px] px-2 font-semibold text-ink-dim hover:text-ink"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="min-h-[44px] font-semibold text-brand-600 hover:text-brand-700"
                onClick={() => setConfirming(true)}
              >
                Reset season balance
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
