"use client";

import { useState } from "react";
import { SFButton, SFIcon } from "@/components/sf";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/ActionSheet";
import { ResetGameDialog } from "@/components/games/ResetGameButton";
import { DeleteGameDialog } from "@/components/games/DeleteGameDialog";
import { GameDayLinkDialog } from "@/components/games/GameDayLinkDialog";
import { EditGameDialog } from "@/components/games/EditGameDialog";
import { FixScoresDialog, type FixScoresProps } from "@/components/games/FixScoresDialog";
import { restartGameHint } from "@/lib/sports/words";

interface GameMoreMenuProps {
  teamId: string;
  gameId: string;
  /** games.share_token — enables "Game-day link". */
  shareToken?: string;
  /**
   * A finished game's scores, fixable here (it used to be "Open game
   * screen: fix scores", which opened a read-only summary).
   */
  fixScores?: FixScoresProps;
  /** Enables "Edit details" (upcoming games). */
  edit?: {
    game: {
      id: string;
      opponent: string;
      scheduled_at: string;
      location: string | null;
      round_number: number | null;
      notes: string | null;
    };
    /** For the same-name opponent warning. */
    teamName?: string;
  };
  canRestart: boolean;
  /** Team admins: "Get a new link" in the Game-day link dialog. */
  canReplaceLink?: boolean;
  canDelete: boolean;
  /** The team's period word: Restart wipes "every half" in a halves game. */
  periodLabel: "quarter" | "half" | "period";
  /** The game is being played: Delete's confirm says so and waits for a tick. */
  live?: boolean;
}

type Dialog = "link" | "edit" | "fix" | "restart" | "delete" | null;

/**
 * The game hub's overflow: everything that isn't the one primary action
 * for the game's state (UX plan §6 Game hub, principle 6). Destructive
 * actions live here so they never sit stacked under the primary button.
 */
export function GameMoreMenu({
  teamId,
  gameId,
  shareToken,
  fixScores,
  edit,
  canRestart,
  canReplaceLink = false,
  canDelete,
  periodLabel,
  live = false,
}: GameMoreMenuProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const actions: ActionSheetAction[] = [];
  if (fixScores) {
    actions.push({
      id: "fix-scores",
      label: "Fix scores",
      description: "Take a score off, change who scored, or add a missed one.",
      onSelect: () => setDialog("fix"),
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
      description: restartGameHint(periodLabel),
      tone: "danger",
      onSelect: () => setDialog("restart"),
    });
  }
  if (canDelete) {
    actions.push({
      id: "delete",
      label: "Delete game",
      description: live ? "It's being played right now. Removes it for everyone." : "Removes the game and its availability.",
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
      {dialog === "link" && shareToken && (
        <GameDayLinkDialog
          token={shareToken}
          onClose={close}
          replace={canReplaceLink ? { teamId, gameId } : undefined}
        />
      )}
      {dialog === "fix" && fixScores && <FixScoresDialog {...fixScores} onClose={close} />}
      {dialog === "edit" && edit && (
        <EditGameDialog teamId={teamId} game={edit.game} teamName={edit.teamName} onClose={close} />
      )}
      {dialog === "restart" && (
        <ResetGameDialog auth={{ kind: "team", teamId }} gameId={gameId} onClose={close} />
      )}
      {dialog === "delete" && <DeleteGameDialog teamId={teamId} gameId={gameId} onClose={close} live={live} />}
    </>
  );
}
