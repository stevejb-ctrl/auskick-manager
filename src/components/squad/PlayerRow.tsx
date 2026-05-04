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
import { Guernsey } from "@/components/sf";
import { ChipPicker } from "@/components/squad/ChipPicker";
import { CHIP_COLORS, type ChipKey } from "@/lib/chips";
import type { Player } from "@/lib/types";

interface PlayerRowProps {
  player: Player;
  teamId: string;
  takenJerseys: number[];
  canEdit: boolean;
  /**
   * AFL teams use jersey numbers; netball doesn't. When false, the
   * jersey badge and edit input both disappear so coaches don't see a
   * field they're never going to use. Defaults true to preserve AFL
   * behaviour.
   */
  showJersey?: boolean;
  /** Optional team-defined labels for chip A/B/C — drives the edit picker. */
  chipLabels?: { a: string | null; b: string | null; c: string | null };
}

export function PlayerRow({
  player,
  teamId,
  takenJerseys,
  canEdit,
  showJersey = true,
  chipLabels,
}: PlayerRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.full_name);
  const [jersey, setJersey] = useState(player.jersey_number != null ? String(player.jersey_number) : "");
  const [chip, setChip] = useState<ChipKey | "">(
    (player.chip ?? "") as ChipKey | "",
  );
  const [nameError, setNameError] = useState<string | undefined>();
  const [jerseyError, setJerseyError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function cancelEdit() {
    setName(player.full_name);
    setJersey(player.jersey_number != null ? String(player.jersey_number) : "");
    setChip((player.chip ?? "") as ChipKey | "");
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

    const jerseyNum = jersey.trim() === "" ? null : parseInt(jersey, 10);
    if (jerseyNum !== null && (isNaN(jerseyNum) || jerseyNum < 1 || jerseyNum > 99)) {
      setJerseyError("1–99 only.");
      return;
    }

    if (jerseyNum !== null) {
      const otherJerseys = takenJerseys.filter((j) => j !== player.jersey_number);
      if (otherJerseys.includes(jerseyNum)) {
        setJerseyError(`#${jerseyNum} taken.`);
        return;
      }
    }

    startTransition(async () => {
      const result = await updatePlayer(teamId, player.id, {
        full_name: name.trim(),
        jersey_number: jerseyNum,
        chip: chip === "" ? null : chip,
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
      data-testid={`player-row-${player.id}`}
      className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${
        !player.is_active ? "opacity-50" : ""
      }`}
    >
      {/* Jersey badge — Guernsey SVG t-shirt with the player number printed
          on it. Neutral surface-alt + mute ink when no number is recorded.
          Hidden entirely for sports that don't use jersey numbers (netball). */}
      {showJersey && (
        player.jersey_number != null ? (
          <Guernsey num={player.jersey_number} size={36} />
        ) : (
          <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-alt font-mono text-sm font-bold text-ink-mute">
            —
          </span>
        )
      )}

      {editing && canEdit ? (
        <div className="flex flex-1 flex-wrap items-start gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
            disabled={isPending}
            className="min-w-0 flex-1"
            aria-label="Player name"
          />
          {showJersey && (
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
          )}
          {chipLabels &&
            (chipLabels.a || chipLabels.b || chipLabels.c) && (
              <div className="basis-full">
                <ChipPicker
                  value={chip}
                  onChange={setChip}
                  labels={chipLabels}
                  disabled={isPending}
                />
              </div>
            )}
          {serverError && (
            <p className="w-full text-xs text-danger">{serverError}</p>
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
          <span className="flex-1 text-sm font-medium text-ink">
            {player.chip && (
              <span
                aria-hidden
                title={
                  chipLabels?.[player.chip as ChipKey] ?? `Chip ${player.chip.toUpperCase()}`
                }
                className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${
                  CHIP_COLORS[player.chip as ChipKey].dot
                }`}
              />
            )}
            {player.full_name}
          </span>
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={isPending}
            >
              Edit
            </Button>
          )}
        </>
      )}

      {canEdit && (
        <Toggle
          checked={player.is_active}
          onChange={handleToggle}
          disabled={isPending}
          label={player.is_active ? "Deactivate player" : "Reactivate player"}
        />
      )}
    </li>
  );
}
