"use client";

// ─── useLiveChrome ───────────────────────────────────────────
// The shared live chrome AFL's LiveGame has (the reference), for every
// other sport's live screen to consume rather than re-make (CLAUDE.md
// "Reuse before you fork"). The UX audit of 23 Oct 2026 found soccer's
// family and basketball had drifted on each piece:
//
//   - the undo strip flashes what was just recorded ("Roos goal — Mia")
//     for 8 s, then settles to "Undo last score" (`scored`, `undoStrip`);
//   - a tap-tap sub asks first (the shared SwapConfirmDialog), then a
//     toast says what changed (`confirmSwap`, `swapped`, `toast`);
//   - the long-press sheet gets the kid's lent minutes, the season's
//     plus this game's (`loanMinutes`).
//
// The screen renders `toast` near the top (an overlay, as AFL's) and
// `overlays` (the confirm) anywhere. liveChromeContract.test.ts checks
// every sport's screen has these pieces.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { UndoStrip } from "@/components/live/UndoStrip";
import { SwapConfirmDialog } from "@/components/live/SwapConfirmDialog";
import { SwapDoneToast } from "@/components/live/SwapDoneToast";
import { useSquadNames } from "@/components/live/SquadNames";
import { hapticTap } from "@/lib/haptics";
import {
  liveLoanMinutes,
  squadLoanAverage,
  swapToastText,
  undoMessage,
} from "@/lib/live/liveChrome";
import type { GameEvent, Player } from "@/lib/types";

/** How long the undo strip flashes what was recorded (AFL's 8 s). */
const UNDO_FLASH_MS = 8000;
/** How long the swap toast shows (AFL's 2.5 s). */
const TOAST_MS = 2500;
/** Long enough to tap Undo after "Make all swaps". */
const UNDO_TOAST_MS = 6000;

interface PendingSwap {
  offId: string | null;
  onId: string;
  /** The spot in the sport's words ("Defence", "Guards"). */
  spotName: string;
  onConfirm: () => void;
  /**
   * The rule this sub breaks (touch's boys' cap), on the same confirm:
   * its buttons then read "Swap anyway" and "Pick someone else".
   */
  ruleWarning?: string | null;
  /** After Cancel ("Pick someone else": the kid tapped first stays picked). */
  onCancel?: () => void;
}

export interface LiveChrome {
  /** A score was recorded: the undo strip flashes what it was. */
  scored(score: { side: "us" | "them"; what: string; scorerId?: string | null }): void;
  /** The last score was taken back: the strip stops flashing. */
  undone(): void;
  /** The undo strip, for LiveStickyScoreBar (null when `show` is false). */
  undoStrip(opts: { show: boolean; onUndo: () => void; disabled?: boolean }): ReactNode;
  /** Ask before a tap-tap sub; on Confirm it runs and the toast shows. */
  confirmSwap(swap: PendingSwap): void;
  /**
   * A swap landed without asking (a suggested sub, a filled spot): toast
   * it. `undo`: "Make all swaps"' Undo on the toast (lib/live undoSwaps).
   */
  swapped(offId: string | null, onId: string, undo?: () => void): void;
  /** Any other change worth a toast ("Ava ⇄ Leo", "2 subs made" with its Undo). */
  showToast(text: string, undo?: () => void): void;
  /** The swap toast, near the top of the screen (an overlay). */
  toast: ReactNode;
  /** The swap confirm. */
  overlays: ReactNode;
  /** A kid's first name, as the toasts and strip say it. */
  firstName(playerId: string): string;
  /** The long-press sheet's lent minutes for a kid. */
  loanMinutes(playerId: string): { seasonLoanMins: number; squadLoanMins: number };
}

export function useLiveChrome(opts: {
  teamName: string;
  opponentName: string;
  playersById: Map<string, Player>;
  /** Lent minutes in the season's other games (seasonLoanMinutes). */
  seasonLoanMinutes?: Record<string, number>;
  /** This game's events (with any not saved yet). */
  events: GameEvent[];
  /** The period's elapsed ms while one is in play, else null. */
  openElapsedMs: number | null;
}): LiveChrome {
  const { teamName, opponentName, playersById, seasonLoanMinutes, events, openElapsedMs } = opts;
  const [message, setMessage] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<{ run: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null);
  const names = useSquadNames();

  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    },
    [],
  );

  const firstName = useCallback(
    (playerId: string) => {
      const p = playersById.get(playerId);
      if (!p) return "Player";
      // "Jack", or "Jack S" beside another Jack (SquadNames).
      return names.first(p);
    },
    [playersById, names],
  );

  const showToast = useCallback((text: string, undo?: () => void) => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    setToastText(text);
    setToastUndo(undo ? { run: undo } : null);
    toastTimer.current = setTimeout(() => {
      setToastText(null);
      setToastUndo(null);
    }, undo ? UNDO_TOAST_MS : TOAST_MS);
    // Light haptic tap on mobile — confirms the swap landed.
    void hapticTap("light");
  }, []);

  const swapped = useCallback(
    (offId: string | null, onId: string, undo?: () => void) =>
      showToast(swapToastText(offId ? firstName(offId) : null, firstName(onId)), undo),
    [firstName, showToast],
  );

  const scored: LiveChrome["scored"] = ({ side, what, scorerId }) => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    setMessage(undoMessage({ side, what, teamName, opponentName, scorerName: scorerId ? firstName(scorerId) : null }));
    setFlashing(true);
    flashTimer.current = setTimeout(() => setFlashing(false), UNDO_FLASH_MS);
  };

  const undone = () => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    flashTimer.current = null;
    setFlashing(false);
    setMessage(null);
  };

  const squadLoanMins = squadLoanAverage(seasonLoanMinutes ?? {});

  return {
    scored,
    undone,
    undoStrip: ({ show, onUndo, disabled }) =>
      show ? (
        <UndoStrip flashing={flashing && message !== null} message={message ?? ""} onUndo={onUndo} disabled={disabled} />
      ) : null,
    confirmSwap: setPendingSwap,
    swapped,
    showToast,
    toast: toastText ? (
      <SwapDoneToast
        text={toastText}
        undoLabel={toastText.endsWith(" subs made") ? "Undo swaps" : "Undo"}
        onUndo={
          toastUndo
            ? () => {
                toastUndo.run();
                showToast("Swaps undone");
              }
            : undefined
        }
      />
    ) : null,
    overlays: pendingSwap ? (
      <SwapConfirmDialog
        off={pendingSwap.offId ?? ""}
        on={pendingSwap.onId}
        spotName={pendingSwap.spotName}
        playersById={playersById}
        ruleWarning={pendingSwap.ruleWarning ?? null}
        onConfirm={() => {
          const swap = pendingSwap;
          setPendingSwap(null);
          swap.onConfirm();
          swapped(swap.offId, swap.onId);
        }}
        onCancel={() => {
          const swap = pendingSwap;
          setPendingSwap(null);
          swap.onCancel?.();
        }}
      />
    ) : null,
    firstName,
    loanMinutes: (playerId) => ({
      seasonLoanMins: liveLoanMinutes({
        seasonLoanMinutes: seasonLoanMinutes ?? {},
        events,
        playerId,
        openElapsedMs,
      }),
      squadLoanMins,
    }),
  };
}
