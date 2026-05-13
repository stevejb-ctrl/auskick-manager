"use client";

import { useState, useTransition } from "react";
import { resetGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";
import type { LiveAuth } from "@/lib/types";

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

type Stage = "idle" | "confirm" | "final";

export function ResetGameButton({ auth, gameId }: ResetGameButtonProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      // resetGame redirects on success (back to the pre-kick-off
      // screen so the coach can re-set availability + fill-ins) so
      // `result` will be undefined on the happy path. Only treat
      // it as a failure when the action came back with `{success: false}`.
      const result = await resetGame(auth, gameId);
      if (result && !result.success) {
        setError(result.error);
        setStage("idle");
      } else {
        setStage("idle");
      }
    });
  }

  return (
    <>
      {/* SFButton danger to match DeleteGameButton's idle treatment
          (Steve 2026-05-13) — both destructive actions on the game-
          detail page now share the same red-border ghost look,
          paired with the SFButton ghost neutrals (Set lineup,
          Share gameday link). */}
      <SFButton
        variant="danger"
        size="md"
        onClick={() => setStage("confirm")}
        className="w-full sm:w-auto"
      >
        Restart game
      </SFButton>

      {stage !== "idle" && (
        <Modal>
          <h2 className="text-center text-lg font-bold text-danger">
            Restart this game?
          </h2>
          <p className="mt-2 text-sm text-ink-dim">
            Restarting will permanently delete everything that
            happened in this game.
          </p>
          <ul className="mt-2 list-disc pl-5 text-xs text-ink-dim">
            <li>All quarters, swaps, goals, and behinds will be wiped.</li>
            <li>The starting lineup will be cleared.</li>
            <li>Player zone minutes from this game will no longer count.</li>
            <li>This can&apos;t be undone.</li>
          </ul>

          {error && (
            <p
              className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
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
                onClick={() => setStage("idle")}
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
                onClick={() => setStage("idle")}
                disabled={isPending}
              >
                Cancel
              </SFButton>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
