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

/** "Leo → Ava" for a sub, "Ava on" when the spot was empty. */
export function swapToastText(offName: string | null, onName: string): string {
  return offName ? `${offName} → ${onName}` : `${onName} on`;
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
