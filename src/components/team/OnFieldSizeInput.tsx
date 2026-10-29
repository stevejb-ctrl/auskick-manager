"use client";

// ─── Players on the field ────────────────────────────────────
// Team › Season: the team's competition's on-field size. Competitions
// differ by state (junior union plays 10, 12 or 15 a side at U10), so
// a coach sets theirs once and every new game starts from it, and so do
// the games already scheduled that were on the old size (the card says
// so before and after saving: UX round 2, 24 Oct 2026). The choices are
// the age group's range; the age group's own size means "use the
// default". A game can still change it on the day.
//
// Sits beside QuarterLengthInput and shares its card shape.

import { useState, useTransition } from "react";
import { setTeamOnFieldSize } from "@/app/(app)/teams/[teamId]/settings/actions";
import { SFButton } from "@/components/sf";
import { Label } from "@/components/ui/Label";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { playersOnSurfaceLabel } from "@/lib/sports/words";
import type { SportId } from "@/lib/sports/types";

interface Props {
  teamId: string;
  /** The team's sport: "Players on the court" for netball, futsal and basketball. */
  sport: SportId;
  /** The age group's default, fewest and most players on the field. */
  ageGroupDefault: number;
  min: number;
  max: number;
  /** The team's own size, or null to use the age group's. */
  initialSize: number | null;
  /** Games already scheduled on the team's current size: a save moves them too. */
  scheduledGames?: number;
  isAdmin?: boolean;
}

export function OnFieldSizeInput({ teamId, sport, ageGroupDefault, min, max, initialSize, scheduledGames = 0, isAdmin = true }: Props) {
  const [size, setSize] = useState<number>(initialSize ?? ageGroupDefault);
  // What's on the server, so Save shows only for a change.
  const [savedSize, setSavedSize] = useState<number>(initialSize ?? ageGroupDefault);
  const [usingOverride, setUsingOverride] = useState<boolean>(initialSize !== null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Scheduled games the last save moved to the new size.
  const [moved, setMoved] = useState(0);
  const [isPending, startTransition] = useTransition();

  const options: number[] = [];
  for (let n = min; n <= max; n++) options.push(n);

  function save(next: number | null) {
    if (!isAdmin) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await setTeamOnFieldSize(teamId, next);
      if (!r.success) {
        setError(r.error);
        return;
      }
      setUsingOverride(next !== null && next !== ageGroupDefault);
      setSavedSize(next ?? ageGroupDefault);
      setMoved(r.data?.scheduled ?? 0);
      setSaved(true);
    });
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1">
          <Label htmlFor={`on-field-size-${teamId}`}>{playersOnSurfaceLabel(sport)}</Label>
          <select
            id={`on-field-size-${teamId}`}
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setSaved(false);
            }}
            disabled={!isAdmin || isPending}
            className="h-10 w-full rounded-md border border-hairline bg-surface px-2 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
          >
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
                {n === ageGroupDefault ? " (age-group default)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-mute">
            {usingOverride
              ? `Your competition's size (age-group default is ${ageGroupDefault}). `
              : `Using the age-group default (${ageGroupDefault}). `}
            Competitions differ by state: set what yours plays. A game can still change it on the day.
            {scheduledGames > 0 &&
              ` Saving also changes the ${scheduledGames === 1 ? "game" : `${scheduledGames} games`} already scheduled.`}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {/* Save appears with a change, not as a standing button. */}
            {(size !== savedSize || isPending) && (
              <SFButton type="button" size="sm" onClick={() => save(size)} loading={isPending}>
                Save
              </SFButton>
            )}
            {usingOverride && (
              <SFButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSize(ageGroupDefault);
                  save(null);
                }}
                disabled={isPending}
              >
                Use default
              </SFButton>
            )}
          </div>
        )}
      </div>
      {saved && !error && (
        <p role="status" className="mt-2 text-xs text-ok">
          {moved > 0
            ? `Saved. New games start with ${size} on the field, and so ${moved === 1 ? "does the game" : `do the ${moved} games`} already scheduled.`
            : `Saved. New games start with ${size} on the field.`}
        </p>
      )}
      {error && <InlineAlert className="mt-2">{error}</InlineAlert>}
    </div>
  );
}
