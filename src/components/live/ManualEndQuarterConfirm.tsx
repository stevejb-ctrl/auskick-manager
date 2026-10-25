"use client";

// ─── ManualEndQuarterConfirm ─────────────────────────────────
// Shared "End {period} now?" confirmation, used by every sport.
//
// The coach ends a period from the clock menu when the real game's
// end beat the app's clock, or when the game played on while the clock
// sat paused, or (basketball, touch) taps the clock at 0:00. It shows
// how much of the period the clock saw: the main button credits that,
// and "The game played on: credit the full 20:00" is the explicit second
// choice. Confirming used to credit everyone the whole period whatever
// the clock said, so a half ended 6 s in gave every kid on the court 20
// phantom minutes (round 3, 24 Oct 2026).
//
// Every word comes from the sport (src/lib/sports/words.ts): its
// surface ("everyone on the court"), its end cue ("when the whistle
// beats the app's clock") and the period word, for the clock as it
// stands. It used to say "even though the clock is paused" while the
// clock ran, and started lowercase where a sport passed "on-field"
// (ten-sport UX audit, 23 Oct 2026).
//
// Backdrop tap dismisses (non-destructive). Confirm runs the
// caller's `onConfirm` then closes via `onCancel` (caller-owned —
// keeps the state machine in the parent).

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { getSportConfig } from "@/lib/sports/registry";
import type { SportId } from "@/lib/sports/types";
import { endPeriodEarlyCopy, type EndEarlyClock } from "@/lib/sports/words";

interface ManualEndQuarterConfirmProps {
  /** Period number being ended, interpolated into the heading + button. */
  quarter: number;
  /**
   * Tapped on "End {abbr}{n}" (credit the time played: `full` false) or
   * "The game played on: credit the full …" (`full` true).
   */
  onConfirm: (full: boolean) => void;
  /** Tapped on Cancel or the backdrop — closes the modal without side effects. */
  onCancel: () => void;
  /** The team's sport: its surface and end cue word the explainer. */
  sport: SportId;
  /** Where the clock stands: running, paused, or at the hooter (0:00). */
  clock: EndEarlyClock;
  /**
   * The age group's period word. Defaults to the sport's own (league
   * U10+ and a team that picks halves or quarters pass theirs).
   */
  periodLabel?: "quarter" | "half" | "period";
  /** Game ms the clock has seen this period. */
  elapsedMs: number;
  /** The period's full length, in game ms. */
  periodMs: number;
}

export function ManualEndQuarterConfirm({
  quarter,
  onConfirm,
  onCancel,
  sport,
  clock,
  periodLabel,
  elapsedMs,
  periodMs,
}: ManualEndQuarterConfirmProps) {
  const copy = endPeriodEarlyCopy({
    sport,
    periodLabel: periodLabel ?? getSportConfig(sport).periodLabel,
    period: quarter,
    clock,
    elapsedMs,
    periodMs,
  });
  return (
    <Modal label={copy.title} onClose={onCancel}>
        <p className="text-center text-sm font-semibold text-ink">
          {copy.title}
        </p>
        <p className="mt-2 text-center text-xs text-ink-mute">{copy.body}</p>
        <div className="mt-4 flex gap-2">
          {/* Primary (brand green), not danger — ending a quarter is a
              routine every-game action, and red implied something would
              be destroyed. The consequence copy above keeps it safe.
              UX review #14, Steve 2026-07-08. */}
          <Button
            className="flex-1"
            variant="primary"
            onClick={() => onConfirm(false)}
          >
            {copy.confirm}
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
        {copy.confirmFull && (
          <Button className="mt-2 w-full" variant="secondary" onClick={() => onConfirm(true)}>
            {copy.confirmFull}
          </Button>
        )}
      </Modal>
  );
}
