"use client";

import { useState, useTransition } from "react";
import { resetGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";

interface ResetGameButtonProps {
  teamId: string;
  gameId: string;
}

export function ResetGameButton({ teamId, gameId }: ResetGameButtonProps) {
  const [stage, setStage] = useState<"idle" | "confirm" | "final">("idle");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetGame(teamId, gameId);
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
      <button
        type="button"
        onClick={() => setStage("confirm")}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
      >
        Restart game
      </button>
    );
  }

  return (
    <div className="w-full rounded-md border border-red-300 bg-red-50 p-3 text-sm">
      <p className="font-semibold text-red-900">
        ⚠️ Restarting will permanently delete everything that happened in this game.
      </p>
      <ul className="mt-2 list-disc pl-5 text-xs text-red-800">
        <li>All quarters, swaps, goals, and behinds will be wiped.</li>
        <li>The starting lineup will be cleared.</li>
        <li>Player zone minutes from this game will no longer count.</li>
        <li>This can&apos;t be undone.</li>
      </ul>
      {error && (
        <p className="mt-2 rounded bg-red-100 px-2 py-1 text-xs text-red-800">
          {error}
        </p>
      )}
      {stage === "confirm" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStage("final")}
            disabled={isPending}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 hover:bg-red-50"
          >
            I understand, continue
          </button>
          <button
            type="button"
            onClick={() => setStage("idle")}
            disabled={isPending}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {isPending ? "Restarting…" : "Yes, restart this game"}
          </button>
          <button
            type="button"
            onClick={() => setStage("idle")}
            disabled={isPending}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
