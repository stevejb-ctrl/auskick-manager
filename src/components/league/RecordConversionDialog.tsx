"use client";

// ─── RecordConversionDialog ──────────────────────────────────
// Modal kicker picker that surfaces after a try is recorded. The
// coach selects the kicker from the on-field pool; players who've
// already kicked in the current cycle are disabled with a
// "Already kicked this cycle" hint, EXCEPT when the rotation has
// just reset (everyone has had a turn) — then the dialog
// re-enables all rows with a banner.
//
// `Force` toggle handles Junior Laws §15's edge case where the
// try-scorer is fouled in the act and gets an additional kick at
// goal even if they've already kicked this cycle. Off by default
// so the rotation rule is enforced by default; coach has to
// consciously flip it on.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton, Guernsey } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import {
  conversionCycle,
  nextEligibleConversionKickers,
  totalConversionAttemptsByPlayer,
} from "@/lib/sports/rugby_league/kicks";
import type { GameEvent, LiveAuth, Player } from "@/lib/types";

interface RecordConversionDialogProps {
  auth: LiveAuth;
  gameId: string;
  /** All squad players — used to look up names for the rows. */
  squad: Player[];
  /** Currently on-field player ids. The rotation pool. */
  onFieldPlayerIds: string[];
  events: GameEvent[];
  /** Current quarter / half — passed through to the server event. */
  quarter: number;
  /** Live clock elapsed ms — written into the event metadata. */
  elapsedMs: number;
  /** Tapped Cancel or backdrop — closes the dialog without writing. */
  onClose: () => void;
  /**
   * Optional: id of the `try` event that triggered this dialog.
   * Forwarded as metadata.try_event_id so future audits can pair
   * each conversion attempt with its try.
   */
  tryEventId?: string;
}

