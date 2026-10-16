"use client";

// ─── Quarter Length Input ────────────────────────────────────
// Small editable card for a coach to override their team's period
// (quarter or half) length, on team settings for every sport (the
// setup wizard sets it on its Basics step). The age-group default =
// no override; any whole number of minutes (1–60) overrides.
//
// Persists via setQuarterLengthSeconds server action. The input is
// in MINUTES because that's what coaches think in; the action
// converts to seconds.

import { useState, useTransition } from "react";
import { setQuarterLengthSeconds } from "@/app/(app)/teams/[teamId]/games/actions";
import { PERIOD_MINUTES_MAX } from "@/lib/games/newGameDefaults";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface Props {
  teamId: string;
  /** Default quarter length in seconds for the team's age group. */
  ageGroupDefaultSeconds: number;
  /** Current override in seconds, or null to use the default. */
  initialOverrideSeconds: number | null;
  /** Whether the current user can edit (admins only typically). */
  isAdmin?: boolean;
  /** "Half" for sports that play halves (rugby league U10+). */
  periodWord?: "Quarter" | "Half";
}

export function QuarterLengthInput({
  teamId,
  ageGroupDefaultSeconds,
  initialOverrideSeconds,
  isAdmin = true,
  periodWord = "Quarter",
}: Props) {
  const initialMinutes =
    (initialOverrideSeconds ?? ageGroupDefaultSeconds) / 60;
  const [minutes, setMinutes] = useState<string>(String(initialMinutes));
  const [usingOverride, setUsingOverride] = useState<boolean>(
    initialOverrideSeconds !== null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ageGroupMinutes = ageGroupDefaultSeconds / 60;

  function handleSave() {
    if (!isAdmin) return;
    setError(null);
    const next = parseInt(minutes, 10);
    if (!Number.isInteger(next) || next < 1 || next > PERIOD_MINUTES_MAX) {
      setError(`${periodWord} length must be a whole number between 1 and ${PERIOD_MINUTES_MAX}.`);
      return;
    }
    const overrideSeconds = next === ageGroupMinutes ? null : next * 60;
    startTransition(async () => {
      const r = await setQuarterLengthSeconds(teamId, overrideSeconds);
      if (!r.success) setError(r.error);
      else setUsingOverride(overrideSeconds !== null);
    });
  }

  function handleResetToDefault() {
    if (!isAdmin) return;
    setError(null);
    setMinutes(String(ageGroupMinutes));
    startTransition(async () => {
      const r = await setQuarterLengthSeconds(teamId, null);
      if (!r.success) setError(r.error);
      else setUsingOverride(false);
    });
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[10rem]">
          <Label htmlFor={`quarter-length-${teamId}`}>
            {periodWord} length (minutes)
          </Label>
          <Input
            id={`quarter-length-${teamId}`}
            type="number"
            min={1}
            max={PERIOD_MINUTES_MAX}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            disabled={!isAdmin || isPending}
          />
          <p className="mt-1 text-xs text-ink-mute">
            {usingOverride
              ? `Custom override (age-group default is ${ageGroupMinutes} min). `
              : `Using the age-group default (${ageGroupMinutes} min). `}
            Junior leagues vary widely — set whatever your league plays.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <SFButton
              type="button"
              size="sm"
              onClick={handleSave}
              loading={isPending}
            >
              Save
            </SFButton>
            {usingOverride && (
              <SFButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetToDefault}
                disabled={isPending}
              >
                Use default
              </SFButton>
            )}
          </div>
        )}
      </div>
      {error && (
        <InlineAlert className="mt-2">
          {error}
        </InlineAlert>
      )}
    </div>
  );
}
