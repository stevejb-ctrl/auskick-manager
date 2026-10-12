"use client";

import { useState, useTransition } from "react";
import { createGame, updateGame } from "@/app/(app)/teams/[teamId]/games/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { AgeGroupConfig } from "@/lib/sports/types";

interface CreateGameFormProps {
  teamId: string;
  ageGroup: AgeGroupConfig;
  onCancel?: () => void;
  /** Passed through to createGame — see its `afterCreate` doc. */
  afterCreate?: "open-game" | "stay";
  /** Called after a successful create when `afterCreate` is "stay", or after an edit. */
  onCreated?: () => void;
  /**
   * Edit an existing game instead of creating one (the game hub's
   * More → Edit details). Prefills the form and saves via updateGame.
   */
  existingGame?: {
    id: string;
    opponent: string;
    scheduled_at: string;
    location: string | null;
    round_number: number | null;
    notes: string | null;
  };
}

/** ISO timestamp → the local "YYYY-MM-DDTHH:mm" a datetime-local input wants. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateGameForm({
  teamId,
  ageGroup,
  onCancel,
  afterCreate = "open-game",
  onCreated,
  existingGame,
}: CreateGameFormProps) {
  const cfg = ageGroup;
  const [opponent, setOpponent] = useState(existingGame?.opponent ?? "");
  const [scheduledAt, setScheduledAt] = useState(
    existingGame ? toLocalInputValue(existingGame.scheduled_at) : "",
  );
  const [location, setLocation] = useState(existingGame?.location ?? "");
  const [round, setRound] = useState(
    existingGame?.round_number != null ? String(existingGame.round_number) : "",
  );
  const [notes, setNotes] = useState(existingGame?.notes ?? "");
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
      if (existingGame) {
        const result = await updateGame(teamId, existingGame.id, {
          opponent: opponent.trim(),
          scheduled_at: new Date(scheduledAt).toISOString(),
          location: location.trim() || null,
          round_number: roundNum,
          notes: notes.trim() || null,
        });
        if (!result.success) setServerError(result.error);
        else onCreated?.();
        return;
      }
      const result = await createGame(teamId, {
        opponent,
        scheduled_at: new Date(scheduledAt).toISOString(),
        location: location || null,
        round_number: roundNum,
        notes: notes || null,
        on_field_size: cfg.defaultOnFieldSize,
      }, afterCreate);
      if (result && !result.success) {
        setServerError(result.error);
      } else if (result?.success) {
        onCreated?.();
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
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink shadow-card placeholder:text-ink-mute focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-ink-mute"
        />
      </div>

      {serverError && (
        <p className="text-sm text-danger" role="alert">
          {serverError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" loading={isPending} size="sm">
          {existingGame ? "Save changes" : "Create game"}
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
