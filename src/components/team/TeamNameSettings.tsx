"use client";

import { useState, useTransition } from "react";
import { renameTeam } from "@/app/(app)/teams/[teamId]/settings/actions";

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
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Team name</h2>
      <p className="mt-1 text-sm text-gray-500">
        Shown in the scorebug, lists, and anywhere else the team appears.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          disabled={!isAdmin || isPending}
          maxLength={80}
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!isAdmin || isPending || name.trim() === currentName}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && !error && (
        <p className="mt-2 text-xs text-green-700">Saved.</p>
      )}
      {!isAdmin && (
        <p className="mt-2 text-xs text-gray-500">Only admins can rename the team.</p>
      )}
    </section>
  );
}
