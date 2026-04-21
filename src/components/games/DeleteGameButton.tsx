"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Button } from "@/components/ui/Button";

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
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => setStage("confirm")}
        className="border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
      >
        Delete game
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-danger/30 bg-danger/10 p-3 text-sm">
      <p className="font-semibold text-danger">
        ⚠️ Delete this game permanently?
      </p>
      <ul className="mt-2 list-disc pl-5 text-xs text-danger/90">
        <li>The game, its availability, and all recorded events will be removed.</li>
        <li>This can&apos;t be undone.</li>
      </ul>
      {error && (
        <p className="mt-2 rounded bg-danger/20 px-2 py-1 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={handleDelete}
          loading={isPending}
        >
          {isPending ? "Deleting…" : "Yes, delete this game"}
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
    </div>
  );
}
