"use client";

// ─── GamePlanButton ──────────────────────────────────────────
// The entry affordance for the pre-game rotation planner. A thin
// client shell: it owns nothing but the open/closed state, renders a
// shared SFButton, and lifts the GamePlanModal on tap. Every prop is
// forwarded straight through to the modal, so the two mount points
// (the game-detail page action row and each sport's pre-kickoff
// lineup screen) configure the planner identically.
//
// Kept separate from GamePlanModal so server components can import a
// single button without pulling the modal's client weight into their
// initial render — the modal only mounts once the coach asks for it.

import { useState } from "react";
import { SFButton, SFIcon } from "@/components/sf";
import { withPinnedPeriods } from "@/lib/game-plan";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { GamePlanModal, type GamePlanModalProps } from "./GamePlanModal";

type SFButtonVariant = "primary" | "accent" | "alarm" | "ghost" | "subtle" | "danger";
type SFButtonSize = "sm" | "md" | "lg";

export interface GamePlanButtonProps
  extends Omit<GamePlanModalProps, "onClose"> {
  /** Button label. Defaults to "Game plan". */
  label?: string;
  /** SFButton variant — defaults to "ghost" so it sits beside primaries. */
  variant?: SFButtonVariant;
  /** SFButton size — defaults to "sm". */
  size?: SFButtonSize;
  /** Stretch the button to its container width. */
  full?: boolean;
  className?: string;
  /**
   * From a page without the lineup (the game page): the game whose later
   * periods the coach pinned on its lineup ("Use this plan"). The plan
   * opens on them, as the lineup's own Game plan does, so the two share
   * the same text (UX round 2, 24 Oct 2026). A lineup screen passes its
   * own adjustInitialPlan instead.
   */
  pinnedPlanGameId?: string;
}

/**
 * Opens the pre-game rotation planner. Renders a button; on tap it
 * mounts the GamePlanModal with the same props. Closing unmounts the
 * modal so its projection state resets cleanly each time.
 */
export function GamePlanButton({
  label = "Game plan",
  variant = "ghost",
  size = "sm",
  full,
  className,
  pinnedPlanGameId,
  ...modalProps
}: GamePlanButtonProps) {
  const [open, setOpen] = useState(false);
  const plannedRotation = useLiveGame((s) => s.plannedRotation);
  const adjustInitialPlan =
    modalProps.adjustInitialPlan ??
    (pinnedPlanGameId
      ? (plan: Parameters<NonNullable<GamePlanModalProps["adjustInitialPlan"]>>[0]) =>
          withPinnedPeriods(plan, {
            pin: plannedRotation?.gameId === pinnedPlanGameId ? plannedRotation : null,
            fromPeriodIndex: 1,
            availableIds: modalProps.players.map((p) => p.id),
          })
      : undefined);

  return (
    <>
      <SFButton
        variant={variant}
        size={size}
        full={full}
        className={className}
        onClick={() => setOpen(true)}
        icon={<SFIcon.whistle />}
      >
        {label}
      </SFButton>
      {open && (
        <GamePlanModal {...modalProps} adjustInitialPlan={adjustInitialPlan} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
