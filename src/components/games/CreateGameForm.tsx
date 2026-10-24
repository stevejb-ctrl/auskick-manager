"use client";

import { useEffect, useState, useTransition } from "react";
import { createGame, updateGame } from "@/app/(app)/teams/[teamId]/games/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { gameDateError, gameDateRange, opponentIsTeam, toLocalInputValue } from "@/lib/games/gameDates";

interface CreateGameFormProps {
  teamId: string;
  onCancel?: () => void;
  /** Passed through to createGame — see its `afterCreate` doc. */
  afterCreate?: "open-game" | "stay";
  /** Called after a successful create when `afterCreate` is "stay", or after an edit. */
  onCreated?: () => void;
  /** The team's name: an opponent with the same name gets a warning. */
  teamName?: string;
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

export function CreateGameForm({
  teamId,
  onCancel,
  afterCreate = "open-game",
  onCreated,
  existingGame,
  teamName,
}: CreateGameFormProps) {
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
  // The browser stops a typo'd year too; an old game's own date stays
  // pickable. Set after mount: "now" differs between server and client.
  const [dateRange, setDateRange] = useState<{ min?: string; max?: string }>({});
  useEffect(() => {
    const range = gameDateRange();
    if (existingGame) {
      const own = toLocalInputValue(existingGame.scheduled_at);
      if (own < range.min) range.min = own;
      if (own > range.max) range.max = own;
    }
    setDateRange(range);
  }, [existingGame]);
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
    // A typo'd year (9999) was accepted. An existing game keeps its own
    // date even if it's old now; only a changed one is checked.
    const dateChanged = !existingGame || toLocalInputValue(existingGame.scheduled_at) !== scheduledAt;
    const dateError = dateChanged ? gameDateError(new Date(scheduledAt).toISOString()) : null;
    if (dateError) {
      setServerError(dateError);
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
        // The size comes from the team (its own, else its age group's).
      }, afterCreate);
      if (result && !result.success) {
        setServerError(result.error);
      } else if (result?.success) {
        onCreated?.();
      }
    });
  }

  return (
    // noValidate: our checks say why in words ("more than 18 months away");
    // min/max still grey out the picker's far-off dates.
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="opponent">Opponent</Label>
        <Input
          id="opponent"
          type="text"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="e.g. Merewether Magpies"
          disabled={isPending}
          aria-describedby={opponentIsTeam(opponent, teamName) ? "opponent-same-name" : undefined}
        />
        {/* A warning, not a block: same-name clubs from two suburbs meet. */}
        {opponentIsTeam(opponent, teamName) && (
          <p id="opponent-same-name" className="text-xs text-warn" aria-live="polite">
            That&apos;s your team&apos;s name too. Add their suburb or club so the score reads clearly.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-1">
          <Label htmlFor="scheduled-at">Date &amp; time</Label>
          <Input
            id="scheduled-at"
            type="datetime-local"
            {...dateRange}
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
