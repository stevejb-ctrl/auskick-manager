"use client";

import { ActionSheet, type ActionSheetAction } from "@/components/ui/ActionSheet";

interface ClockMenuProps {
  /** "Q2" / "H1" — names the sheet and the end action. */
  periodAbbr: string;
  running: boolean;
  onPause: () => void;
  onResume: () => void;
  /** Opens the end-early confirm. Omit when ending isn't allowed. */
  onEndEarly?: () => void;
  onClose: () => void;
}

/**
 * What tapping the clock pill opens, in every sport (UX plan H5): pause
 * or resume, and end the period now. Ending early used to need a pause
 * and then a ~20 px chip that only existed while paused; here it's a
 * ≥ 44 pt row, still behind the existing confirm.
 */
export function ClockMenu({
  periodAbbr,
  running,
  onPause,
  onResume,
  onEndEarly,
  onClose,
}: ClockMenuProps) {
  const actions: ActionSheetAction[] = [
    running
      ? {
          id: "pause",
          label: "Pause clock",
          description: "For a stoppage, like an injury.",
          onSelect: onPause,
        }
      : { id: "resume", label: "Resume clock", onSelect: onResume },
  ];
  if (onEndEarly) {
    actions.push({
      id: "end",
      label: `End ${periodAbbr} now`,
      description: "When the siren beats the app's clock.",
      tone: "danger",
      onSelect: onEndEarly,
    });
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
