"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface DeleteGameDialogProps {
  teamId: string;
  gameId: string;
  onClose: () => void;
  /** After the delete, instead of going to the Games list (a list the game was on). */
  onDeleted?: () => void;
  /**
   * The game is being played right now. Round 3 edge testing (24 Oct
   * 2026): a live game got the same confirm as any other, and the phone
   * running it carried on into a game that was gone. A live game's
   * confirm says so, and Delete waits for a tick.
   */
  live?: boolean;
}

/**
 * Delete confirm in a Modal — the same grammar as Restart, so the two
 * destructive game actions confirm the same way (they used to differ:
 * Delete expanded inline, Restart opened a modal). Opened from the
 * game hub's More sheet.
 */
export function DeleteGameDialog({ teamId, gameId, onClose, onDeleted, live = false }: DeleteGameDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteGame(teamId, gameId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (onDeleted) {
        onClose();
        onDeleted();
        return;
      }
      router.push(`/teams/${teamId}/games`);
      router.refresh();
    });
  }

  return (
    <Modal label={live ? "Delete a game that's being played?" : "Delete this game?"}>
      <h2 className="text-center text-lg font-bold text-danger">
        {live ? "Delete a game that's being played?" : "Delete this game?"}
      </h2>
      <ul className="mt-2 list-disc pl-5 text-xs text-ink-dim">
        {live && (
          <li className="font-semibold text-danger">
            This game is live right now. Whoever is running it (you, or someone on the game-day link) loses it, with
            every score and minute so far.
          </li>
        )}
        <li>The game, its availability, and all recorded events will be removed.</li>
        <li>This can&apos;t be undone.</li>
      </ul>
      {live && (
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={sure}
            onChange={(e) => setSure(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-danger"
          />
          I know it&apos;s live. Delete it anyway.
        </label>
      )}
      {error && (
        <InlineAlert className="mt-3">
          {error}
        </InlineAlert>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <SFButton
          type="button"
          variant="alarm"
          size="md"
          onClick={handleDelete}
          loading={isPending}
          disabled={live && !sure}
        >
          {isPending ? "Deleting…" : live ? "Delete the live game" : "Yes, delete this game"}
        </SFButton>
        <SFButton type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
          Cancel
        </SFButton>
      </div>
    </Modal>
  );
}
