"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";

interface DeleteGameButtonProps {
  teamId: string;
  gameId: string;
}

export function DeleteGameButton({ teamId, gameId }: DeleteGameButtonProps) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "confirm">("idle");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteGame(teamId, gameId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/teams/${teamId}/games`);
      router.refresh();
    });
  }

  if (stage === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStage("confirm")}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
      >
        Delete game
      </button>
    );
  }

  return (
    <div className="w-full rounded-md border border-red-300 bg-red-50 p-3 text-sm">
      <p className="font-semibold text-red-900">
        ⚠️ Delete this game permanently?
      </p>
      <ul className="mt-2 list-disc pl-5 text-xs text-red-800">
        <li>The game, its availability, and all recorded events will be removed.</li>
        <li>This can&apos;t be undone.</li>
      </ul>
      {error && (
        <p className="mt-2 rounded bg-red-100 px-2 py-1 text-xs text-red-800">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {isPending ? "Deleting…" : "Yes, delete this game"}
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
    </div>
  );
}
