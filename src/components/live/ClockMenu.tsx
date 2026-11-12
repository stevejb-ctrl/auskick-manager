"use client";

import { ActionSheet, type ActionSheetAction } from "@/components/ui/ActionSheet";
import { clockEndEarlyHint } from "@/lib/sports/words";
import type { SportId } from "@/lib/sports/types";

interface ClockMenuProps {
  /** The team's sport: its end cue names when to end early ("whistle"). */
  sport: SportId;
  /** "Q2" / "H1" — names the sheet and the end action. */
  periodAbbr: string;
  running: boolean;
  onPause: () => void;
  onResume: () => void;
  /** Opens the end-early confirm. Omit when ending isn't allowed. */
  onEndEarly?: () => void;
  onClose: () => void;
  /**
   * Live v3 (AFL's shell): the time left, "7:40". The sheet then reads
   * as the v3 clock sheet: "Q2 CLOCK" over "Running · 7:40 left", and
   * Pause (or Resume) is its one filled row.
   */
  remaining?: string;
}

/**
 * What tapping the clock pill opens, in every sport (UX plan H5): pause
 * or resume, and end the period now. Ending early used to need a pause
 * and then a ~20 px chip that only existed while paused; here it's a
 * ≥ 44 pt row, still behind the existing confirm.
 */
export function ClockMenu({
  sport,
  periodAbbr,
  running,
  onPause,
  onResume,
  onEndEarly,
  onClose,
  remaining,
}: ClockMenuProps) {
  const v3 = remaining !== undefined;
  const actions: ActionSheetAction[] = [
    running
      ? {
          id: "pause",
          label: "Pause clock",
          description: "For a stoppage, like an injury.",
          onSelect: onPause,
          tone: v3 ? "ink" : undefined,
        }
      : {
          id: "resume",
          label: "Resume clock",
          description: v3 ? `Picks up from ${remaining}.` : undefined,
          onSelect: onResume,
          tone: v3 ? "oval" : undefined,
        },
  ];
  if (onEndEarly) {
    // Default tone, not danger: ending a period is a routine
    // every-game action (its confirm went green for the same reason,
    // Steve 2026-07-08) and the helper line already carries the
    // caution. Red stays reserved for destructive rows like Restart
    // game (UI polish audit §6).
    actions.push({
      id: "end",
      label: `End ${periodAbbr} now`,
      description: clockEndEarlyHint(sport),
      onSelect: onEndEarly,
    });
  }
  if (v3) {
    return (
      <ActionSheet
        eyebrow={`${periodAbbr} clock`}
        label={`${periodAbbr} clock`}
        title={`${running ? "Running" : "Paused"} · ${remaining} left`}
        actions={actions}
        onClose={onClose}
      />
    );
  }
  return (
    <ActionSheet
      title={`${periodAbbr} clock`}
      subtitle={running ? "Running" : "Paused"}
      actions={actions}
      onClose={onClose}
    />
  );
}
