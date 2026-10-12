"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Modal } from "@/components/ui/Modal";
import { SFButton } from "@/components/sf";

interface DeleteGameDialogProps {
  teamId: string;
  gameId: string;
  onClose: () => void;
}

/**
 * Delete confirm in a Modal — the same grammar as Restart, so the two
 * destructive game actions confirm the same way (they used to differ:
 * Delete expanded inline, Restart opened a modal). Opened from the
 * game hub's More sheet.
 */
export function DeleteGameDialog({ teamId, gameId, onClose }: DeleteGameDialogProps) {
  const router = useRouter();
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

  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-danger">Delete this game?</h2>
      <ul className="mt-2 list-disc pl-5 text-xs text-ink-dim">
        <li>The game, its availability, and all recorded events will be removed.</li>
        <li>This can&apos;t be undone.</li>
      </ul>
      {error && (
        <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <SFButton type="button" variant="alarm" size="md" onClick={handleDelete} loading={isPending}>
          {isPending ? "Deleting…" : "Yes, delete this game"}
        </SFButton>
        <SFButton type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
          Cancel
        </SFButton>
      </div>
    </Modal>
  );
}
