"use client";

// ─── TrackZoneTimeToggle ──────────────────────────────────────
// Rugby team setting. Toggles whether every live-game
// LeaguePlayerTile renders the AFL-style F/C/B stacked time bar.
//
// Rugby has no native "centre" zone — the field splits into
// forwards and backs only — so the bar maps:
//   * Forwards-zone time → forwards segment
//   * Backs-zone time    → backs segment
//   * Time wearing a vest (league's FR or DH) → centre segment
//
// Where no vest is worn (union, league U6–U7) it's forwards and
// backs only, and the copy says so. Teams that don't keep players to
// a line can leave this off and avoid visual noise on their tiles.
//
// Mirrors UnbrokenPeriodsToggle / MidQuarterSubsToggle:
//   - same card layout + Toggle primitive
//   - optimistic flip with server rollback on error
//   - admin-only (parent viewers can't change team settings)

import { useState, useTransition } from "react";
import { setTrackZoneTime } from "@/app/(app)/teams/[teamId]/games/actions";
import { Toggle } from "@/components/ui/Toggle";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface TrackZoneTimeToggleProps {
  teamId: string;
  initialEnabled: boolean;
  isAdmin?: boolean;
  /** The vest the centre segment counts, or null where none is worn. */
  centreVest: string | null;
}

export function TrackZoneTimeToggle({
  teamId,
  initialEnabled,
  isAdmin = false,
  centreVest,
}: TrackZoneTimeToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    if (!isAdmin) return;
    setError(null);
    setEnabled(next);
    startTransition(async () => {
      const result = await setTrackZoneTime(teamId, next);
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
          Track forward and back time
        </p>
        {centreVest ? (
          <p className="mt-0.5 text-xs text-ink-mute">
            Adds a stacked bar to every player tile showing the share
            of game time spent in{" "}
            <strong className="text-ink">forwards</strong>,{" "}
            <strong className="text-ink">centre</strong> (time wearing{" "}
            {centreVest}) and <strong className="text-ink">backs</strong>. Useful
            for teams that rotate the vest as a real position. Off by default.
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-ink-mute">
            Adds a stacked bar to every player tile showing the share
            of game time spent in{" "}
            <strong className="text-ink">forwards</strong> and{" "}
            <strong className="text-ink">backs</strong>. Useful for teams
            that keep players to a line. Off by default.
          </p>
        )}
        {error && (
          <InlineAlert className="mt-2">
            {error}
          </InlineAlert>
        )}
      </div>
      <Toggle
        checked={enabled}
        onChange={handleChange}
        disabled={isPending || !isAdmin}
        label="Track forward and back time"
      />
    </div>
  );
}
