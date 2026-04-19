"use client";

import { useState, useTransition } from "react";
import { createGame } from "@/app/(app)/teams/[teamId]/games/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { AGE_GROUPS } from "@/lib/ageGroups";
import type { AgeGroup } from "@/lib/types";

interface CreateGameFormProps {
  teamId: string;
  ageGroup: AgeGroup;
  onCancel?: () => void;
}

export function CreateGameForm({ teamId, ageGroup, onCancel }: CreateGameFormProps) {
  const cfg = AGE_GROUPS[ageGroup];
  const [opponent, setOpponent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");
  const [round, setRound] = useState("");
  const [notes, setNotes] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (!opponent.trim()) {
      setServerError("Opponent is required.");
      return;
    }
    if (!scheduledAt) {
      setServerError("Date and time are required.");
      return;
    }

    const roundNum = round ? parseInt(round, 10) : null;
    if (round && (isNaN(roundNum!) || roundNum! < 1 || roundNum! > 30)) {
      setServerError("Round must be between 1 and 30.");
      return;
    }

    startTransition(async () => {
      const result = await createGame(teamId, {
        opponent,
        scheduled_at: new Date(scheduledAt).toISOString(),
        location: location || null,
        round_number: roundNum,
        notes: notes || null,
        on_field_size: cfg.defaultOnFieldSize,
      });
      if (result && !result.success) {
        setServerError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="opponent">Opponent</Label>
        <Input
          id="opponent"
          type="text"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="e.g. Merewether Magpies"
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-1">
          <Label htmlFor="scheduled-at">Date &amp; time</Label>
          <Input
            id="scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="sm:w-24 space-y-1">
          <Label htmlFor="round">Round</Label>
          <Input
            id="round"
            type="number"
            min={1}
            max={30}
            value={round}
            onChange={(e) => setRound(e.target.value)}
            placeholder="1"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. No. 1 Sportsground"
          disabled={isPending}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything parents should know"
          disabled={isPending}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500"
        />
      </div>

      {serverError && (
        <p className="text-sm text-red-600" role="alert">
          {serverError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" loading={isPending} size="sm">
          Create game
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
