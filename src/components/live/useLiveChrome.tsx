"use client";

// ─── useLiveChrome ───────────────────────────────────────────
// The shared live chrome AFL's LiveGame has (the reference), for every
// other sport's live screen to consume rather than re-make (CLAUDE.md
// "Reuse before you fork"). The UX audit of 23 Oct 2026 found soccer's
// family and basketball had drifted on each piece:
//
//   - the one Undo (useOneUndo): the strip names what it takes back,
//     the newest score, foul or swap of this phone's ("Undo: Roos goal —
//     Mia", "Undo: Ava on for Leo"), flashing for 8 s when it's just been
//     recorded (`scored`, `fouled`, `undoStrip`);
//   - a sub made by hand happens at once, and the toast says what changed
//     (`manualSwap`, `swapped`, `toast`); the strip's Undo puts it back.
//     Only a sub that breaks a rule (touch's boys' cap) asks first, on
//     the shared SwapConfirmDialog;
//   - the long-press sheet gets the kid's lent minutes, the season's
//     plus this game's (`loanMinutes`).
//
// The screen renders `toast` near the top (an overlay, as AFL's) and
// `overlays` (the rule-break confirm, the walkthrough) anywhere.
// liveChromeContract.test.ts checks
// every sport's screen has these pieces.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useOneUndo } from "@/components/live/useOneUndo";
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
import { swapsUndoneText, swapUndoLabel, type UndoEvent } from "@/lib/live/lastUndoable";
import type { GameEvent, LiveAuth, Player } from "@/lib/types";

/** How long the swap toast shows (AFL's 2.5 s). */
const TOAST_MS = 2500;

export interface ManualSwap {
  offId: string | null;
  onId: string;
  /** The spot in the sport's words ("Defence", "Guards"). */
  spotName: string;
  /** Makes the swap (the sport's own write). */
  run: () => void;
  /**
   * Puts it back: the same swap with the pair flipped, as a new event
   * (events are never rewritten). The strip's Undo offers it while it's
   * the last thing done. None when the kid filled an empty spot: there's
   * nobody to bring back.
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
   * its write's op id (useOptimisticEvents' write returns it): while it
   * stands, it's what the strip names and Undo takes back.
   */
  scored(score: { side: "us" | "them"; what: string; scorerId?: string | null; key?: string | null }): void;
  /** A foul was recorded (basketball): Undo names it next ("foul on Sam"). */
  fouled(key: string | null | undefined): void;
  /**
   * Another change Undo can put back while it's the last thing done (a
   * sit-out): the strip names it ("Undo: Sam's sit-out") and `run` puts
   * it back.
   */
  undoableChange(label: string, run: () => void): void;
  /** A score was taken back some other way: the strip stops flashing. */
  undone(): void;
  /**
   * The undo strip, for LiveShell's `undo` slot (null when `show` is
   * false or there's nothing to take back). A swap it puts back itself;
   * a score or a foul goes to the screen's write (`onUndo`, `onUndoFoul`).
   */
  undoStrip(opts: {
    show: boolean;
    onUndo: (score: UndoEvent) => void;
    onUndoFoul?: (foul: UndoEvent) => void;
    disabled?: boolean;
    plain?: boolean;
  }): ReactNode;
  /**
   * A sub made by hand (tap-tap, a bench kid into an empty spot): it
   * happens at once and the toast says so, with Undo. Live v3 (Steve,
   * 8 Nov 2026) dropped the "Manually sub…?" confirm; a sub that breaks
   * a rule still asks first.
   */
  manualSwap(swap: ManualSwap): void;
  /**
   * A swap landed without asking (a suggested sub, a filled spot): toast
   * it. `undo`: what the strip's Undo does to put it back (lib/live
   * undoSwaps); without one, a swap before it can't be put back any more.
   */
  swapped(offId: string | null, onId: string, undo?: () => void): void;
  /**
   * Any other change worth a toast ("Ava ⇄ Leo", "2 subs made"). With
   * `undo`, the strip offers it, named `undoLabel` ("the 2 swaps").
   */
  showToast(text: string, undo?: () => void, undoLabel?: string): void;
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
  /** The sport's score event types (Undo takes back the standing ones). */
  scoreTypes: ReadonlySet<string>;
  /** The period in play, else null: a swap from an earlier one can't be put back. */
  period: number | null;
  /** The period's elapsed ms while one is in play, else null. */
  openElapsedMs: number | null;
  /** Live v3's shell: the ink toast over the bar, with its drain bar. */
  toastLook?: "brand" | "ink";
}): LiveChrome {
  const { auth, gameId, teamName, opponentName, playersById, seasonLoanMinutes, events, scoreTypes, period, openElapsedMs, toastLook = "brand" } = opts;
  const [toastText, setToastText] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingSwap, setPendingSwap] = useState<ManualSwap | null>(null);
  const names = useSquadNames();

  useEffect(
    () => () => {
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

  const undo = useOneUndo({ events, scoreTypes, period, teamName, opponentName, firstName });
  const { changed, other } = undo;

  // The toast says what changed; it has no Undo of its own (the strip's
  // is the one Undo, Stagehand round 9).
  const toastOnly = useCallback((text: string) => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    setToastText(text);
    toastTimer.current = setTimeout(() => setToastText(null), TOAST_MS);
    // Light haptic tap on mobile — confirms the swap landed.
    void hapticTap("light");
  }, []);

  const showToast = useCallback(
    (text: string, putBack?: () => void, undoLabel?: string) => {
      toastOnly(text);
      if (putBack) {
        const label = undoLabel ?? text;
        changed({
          label,
          run: () => {
            putBack();
            toastOnly(swapsUndoneText(label));
          },
        });
      } else other();
    },
    [toastOnly, changed, other],
  );

  const swapped = useCallback(
    (offId: string | null, onId: string, putBack?: () => void) =>
      showToast(swapToastText(offId ? firstName(offId) : null, firstName(onId)), putBack, swapUndoLabel([{ off: offId, on: onId }], firstName)),
    [firstName, showToast],
  );

  const makeSwap = useCallback(
    (swap: ManualSwap) => {
      swap.run();
      swapped(swap.offId, swap.onId, swap.undo);
    },
    [swapped],
  );

  const scored: LiveChrome["scored"] = ({ side, what, scorerId, key }) =>
    undo.scored(key, undoMessage({ side, what, teamName, opponentName, scorerName: scorerId ? firstName(scorerId) : null }));

  const squadLoanMins = squadLoanAverage(seasonLoanMinutes ?? {});

  return {
    scored,
    fouled: undo.fouled,
    undoableChange: (label, run) => changed({ label, run }),
    undone: undo.quiet,
    // Names what Undo takes back: this phone's newest score, foul or
    // swap, else the game's latest score (the other phone's, or the next
    // one down after an undo).
    undoStrip: ({ show, onUndo, onUndoFoul, disabled, plain }) =>
      undo.strip({ show, disabled, plain, onScore: onUndo, onFoul: onUndoFoul }),
    manualSwap: (swap) => (swap.ruleWarning ? setPendingSwap(swap) : makeSwap(swap)),
    swapped,
    showToast,
    toast: toastText ? (
      <SwapDoneToast text={toastText} look={toastLook} durationMs={toastLook === "ink" ? TOAST_MS : undefined} />
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
