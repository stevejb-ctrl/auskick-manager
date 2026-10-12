"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton, SFIcon } from "@/components/sf";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/ActionSheet";
import { ResetGameDialog } from "@/components/games/ResetGameButton";
import { DeleteGameDialog } from "@/components/games/DeleteGameDialog";

interface GameMoreMenuProps {
  teamId: string;
  gameId: string;
  /** Opens the game screen (for a final game that's no longer the primary). */
  liveHref?: string;
  canRestart: boolean;
  canDelete: boolean;
}

/**
 * The game hub's overflow: everything that isn't the one primary action
 * for the game's state. Destructive actions live here so they never sit
 * stacked under the primary button (UX plan H3).
 */
export function GameMoreMenu({ teamId, gameId, liveHref, canRestart, canDelete }: GameMoreMenuProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialog, setDialog] = useState<"restart" | "delete" | null>(null);

  const actions: ActionSheetAction[] = [];
  if (liveHref) {
    actions.push({
      id: "open-live",
      label: "Open game screen",
      description: "Fix scores or review the full-time screen.",
      onSelect: () => router.push(liveHref),
    });
  }
  if (canRestart) {
    actions.push({
      id: "restart",
      label: "Restart game",
      description: "Wipes every quarter, swap and score.",
      tone: "danger",
      onSelect: () => setDialog("restart"),
    });
  }
  if (canDelete) {
    actions.push({
      id: "delete",
      label: "Delete game",
      description: "Removes the game and its availability.",
      tone: "danger",
      onSelect: () => setDialog("delete"),
    });
  }
  if (actions.length === 0) return null;

  return (
    <>
      <SFButton
        variant="ghost"
        size="md"
        aria-label="More actions"
        icon={<SFIcon.more color="currentColor" />}
        onClick={() => setSheetOpen(true)}
      >
        More
      </SFButton>
      {sheetOpen && (
        <ActionSheet title="Game actions" actions={actions} onClose={() => setSheetOpen(false)} />
      )}
      {dialog === "restart" && (
        <ResetGameDialog
          auth={{ kind: "team", teamId }}
          gameId={gameId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "delete" && (
        <DeleteGameDialog teamId={teamId} gameId={gameId} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
