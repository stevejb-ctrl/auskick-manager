"use client";

import { useState, useTransition } from "react";
import { setTrackScoring } from "@/app/(app)/teams/[teamId]/games/actions";
import { Toggle } from "@/components/ui/Toggle";
import type { Sport } from "@/lib/types";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface TrackScoringToggleProps {
  teamId: string;
  initialEnabled: boolean;
  isAdmin?: boolean;
  /** The team's sport: it names what the scoreboard tracks. */
  sportId: Sport;
}

// Score-shape varies by sport. League says "points": "tries &
// conversions" was a mouthful for a toggle.
const SCORING_HEADING: Record<Sport, string> = {
  afl: "Track goals & behinds",
  netball: "Track goals",
  rugby_league: "Track points",
};

export function TrackScoringToggle({
  teamId,
  initialEnabled,
  isAdmin = false,
  sportId,
}: TrackScoringToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const heading = SCORING_HEADING[sportId];

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
          <InlineAlert className="mt-2">
            {error}
          </InlineAlert>
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