export function RecordConversionDialog({
  auth,
  gameId,
  squad,
  onFieldPlayerIds,
  events,
  quarter,
  elapsedMs,
  onClose,
  tryEventId,
}: RecordConversionDialogProps) {
  const router = useRouter();
  const [pendingKickerId, setPendingKickerId] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cycle = conversionCycle(events, onFieldPlayerIds);
  const eligible = new Set(
    nextEligibleConversionKickers(events, onFieldPlayerIds),
  );
  const totalAttempts = totalConversionAttemptsByPlayer(events);
  const neverKickedOnField = onFieldPlayerIds.filter(
    (id) => (totalAttempts[id] ?? 0) === 0,
  );
  const playerById = new Map(squad.map((p) => [p.id, p]));

  const onFieldPlayers = onFieldPlayerIds
    .map((id) => playerById.get(id))
    .filter((p): p is Player => Boolean(p));

  // Banner logic — three cases:
  //   1. There's a never-kicked-this-game on-field player AND prior
  //      attempts exist → "Fresh sub-on goes first" (priority over
  //      anyone who has kicked, regardless of cycle state).
  //   2. Cycle just reset (attempted empty) AND prior attempts exist
  //      → "Rotation reset" (everyone caught up; next pick is a fresh
  //      cycle).
  //   3. Otherwise → no banner.
  const showFreshBanner
    = neverKickedOnField.length > 0
    && events.some((e) => e.type === "conversion_attempt");
  const showResetBanner
    = !showFreshBanner
    && cycle.attempted.size === 0
    && onFieldPlayerIds.length > 0
    && events.some((e) => e.type === "conversion_attempt");

  async function commit(kickerId: string, made: boolean) {
    setPendingKickerId(kickerId);
    setError(null);
    const { flushed } = enqueueLiveAction("recordConversionAttempt", [
      auth,
      gameId,
      kickerId,
      made,
      quarter,
      elapsedMs,
      { force, tryEventId },
    ]);
    await flushed;
    setPendingKickerId(null);
    // The write queue swallows errors and retries. Surface a soft
    // hint that the action is in flight — a true error would only
    // show up if the queue's lastError gets surfaced; for Phase 5
    // MVP we trust the queue to retry and close the dialog
    // optimistically.
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      {/*
       * max-h caps the panel so it can never extend behind the
       * LiveTopBar on mobile. LiveTopBar = env(safe-area-inset-top)
       * + 44px content row. The player list is flex-1 overflow-y-auto
       * so it scrolls inside the capped height while the header and
       * force-toggle footer stay pinned. sm: override via sm:rounded-2xl
       * / sm:max-h-[90dvh] keeps the centred desktop layout tidy.
       */}
      <div
        role="dialog"
        aria-label="Record conversion"
        className="flex w-full max-w-md flex-col rounded-t-2xl bg-surface shadow-modal sm:rounded-2xl max-h-[calc(100dvh-env(safe-area-inset-top)-44px)] sm:max-h-[90dvh]"
      >
        {/* Header — pinned, never scrolls out of view */}
        <header className="flex flex-shrink-0 items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
              Record conversion
            </h2>
            <p className="text-xs text-ink-mute">
              Pick the kicker — laws §15 rotation enforced.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-ink-mute hover:bg-surface-alt"
          >
            Cancel
          </button>
        </header>

        {/* Alerts + scrollable player list */}
        <div className="flex-1 overflow-y-auto px-4">
          {error && <InlineAlert kind="danger">{error}</InlineAlert>}
          {showFreshBanner && (
            <InlineAlert kind="warn">
              {neverKickedOnField.length === 1
                ? "One on-field player hasn't kicked this game — they go first."
                : `${neverKickedOnField.length} on-field players haven't kicked this game — they go first.`}
            </InlineAlert>
          )}
          {showResetBanner && (
            <InlineAlert kind="warn">
              Rotation reset — everyone on the field has kicked. The next pick
              starts a new cycle.
            </InlineAlert>
          )}

          <div className="mt-2 space-y-1.5 pb-1">
            {onFieldPlayers.map((p) => {
              const canPick = force || eligible.has(p.id);
              const alreadyKickedInCycle = cycle.attempted.has(p.id);
              const totalAttemptsForPlayer = totalAttempts[p.id] ?? 0;
              const everKicked = totalAttemptsForPlayer > 0;
              // Status label — three states the dialog can communicate
              // when this player is not currently in the eligible pool:
              //   * "Already kicked this cycle" — they're in the current
              //     rotation (cycle.attempted) → wait until reset.
              //   * "Kicked earlier this game" — cycle has since reset,
              //     but a never-kicker on field jumps the queue, so
              //     this player isn't eligible right now.
              //   * Nothing — they're an eligible pick.
              const statusLabel = !canPick && alreadyKickedInCycle
                ? "Already kicked this cycle"
                : !canPick && everKicked
                  ? `Kicked ${totalAttemptsForPlayer}× this game — fresh sub-on goes first`
                  : null;
              const isPending = pendingKickerId === p.id;
              return (
                <div
                  key={p.id}
                  className={[
                    "flex items-center justify-between rounded-lg border px-3 py-2",
                    canPick
                      ? "border-hairline bg-surface hover:border-brand-600"
                      : "border-hairline bg-surface-alt opacity-60",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <Guernsey
                      num={p.jersey_number != null ? String(p.jersey_number) : ""}
                      size={26}
                    />
                    <div className="text-sm">
                      <span className="font-medium text-ink">{p.full_name}</span>
                      {statusLabel && (
                        <span className="ml-2 text-xs text-ink-mute">
                          {statusLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <SFButton
                      size="sm"
                      variant="primary"
                      disabled={!canPick || isPending}
                      onClick={() => commit(p.id, true)}
                    >
                      Made
                    </SFButton>
                    <SFButton
                      size="sm"
                      variant="ghost"
                      disabled={!canPick || isPending}
                      onClick={() => commit(p.id, false)}
                    >
                      Missed
                    </SFButton>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Force-toggle footer — pinned, never scrolls out of view */}
        <div className="flex-shrink-0 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-0">
          <label className="mt-3 flex items-center gap-2 rounded-md bg-surface-alt px-3 py-2 text-xs text-ink-dim">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="h-4 w-4 rounded border-hairline accent-brand-600"
            />
            <span>
              <strong className="text-ink">Force</strong> — bypass rotation
              (try-scorer fouled in the act of scoring, laws §15 carve-out).
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
