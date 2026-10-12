"use client";

import { useState, useTransition } from "react";
import { setTeamAgeGroup } from "@/app/(app)/teams/[teamId]/settings/actions";
import { SFButton } from "@/components/sf";
import { Label } from "@/components/ui/Label";

interface AgeGroupSettingsProps {
  teamId: string;
  current: string;
  options: { id: string; label: string; notes?: string }[];
  isAdmin: boolean;
}

/**
 * Team › Season › Age group. It was set once in the wizard and could
 * never change (UX plan H7) — a team moving up mid-year, or a coach who
 * picked the wrong age, was stuck.
 */
export function AgeGroupSettings({ teamId, current, options, isAdmin }: AgeGroupSettingsProps) {
  const [value, setValue] = useState(current);
  const [saved, setSaved] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const notes = options.find((o) => o.id === value)?.notes;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setTeamAgeGroup(teamId, value);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSaved(value);
    });
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <Label htmlFor="team-age-group">Age group</Label>
      <div className="mt-1 flex gap-2">
        <select
          id="team-age-group"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!isAdmin || isPending}
          className="h-11 min-w-0 flex-1 rounded-md border border-hairline bg-surface px-2 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {isAdmin && (
          <SFButton
            variant="ghost"
            size="md"
            onClick={save}
            disabled={value === saved}
            loading={isPending}
            aria-label="Save age group"
          >
            Save
          </SFButton>
        )}
      </div>
      {notes && <p className="mt-1.5 text-xs text-ink-mute">{notes}</p>}
      <p className="mt-1 text-xs text-ink-mute">
        Sets the default on-field size, period length and rotation rules for new games.
      </p>
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
