"use client";

// ─── Netball Player Actions Modal ────────────────────────────
// Opens on long-press of a player token (or a bench player long-press,
// once we wire that up). Mirrors the AFL LockModal but with a
// netball-scoped action set:
//   - Mark injured / un-injure
//   - Lend to opposition / bring back
//   - Lock to this position for the next quarter break
//   - Switch player (mid-Q sub, when allow_mid_quarter_subs is on)
//   - Move to empty position (short-squad blank-slot reshuffle,
//     when allow_mid_quarter_subs is on and there's at least one
//     empty position on court)
//   - Cancel
//
// AFL's "Lock to field" / "Lock to zone" don't apply: netball's
// substitution rule is period-break-only, so there's no mid-play
// rotation engine that locking would lock against. A coach who wants
// to pin a strong shooter into GS for next quarter uses the
// lock-for-next-break action instead — a soft signal to the suggester.

import { useState } from "react";
import type { Player } from "@/lib/types";
import { netballSport } from "@/lib/sports/netball";

interface Props {
  player: Player;
  /** The position the player is currently in (or null for bench). */
  positionId: string | null;
  isInjured: boolean;
  isLoaned: boolean;
  isLockedForNextBreak: boolean;
  onMarkInjured: () => void;
  onUnInjury: () => void;
  onMarkLoaned: () => void;
  onUnLoan: () => void;
  onLockForNextBreak: () => void;
  onUnlock: () => void;
  /**
   * Mid-quarter switch — vacate this player's position and open the
   * Pick Replacement sheet so the GM can sub a bench player in.
   * Optional: only wired for FIELD players (positionId !== null).
   * Bench-initiated switches aren't supported yet because netball
   * doesn't have a tap-a-position picker — the existing
   * vacateAndPromptReplacement flow only goes field → bench.
   */
  onSwitch?: () => void;
  /**
   * Short-squad blank-slot reshuffle (Steve 2026-05-23). Empty
   * position ids on court right now. When the array is non-empty AND
   * `onMoveToEmpty` is wired AND the long-pressed player is on the
   * court, the modal surfaces a "Move to empty position" action; tap
   * it to reveal one button per empty position. Selecting one moves
   * the player there and leaves their current position empty.
   */
  emptyPositions?: string[];
  onMoveToEmpty?: (targetPositionId: string) => void;
  /**
   * F3 (Phase 12) — optional shared player-insight summary, rendered
   * under the header (mirrors the LockModal `insight` slot AFL/league
   * use). Host passes <PlayerInsightSummary/>; additive, so existing
   * callers that omit it are unaffected.
   */
  insight?: React.ReactNode;
  onClose: () => void;
}

