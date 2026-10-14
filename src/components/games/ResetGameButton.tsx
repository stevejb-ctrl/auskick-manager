"use client";

import { useState, useTransition } from "react";
import { resetGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { emptyLineup } from "@/lib/types";
import type { LiveAuth } from "@/lib/types";
import { InlineAlert } from "@/components/ui/InlineAlert";

// ─── Reset Game Button ─────────────────────────────────────────
// Destructive action — wipes all events for a game so the coach
// can re-set the lineup from scratch. Two-step gate (warning →
// final confirm) so a stray tap can't nuke an in-progress game.
//
// Confirmation lives in a Modal (not an inline-expanding panel)
// so the state change after the first tap is unmistakable.
// Stagehand exploration (game-day-flow mission, 2026-05-08) showed
// the inline expansion was easy to miss, especially when another
// overlay (walkthrough modal) sat on top of the page — the agent
// concluded "Restart game failed" because the inline confirmation
// never visibly registered.

interface ResetGameButtonProps {
  auth: LiveAuth;
  gameId: string;
}

type Stage = "confirm" | "final";

export function ResetGameButton({ auth, gameId }: ResetGameButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* SFButton danger to match the other destructive actions (Steve
          2026-05-13). Intrinsic width — Restart is the "if you need it"
          option next to Add late arrival (Steve 2026-05-15). */}
      <SFButton variant="danger" size="md" onClick={() => setOpen(true)}>
        Restart game
      </SFButton>
      {open && <ResetGameDialog auth={auth} gameId={gameId} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The two-step restart confirm on its own, so an overflow menu (the
 * game hub's More sheet) can open it without rendering the trigger.
 */
export function ResetGameDialog({
  auth,
  gameId,
  onClose,
}: ResetGameButtonProps & { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("confirm");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReset() {
    setError(null);
    // Wipe the AFL zustand store synchronously BEFORE firing the
    // server action. resetGame deletes every event server-side and
    // redirects to the pre-kick-off page, but the in-memory store
    // (clockStartedAt, accumulatedMs, teamScore, opponentScore,
    // lineup, etc.) persists across the unmount → re-mount that
    // the redirect triggers. The LiveGame init effect normally
    // detects "store ahead of server" on the next kickoff and
    // wipes — but that only fires AFTER the user re-enters /live
    // post-restart-kickoff. During the in-between window the old
    // clock + scoreboard remain visible. Calling init() here with
    // currentQuarter=0 triggers the existing isRestart-detection
    // path so the store hits its defaults synchronously, before
    // the redirect's render lands. (Netball uses local component
    // state, not this store, so no parallel wipe is needed.)
    useLiveGame.getState().init({
      activeGameId: gameId,
      currentQuarter: 0,
      lineup: emptyLineup(),
    });
    startTransition(async () => {
      // resetGame redirects on success (back to the pre-kick-off
      // screen so the coach can re-set availability + fill-ins) so
      // `result` will be undefined on the happy path. Only treat
      // it as a failure when the action came back with `{success: false}`.
      const result = await resetGame(auth, gameId);
      if (result && !result.success) {
        setError(result.error);
        setStage("confirm");
      } else {
        onClose();
      }
    });
  }

  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-danger">
        Restart this game?
      </h2>
      <p className="mt-2 text-sm text-ink-dim">
        Restarting will permanently delete everything that
        happened in this game.
      </p>
      <ul className="mt-2 list-disc pl-5 text-xs text-ink-dim">
        <li>The clock, every swap and every score will be wiped.</li>
        <li>The starting lineup will be cleared.</li>
        <li>Game time from this game will no longer count for the season.</li>
        <li>This can&apos;t be undone.</li>
      </ul>

      {error && (
        <InlineAlert className="mt-3">
          {error}
        </InlineAlert>
      )}

      {stage === "confirm" ? (
        <div className="mt-5 flex flex-col gap-2">
          <SFButton
            type="button"
            variant="danger"
            size="md"
            onClick={() => setStage("final")}
            disabled={isPending}
          >
            I understand, continue
          </SFButton>
          <SFButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </SFButton>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          <SFButton
            type="button"
            variant="alarm"
            size="md"
            onClick={handleReset}
            loading={isPending}
          >
            {isPending ? "Restarting…" : "Yes, restart this game"}
          </SFButton>
          <SFButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </SFButton>
        </div>
      )}
    </Modal>
  );
}
