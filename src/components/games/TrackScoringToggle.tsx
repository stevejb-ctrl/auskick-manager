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

  // Score-shape varies by sport.
  //   - AFL: goals + behinds → "Track goals & behinds"
  //   - Netball: goals only  → "Track goals"
  //   - Rugby League: tries + conversions → "Track points" (the
  //     coach's mental model; surfacing "tries & conversions" was
  //     a mouthful for a toggle).
  // A registry-driven label would be cleaner but isn't worth the
  // client-component cost for three discrete sports.
  const heading =
    sportId === "rugby_league"
      ? "Track points"
      : sportId === "netball"
        ? "Track goals"
        : "Track goals & behinds";

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
    <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div>
        <p className="text-sm font-medium text-ink">{heading}</p>
        <p className="text-xs text-ink-mute">
          When on, the live game screen shows scoring buttons and includes
          scores in the post-game summary.
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
        label="Track scoring"
      />
    </div>
  );
}
