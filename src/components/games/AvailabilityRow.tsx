"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { Guernsey } from "@/components/sf";
import { PulseDot } from "@/components/ui/PulseDot";
import type { ActionResult, AvailabilityStatus, LiveAuth } from "@/lib/types";

interface AvailabilityRowProps {
  /** The team's or runner's auth, for the live write queue (not needed with onWrite). */
  auth?: LiveAuth;
  gameId: string;
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  status: AvailabilityStatus;
  canEdit: boolean;
  /**
   * Write the answer some other way than the team's live write queue:
   * the parent availability link (/availability/[token]) answers with
   * its own token-checked action. A refused answer rolls back and says
   * why.
   */
  onWrite?: (next: AvailabilityStatus) => Promise<ActionResult>;
  /** A small line under the name: "Replied" when a parent answered. */
  note?: string;
  /**
   * A parent answering for their child: every tap is an answer, even on
   * the side already shown (a new game starts everyone In, and the coach
   * needs to see the parent confirmed it), and a kid nobody's answered
   * for shows neither In nor Out.
   */
  answering?: boolean;
}

// Two-state availability: anything that isn't explicitly "available" is
// shown as "Out" (including the legacy "unknown" rows).
//
// UX review #11 (Steve 2026-07-08): the old row carried BOTH a status
// pill ("Unavailable") AND an action button ("Mark available") — the
// same fact twice, squeezing player names into truncation at 375px.
// Replaced with ONE segmented In / Out control that shows the state
// and takes the tap, which also resolves the state-vs-action label
// ambiguity Stagehand flagged 2026-05-09: you tap the state you want.
const statusPillLabels: Record<AvailabilityStatus, string> = {
  available: "In",
  unavailable: "Out",
  unknown: "Out",
};

// Per-status flash tint. The overlay span sits on top of the row's
// transparent background and fades from full opacity to zero over
// 400ms. Tones are deliberately soft — the pill colour change is
// the primary signal; the flash is supplementary confirmation that
// the write landed without forcing the eye away from the pill.
const flashStyles: Record<AvailabilityStatus, string> = {
  available:   "bg-ok/15",
  unavailable: "bg-ink-dim/10",
  unknown:     "bg-ink-dim/10",
};

