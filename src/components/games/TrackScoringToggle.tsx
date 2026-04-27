"use client";

import { useState, useTransition } from "react";
import { setTrackScoring } from "@/app/(app)/teams/[teamId]/games/actions";
import { Toggle } from "@/components/ui/Toggle";
import type { Sport } from "@/lib/types";

interface TrackScoringToggleProps {
  teamId: string;
  initialEnabled: boolean;
  isAdmin?: boolean;
  /**
   * Sport drives the toggle label. AFL has goals + behinds, netball is
   * goals-only; without this prop the label always reads "goals & behinds"
   * which is wrong for any non-AFL team.
   */
  sportId?: Sport;
}

export function TrackScoringToggle({
  teamId,
  initialEnabled,
  isAdmin = false,
  sportId = "afl",
}: TrackScoringToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Score-shape varies by sport. Net `scoreTypes` would be cleaner but
  // forcing a registry import into a client component for one string
  // isn't worth it for two sports — branch inline and revisit when rugby
  // lands and we have try/conv/pen/dropGoal to surface.
  const heading =
    sportId === "netball" ? "Track goals" : "Track goals & behinds";

  function handleChange(next: boolean) {
    if (!isAdmin) return;
    setError(null);
    setEnabled(next);
    startTransition(async () => {
      const result = await setTrackScoring(teamId, next);
      if (!result.success) {
        setEnabled(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 shadow-card">
      <div>
        <p className="text-sm font-medium text-ink">{heading}</p>
        <p className="text-xs text-ink-mute">
          When on, the live game screen shows scoring buttons and includes
          scores in the post-game summary.
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <Toggle
        checked={enabled}
        onChange={handleChange}
        disabled={isPending || !isAdmin}
        label="Track scoring"
      />
    </div>
  );
}
