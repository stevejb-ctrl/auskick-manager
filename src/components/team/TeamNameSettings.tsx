"use client";

import { useState, useTransition } from "react";
import { renameTeam } from "@/app/(app)/teams/[teamId]/settings/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface TeamNameSettingsProps {
  teamId: string;
  currentName: string;
  isAdmin: boolean;
}

export function TeamNameSettings({ teamId, currentName, isAdmin }: TeamNameSettingsProps) {
  const [name, setName] = useState(currentName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name can't be empty.");
      return;
    }
    if (trimmed === currentName) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await renameTeam(teamId, trimmed);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4 shadow-card">
      <h2 className="text-base font-semibold text-ink">Team name</h2>
      <p className="mt-1 text-sm text-ink-dim">
        Shown in the scorebug, lists, and anywhere else the team appears.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          disabled={!isAdmin || isPending}
          maxLength={80}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          onClick={submit}
          disabled={!isAdmin || name.trim() === currentName}
          loading={isPending}
          size="md"
        >
          Save
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {saved && !error && (
        <p className="mt-2 text-xs text-ok">Saved.</p>
      )}
      {!isAdmin && (
        <p className="mt-2 text-xs text-ink-mute">Only admins can rename the team.</p>
      )}
    </section>
  );
}
