"use client";

import { useState, useTransition } from "react";
import {
  updatePlayer,
  deactivatePlayer,
  reactivatePlayer,
} from "@/app/(app)/teams/[teamId]/squad/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import type { Player } from "@/lib/types";

interface PlayerRowProps {
  player: Player;
  teamId: string;
  takenJerseys: number[];
}

export function PlayerRow({ player, teamId, takenJerseys }: PlayerRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.full_name);
  const [jersey, setJersey] = useState(String(player.jersey_number));
  const [nameError, setNameError] = useState<string | undefined>();
  const [jerseyError, setJerseyError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function cancelEdit() {
    setName(player.full_name);
    setJersey(String(player.jersey_number));
    setNameError(undefined);
    setJerseyError(undefined);
    setServerError(null);
    setEditing(false);
  }

  function saveEdit() {
    setNameError(undefined);
    setJerseyError(undefined);
    setServerError(null);

    if (!name.trim()) {
      setNameError("Required.");
      return;
    }

    const jerseyNum = parseInt(jersey, 10);
    if (isNaN(jerseyNum) || jerseyNum < 1 || jerseyNum > 99) {
      setJerseyError("1–99 only.");
      return;
    }

    const otherJerseys = takenJerseys.filter((j) => j !== player.jersey_number);
    if (otherJerseys.includes(jerseyNum)) {
      setJerseyError(`#${jerseyNum} taken.`);
      return;
    }

    startTransition(async () => {
      const result = await updatePlayer(teamId, player.id, {
        full_name: name.trim(),
        jersey_number: jerseyNum,
      });
      if (!result.success) {
        setServerError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  function handleToggle(active: boolean) {
    startTransition(async () => {
      if (active) {
        await reactivatePlayer(teamId, player.id);
      } else {
        await deactivatePlayer(teamId, player.id);
      }
    });
  }

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        !player.is_active ? "opacity-50" : ""
      }`}
    >
      {/* Jersey badge */}
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
        {player.jersey_number}
      </span>

      {editing ? (
        <div className="flex flex-1 flex-wrap items-start gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
            disabled={isPending}
            className="min-w-0 flex-1"
            aria-label="Player name"
          />
          <Input
            type="number"
            min={1}
            max={99}
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
            error={jerseyError}
            disabled={isPending}
            className="w-20"
            aria-label="Jersey number"
          />
          {serverError && (
            <p className="w-full text-xs text-red-600">{serverError}</p>
          )}
          <Button size="sm" loading={isPending} onClick={saveEdit}>
            Save
          </Button>
          <Button size="sm" variant="ghost" disabled={isPending} onClick={cancelEdit}>
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-sm font-medium text-gray-900">
            {player.full_name}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            disabled={isPending}
          >
            Edit
          </Button>
        </>
      )}

      <Toggle
        checked={player.is_active}
        onChange={handleToggle}
        disabled={isPending}
        label={player.is_active ? "Deactivate player" : "Reactivate player"}
      />
    </li>
  );
}
