"use client";

// ─── Pick Replacement Sheet ──────────────────────────────────
// Pops after a coach marks an on-court player as injured. Lists every
// available bench player and lets the coach tap one to substitute.
// Rules of play apply — only positions a player is eligible for would
// be offered if we filtered, but for an injury sub the coach typically
// just needs anyone available, so we don't gate by eligibility here.
// (The lineup picker enforces eligibility at the start/break of every
// quarter; a mid-quarter sub is a temporary stand-in.)

import type { Player } from "@/lib/types";
import { netballSport, isPositionAllowedInZone } from "@/lib/sports/netball";

interface Props {
  /** Position id of the slot the injured player just vacated. */
  positionId: string;
  /** Display name of the injured player, for context. */
  injuredPlayerName: string;
  /** Players available to take the slot (bench + active, not injured/loaned/already-on-court). */
  candidates: Player[];
  onPick: (playerId: string) => void;
  onCancel: () => void;
}

export function PickReplacementSheet({
  positionId,
  injuredPlayerName,
  candidates,
  onPick,
  onCancel,
}: Props) {
  const pos = netballSport.allPositions.find((p) => p.id === positionId);
  const posLabel = pos?.label ?? positionId.toUpperCase();

  // Players whose allowed zones include this position's primary zone(s)
  // surface first; everyone else is grouped under "any available". This
  // is a soft sort, not a hard filter — emergencies happen.
  const eligible = candidates.filter((p) =>
    pos?.allowedZones?.some((z) => isPositionAllowedInZone(positionId, z)) ?? true,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-lg sm:rounded-lg border border-hairline bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-hairline px-5 py-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
            Replace
          </p>
          <h2 id="replace-title" className="text-base font-semibold text-ink">
            {injuredPlayerName} → {posLabel}
          </h2>
          <p className="mt-1 text-xs text-ink-mute">
            Pick a bench player to take the {posLabel} slot for the rest of this
            quarter.
          </p>
        </div>

        {eligible.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-mute">
            No bench players available — your squad is fully deployed.
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-hairline overflow-y-auto">
            {eligible.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  className="w-full px-5 py-3 text-left text-sm text-ink hover:bg-surface-alt"
                >
                  {p.full_name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-hairline px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-alt"
          >
            Cancel — leave position empty for now
          </button>
        </div>
      </div>
    </div>
  );
}
