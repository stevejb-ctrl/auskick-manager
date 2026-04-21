"use client";

import { useState, useTransition } from "react";
import { addFillIn } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
          className="text-sm font-semibold text-brand-700 transition-colors duration-fast ease-out-quart hover:text-brand-800"
        >
          + Add fill-in player
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-hairline bg-surface-alt px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Fill-in name"
          disabled={isPending}
          autoFocus
          className="min-w-0 flex-1"
        />
        <Input
          type="number"
          inputMode="numeric"
          value={jersey}
          onChange={(e) => setJersey(e.target.value)}
          placeholder="#"
          min={0}
          disabled={isPending}
          className="w-16 tabular-nums"
        />
        <Button
          type="button"
          onClick={submit}
          loading={isPending}
          size="sm"
        >
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
