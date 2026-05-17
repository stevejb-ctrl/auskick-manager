"use client";

// ─── MidQuarterSubsToggle ─────────────────────────────────────
// Netball-only setting card on the team Settings page. Toggles
// whether the long-press → actions menu surfaces a "Switch player"
// affordance for mid-quarter substitutions.
//
// Default OFF. Netball is overwhelmingly a "subs at the break"
// sport — junior leagues universally play it that way and the AGA
// rule book formalises it as part of the game. But a fraction of
// teams (Open / mixed / experimental coaches) do use rolling subs
// mid-quarter, so we keep the underlying mechanic wired and just
// hide its entry point unless the team opts in.
//
// The actual mid-Q sub flow already exists in
// `src/components/netball/NetballLiveGame.tsx` — `midQuarterSubs`
// state machine + `NetballPlayerActions.onSwitch` + the
// `PickReplacementSheet` for picking the bench player. This card
// flips the team-level boolean that gates whether `onSwitch` is
// wired through.
//
// Mirrors `TrackScoringToggle.tsx` — same card layout, same
// Toggle primitive, same optimistic-with-rollback pattern.

import { useState, useTransition } from "react";
import { setAllowMidQuarterSubs } from "@/app/(app)/teams/[teamId]/games/actions";
import { Toggle } from "@/components/ui/Toggle";

interface MidQuarterSubsToggleProps {
  teamId: string;
  initialEnabled: boolean;
  isAdmin?: boolean;
}

export function MidQuarterSubsToggle({
  teamId,
  initialEnabled,
  isAdmin = false,
}: MidQuarterSubsToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    if (!isAdmin) return;
    setError(null);
    setEnabled(next);
    startTransition(async () => {
      const result = await setAllowMidQuarterSubs(teamId, next);
      if (!result.success) {
        // Rollback optimistic flip if server rejects.
        setEnabled(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div>
        <p className="text-sm font-medium text-ink">Allow mid-quarter subs</p>
        <p className="text-xs text-ink-mute">
          When on, long-pressing a player on court surfaces a{" "}
          <strong className="text-ink">Switch player</strong> action so
          you can sub a bench player in without waiting for the
          break. Off by default — most netball is played with subs
          at the break only.
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
        label="Allow mid-quarter subs"
      />
    </div>
  );
}
