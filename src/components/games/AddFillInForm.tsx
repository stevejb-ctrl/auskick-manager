"use client";

import { useState, useTransition } from "react";
import { addFillIn } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import type { LiveAuth } from "@/lib/types";

interface AddFillInFormProps {
  auth: LiveAuth;
  gameId: string;
}

export function AddFillInForm({ auth, gameId }: AddFillInFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setJersey("");
    setError(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    const num = jersey.trim() === "" ? null : Number(jersey);
    if (num !== null && (!Number.isInteger(num) || num < 0)) {
      setError("Number must be a positive integer.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addFillIn(auth, gameId, {
        full_name: trimmed,
        jersey_number: num,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      reset();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          + Add fill-in player
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Fill-in name"
          disabled={isPending}
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <input
          type="number"
          inputMode="numeric"
          value={jersey}
          onChange={(e) => setJersey(e.target.value)}
          placeholder="#"
          min={0}
          disabled={isPending}
          className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
        />
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={isPending}
          className="rounded-md px-2 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
