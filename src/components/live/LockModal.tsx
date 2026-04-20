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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-modal-title"
    >
      <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-2xl">
        <p className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
          Player lock
        </p>
        <h2
          id="lock-modal-title"
          className="mb-1 text-center text-base font-bold text-gray-900"
        >
          {firstName} #{player.jersey_number}
        </h2>

        {currentLock ? (
          /* Already locked — just offer unlock */
          <>
            <p className="mb-5 text-center text-sm text-gray-500">
              {currentLock === "field"
                ? "Always on field — never subbed off."
                : `Locked to ${zoneLabel ?? "position"} — subs back to this zone only.`}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onUnlock}
                className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Unlock player
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-sm text-gray-400 transition-colors hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          /* Not locked — offer two lock types */
          <>
            <p className="mb-4 text-center text-sm text-gray-500">
              How would you like to lock this player?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onLockField}
                className="flex w-full flex-col items-center rounded-lg bg-indigo-600 px-4 py-3 text-white transition-colors hover:bg-indigo-700"
              >
                <span className="text-sm font-bold">Always on field</span>
                <span className="mt-0.5 text-xs opacity-80">Never substituted off</span>
              </button>
              {currentZone && (
                <button
                  type="button"
                  onClick={onLockZone}
                  className="flex w-full flex-col items-center rounded-lg bg-amber-500 px-4 py-3 text-white transition-colors hover:bg-amber-600"
                >
                  <span className="text-sm font-bold">Lock to {zoneLabel}</span>
                  <span className="mt-0.5 text-xs opacity-80">
                    Can sub on/off but only to this position
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-sm text-gray-400 transition-colors hover:text-gray-600"
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
