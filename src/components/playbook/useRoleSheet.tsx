"use client";

import { useState, type ReactNode } from "react";
import { PlayerRoleSheet } from "@/components/playbook/PlayerRoleSheet";
import { savePlayerRole } from "@/app/(app)/teams/[teamId]/settings/howWePlayActions";
import { EMPTY_ROLE, type PlayerRole, type RoleModel } from "@/lib/playbook/roles";

/** What a lineup needs to offer the role sheet: the team's role model and saved roles. */
export interface RoleSheetConfig {
  model: RoleModel;
  roles: Record<string, PlayerRole>;
}

/**
 * The player role sheet on a game-day lineup (UX plan 3.5), shared by
 * the AFL, netball and league pickers so the long-press feels the same
 * in every sport. `open` is undefined when roles can't be edited here
 * (no How we play roles, or a runner/manager link without a team id),
 * so callers can pass it straight through as an optional handler.
 */
export function useRoleSheet(
  config: RoleSheetConfig | undefined,
  teamId: string | null,
  nameOf: (playerId: string) => string | undefined,
): {
  open: ((playerId: string) => void) | undefined;
  sheet: ReactNode;
  /** Saved roles, updated as the sheet saves (tiles show keep-on). */
  roles: Record<string, PlayerRole>;
} {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roles, setRoles] = useState<Record<string, PlayerRole>>(config?.roles ?? {});
  if (!config || !teamId) return { open: undefined, sheet: null, roles: config?.roles ?? {} };

  const sheet = playerId ? (
    <PlayerRoleSheet
      playerName={nameOf(playerId) ?? "Player"}
      model={config.model}
      initial={roles[playerId] ?? EMPTY_ROLE}
      onSave={async (next) => {
        const res = await savePlayerRole(teamId, playerId, next);
        if (res.success) setRoles((r) => ({ ...r, [playerId]: next }));
        return res;
      }}
      onClose={() => setPlayerId(null)}
    />
  ) : null;
  return { open: setPlayerId, sheet, roles };
}
