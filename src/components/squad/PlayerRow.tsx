"use client";

import { useState, useTransition } from "react";
import {
  updatePlayer,
  deactivatePlayer,
  reactivatePlayer,
} from "@/app/(app)/teams/[teamId]/squad/actions";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { Guernsey } from "@/components/sf";
import type { Player } from "@/lib/types";
import { PlayerRoleSheet } from "@/components/playbook/PlayerRoleSheet";
import { savePlayerRole } from "@/app/(app)/teams/[teamId]/settings/howWePlayActions";
import { describeRole, EMPTY_ROLE, type PlayerRole, type RoleModel } from "@/lib/playbook/roles";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { MixedGroupPicker } from "@/components/squad/MixedGroupPicker";
import type { MixedGroup } from "@/lib/types";

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
  /** How we play role sheet for this team; null where roles don't apply. */
  roleModel?: RoleModel | null;
  role?: PlayerRole;
  /** A touch or Oztag mixed team: the coach marks who the kid counts as. */
  mixed?: boolean;
}

export function PlayerRow({
  player,
  teamId,
  takenJerseys,
  canEdit,
  showJersey = true,
  roleModel = null,
  role,
  mixed = false,
}: PlayerRowProps) {
  const [group, setGroup] = useState<MixedGroup | null>(player.mixed_group ?? null);
  const [editing, setEditing] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const roleText = roleModel ? describeRole(role, roleModel) : "";
  const [name, setName] = useState(player.full_name);
  const [jersey, setJersey] = useState(player.jersey_number != null ? String(player.jersey_number) : "");
  const [nameError, setNameError] = useState<string | undefined>();
  const [jerseyError, setJerseyError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function cancelEdit() {
    setName(player.full_name);
    setJersey(player.jersey_number != null ? String(player.jersey_number) : "");
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
      });
      if (!result.success) {
        setServerError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  function handleGroup(next: MixedGroup) {
    const before = group;
    setServerError(null);
    setGroup(next);
    startTransition(async () => {
      const result = await updatePlayer(teamId, player.id, { mixed_group: next });
      if (!result.success) {
        setGroup(before);
        setServerError(result.error);
      }
    });
  }

  // A kid in a game that's on now: asked before they're deactivated
  // (UX round 3, 24 Oct 2026). The opponent, while the question is up.
  const [liveGame, setLiveGame] = useState<string | null>(null);

  function handleToggle(active: boolean, confirmLive = false) {
    setServerError(null);
    setLiveGame(null);
    startTransition(async () => {
      // A refusal (e.g. "Squad is full") is shown, not swallowed — the
      // switch flipping back on its own said nothing about why.
      const result = active
        ? await reactivatePlayer(teamId, player.id)
        : await deactivatePlayer(teamId, player.id, confirmLive);
      const live = (result as { liveGame?: string }).liveGame;
      if (!result.success && live) setLiveGame(live);
      else if (!result.success) setServerError(result.error);
    });
  }

  return (
    <li
      data-testid={`player-row-${player.id}`}
      className={`flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 ${
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
          {serverError && (
            <InlineAlert className="w-full">
              {serverError}
            </InlineAlert>
          )}
          <SFButton size="sm" loading={isPending} onClick={saveEdit}>
            Save
          </SFButton>
          <SFButton size="sm" variant="ghost" disabled={isPending} onClick={cancelEdit}>
            Cancel
          </SFButton>
        </div>
      ) : (
        <>
          {/* At least 8.5rem before the buttons wrap under it, and long
              names break inside it (UX round 3, e4: at 320 px the name had
              63 px and "Papadopoulos" ran under the Role button). */}
          <span className="min-w-0 flex-[1_1_8.5rem] text-sm font-medium text-ink [overflow-wrap:anywhere]">
            {player.full_name}
            {roleText && (
              <span className="block truncate text-xs font-normal text-ink-mute" data-testid={`player-role-${player.id}`}>
                {roleText}
              </span>
            )}
          </span>
          {canEdit && roleModel && player.is_active && (
            <SFButton
              size="sm"
              variant="ghost"
              onClick={() => setRoleOpen(true)}
              aria-label={`Role for ${player.full_name}`}
            >
              Role
            </SFButton>
          )}
          {canEdit && (
            <SFButton
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={isPending}
              aria-label={`Edit ${player.full_name}`}
            >
              Edit
            </SFButton>
          )}
        </>
      )}

      {roleOpen && roleModel && (
        <PlayerRoleSheet
          playerName={player.full_name}
          model={roleModel}
          initial={role ?? EMPTY_ROLE}
          onSave={(next) => savePlayerRole(teamId, player.id, next)}
          onClose={() => setRoleOpen(false)}
          teamId={teamId}
        />
      )}

      {/* Only on a mixed team, and only to the coach. */}
      {canEdit && mixed && player.is_active && !editing && (
        <span className="basis-full sm:basis-auto" data-testid={`player-mixed-${player.id}`}>
          <MixedGroupPicker value={group} onChange={handleGroup} disabled={isPending} playerName={player.full_name} />
        </span>
      )}

      {canEdit && (
        <Toggle
          checked={player.is_active}
          onChange={handleToggle}
          disabled={isPending}
          // Named for the kid: every row read "Deactivate player" (UX round 3, e4).
          label={`${player.is_active ? "Deactivate" : "Reactivate"} ${player.full_name}`}
        />
      )}
      {!editing && serverError && (
        <InlineAlert className="basis-full">{serverError}</InlineAlert>
      )}
      {liveGame && (
        <div role="alert" className="basis-full rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-ink">
          <p>
            {player.full_name} is in the game against {liveGame} that&apos;s on now. They&apos;ll stay in that game
            until it&apos;s finished, and be off the squad for the next one.
          </p>
          <div className="mt-2 flex gap-2">
            <SFButton size="sm" variant="danger" onClick={() => handleToggle(false, true)} loading={isPending}>
              Deactivate anyway
            </SFButton>
            <SFButton size="sm" variant="ghost" onClick={() => setLiveGame(null)} disabled={isPending}>
              Keep {player.full_name.trim().split(/\s+/)[0]}
            </SFButton>
          </div>
        </div>
      )}
    </li>
  );
}
