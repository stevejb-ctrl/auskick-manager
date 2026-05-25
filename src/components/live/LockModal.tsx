"use client";

import type { Player, Zone } from "@/lib/types";
import { ZONE_SHORT_LABELS } from "@/lib/ageGroups";

interface LockModalProps {
  player: Player;
  /** Current lock state for this player. Null when locking isn't supported (e.g. RL). */
  currentLock: "field" | "zone" | null;
  /** The zone the player is currently in (or last played), used for zone-lock label. */
  currentZone: Zone | null;
  /** Whether this player is currently injured. */
  isInjured: boolean;
  /** Whether this player is currently lent to the opposition. */
  isLoaned: boolean;
  /** Total minutes this player has been lent out across the season. */
  seasonLoanMins: number;
  /** Median minutes the squad has been lent out across the season (for context). */
  squadLoanMins: number;
  /**
   * Lock-to-field handler. Omit to hide the button — rugby league
   * doesn't have a "lock to field" concept (positionless, vest-driven),
   * so this is optional. AFL passes a real handler.
   */
  onLockField?: () => void;
  /**
   * Lock-to-zone handler. Hidden automatically when `currentZone` is
   * null (RL) or when omitted.
   */
  onLockZone?: () => void;
  onUnlock: () => void;
  onToggleInjury: () => void;
  onToggleLoan: () => void;
  /**
   * Enter "switch" mode — closes the modal and selects this player so
   * the next tap on another field tile or bench tile completes the
   * swap. Hooks into the existing tap-tap flow in LiveGame so we don't
   * duplicate the swap logic; the modal is just a more discoverable
   * entry point than tap-then-tap-elsewhere.
   */
  onSwitch: () => void;
  /**
   * Sport-specific vest-replace action (RL: FR / DH). When provided,
   * a dedicated "Replace First Receiver" / "Replace Dummy Half"
   * button surfaces above the lock/injure/lend stack. AFL passes
   * nothing here.
   */
  vestReplaceLabel?: string;
  onReplaceVest?: () => void;
  /**
   * Rugby league position override. When supplied, surfaces a
   * "Move to {moveToLabel}" button that flips the player between
   * the forwards and backs buckets without changing field
   * membership. `moveToLabel` is the *destination* (e.g. "Backs"
   * when the player is currently a forward). Hidden when the
   * player isn't on the field.
   */
  moveToLabel?: string;
  onMovePosition?: () => void;
  /**
   * Pre-game vest assignment toggles (rugby league spike picker).
   * When supplied, surfaces "Make/Remove FR" and "Make/Remove DH"
   * buttons that flip vest ownership for this player at kickoff.
   * `isFr` / `isDh` drives the button label so the same handler
   * works for both "make" and "remove". Live game uses
   * `onReplaceVest` instead — these are pre-game only.
   */
  onAssignFr?: () => void;
  onAssignDh?: () => void;
  isFr?: boolean;
  isDh?: boolean;
  /**
   * Pre-game bench toggle. When supplied, surfaces
   * "Bench" (if on field) or "Add to field" (if on bench).
   * Live game uses tap-tap-swap or the next-sub card instead;
   * this is the pre-game spike picker's direct route.
   */
  onToggleBench?: () => void;
  /**
   * `true` when the player is on the field. Drives the bench
   * button label and hides Move/Vest actions that don't apply
   * to bench players.
   */
  isOnField?: boolean;
  onClose: () => void;
}

