"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { SFButton } from "@/components/sf";

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
    // SFButton danger so this destructive affordance reads as part
    // of the same visual system as the surrounding actions on the
    // game-detail page (Steve 2026-05-13). The danger variant is
    // border-only with red text — louder than ghost so the
    // destructive intent is obvious, quieter than primary so it
    // doesn't compete with "Start game".
    return (
      <SFButton
        variant="danger"
        size="md"
        onClick={() => setStage("confirm")}
        className="w-full sm:w-auto"
      >
        Delete game
      </SFButton>
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
        <p
          className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <SFButton
          type="button"
          variant="alarm"
          size="sm"
          onClick={handleDelete}
          loading={isPending}
        >
          {isPending ? "Deleting…" : "Yes, delete this game"}
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
    </div>
  );
}
