"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton, SFIcon } from "@/components/sf";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/ActionSheet";
import { ResetGameDialog } from "@/components/games/ResetGameButton";
import { DeleteGameDialog } from "@/components/games/DeleteGameDialog";
import { GameDayLinkDialog } from "@/components/games/GameDayLinkDialog";
import { EditGameDialog } from "@/components/games/EditGameDialog";
import type { AgeGroupConfig } from "@/lib/sports/types";

interface GameMoreMenuProps {
  teamId: string;
  gameId: string;
  /** games.share_token — enables "Game-day link". */
  shareToken?: string;
  /** Opens the game screen (for a final game that's no longer the primary). */
  liveHref?: string;
  /** Enables "Edit details" (upcoming games). */
  edit?: {
    ageGroup: AgeGroupConfig;
    game: {
      id: string;
      opponent: string;
      scheduled_at: string;
      location: string | null;
      round_number: number | null;
      notes: string | null;
    };
  };
  canRestart: boolean;
  canDelete: boolean;
}

type Dialog = "link" | "edit" | "restart" | "delete" | null;

/**
 * The game hub's overflow: everything that isn't the one primary action
 * for the game's state (UX plan §6 Game hub, principle 6). Destructive
 * actions live here so they never sit stacked under the primary button.
 */
export function GameMoreMenu({
  teamId,
  gameId,
  shareToken,
  liveHref,
  edit,
  canRestart,
  canDelete,
}: GameMoreMenuProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const actions: ActionSheetAction[] = [];
  if (liveHref) {
    actions.push({
      id: "open-live",
      label: "Open game screen",
      description: "Fix scores or review the full-time screen.",
      onSelect: () => router.push(liveHref),
    });
  }
  if (shareToken) {
    actions.push({
      id: "link",
      label: "Game-day link",
      description: "Let someone run this game without an account.",
      onSelect: () => setDialog("link"),
    });
  }
  if (edit) {
    actions.push({
      id: "edit",
      label: "Edit details",
      description: "Opponent, time, round, location and notes.",
      onSelect: () => setDialog("edit"),
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

  const close = () => setDialog(null);

  return (
    <>
      <SFButton
        variant="ghost"
        size="md"
        aria-label="More actions"
        icon={<SFIcon.more color="currentColor" />}
        onClick={() => setSheetOpen(true)}
        className="w-full whitespace-nowrap !px-2 sm:w-auto sm:!px-[18px]"
      >
        More
      </SFButton>
      {sheetOpen && (
        <ActionSheet title="Game actions" actions={actions} onClose={() => setSheetOpen(false)} />
      )}
      {dialog === "link" && shareToken && <GameDayLinkDialog token={shareToken} onClose={close} />}
      {dialog === "edit" && edit && (
        <EditGameDialog teamId={teamId} ageGroup={edit.ageGroup} game={edit.game} onClose={close} />
      )}
      {dialog === "restart" && (
        <ResetGameDialog auth={{ kind: "team", teamId }} gameId={gameId} onClose={close} />
      )}
      {dialog === "delete" && <DeleteGameDialog teamId={teamId} gameId={gameId} onClose={close} />}
    </>
  );
}
