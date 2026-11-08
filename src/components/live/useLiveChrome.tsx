"use client";

// ─── useLiveChrome ───────────────────────────────────────────
// The shared live chrome AFL's LiveGame has (the reference), for every
// other sport's live screen to consume rather than re-make (CLAUDE.md
// "Reuse before you fork"). The UX audit of 23 Oct 2026 found soccer's
// family and basketball had drifted on each piece:
//
//   - the undo strip flashes what was just recorded ("Roos goal — Mia")
//     for 8 s, then settles quietly, still naming it (`scored`, `undoStrip`);
//   - a sub made by hand happens at once, and the toast says what changed
//     with an Undo for 6 s (`manualSwap`, `swapped`, `toast`). Only a sub
//     that breaks a rule (touch's boys' cap) asks first, on the shared
//     SwapConfirmDialog;
//   - the long-press sheet gets the kid's lent minutes, the season's
//     plus this game's (`loanMinutes`).
//
// The screen renders `toast` near the top (an overlay, as AFL's) and
// `overlays` (the rule-break confirm, the walkthrough) anywhere.
// liveChromeContract.test.ts checks
// every sport's screen has these pieces.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { UndoStrip } from "@/components/live/UndoStrip";
import { SwapConfirmDialog } from "@/components/live/SwapConfirmDialog";
import { SwapDoneToast } from "@/components/live/SwapDoneToast";
import { WalkthroughModal, buildSharedWalkthroughSteps } from "@/components/live/WalkthroughModal";
import { useSquadNames } from "@/components/live/SquadNames";
import { ScoresSheet } from "@/components/live/ScoresSheet";
import { hapticTap } from "@/lib/haptics";
import {
  liveLoanMinutes,
  squadLoanAverage,
  swapToastText,
  undoMessage,
} from "@/lib/live/liveChrome";
import type { GameEvent, LiveAuth, Player } from "@/lib/types";

/** How long the undo strip flashes what was recorded (AFL's 8 s). */
const UNDO_FLASH_MS = 8000;
/** How long the swap toast shows (AFL's 2.5 s). */
const TOAST_MS = 2500;
/** Long enough to tap Undo after "Make all swaps". */
const UNDO_TOAST_MS = 6000;

export interface ManualSwap {
  offId: string | null;
  onId: string;
  /** The spot in the sport's words ("Defence", "Guards"). */
  spotName: string;
  /** Makes the swap (the sport's own write). */
  run: () => void;
  /**
   * Puts it back: the same swap with the pair flipped, as a new event
   * (events are never rewritten). The toast offers it for 6 s. None when
   * the kid filled an empty spot: there's nobody to bring back.
   */
  undo?: () => void;
  /**
   * The rule this sub breaks (touch's boys' cap): the one hand sub that
   * asks first, on the shared confirm, whose buttons then read "Swap
   * anyway" and "Pick someone else".
   */
  ruleWarning?: string | null;
  /** After "Pick someone else" (the kid tapped first stays picked). */
  onCancel?: () => void;
}

export interface LiveChrome {
  /**
   * A score was recorded: the undo strip flashes what it was. `key` is
   * its write's op id (useOptimisticEvents' write returns it): the score
   * the strip names, which its Undo takes back (undoTap).
   */
  scored(score: { side: "us" | "them"; what: string; scorerId?: string | null; key?: string | null }): void;
  /** The write key of the score the strip names, until it's undone. */
  namedScoreKey: string | null;
  /** The last score was taken back: the strip stops flashing. */
  undone(): void;
  /** The undo strip, for LiveShell's `undo` slot (null when `show` is false). */
  undoStrip(opts: { show: boolean; onUndo: () => void; disabled?: boolean; target?: string | null; plain?: boolean }): ReactNode;
  /**
   * A sub made by hand (tap-tap, a bench kid into an empty spot): it
   * happens at once and the toast says so, with Undo. Live v3 (Steve,
   * 8 Nov 2026) dropped the "Manually sub…?" confirm; a sub that breaks
   * a rule still asks first.
   */
  manualSwap(swap: ManualSwap): void;
  /**
   * A swap landed without asking (a suggested sub, a filled spot): toast
   * it. `undo`: "Make all swaps"' Undo on the toast (lib/live undoSwaps).
   */
  swapped(offId: string | null, onId: string, undo?: () => void): void;
  /** Any other change worth a toast ("Ava ⇄ Leo", "2 subs made" with its Undo). */
  showToast(text: string, undo?: () => void): void;
  /** The swap toast, near the top of the screen (an overlay). */
  toast: ReactNode;
  /** The rule-break confirm and the walkthrough. */
  overlays: ReactNode;
  /** Opens the walkthrough (the top bar's ?), these sports' first. */
  openHelp(): void;
  /** Opens the Scores and fixes sheet (live/ScoresSheet), in `overlays`. */
  openScores(): void;
  /** A kid's first name, as the toasts and strip say it. */
  firstName(playerId: string): string;
  /** The long-press sheet's lent minutes for a kid. */
  loanMinutes(playerId: string): { seasonLoanMins: number; squadLoanMins: number };
}

