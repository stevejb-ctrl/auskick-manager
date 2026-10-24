"use client";

import { useState, type ReactNode } from "react";
import type { Player, Zone } from "@/lib/types";
import { ZONE_SHORT_LABELS } from "@/lib/ageGroups";
import { Modal } from "@/components/ui/Modal";

interface LockModalProps {
  player: Player;
  /** Current lock state for this player. Null when locking isn't supported (e.g. RL). */
  currentLock: "field" | "zone" | null;
  /** The zone the player is currently in (or last played), used for zone-lock label. */
  currentZone?: Zone | null;
  /**
   * The sport's own line or spot the kid is in now ("Guards", "GS"), for
   * sports whose spots aren't AFL zones: an on-field kid's Switch line
   * then says to tap a teammate to swap places.
   */
  currentLine?: string | null;
  /** Whether this player is currently injured. */
  isInjured: boolean;
  /** Whether this player is currently lent to the opposition. */
  isLoaned: boolean;
  /**
   * Total minutes this player has been lent out across the season. Omit
   * when the sport doesn't count loan time: Lend then says what it does
   * rather than "Season total: 0m".
   */
  seasonLoanMins?: number;
  /** Median minutes the squad has been lent out across the season (for context). */
  squadLoanMins?: number;
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
  /**
   * The zone lock in the sport's own words, in place of the AFL zone's
   * short label: netball's "GS next break" makes "Keep in GS next
   * break". Shows the button without an AFL `currentZone`.
   */
  zoneLabel?: string;
  /** The line under Keep in … (default: subs back to this position only). */
  lockZoneHint?: string;
  /** What a locked kid's sheet says, in the sport's words. */
  lockedNote?: string;
  onUnlock: () => void;
  /** Omitted before kickoff: there's nothing to injure or lend yet. */
  onToggleInjury?: () => void;
  onToggleLoan?: () => void;
  /**
   * Enter "switch" mode — closes the modal and selects this player so
   * the next tap on another field tile or bench tile completes the
   * swap. Hooks into the existing tap-tap flow in LiveGame so we don't
   * duplicate the swap logic; the modal is just a more discoverable
   * entry point than tap-then-tap-elsewhere. Omit to hide it (netball
   * without mid-quarter subs, or a kid on the bench).
   */
  onSwitch?: () => void;
  /** The line under Switch player, when the sport's switch works differently. */
  switchHint?: string;
  /**
   * Sport-specific vest-replace action (RL: FR / DH). When provided,
   * a dedicated "Replace First Receiver" / "Replace Dummy Half"
   * button surfaces above the lock/injure/lend stack. AFL passes
   * nothing here.
   */
  vestReplaceLabel?: string;
  onReplaceVest?: () => void;
  /**
   * The line under the replace button. Defaults to league's vest
   * words; soccer's keeper passes its own.
   */
  vestReplaceHint?: string;
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
   * How we play: opens the player role sheet (plays as, main spot,
   * plays every minute). Pre-game pickers only, coaches only.
   */
  onEditRole?: () => void;
  /**
   * `true` when the player is on the field. Drives the bench
   * button label and hides Move/Vest actions that don't apply
   * to bench players.
   */
  isOnField?: boolean;
  /**
   * F3 (Phase 12) long-press player summary. Optional presentational slot
   * rendered between the player name and the action buttons. The host
   * builds it from the shared `buildPlayerInsight` view-model via
   * `PlayerInsightSummary`, so this component stays sport-agnostic — it
   * just reserves the space. Omit to show no summary (pre-game pickers).
   */
  insight?: ReactNode;
  /**
   * More actions under Switch, each its own button (basketball's "Sit
   * out 5 min" and "Fouled out"). Shown for a kid on the team (not hurt
   * or lent). One with `confirm` asks first: the sheet shows
   * "{label}?" and the confirm words, with "Yes, {label}" and Back.
   */
  extraActions?: LockModalAction[];
  /**
   * A kid out for the game who can't come back (basketball's foul-out):
   * replaces the injured words and hides "Back on".
   */
  outForGameNote?: string;
  /**
   * What an out-for-the-game kid's sheet still offers, above Close:
   * basketball's "Take back the last foul", so a mistaken fifth foul
   * isn't final (UX audit 23 Oct 2026, P1).
   */
  outForGameActions?: LockModalAction[];
  onClose: () => void;
}

