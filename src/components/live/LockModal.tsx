"use client";

import type { Player, Zone } from "@/lib/types";
import { ZONE_SHORT_LABELS } from "@/lib/ageGroups";

interface LockModalProps {
  player: Player;
  /** Current lock state for this player. */
  currentLock: "field" | "zone" | null;
  /** The zone the player is currently in (or last played), used for zone-lock label. */
  currentZone: Zone | null;
  onLockField: () => void;
  onLockZone: () => void;
  onUnlock: () => void;
  onClose: () => void;
}

export function LockModal({
  player,
  currentLock,
  currentZone,
  onLockField,
  onLockZone,
  onUnlock,
  onClose,
}: LockModalProps) {
  const firstName = player.full_name.trim().split(/\s+/)[0];
  const zoneLabel = currentZone ? ZONE_SHORT_LABELS[currentZone] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-modal-title"
    >
      <div className="w-full max-w-xs rounded-lg border border-hairline bg-surface p-5 shadow-modal">
        <p className="mb-1 text-center font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Player lock
        </p>
        <h2
          id="lock-modal-title"
          className="mb-1 text-center text-base font-bold text-ink"
        >
          {firstName} #{player.jersey_number}
        </h2>

        {currentLock ? (
          /* Already locked — just offer unlock */
          <>
            <p className="mb-5 text-center text-sm text-ink-dim">
              {currentLock === "field"
                ? "Always on field — never subbed off."
                : `Locked to ${zoneLabel ?? "position"} — subs back to this zone only.`}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onUnlock}
                className="w-full rounded-md border border-hairline py-2.5 text-sm font-semibold text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
              >
                Unlock player
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-sm text-ink-mute transition-colors duration-fast ease-out-quart hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          /* Not locked — offer two lock types */
          <>
            <p className="mb-4 text-center text-sm text-ink-dim">
              How would you like to lock this player?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onLockField}
                className="flex w-full flex-col items-center rounded-md bg-ink px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-ink/90"
              >
                <span className="text-sm font-bold">Always on field</span>
                <span className="mt-0.5 text-xs opacity-80">Never substituted off</span>
              </button>
              {currentZone && (
                <button
                  type="button"
                  onClick={onLockZone}
                  className="flex w-full flex-col items-center rounded-md bg-warn px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-warn/90"
                >
                  <span className="text-sm font-bold">Lock to {zoneLabel}</span>
                  <span className="mt-0.5 text-xs opacity-90">
                    Can sub on/off but only to this position
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-sm text-ink-mute transition-colors duration-fast ease-out-quart hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
