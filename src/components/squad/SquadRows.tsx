"use client";

import { useState } from "react";
import { PlayerRow } from "@/components/squad/PlayerRow";
import { Eyebrow, SFCard } from "@/components/sf";
import type { PlayerRole, RoleModel } from "@/lib/playbook/roles";
import type { Player } from "@/lib/types";

interface SquadRowsProps {
  players: Player[];
  teamId: string;
  takenJerseys: number[];
  isAdmin: boolean;
  showJersey: boolean;
  roleModel: RoleModel | null;
  roles: Record<string, PlayerRole>;
  mixed: boolean;
}

// ─── The squad's two lists ───────────────────────────────────
// A kid switched off (or back on) stays where they were, muted, until
// the coach leaves the page. Moving them to the other list on save
// slid every row below up under the coach's thumb, so the next tap
// could land on the wrong kid (usability pass, 26 Oct 2026). Kids
// added on this visit go by whether they're active.
export function SquadRows({ players, teamId, takenJerseys, isAdmin, showJersey, roleModel, roles, mixed }: SquadRowsProps) {
  const [placed] = useState(() => new Map(players.map((p) => [p.id, p.is_active])));
  const inActiveList = (p: Player) => placed.get(p.id) ?? p.is_active;
  const activeList = players.filter(inActiveList);
  const inactiveList = players.filter((p) => !inActiveList(p));
  const activeCount = players.filter((p) => p.is_active).length;
  const inactiveCount = players.length - activeCount;

  const row = (player: Player) => (
    <PlayerRow
      key={player.id}
      player={player}
      teamId={teamId}
      takenJerseys={takenJerseys}
      canEdit={isAdmin}
      showJersey={showJersey}
      roleModel={roleModel}
      role={roles[player.id]}
      mixed={mixed}
    />
  );

  return (
    <>
      <SFCard pad={0}>
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-5">
          <Eyebrow>On the squad</Eyebrow>
          <span className="font-mono text-micro font-bold uppercase tracking-[0.1em] text-ink-mute">
            {activeCount} active
          </span>
        </div>
        {activeList.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-mute">
            No players yet — add your first player above.
          </p>
        ) : (
          <ul className="divide-y divide-hairline" data-testid="squad-active-list">
            {activeList.map(row)}
          </ul>
        )}
      </SFCard>

      {inactiveList.length > 0 && (
        <SFCard pad={0}>
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-5">
            <Eyebrow>Inactive</Eyebrow>
            <span className="font-mono text-micro font-bold uppercase tracking-[0.1em] text-ink-mute">
              {inactiveCount}
            </span>
          </div>
          <ul className="divide-y divide-hairline" data-testid="squad-inactive-list">
            {inactiveList.map(row)}
          </ul>
        </SFCard>
      )}
    </>
  );
}