export function AvailabilityRow({
  auth,
  gameId,
  playerId,
  playerName,
  jerseyNumber,
  status,
  canEdit,
  onWrite,
  note,
  answering = false,
}: AvailabilityRowProps) {
  // Optimistic-flip state (perf phase 4a). Before this rework, the
  // handler awaited setAvailability inside startTransition — the
  // pill stayed on the OLD status, with the spinner spinning, for
  // 500-1500ms while the server confirmed. Now we flip the local
  // state synchronously on tap and queue the write via the
  // write-queue (which gives us idempotency + offline resilience
  // for free). On any error path we roll back to the server-known
  // status. The `optimistic` state is null when we trust the
  // server's `status` prop; populated when an in-flight write is
  // pending. `isPending` derives from optimistic !== null so the
  // existing spinner + opacity affordances still work.
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<AvailabilityStatus | null>(null);
  const isPending = optimistic !== null;
  const [writeError, setWriteError] = useState<string | null>(null);

  // When the server-known `status` prop catches up to (or past) the
  // optimistic guess, clear the optimistic state so we go back to
  // mirroring the server.
  useEffect(() => {
    if (optimistic !== null && status === optimistic) {
      setOptimistic(null);
    }
  }, [status, optimistic]);

  const shownStatus: AvailabilityStatus = optimistic ?? status;
  // Two-state for the coach ("unknown" reads Out); a parent answering
  // sees an unanswered kid as neither.
  const isOut = answering ? shownStatus === "unavailable" : shownStatus !== "available";

  // Post-write flash. `flashKey` is bumped whenever the SHOWN
  // status changes — the absolutely-positioned overlay span is
  // re-mounted on every key change, so the `bg-flash` keyframe
  // runs from frame 0 each time. With optimistic flips, the shown
  // status changes on tap (not on server return), so the flash
  // now confirms the tap landed locally — which is exactly what
  // the user is looking for.
  const [flashKey, setFlashKey] = useState(0);
  const prevStatusRef = useRef(shownStatus);
  useEffect(() => {
    if (prevStatusRef.current === shownStatus) return;
    prevStatusRef.current = shownStatus;
    setFlashKey((k) => k + 1);
  }, [shownStatus]);

  function handleSet(next: AvailabilityStatus) {
    if (!canEdit || isPending) return;
    // Tapping the already-active side is a no-op — the control shows
    // state and takes the tap in one place.
    const isIn = shownStatus === "available";
    if (!answering && (next === "available") === isIn) return;
    // Snapshot the server-known status for rollback. Don't snapshot
    // `shownStatus` — if a previous optimistic flip is still
    // pending, we want to fall back to the real server value.
    const rollback = status;
    setOptimistic(next);
    setWriteError(null);
    if (onWrite) {
      onWrite(next)
        .then((res) => {
          if (!res.success) {
            setOptimistic(null);
            setWriteError(res.error);
            return;
          }
          router.refresh();
        })
        .catch(() => setOptimistic(null));
      return;
    }
    if (!auth) return;
    const { flushed } = enqueueLiveAction("setAvailability", [
      auth,
      gameId,
      playerId,
      next,
    ]);
    flushed
      .then(() => {
        // Server-confirmed write. Refresh so the RSC re-renders
        // with the new `status` prop; the useEffect above will
        // then clear the optimistic state.
        router.refresh();
      })
      .catch(() => {
        // Rollback. The write queue never rejects on transient
        // failures (it retries forever) — this only fires on a
        // genuine handler crash, which is a programming error.
        setOptimistic(rollback);
      });
  }

  return (
    <li className="relative flex items-center justify-between gap-2 px-4 py-3">
      {/* Flash overlay — re-keyed by `flashKey` so each new
          availability state restarts the 400ms `bg-flash` keyframe.
          Sits behind the row content via z-index trick: the overlay
          is `pointer-events-none` and `inset-0` but rendered FIRST
          in DOM order, so siblings paint above it naturally. The
          overlay tint (10-15% alpha) is intentionally subtle — the
          status pill colour change is the primary signal; the
          flash is supplementary confirmation. P1-2 in
          MICRO-INTERACTIONS-PLAN.md. */}
      {flashKey > 0 && (
        <span
          key={flashKey}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 motion-safe:animate-bg-flash ${flashStyles[shownStatus]}`}
          data-flash="row"
        />
      )}
      <div className="relative flex min-w-0 items-center gap-3">
        {jerseyNumber != null && <Guernsey num={jerseyNumber} size={32} />}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{playerName}</span>
          {note && <span className="block text-[11px] font-medium text-ok">{note}</span>}
          {writeError && (
            <span className="block text-[11px] text-danger" role="alert">
              {writeError}
            </span>
          )}
        </span>
      </div>
      {/* relative so the control paints ABOVE the absolutely-
          positioned flash overlay. Without this the content sits
          BEHIND the flash and the row reads as "everything just got
          tinted green" instead of "the row flashed briefly". */}
      <div className="relative flex shrink-0 items-center gap-2">
        {isPending && <PulseDot size="sm" />}
        {canEdit ? (
          // Segmented In / Out — state and action in one control. Tap
          // the state you want; the active side is filled. ~40px tall
          // segments keep the fingertip-friendly target from the
          // Steve 2026-05-13 audit.
          <div
            role="group"
            aria-label={`${playerName} availability`}
            className={`inline-flex overflow-hidden rounded-full border border-hairline transition-opacity ${
              isPending ? "opacity-60" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => handleSet("available")}
              disabled={isPending}
              aria-pressed={shownStatus === "available"}
              className={`px-4 py-2.5 text-xs font-semibold transition-colors ${
                shownStatus === "available"
                  ? "bg-brand-600 text-white"
                  : "bg-surface text-ink-dim hover:bg-surface-alt"
              }`}
            >
              In
            </button>
            <button
              type="button"
              onClick={() => handleSet("unavailable")}
              disabled={isPending}
              aria-pressed={isOut}
              className={`border-l border-hairline px-4 py-2.5 text-xs font-semibold transition-colors ${
                isOut
                  ? "bg-ink-dim text-white"
                  : "bg-surface text-ink-dim hover:bg-surface-alt"
              }`}
            >
              Out
            </button>
          </div>
        ) : (
          // Read-only viewers still see the state.
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
              shownStatus === "available"
                ? "border-ok/30 bg-ok/10 text-ok"
                : "border-hairline bg-surface-alt text-ink-mute"
            }`}
          >
            {statusPillLabels[shownStatus]}
          </span>
        )}
      </div>
    </li>
  );
}
