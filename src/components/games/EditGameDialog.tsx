"use client";

import { Modal } from "@/components/ui/Modal";
import { CreateGameForm } from "@/components/games/CreateGameForm";

interface EditGameDialogProps {
  teamId: string;
  game: {
    id: string;
    opponent: string;
    scheduled_at: string;
    location: string | null;
    round_number: number | null;
    notes: string | null;
  };
  onClose: () => void;
}

/**
 * Edit a game's details (opponent, time, round, location, notes) from
 * the game hub's More sheet. Reuses the create form in edit mode so the
 * two never drift; updateGame revalidates the hub so it re-renders.
 */
export function EditGameDialog({ teamId, game, onClose }: EditGameDialogProps) {
  return (
    <Modal size="md">
      <h2 className="mb-4 text-lg font-semibold text-ink">Edit details</h2>
      <div className="overflow-y-auto">
        <CreateGameForm
          teamId={teamId}
          existingGame={game}
          onCancel={onClose}
          onCreated={onClose}
        />
      </div>
    </Modal>
  );
}
