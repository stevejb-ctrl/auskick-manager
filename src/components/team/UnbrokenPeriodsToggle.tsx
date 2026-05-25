"use client";

// ─── UnbrokenPeriodsToggle ────────────────────────────────────
// Rugby-league-only team setting. Toggles whether the sub-rotation
// planner enforces Junior League §6's "each player must play an
// unbroken quarter / half" rule.
//
// Off by default — many casual competitions don't enforce §6
// strictly, and coach UX is simpler without the constraint. Teams
// whose league does enforce it flip this once and every game for
// that team will plan with the rule in mind.
//
// Mirrors MidQuarterSubsToggle in structure:
//   - same card layout + Toggle primitive
//   - optimistic flip with server rollback on error
//   - admin-only (parent viewers can't change team settings)

import { useState, useTransition } from "react";
import { setEnforceUnbrokenPeriods } from "@/app/(app)/teams/[teamId]/games/actions";
import { Toggle } from "@/components/ui/Toggle";

interface UnbrokenPeriodsToggleProps {
  teamId: string;
  initialEnabled: boolean;
  isAdmin?: boolean;
}

export function UnbrokenPeriodsToggle({
  teamId,
  initialEnabled,
  isAdmin = false,
}: UnbrokenPeriodsToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    if (!isAdmin) return;
    setError(null);
    setEnabled(next);
    startTransition(async () => {
      const result = await setEnforceUnbrokenPeriods(teamId, next);
      if (!result.success) {
        // Rollback the optimistic flip if the server rejects.
        setEnabled(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          Enforce unbroken periods
        </p>
        <p className="mt-0.5 text-xs text-ink-mute">
          Junior League §6: each player must play at least{" "}
          <strong className="text-ink">two full unbroken quarters</strong>{" "}
          (U6–U9) or{" "}
          <strong className="text-ink">one full unbroken half</strong>{" "}
          (U10–U12) each game — without being subbed out during that period.
          When on, the sub-rotation planner avoids breaking a player's
          unbroken run. Off by default.
        </p>
        {error && (
          <p
            className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
      <Toggle
        checked={enabled}
        onChange={handleChange}
        disabled={isPending || !isAdmin}
        label="Enforce unbroken periods"
      />
    </div>
  );
}
