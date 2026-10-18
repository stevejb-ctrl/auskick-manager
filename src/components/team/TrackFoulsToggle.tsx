"use client";

// ─── TrackFoulsToggle ─────────────────────────────────────────
// Basketball's setting card on the team Settings page: the coach's foul
// tally on the live screen (a Foul button on the player's dock, a count
// on each tile, foul trouble in the sub suggestions, a foul-out at five).
// The default is the age group's: off at U8–U10, on from U12.
//
// Mirrors MidQuarterSubsToggle and TrackScoringToggle: the same card,
// the same Toggle primitive, the same optimistic-with-rollback save.

import { useState, useTransition } from "react";
import { setTeamTrackFouls } from "@/app/(app)/teams/[teamId]/settings/actions";
import { Toggle } from "@/components/ui/Toggle";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface TrackFoulsToggleProps {
  teamId: string;
  initialEnabled: boolean;
  isAdmin?: boolean;
}

export function TrackFoulsToggle({ teamId, initialEnabled, isAdmin = false }: TrackFoulsToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    if (!isAdmin) return;
    setError(null);
    setEnabled(next);
    startTransition(async () => {
      const result = await setTeamTrackFouls(teamId, next);
      if (!result.success) {
        setEnabled(!next);
        setError(result.error ?? "Couldn't save.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div>
        <p className="text-sm font-medium text-ink">Track fouls</p>
        <p className="text-xs text-ink-mute">
          A <strong className="text-ink">Foul</strong> button on the player&apos;s dock and a count on each tile. Siren
          rests a kid one foul short of fouling out, and five fouls takes them out for the game.
        </p>
        {error && <InlineAlert className="mt-2">{error}</InlineAlert>}
      </div>
      <Toggle checked={enabled} onChange={handleChange} disabled={isPending || !isAdmin} label="Track fouls" />
    </div>
  );
}
