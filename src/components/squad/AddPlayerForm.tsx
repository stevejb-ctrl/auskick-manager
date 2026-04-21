"use client";

import { useState, useTransition } from "react";
import { addPlayer } from "@/app/(app)/teams/[teamId]/squad/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

interface AddPlayerFormProps {
  teamId: string;
  activeCount: number;
  maxPlayers: number;
  takenJerseys: number[];
}

export function AddPlayerForm({
  teamId,
  activeCount,
  maxPlayers,
  takenJerseys,
}: AddPlayerFormProps) {
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [jerseyError, setJerseyError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isFull = activeCount >= maxPlayers;

  function validate() {
    let valid = true;
    setNameError(undefined);
    setJerseyError(undefined);
    setServerError(null);

    if (!name.trim()) {
      setNameError("Name is required.");
      valid = false;
    }

    const jerseyNum = parseInt(jersey, 10);
    if (!jersey || isNaN(jerseyNum) || jerseyNum < 1 || jerseyNum > 99) {
      setJerseyError("Jersey must be a number 1–99.");
      valid = false;
    } else if (takenJerseys.includes(jerseyNum)) {
      setJerseyError(`#${jerseyNum} is already taken.`);
      valid = false;
    }

    return valid;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    startTransition(async () => {
      const result = await addPlayer(teamId, name.trim(), parseInt(jersey, 10));
      if (!result.success) {
        setServerError(result.error);
      } else {
        setName("");
        setJersey("");
      }
    });
  }

  if (isFull) {
    return (
      <p className="rounded-lg border border-dashed border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
        Squad is full — deactivate a player to make room.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <Label htmlFor="player-name">Player name</Label>
          <Input
            id="player-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sam Smith"
            error={nameError}
            disabled={isPending}
          />
        </div>
        <div className="w-28 space-y-1">
          <Label htmlFor="jersey">Jersey #</Label>
          <Input
            id="jersey"
            type="number"
            min={1}
            max={99}
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
            placeholder="7"
            error={jerseyError}
            disabled={isPending}
          />
        </div>
      </div>

      {serverError && (
        <p className="text-sm text-danger" role="alert">
          {serverError}
        </p>
      )}

      <Button type="submit" loading={isPending} size="sm">
        Add player
      </Button>
    </form>
  );
}