export function NetballPlayerActions({
  player,
  positionId,
  isInjured,
  isLoaned,
  isLockedForNextBreak,
  onMarkInjured,
  onUnInjury,
  onMarkLoaned,
  onUnLoan,
  onLockForNextBreak,
  onUnlock,
  onSwitch,
  emptyPositions = [],
  onMoveToEmpty,
  insight,
  onClose,
}: Props) {
  const firstName = player.full_name.trim().split(/\s+/)[0];
  const pos = positionId
    ? netballSport.allPositions.find((p) => p.id === positionId)
    : null;
  const positionLabel = pos?.shortLabel ?? "Bench";

  // Two-step picker state for "Move to empty position". The first
  // tap on the action button flips the modal into a sub-mode that
  // shows one button per empty position; "Back" returns to the
  // root menu. Keeps the modal compact instead of always rendering
  // a long list of position buttons.
  const [showEmptyPicker, setShowEmptyPicker] = useState(false);
  const canMoveToEmpty =
    !!onMoveToEmpty &&
    !!positionId &&
    !isInjured &&
    !isLoaned &&
    emptyPositions.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="netball-actions-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-lg border border-hairline bg-surface p-5 shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-center font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Player actions
        </p>
        <h2
          id="netball-actions-title"
          className="mb-4 text-center text-lg font-semibold text-ink"
        >
          {firstName} <span className="text-ink-mute">· {positionLabel}</span>
        </h2>

        {/* F3 shared player-insight summary (in-game per-third + last-sub,
            per-period, season %). Additive slot above the action set. */}
        {insight}

        <div className="flex flex-col gap-2">
          {/* Move-to-empty picker sub-mode — when the coach taps the
              "Move to empty position" action below, the modal flips
              into this sub-mode and shows one button per empty
              position on court. Picking one fires onMoveToEmpty and
              the parent handles the lineup mutation. "Back" returns
              to the root menu so the coach can still inject / lend /
              lock without re-opening the long-press. */}
          {showEmptyPicker ? (
            <>
              <p className="text-xs text-ink-mute">
                Move {firstName} from {positionLabel} to:
              </p>
              {emptyPositions.map((pid) => {
                const empty = netballSport.allPositions.find((p) => p.id === pid);
                const label = empty?.shortLabel ?? pid.toUpperCase();
                const full = empty?.label ?? pid;
                return (
                  <ActionButton
                    key={pid}
                    variant="primary"
                    onClick={() => {
                      onMoveToEmpty?.(pid);
                    }}
                  >
                    → {label} <span className="text-xs opacity-80">({full})</span>
                  </ActionButton>
                );
              })}
              <ActionButton
                variant="ghost"
                onClick={() => setShowEmptyPicker(false)}
              >
                ← Back
              </ActionButton>
            </>
          ) : (
          <>
          {/* Switch — mid-quarter sub. Only for field players (the
              vacate-and-prompt flow is field → bench). Hide if the
              player's already injured or loaned because those flows
              already triggered a replacement picker. */}
          {onSwitch && positionId && !isInjured && !isLoaned && (
            <ActionButton variant="primary" onClick={onSwitch}>
              🔄 Switch player
            </ActionButton>
          )}

          {/* Move to empty position — short-squad blank-slot
              reshuffle. Only renders when the coach has empty
              positions on court AND mid-Q subs are enabled (the
              parent gates `onMoveToEmpty` on
              `allowMidQuarterSubs`). One tap reveals the picker
              sub-mode above; selecting a target moves this player
              there and leaves their current position empty. */}
          {canMoveToEmpty && (
            <ActionButton
              variant="primary"
              onClick={() => setShowEmptyPicker(true)}
            >
              ↔ Move to empty position
            </ActionButton>
          )}

          {/* Lock for next break — only meaningful when the player is
              actually on the court right now. Hide for bench players
              since they're not in a position to lock yet. */}
          {positionId && (
            isLockedForNextBreak ? (
              <ActionButton variant="ghost" onClick={onUnlock}>
                🔓 Unlock for next break
              </ActionButton>
            ) : (
              <ActionButton variant="ghost" onClick={onLockForNextBreak}>
                🔒 Keep at {positionLabel} next break
              </ActionButton>
            )
          )}

          {/* Injury — single tap toggles. The parent decides whether to
              auto-prompt a replacement when toggling on. */}
          {isInjured ? (
            <ActionButton variant="ghost" onClick={onUnInjury}>
              🩹 Mark recovered
            </ActionButton>
          ) : (
            <ActionButton variant="warn" onClick={onMarkInjured}>
              🏥 Mark injured
            </ActionButton>
          )}

          {/* Loan — applies in junior netball ("share player" with
              the opposition when their numbers are short). */}
          {isLoaned ? (
            <ActionButton variant="ghost" onClick={onUnLoan}>
              ↩️ Bring back from loan
            </ActionButton>
          ) : (
            <ActionButton variant="warn" onClick={onMarkLoaned}>
              🤝 Lend to opposition
            </ActionButton>
          )}

          <ActionButton variant="ghost" onClick={onClose}>
            Cancel
          </ActionButton>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Action button — small wrapper for consistent styling ────
function ActionButton({
  variant,
  onClick,
  children,
}: {
  variant: "primary" | "warn" | "ghost";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls =
    variant === "primary"
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : variant === "warn"
      ? "border border-warn/40 bg-warn-soft text-warn hover:bg-warn/10"
      : "border border-hairline bg-surface text-ink hover:bg-surface-alt";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${cls}`}
    >
      {children}
    </button>
  );
}