export function LockModal({
  player,
  currentLock,
  currentZone,
  isInjured,
  isLoaned,
  seasonLoanMins,
  squadLoanMins,
  onLockField,
  onLockZone,
  onUnlock,
  onToggleInjury,
  onToggleLoan,
  onSwitch,
  vestReplaceLabel,
  onReplaceVest,
  moveToLabel,
  onMovePosition,
  onAssignFr,
  onAssignDh,
  isFr,
  isDh,
  onToggleBench,
  isOnField,
  onClose,
}: LockModalProps) {
  const firstName = player.full_name.trim().split(/\s+/)[0];
  const zoneLabel = currentZone ? ZONE_SHORT_LABELS[currentZone] : null;
  const loanedLabel = Math.round(seasonLoanMins);
  const squadLabel = Math.round(squadLoanMins);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-modal-title"
    >
      <div className="w-full max-w-xs rounded-lg border border-hairline bg-surface p-5 shadow-modal">
        <p className="mb-1 text-center font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Player actions
        </p>
        <h2
          id="lock-modal-title"
          className="mb-1 text-center text-base font-bold text-ink"
        >
          {firstName}{player.jersey_number != null ? ` #${player.jersey_number}` : ""}
        </h2>

        {isInjured ? (
          /* Currently injured — offer to mark recovered */
          <>
            <p className="mb-5 text-center text-sm text-ink-dim">
              Injured — sitting on the bench and skipped by the sub
              rotation until they&apos;re recovered.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onToggleInjury}
                className="flex w-full flex-col items-center rounded-md bg-brand-600 px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
              >
                <span className="text-sm font-bold">Mark {firstName} recovered</span>
                <span className="mt-0.5 text-xs opacity-90">
                  Back in the rotation from the next sub
                </span>
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
        ) : isLoaned ? (
          /* Currently loaned — offer to bring back */
          <>
            <p className="mb-5 text-center text-sm text-ink-dim">
              Lent to the opposition. They&apos;re unavailable for subs until
              you bring them back.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onToggleLoan}
                className="flex w-full flex-col items-center rounded-md bg-brand-600 px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
              >
                <span className="text-sm font-bold">Bring {firstName} back</span>
                <span className="mt-0.5 text-xs opacity-90">
                  Returns to the bench, available for the next sub
                </span>
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
        ) : currentLock ? (
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
          /* Unlocked, on the team — offer switch / lock / injure / loan */
          <>
            <p className="mb-4 text-center text-sm text-ink-dim">
              {onLockField || onLockZone
                ? "Switch them out, lock them in place, flag an injury, or lend them to the opposition."
                : "Switch them out, flag an injury, or lend them to the opposition."}
            </p>
            <div className="flex flex-col gap-2">
              {/* Switch — most common quick action, lives at the top.
                  Closes the modal and selects this player so the next
                  tap on a teammate completes the swap (zone-to-zone if
                  field player tapped; sub-on/off if bench player tapped). */}
              <button
                type="button"
                onClick={onSwitch}
                className="flex w-full flex-col items-center rounded-md bg-brand-600 px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
              >
                <span className="text-sm font-bold">Switch player</span>
                <span className="mt-0.5 text-xs opacity-90">
                  {currentZone
                    ? "Tap a teammate to swap zones, or a bench player to sub off"
                    : "Tap a field player to bring them on"}
                </span>
              </button>
              {/* Vest replacement — rugby league only. Sits below
                  Switch because it's the next-most-common action for a
                  vest wearer (FR / DH). The label is supplied by the
                  parent so the same component can read "First Receiver"
                  or "Dummy Half". */}
              {onReplaceVest && vestReplaceLabel && (
                <button
                  type="button"
                  onClick={onReplaceVest}
                  className="flex w-full flex-col items-center rounded-md bg-ink px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-ink/90"
                >
                  <span className="text-sm font-bold">
                    Replace {vestReplaceLabel}
                  </span>
                  <span className="mt-0.5 text-xs opacity-80">
                    Pick a different player to take the vest this period
                  </span>
                </button>
              )}
              {/* RL only — flip between Forwards and Backs without
                  benching. Coach uses this to reshape the field
                  ratio mid-game (e.g. an injury forces a back into
                  the pack, or a forward gets shuffled to wing). */}
              {onMovePosition && moveToLabel && (
                <button
                  type="button"
                  onClick={onMovePosition}
                  className="flex w-full flex-col items-center rounded-md bg-surface-alt px-4 py-3 text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt/80"
                >
                  <span className="text-sm font-bold">
                    Move to {moveToLabel}
                  </span>
                  <span className="mt-0.5 text-xs text-ink-dim">
                    Stays on the field — just switches position
                  </span>
                </button>
              )}
              {/* RL pre-game vest assignment — only surfaced by the
                  formation lineup picker (live game uses Replace
                  instead, above). isOnField gates these because vest
                  wearers have to be on the field at kickoff. */}
              {/* Vest assignments — full-saturation backgrounds and
                  white text so contrast clears WCAG AA at any brand.
                  Earlier draft used `bg-{token}/90 text-warm` which
                  blended 10% of the surface (off-white) into the
                  background; for the cooler brand-600 green that
                  dropped contrast against cream text below 4.5:1.
                  Steve 2026-05-19. */}
              {onAssignFr && isOnField && (
                <button
                  type="button"
                  onClick={onAssignFr}
                  className="flex w-full flex-col items-center rounded-md bg-warn px-4 py-3 text-white transition-colors duration-fast ease-out-quart hover:bg-warn/90"
                >
                  <span className="text-sm font-bold">
                    {isFr ? "Remove First Receiver" : "Make First Receiver"}
                  </span>
                  <span className="mt-0.5 text-xs text-white/90">
                    Wears the FR vest at kickoff
                  </span>
                </button>
              )}
              {onAssignDh && isOnField && (
                <button
                  type="button"
                  onClick={onAssignDh}
                  className="flex w-full flex-col items-center rounded-md bg-brand-700 px-4 py-3 text-white transition-colors duration-fast ease-out-quart hover:bg-brand-600"
                >
                  <span className="text-sm font-bold">
                    {isDh ? "Remove Dummy Half" : "Make Dummy Half"}
                  </span>
                  <span className="mt-0.5 text-xs text-white/90">
                    Wears the DH vest at kickoff
                  </span>
                </button>
              )}
              {/* RL pre-game bench toggle — moves the player between
                  field and bench during lineup picking. Live game
                  uses tap-tap-swap or the next-sub card instead so
                  this is gated on the prop being supplied. */}
              {onToggleBench && (
                <button
                  type="button"
                  onClick={onToggleBench}
                  className="flex w-full flex-col items-center rounded-md border border-hairline px-4 py-3 text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
                >
                  <span className="text-sm font-bold">
                    {isOnField ? "Bench" : "Add to field"}
                  </span>
                  <span className="mt-0.5 text-xs text-ink-dim">
                    {isOnField
                      ? "Moves to the bench"
                      : "Bring this player onto the field"}
                  </span>
                </button>
              )}
              {onLockField && (
                <button
                  type="button"
                  onClick={onLockField}
                  className="flex w-full flex-col items-center rounded-md bg-ink px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-ink/90"
                >
                  <span className="text-sm font-bold">Always on field</span>
                  <span className="mt-0.5 text-xs opacity-80">Never substituted off</span>
                </button>
              )}
              {onLockZone && currentZone && (
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
                onClick={onToggleInjury}
                className="flex w-full flex-col items-center rounded-md bg-danger px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-danger/90"
              >
                <span className="text-sm font-bold">Mark injured</span>
                <span className="mt-0.5 text-xs opacity-90">
                  Moves to the bench and skips the sub rotation
                </span>
              </button>
              <button
                type="button"
                onClick={onToggleLoan}
                className="flex w-full flex-col items-center rounded-md border border-hairline px-4 py-3 text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
              >
                <span className="text-sm font-bold">Lend to opposition</span>
                <span className="mt-0.5 text-center text-xs text-ink-dim">
                  Season total: <span className="font-semibold text-ink">{loanedLabel}m</span>
                  {squadLabel > 0 && (
                    <> · squad avg {squadLabel}m</>
                  )}
                </span>
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
        )}
      </div>
    </div>
  );
}
