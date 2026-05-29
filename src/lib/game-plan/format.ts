// ─── Pre-game rotation plan — plain-text formatter ───────────
// The planning-time mirror of the post-game summary's `buildSummary`
// (see src/components/live/GameSummaryCard.tsx). Same shape language —
// an emoji header line, blank-line-separated sections, and a per-player
// game-time footer sorted most → least — so a coach who copy/pastes the
// post-game summary into the team chat reads the pre-game plan the same
// way.
//
// Pure: takes a `GamePlan` (from ./project) plus a player-name lookup,
// returns the text. No React, no clipboard — the copy affordance lives
// in the shared CopyableTextBlock.

import type { GamePlan } from "./types";

export interface FormatGamePlanOptions {
  /** Coach's team name for the header line. */
  teamName: string;
  /** Opponent name, when known. Omitted → header drops the "v …" half. */
  opponentName?: string | null;
  /**
   * Resolve a player id → display label (e.g. "Jack" or "#7 Jack").
   * The caller decides whether to include the jersey number; unknown
   * ids fall back to the id so the plan never silently drops a player.
   */
  playerName: (playerId: string) => string;
}

/** "1 quarter" / "3 quarters" using the plan's resolved period noun. */
function periodCountPhrase(plan: GamePlan, n: number): string {
  return `${n} ${n === 1 ? plan.periodLabel : plan.periodLabelPlural}`;
}

/**
 * Render a full-game rotation plan as copy/paste text for the team chat.
 *
 * Layout:
 *
 *   🗓 Game plan — Hawks v Eagles
 *   4 quarters · ~12 min each
 *
 *   Q1
 *     Back: Jack, Tom, Will
 *     Centre: Sam, Alex, Ben
 *     Forward: Max, Leo, Ned
 *     Bench: Charlie, Ollie, Finn
 *
 *   Q2
 *     …
 *
 *   ⏱ Planned game time (most → least)
 *   #7 Jack — 4 quarters · ~48 min
 *   Tom — 3 quarters · ~36 min
 */
export function formatGamePlan(
  plan: GamePlan,
  opts: FormatGamePlanOptions,
): string {
  const { teamName, opponentName, playerName } = opts;
  const names = (ids: string[]) =>
    ids.length > 0 ? ids.map(playerName).join(", ") : "—";

  const lines: string[] = [];

  // Header — mirrors "🏉 Full time — Team v Opp".
  const opp = opponentName?.trim();
  lines.push(`🗓 Game plan — ${teamName}${opp ? ` v ${opp}` : ""}`);

  // Subhead — period count + minutes-per-period (matches the modal
  // subhead and gives the chat reader the cadence at a glance).
  const mins = Math.round(plan.periodMinutes);
  lines.push(
    `${periodCountPhrase(plan, plan.periods.length)} · ~${mins} min each`,
  );

  // One block per period: each on-field group on its own indented
  // line, then the bench. Empty groups render "—" so a short-squad
  // gap is visible rather than silently dropped.
  for (const period of plan.periods) {
    lines.push(`\n${period.label}`);
    for (const g of period.groups) {
      lines.push(`  ${g.groupLabel}: ${names(g.playerIds)}`);
    }
    if (period.bench.length > 0) {
      lines.push(`  Bench: ${names(period.bench)}`);
    }
  }

  // Footer — planned game time per player, most → least (totals are
  // already sorted that way by the projector). Skips players projected
  // to never get on so the list reads as "who's playing, and how much".
  const played = plan.totals.filter((t) => t.periodsOnField > 0);
  if (played.length > 0) {
    lines.push(`\n⏱ Planned game time (most → least)`);
    for (const t of played) {
      lines.push(
        `${playerName(t.playerId)} — ${periodCountPhrase(plan, t.periodsOnField)} · ~${t.minutes} min`,
      );
    }
  }

  return lines.join("\n");
}
