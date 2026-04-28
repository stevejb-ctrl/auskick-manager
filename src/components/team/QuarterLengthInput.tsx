"use client";

// ─── Quarter Length Input ────────────────────────────────────
// Small editable card for a coach to override their team's quarter
// duration. Shown for netball teams in both the setup wizard's
// "How we play" step and the team settings page. Empty = use the
// age-group default; any positive integer (1–30 min) overrides.
//
// Persists via setQuarterLengthSeconds server action. The input is
// in MINUTES because that's what coaches think in; the action
// converts to seconds.

import { useState, useTransition } from "react";
import { setQuarterLengthSeconds } from "@/app/(app)/teams/[teamId]/games/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

interface Props {
  teamId: string;
  /** Default quarter length in seconds for the team's age group. */
  ageGroupDefaultSeconds: number;
  /** Current override in seconds, or null to use the default. */
  initialOverrideSeconds: number | null;
  /** Whether the current user can edit (admins only typically). */
  isAdmin?: boolean;
}

export function QuarterLengthInput({
  teamId,
  ageGroupDefaultSeconds,
  initialOverrideSeconds,
  isAdmin = true,
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
    if (!Number.isInteger(next) || next < 1 || next > 30) {
      setError("Quarter length must be a whole number between 1 and 30.");
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
    <div className="rounded-lg border border-hairline bg-surface px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[10rem]">
          <Label htmlFor={`quarter-length-${teamId}`}>
            Quarter length (minutes)
          </Label>
          <Input
            id={`quarter-length-${teamId}`}
            type="number"
            min={1}
            max={30}
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
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              loading={isPending}
            >
              Save
            </Button>
            {usingOverride && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetToDefault}
                disabled={isPending}
              >
                Use default
              </Button>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