export function useLiveChrome(opts: {
  /** Who's running the game, and which: the Scores and fixes sheet reads and fixes its log. */
  auth: LiveAuth;
  gameId: string;
  teamName: string;
  opponentName: string;
  playersById: Map<string, Player>;
  /** Lent minutes in the season's other games (seasonLoanMinutes). */
  seasonLoanMinutes?: Record<string, number>;
  /** This game's events (with any not saved yet). */
  events: GameEvent[];
  /** The period's elapsed ms while one is in play, else null. */
  openElapsedMs: number | null;
  /** Live v3's shell: the ink toast over the bar, with its drain bar. */
  toastLook?: "brand" | "ink";
}): LiveChrome {
  const { auth, gameId, teamName, opponentName, playersById, seasonLoanMinutes, events, openElapsedMs, toastLook = "brand" } = opts;
  const [message, setMessage] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [namedScoreKey, setNamedScoreKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<{ run: () => void } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingSwap, setPendingSwap] = useState<ManualSwap | null>(null);
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

  const makeSwap = useCallback(
    (swap: ManualSwap) => {
      swap.run();
      swapped(swap.offId, swap.onId, swap.undo);
    },
    [swapped],
  );

  const scored: LiveChrome["scored"] =({ side, what, scorerId, key }) => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    setNamedScoreKey(key ?? null);
    setMessage(undoMessage({ side, what, teamName, opponentName, scorerName: scorerId ? firstName(scorerId) : null }));
    setFlashing(true);
    flashTimer.current = setTimeout(() => setFlashing(false), UNDO_FLASH_MS);
  };

  const undone = () => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    flashTimer.current = null;
    setFlashing(false);
    setMessage(null);
    setNamedScoreKey(null);
  };

  const squadLoanMins = squadLoanAverage(seasonLoanMinutes ?? {});

  return {
    scored,
    namedScoreKey,
    undone,
    // Named after this phone's last score, else what Undo will take back
    // (the other phone's, or the next one down after an undo).
    undoStrip: ({ show, onUndo, disabled, target, plain }) =>
      show ? (
        <UndoStrip flashing={flashing && message !== null} message={message ?? target ?? ""} onUndo={onUndo} disabled={disabled} plain={plain} />
      ) : null,
    manualSwap: (swap) => (swap.ruleWarning ? setPendingSwap(swap) : makeSwap(swap)),
    swapped,
    showToast,
    toast: toastText ? (
      <SwapDoneToast
        text={toastText}
        look={toastLook}
        durationMs={toastLook === "ink" ? (toastUndo ? UNDO_TOAST_MS : TOAST_MS) : undefined}
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
    openHelp: () => setHelpOpen(true),
    openScores: () => setScoresOpen(true),
    overlays: scoresOpen ? (
      <ScoresSheet auth={auth} gameId={gameId} onClose={() => setScoresOpen(false)} />
    ) : helpOpen ? (
      <WalkthroughModal steps={buildSharedWalkthroughSteps()} onClose={() => setHelpOpen(false)} />
    ) : pendingSwap ? (
      <SwapConfirmDialog
        off={pendingSwap.offId ?? ""}
        on={pendingSwap.onId}
        spotName={pendingSwap.spotName}
        playersById={playersById}
        ruleWarning={pendingSwap.ruleWarning ?? null}
        onConfirm={() => {
          const swap = pendingSwap;
          setPendingSwap(null);
          makeSwap(swap);
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
