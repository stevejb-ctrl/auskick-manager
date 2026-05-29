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
  ...modalProps
}: GamePlanButtonProps) {
  const [open, setOpen] = useState(false);

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
        <GamePlanModal {...modalProps} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
