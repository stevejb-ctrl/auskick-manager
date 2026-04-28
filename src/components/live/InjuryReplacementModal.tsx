"use client";

import type { Player, Zone } from "@/lib/types";
import { ZONE_SHORT_LABELS } from "@/lib/ageGroups";

export interface InjuryReplacementCandidate {
  player: Player;
  /** Total ms this player has been on the field this game (for sort + display). */
  totalMs: number;
}

interface InjuryReplacementModalProps {
  /** The player about to be marked injured (currently on field). */
  injuredPlayer: Player;
  /** Zone they're vacating — shown so the coach knows which spot to fill. */
  zone: Zone;
  /**
   * Bench candidates eligible to take the spot, ALREADY SORTED by ascending
   * totalMs (least played first). The top of the list is rendered as the
   * suggested pick. Pre-sort happens in the caller because totalMs comes from
   * a derivation in LiveGame that the modal shouldn't have to recompute.
   */
  candidates: InjuryReplacementCandidate[];
  onPickReplacement: (replacementId: string) => void;
  /** Mark injured without replacing — leaves the zone short. */
  onSkipReplacement: () => void;
  /** Don't mark injured at all. */
  onCancel: () => void;
}

function formatMinSec(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Shown when a coach taps "Mark injured" on an on-field player. Lets them
 * pick a replacement from the bench so the zone doesn't go a player short.
 * The list is pre-sorted least-played first; the top row is highlighted as
 * the suggested pick (the kid who's owed the most field time).
 */
export function InjuryReplacementModal({
  injuredPlayer,
  zone,
  candidates,
  onPickReplacement,
  onSkipReplacement,
  onCancel,
}: InjuryReplacementModalProps) {
  const firstName = injuredPlayer.full_name.trim().split(/\s+/)[0];
  const zoneLabel = ZONE_SHORT_LABELS[zone];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="injury-replacement-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-lg border border-hairline bg-surface shadow-modal">
        <div className="px-5 pt-5">
          <p className="mb-1 text-center font-mono text-[11px] font-bold uppercase tracking-micro text-danger">
            Marking {firstName} injured
          </p>
          <h2
            id="injury-replacement-title"
            className="mb-1 text-center text-base font-bold text-ink"
          >
            Who comes on at {zoneLabel}?
          </h2>
          <p className="mb-4 text-center text-xs text-ink-dim">
            Pick a player from the bench. Suggested = least field time so far.
          </p>
        </div>

        {/* Candidates list — scrolls if many bench players. */}
        <div className="flex-1 overflow-y-auto px-5 pb-3">
          <ul className="flex flex-col gap-2">
            {candidates.map((c, idx) => {
              const cFirst = c.player.full_name.trim().split(/\s+/)[0];
              const isSuggested = idx === 0;
              return (
                <li key={c.player.id}>
                  <button
                    type="button"
                    onClick={() => onPickReplacement(c.player.id)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors duration-fast ease-out-quart ${
                      isSuggested
                        ? "border-brand-600 bg-brand-50 hover:bg-brand-100"
                        : "border-hairline bg-surface hover:bg-surface-alt"
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-ink">
                          {cFirst}
                          {c.player.jersey_number != null ? ` #${c.player.jersey_number}` : ""}
                        </span>
                        {isSuggested && (
                          <span className="rounded-full bg-brand-600 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-micro text-warm">
                            Suggested
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-ink-dim">
                        Played {formatMinSec(c.totalMs)} this game
                      </span>
                    </span>
                    <span className="ml-3 shrink-0 nums font-mono text-sm font-semibold text-ink">
                      {formatMinSec(c.totalMs)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer actions. */}
        <div className="flex flex-col gap-1 border-t border-hairline px-5 py-3">
          <button
            type="button"
            onClick={onSkipReplacement}
            className="w-full rounded-md border border-hairline py-2 text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
          >
            Mark injured without replacement
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-1.5 text-xs text-ink-mute transition-colors duration-fast ease-out-quart hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
