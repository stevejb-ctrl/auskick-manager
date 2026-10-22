"use client";

// ─── GirlsTryToggle ──────────────────────────────────────────
// Oztag's setting card on the team Settings page, for a mixed team: a
// girl's try counts 2 (ITF rule 4.3), on by default. Whether junior
// mixed comps apply it is unconfirmed, so a competition that doesn't
// turns it off here.
//
// Mirrors TrackFoulsToggle and TrackScoringToggle: the same card, the
// same Toggle primitive, the same optimistic-with-rollback save.

import { useState, useTransition } from "react";
import { setTeamGirlsTryDouble } from "@/app/(app)/teams/[teamId]/settings/actions";
import { Toggle } from "@/components/ui/Toggle";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface GirlsTryToggleProps {
  teamId: string;
  initialEnabled: boolean;
  isAdmin?: boolean;
}

export function GirlsTryToggle({ teamId, initialEnabled, isAdmin = false }: GirlsTryToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    if (!isAdmin) return;
    setError(null);
    setEnabled(next);
    startTransition(async () => {
      const result = await setTeamGirlsTryDouble(teamId, next);
      if (!result.success) {
        setEnabled(!next);
        setError(result.error ?? "Couldn't save.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div>
        <p className="text-sm font-medium text-ink">A girl&apos;s try counts 2</p>
        <p className="text-xs text-ink-mute">
          The ITF rule for mixed games. A try you credit to a girl counts 2, and the opponent gets a{" "}
          <strong className="text-ink">+2 (girl)</strong> button. Turn it off if your competition doesn&apos;t play it.
        </p>
        {error && <InlineAlert className="mt-2">{error}</InlineAlert>}
      </div>
      <Toggle checked={enabled} onChange={handleChange} disabled={isPending || !isAdmin} label="A girl's try counts 2" />
    </div>
  );
}
