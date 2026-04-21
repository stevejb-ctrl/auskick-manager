"use client";

import { useState, useTransition } from "react";
import { setTrackScoring } from "@/app/(app)/teams/[teamId]/games/actions";
import { Toggle } from "@/components/ui/Toggle";

interface TrackScoringToggleProps {
  teamId: string;
  initialEnabled: boolean;
  isAdmin?: boolean;
}

export function TrackScoringToggle({
  teamId,
  initialEnabled,
  isAdmin = false,
}: TrackScoringToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div>
        <p className="text-sm font-medium text-gray-800">
          Track goals &amp; behinds
        </p>
        <p className="text-xs text-gray-500">
          When on, the live game screen shows scoring buttons and includes
          scores in the post-game summary.
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
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
