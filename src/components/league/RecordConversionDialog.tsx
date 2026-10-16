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
  unconvertedTryIds,
} from "@/lib/sports/rugby_league/kicks";
import type { GameEvent, LiveAuth, Player } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

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
  /**
   * Opened by a try just recorded. `events` are server props and may
   * not hold that try until the refresh lands, so trust the caller.
   */
  afterTry?: boolean;
  /**
   * The junior goal-kick rotation (§15). Off under international laws
   * (U13+): any on-field player may kick, and there's no Force.
   */
  rotation?: boolean;
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
  afterTry = false,
  rotation = true,
}: RecordConversionDialogProps) {
  const router = useRouter();
  const [pendingKickerId, setPendingKickerId] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cycle = conversionCycle(events, onFieldPlayerIds);
  const eligible = new Set(
    rotation ? nextEligibleConversionKickers(events, onFieldPlayerIds) : onFieldPlayerIds,
  );
  const totalAttempts = totalConversionAttemptsByPlayer(events);
  // A kick converts a try (Stagehand round 2: a game held a conversion
  // and no try). With none waiting, only Force (the extra kick) can
  // record one. The server checks the same rule.
  const waitingTries = unconvertedTryIds(events);
  const hasTryToConvert = afterTry || waitingTries.length > 0;
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
    = rotation
    && neverKickedOnField.length > 0
    && events.some((e) => e.type === "conversion_attempt");
  const showResetBanner
    = rotation
    && !showFreshBanner
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
      { force, tryEventId: tryEventId ?? waitingTries[0] },
    ]);
    try {
      await flushed;
    } catch (e) {
      // Refused under a rule (no try, already kicked): say why.
      setPendingKickerId(null);
      setError(e instanceof Error ? e.message : "Couldn't record that kick.");
      return;
    }
    setPendingKickerId(null);
    router.refresh();
    onClose();
  }

  return (
    <Modal size="md" placement="sheet" label="Record conversion" onClose={onClose} padding="p-0">
        {/* Header — pinned, never scrolls out of view */}
        <header className="flex flex-shrink-0 items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
              Record conversion
            </h2>
            <p className="text-xs text-ink-mute">
              {rotation ? "Pick the kicker — laws §15 rotation enforced." : "Pick the kicker."}
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
          {!hasTryToConvert && (
            <InlineAlert kind="warn">
              {rotation
                ? "No try to convert. Record the try first. Force is only for the extra kick when the try-scorer was fouled."
                : "No try to convert. Record the try first. A kick from a penalty is a penalty goal."}
            </InlineAlert>
          )}
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
              const canPick = force || (hasTryToConvert && eligible.has(p.id));
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
              const statusLabel = !hasTryToConvert
                ? null
                : !canPick && alreadyKickedInCycle
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

        {/* Force-toggle footer — pinned, never scrolls out of view.
            Junior laws only: international laws have no rotation, and a
            kick from a penalty is a penalty goal. */}
        {rotation && (
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
        )}
        {!rotation && <div className="pb-[calc(1rem+env(safe-area-inset-bottom))]" />}
      </Modal>
  );
}
