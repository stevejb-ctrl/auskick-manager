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
//
// The kick goes to the live screen (onRecord), which shows it at once and
// queues it, as every score is (optimistic events, UX audit 23 Oct 2026).
// The server checks the same rules; a kick it refuses comes off the
// screen and the live screen says why.

import { useState } from "react";
import { InlineAlert } from "@/components/ui/InlineAlert";
import {
  conversionCycle,
  nextEligibleConversionKickers,
  totalConversionAttemptsByPlayer,
  unconvertedTryIds,
} from "@/lib/sports/rugby_league/kicks";
import type { GameEvent, Player } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { SHEET_CANCEL, SHEET_EYEBROW, SHEET_TITLE } from "@/components/ui/sheetChrome";

interface RecordConversionDialogProps {
  /** All squad players — used to look up names for the rows. */
  squad: Player[];
  /** Currently on-field player ids. The rotation pool. */
  onFieldPlayerIds: string[];
  /** The game's events, with any on their way to the server. */
  events: GameEvent[];
  /** Made or Missed tapped: the live screen records the kick. */
  onRecord: (kickerId: string, made: boolean, force: boolean) => void;
  /** Tapped Cancel or backdrop — closes the dialog without writing. */
  onClose: () => void;
  /** Opened by a try just recorded: there's a try to convert. */
  afterTry?: boolean;
  /**
   * The junior goal-kick rotation (§15). Off under international laws
   * (U13+): any on-field player may kick, and there's no Force.
   */
  rotation?: boolean;
}

export function RecordConversionDialog({
  squad,
  onFieldPlayerIds,
  events,
  onRecord,
  onClose,
  afterTry = false,
  rotation = true,
}: RecordConversionDialogProps) {
  const [force, setForce] = useState(false);

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

  function commit(kickerId: string, made: boolean) {
    onRecord(kickerId, made, force);
    onClose();
  }

  // Live v3's sheet (sheetChrome, as the scorer sheet and Scores and
  // fixes): the eyebrow and title, each kicker on a white plate with
  // Made (filled) and Missed (outlined), the way out at the foot.
  return (
    <Modal size="md" placement="sheet" label="Record conversion" onClose={onClose} padding="p-0">
        {/* Header — pinned, never scrolls out of view */}
        <header className="flex-shrink-0 px-5 pb-3 pt-6 sm:pt-5">
          <p className={SHEET_EYEBROW}>Conversion</p>
          <h2 className={`mt-0.5 ${SHEET_TITLE}`}>Who&apos;s kicking?</h2>
          <p className="mt-1 text-sm text-ink-dim">
            {/* Plain words, and that there's a way out: a parent who
                doesn't know rugby didn't know the kick could be skipped
                ("laws §15", Stagehand round 8, #14). */}
            {rotation
              ? "Pick the kicker: each kid takes a turn, as junior laws say. Or Skip."
              : hasTryToConvert
                ? "Pick the kicker, or Skip."
                : "Pick the kicker."}
          </p>
        </header>

        {/* Alerts + scrollable player list */}
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3.5 pb-1">
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

          <ul className="space-y-1.5">
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
              return (
                <li
                  key={p.id}
                  data-testid="conversion-row"
                  className={`${KICKER_ROW} ${canPick ? "" : "opacity-60"}`}
                >
                  {p.jersey_number != null && (
                    <span
                      aria-hidden="true"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-alt font-mono text-micro font-bold tabular-nums text-ink"
                    >
                      {p.jersey_number}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-bold text-ink">{p.full_name}</span>
                    {statusLabel && <span className="block text-micro text-ink-mute">{statusLabel}</span>}
                  </span>
                  {/* Named for the kicker: fifteen rows of "Made" and
                      "Missed" read the same (UX round 3, e4). */}
                  <span className="flex flex-none gap-1.5">
                    <button
                      type="button"
                      disabled={!canPick}
                      onClick={() => commit(p.id, true)}
                      aria-label={`Made, ${p.full_name}`}
                      className={`${KICK_BUTTON} bg-primary text-on-primary hover:bg-primary/90`}
                    >
                      Made
                    </button>
                    <button
                      type="button"
                      disabled={!canPick}
                      onClick={() => commit(p.id, false)}
                      aria-label={`Missed, ${p.full_name}`}
                      className={`${KICK_BUTTON} bg-transparent text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] hover:bg-surface-alt`}
                    >
                      Missed
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Force (junior laws only: international laws have no rotation,
            and a kick from a penalty is a penalty goal), then the way out.
            Pinned, never scrolled out of view. */}
        <div className="flex-shrink-0 px-3.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5">
          {rotation && (
            <label className="mb-2 flex items-center gap-2 rounded-[12px] bg-surface-alt px-3 py-2 text-xs text-ink-dim">
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
          )}
          <button type="button" onClick={onClose} className={SHEET_CANCEL}>
            {hasTryToConvert ? "Skip" : "Cancel"}
          </button>
        </div>
      </Modal>
  );
}

/** A kicker's row: the sheet's white plate (SHEET_OPTION), holding two buttons. */
const KICKER_ROW =
  "flex min-h-[54px] items-center gap-3 rounded-[15px] bg-surface px-3 py-2 shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))]";

/** Made / Missed: the bar's button type, 44 px, a size down. */
const KICK_BUTTON =
  "inline-flex min-h-[44px] min-w-[64px] items-center justify-center rounded-[12px] px-3 font-display stretch-85 text-[0.9375rem] font-extrabold uppercase " +
  "transition-colors duration-fast ease-out-quart disabled:pointer-events-none";
