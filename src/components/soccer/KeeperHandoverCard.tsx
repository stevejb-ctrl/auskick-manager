"use client";

// ─── KeeperHandoverCard ──────────────────────────────────────
// Who goes in goal for the coming period, on the shared
// RoleHandoverCard (league's vest card draws on the same one). At the
// break it reads as the keeper's gear changing hands, "Keeper top: Sam
// → Mia" (hockey's "Keeper kit"); before kick-off it names the first
// keeper. Replace opens a picker of the kids who can go in, the
// suggestion marked. The pick edits the plan on screen; the period's
// Start commits it (no event is written here).

import { useState } from "react";
import type { Player } from "@/lib/types";
import { shortName } from "@/lib/names";
import { RoleHandoverCard } from "@/components/quarter-break/RoleHandoverCard";

interface KeeperHandoverCardProps {
  /** The period word and number the keeper is for ("half", 2). */
  periodWord: string;
  period: number;
  /** What changes hands, in the sport's words ("Keeper top", "Keeper kit"). */
  gear: string;
  /** Last period's keeper (null before kick-off). */
  from: Player | null;
  /** The planned keeper. */
  to: Player | null;
  /** Kids who can go in: here, fit and not lent. */
  candidates: Player[];
  /** The suggester's pick, marked in the picker. */
  suggestedId: string | null;
  /** How the keeper is chosen, in a line. */
  strategyNote: string;
  onPick: (playerId: string) => void;
  pending?: boolean;
}

function firstName(p: Player): string {
  return shortName(p.full_name);
}

/** The keeper badge: a small ink "GK" chip (the keeper is ink everywhere). */
function KeeperBadge() {
  return (
    <span className="inline-flex h-5 items-center rounded-xs bg-ink px-1.5 font-mono text-nano font-bold uppercase tracking-micro text-warm">
      GK
    </span>
  );
}

export function KeeperHandoverCard({
  periodWord,
  period,
  gear,
  from,
  to,
  candidates,
  suggestedId,
  strategyNote,
  onPick,
  pending = false,
}: KeeperHandoverCardProps) {
  const [picking, setPicking] = useState(false);
  const handover =
    from && to
      ? from.id === to.id
        ? `${firstName(to)} stays in goal.`
        : `${gear}: ${firstName(from)} → ${firstName(to)}`
      : to
        ? `${firstName(to)} starts in goal.`
        : "Nobody is in goal yet.";

  return (
    <RoleHandoverCard
      ariaLabel="Keeper"
      title="Keeper"
      subtitle={`${handover} ${strategyNote}`}
      rows={[
        {
          key: "gk",
          badge: <KeeperBadge />,
          holder: to,
          picking: picking || !to,
          heading: `Keeper for ${periodWord} ${period}`,
          emptyText: "Nobody here can go in goal.",
          candidates: candidates.map((player) => ({ player, suggested: player.id === suggestedId })),
          pending,
          onReplace: () => setPicking(true),
          onCancel: to && picking ? () => setPicking(false) : undefined,
          onPick: (pid) => {
            setPicking(false);
            onPick(pid);
          },
        },
      ]}
    />
  );
}
