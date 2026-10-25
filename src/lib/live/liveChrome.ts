// ─── The live chrome's words and numbers ─────────────────────
// What the shared live chrome shows in every sport (useLiveChrome.tsx):
// the undo strip's "what was recorded", the swap toast, and a kid's
// lent minutes on the long-press sheet. AFL's LiveGame is the
// reference; these are its strings, so every sport reads the same.
// Pure.

import type { GameEvent } from "@/lib/types";
import { gameLoanMinutes } from "@/lib/fairness";

/** "Roos goal — Mia", "Crabs goal", "Cobras 3 points — Kai". */
export function undoMessage(score: {
  side: "us" | "them";
  /** What was scored, in the sport's words ("goal", "try", "3 points"). */
  what: string;
  teamName: string;
  opponentName: string;
  scorerName?: string | null;
}): string {
  const team = score.side === "us" ? score.teamName : score.opponentName;
  return `${team} ${score.what}${score.side === "us" && score.scorerName ? ` — ${score.scorerName}` : ""}`;
}

/**
 * What a sub card's per-pair button is called for a screen reader: "Swap
 * Leo Ng off, Ava Bell on", or "Put Ava Bell on" into an empty spot. Every
 * row's "Make swap" read the same (UX round 3, e4).
 */
export function swapPairLabel(offName: string | null, onName: string): string {
  return offName ? `Swap ${offName} off, ${onName} on` : `Put ${onName} on`;
}

/** "Leo → Ava" for a sub, "Ava on" when the spot was empty. */
export function swapToastText(offName: string | null, onName: string): string {
  return offName ? `${offName} → ${onName}` : `${onName} on`;
}

/**
 * The toast's Undo after "Make all swaps": the same swaps back, last
 * first, each kid coming back on where they went off (the sport's own
 * swap, called with the pair flipped). Round 3 edge testing (24 Oct
 * 2026): a mistaken batch took two hand swaps and two confirms to put
 * back. Nothing to undo when a swap filled an empty spot (taking a kid
 * off with nobody for them isn't a swap).
 */
export function undoSwaps<S extends { off: string | null; on: string }>(
  made: S[],
  swap: (s: S & { off: string }) => void,
): (() => void) | undefined {
  if (made.length === 0 || made.some((s) => s.off === null)) return undefined;
  return () => {
    for (const s of [...made].reverse()) swap({ ...s, off: s.on, on: s.off as string });
  };
}

/**
 * A kid's lent minutes for the long-press sheet: the season's (other
 * games), plus this game's — the stint still open counted up to now
 * when a period is in play (`openElapsedMs`, the period's elapsed ms;
 * null at a break or before the start).
 */
export function liveLoanMinutes(input: {
  seasonLoanMinutes: Record<string, number>;
  events: GameEvent[];
  playerId: string;
  openElapsedMs: number | null;
}): number {
  const { seasonLoanMinutes, events, playerId, openElapsedMs } = input;
  const mine = events.filter((e) => e.player_id === playerId || e.type !== "player_loan");
  // A period in play: close any open stint at now, as quarter_end would.
  const closed =
    openElapsedMs === null
      ? mine
      : [
          ...mine,
          {
            id: "now",
            game_id: "",
            type: "quarter_end",
            player_id: null,
            metadata: { elapsed_ms: openElapsedMs },
            created_by: null,
            // After every real event (the replay sorts by created_at).
            created_at: "9999-12-31T23:59:59.999Z",
          } as GameEvent,
        ];
  return (seasonLoanMinutes[playerId] ?? 0) + (gameLoanMinutes(closed)[playerId] ?? 0);
}

/** The squad's average lent minutes, over the kids who've been lent (AFL's sheet). */
export function squadLoanAverage(seasonLoanMinutes: Record<string, number>): number {
  const lent = Object.values(seasonLoanMinutes).filter((v) => v > 0);
  return lent.length > 0 ? lent.reduce((a, b) => a + b, 0) / lent.length : 0;
}
