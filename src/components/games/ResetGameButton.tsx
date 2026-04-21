"use client";

import { useState, useTransition } from "react";
import { resetGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Button } from "@/components/ui/Button";
import type { LiveAuth } from "@/lib/types";

interface ResetGameButtonProps {
  auth: LiveAuth;
  gameId: string;
}

export function ResetGameButton({ auth, gameId }: ResetGameButtonProps) {
  const [stage, setStage] = useState<"idle" | "confirm" | "final">("idle");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetGame(auth, gameId);
      if (!result.success) {
        setError(result.error);
        setStage("idle");
      } else {
        setStage("idle");
      }
    });
  }

  if (stage === "idle") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => setStage("confirm")}
        className="border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
      >
        Restart game
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-danger/30 bg-danger/10 p-3 text-sm">
      <p className="font-semibold text-danger">
        ⚠️ Restarting will permanently delete everything that happened in this game.
      </p>
      <ul className="mt-2 list-disc pl-5 text-xs text-danger/90">
        <li>All quarters, swaps, goals, and behinds will be wiped.</li>
        <li>The starting lineup will be cleared.</li>
        <li>Player zone minutes from this game will no longer count.</li>
        <li>This can&apos;t be undone.</li>
      </ul>
      {error && (
        <p className="mt-2 rounded bg-danger/20 px-2 py-1 text-xs text-danger">
          {error}
        </p>
      )}
      {stage === "confirm" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setStage("final")}
            disabled={isPending}
            className="border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
          >
            I understand, continue
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setStage("idle")}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleReset}
            loading={isPending}
          >
            {isPending ? "Restarting…" : "Yes, restart this game"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setStage("idle")}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