/** One of a sport's own actions on the sheet. */
export interface LockModalAction {
  label: string;
  hint?: string;
  onClick: () => void;
  testId?: string;
  /** Ask first, with these words under "{label}?". */
  confirm?: string;
}

/** The intro line, naming only the actions on offer. */
function lockModalIntro(can: { switch: boolean; lock: boolean; injure: boolean; lend: boolean }): string {
  const parts: string[] = [];
  if (can.switch) parts.push("switch them out");
  if (can.lock) parts.push("lock them in place");
  if (can.injure) parts.push("flag an injury");
  if (can.lend) parts.push("lend them to the opposition");
  if (parts.length === 0) return "";
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, or ${parts[parts.length - 1]}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export function LockModal({
  player,
  currentLock,
  currentZone = null,
  currentLine = null,
  isInjured,
  isLoaned,
  seasonLoanMins,
  squadLoanMins,
  onLockField,
  onLockZone,
  zoneLabel: zoneLabelProp,
  lockZoneHint = "Can sub on/off but only to this position",
  lockedNote,
  onUnlock,
  onToggleInjury,
  onToggleLoan,
  onSwitch,
  switchHint,
  vestReplaceLabel,
  onReplaceVest,
  vestReplaceHint = "Pick a different player to take the vest this period",
  moveToLabel,
  onMovePosition,
  onAssignFr,
  onAssignDh,
  isFr,
  isDh,
  onToggleBench,
  onEditRole,
  isOnField,
  insight,
  extraActions,
  outForGameNote,
  outForGameActions,
  onClose,
}: LockModalProps) {
  const firstName = player.full_name.trim().split(/\s+/)[0];
  const zoneLabel = zoneLabelProp ?? (currentZone ? ZONE_SHORT_LABELS[currentZone] : currentLine);
  const loanedLabel = seasonLoanMins === undefined ? null : Math.round(seasonLoanMins);
  const squadLabel = Math.round(squadLoanMins ?? 0);
  // An action that asks first: the sheet becomes its confirm.
  const [confirming, setConfirming] = useState<LockModalAction | null>(null);
  const intro = lockModalIntro({
    switch: !!onSwitch,
    lock: !!(onLockField || (onLockZone && zoneLabel)),
    injure: !!onToggleInjury,
    lend: !!onToggleLoan,
  });
  const runAction = (a: LockModalAction) => (a.confirm ? setConfirming(a) : a.onClick());
  const actionButton = (a: LockModalAction) => (
    <button
      key={a.label}
      type="button"
      onClick={() => runAction(a)}
      data-testid={a.testId}
      className="flex w-full flex-col items-center rounded-md bg-surface-alt px-4 py-3 text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt/80"
    >
      <span className="text-sm font-bold">{a.label}</span>
      {a.hint && <span className="mt-0.5 text-xs text-ink-dim">{a.hint}</span>}
    </button>
  );

  return (
    // Scrolls when the actions outgrow the screen: on an iPhone 14,
    // basketball's long list pushed Cancel off the bottom with no way to
    // reach it (live-chrome contract, WebKit).
    <Modal size="xs" labelledBy="lock-modal-title" onClose={onClose} className="overflow-y-auto">
        <p className="mb-1 text-center font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Player actions
        </p>
        <h2
          id="lock-modal-title"
          className="mb-1 text-center text-base font-bold text-ink"
        >
          {firstName}{player.jersey_number != null ? ` #${player.jersey_number}` : ""}
        </h2>

        {insight}

        {confirming ? (
          /* An action that asks first (basketball's manual "Fouled out"). */
          <>
            <h3 className="mb-1 text-center text-sm font-bold text-ink">{confirming.label}?</h3>
            <p className="mb-5 text-center text-sm text-ink-dim">{confirming.confirm}</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const a = confirming;
                  setConfirming(null);
                  a.onClick();
                }}
                className="w-full rounded-md bg-danger px-4 py-3 text-sm font-bold text-warm transition-colors duration-fast ease-out-quart hover:bg-danger/90"
              >
                Yes, {confirming.label.charAt(0).toLowerCase()}
                {confirming.label.slice(1)}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="w-full py-2 text-sm text-ink-mute transition-colors duration-fast ease-out-quart hover:text-ink"
              >
                Back
              </button>
            </div>
          </>
        ) : isInjured && outForGameNote ? (
          /* Out for the game (basketball's foul-out): no "Back on", but
             a mistaken foul-out can still be taken back. */
          <>
            <p className="mb-5 text-center text-sm text-ink-dim">{outForGameNote}</p>
            <div className="flex flex-col gap-2">
              {outForGameActions?.map(actionButton)}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-sm text-ink-mute transition-colors duration-fast ease-out-quart hover:text-ink"
              >
                Close
              </button>
            </div>
          </>
        ) : isInjured ? (
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
                <span className="text-sm font-bold">Back on</span>
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
              {lockedNote ??
                (currentLock === "field"
                  ? "Kept on field — never subbed off."
                  : `Kept in ${zoneLabel ?? "position"} — subs back to this zone only.`)}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onUnlock}
                className="w-full rounded-md border border-hairline py-2.5 text-sm font-semibold text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
              >
                Let them rotate again
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
            {intro && <p className="mb-4 text-center text-sm text-ink-dim">{intro}</p>}
            <div className="flex flex-col gap-2">
              {/* Switch — most common quick action, lives at the top.
                  Closes the modal and selects this player so the next
                  tap on a teammate completes the swap (zone-to-zone if
                  field player tapped; sub-on/off if bench player tapped). */}
              {onSwitch && (
                <button
                  type="button"
                  onClick={onSwitch}
                  className="flex w-full flex-col items-center rounded-md bg-brand-600 px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
                >
                  <span className="text-sm font-bold">Switch player</span>
                  <span className="mt-0.5 text-xs opacity-90">
                    {switchHint ??
                      (currentZone
                        ? "Tap a teammate to swap zones, or a bench player to sub off"
                        : currentLine
                          ? "Tap a teammate to swap places, or a bench player to sub off"
                          : "Tap a field player to bring them on")}
                  </span>
                </button>
              )}
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
                    {vestReplaceHint}
                  </span>
                </button>
              )}
              {extraActions?.map(actionButton)}
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
              {onEditRole && (
                <button
                  type="button"
                  onClick={onEditRole}
                  className="flex w-full flex-col items-center rounded-md border border-hairline px-4 py-3 text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
                >
                  <span className="text-sm font-bold">Player role</span>
                  <span className="mt-0.5 text-xs text-ink-dim">Where they play, plays every minute</span>
                </button>
              )}
              {onLockField && (
                <button
                  type="button"
                  onClick={onLockField}
                  className="flex w-full flex-col items-center rounded-md bg-ink px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-ink/90"
                >
                  <span className="text-sm font-bold">Keep on field</span>
                  <span className="mt-0.5 text-xs opacity-80">Never substituted off</span>
                </button>
              )}
              {onLockZone && zoneLabel && (
                <button
                  type="button"
                  onClick={onLockZone}
                  className="flex w-full flex-col items-center rounded-md bg-warn px-4 py-3 text-warm transition-colors duration-fast ease-out-quart hover:bg-warn/90"
                >
                  <span className="text-sm font-bold">Keep in {zoneLabel}</span>
                  <span className="mt-0.5 text-xs opacity-90">{lockZoneHint}</span>
                </button>
              )}
              {onToggleInjury && (
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
                )}
              {onToggleLoan && (
                <button
                  type="button"
                  onClick={onToggleLoan}
                  className="flex w-full flex-col items-center rounded-md border border-hairline px-4 py-3 text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
                >
                  <span className="text-sm font-bold">Lend to opposition</span>
                  <span className="mt-0.5 text-center text-xs text-ink-dim">
                    {loanedLabel === null ? (
                      "Plays for the other team until you bring them back"
                    ) : (
                      <>
                        Season total: <span className="font-semibold text-ink">{loanedLabel}m</span>
                        {squadLabel > 0 && <> · squad avg {squadLabel}m</>}
                      </>
                    )}
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
      </Modal>
  );
}
