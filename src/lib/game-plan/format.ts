// ─── Pre-game rotation plan — plain-text formatter ───────────
// The planning-time mirror of the post-game summary's `buildSummary`
// (see src/components/live/GameSummaryCard.tsx). Same shape language —
// an emoji header line and blank-line-separated per-period blocks — so a
// coach who copy/pastes the post-game summary into the team chat reads
// the pre-game plan the same way. Unlike the summary it carries no
// per-player game-time footer: the plan is about who is where each
// period, not minutes banked.
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
  /**
   * Set / named positions: the kid's position in a period (0-based
   * index), shown as "Ava (FF)". Omit when positions aren't in force.
   */
  positionLabel?: (periodIndex: number, playerId: string) => string | undefined;
  /**
   * When and where, and who's out (first names), for the night-before
   * text: parents had to ask (UX round 2, 24 Oct 2026). The time is
   * written in the reader's own time zone, as the game page shows it.
   */
  details?: { scheduledAt?: string | null; venue?: string | null; out?: string[] };
}

/** "1 quarter" / "3 quarters" using the plan's resolved period noun. */
function periodCountPhrase(plan: GamePlan, n: number): string {
  return `${n} ${n === 1 ? plan.periodLabel : plan.periodLabelPlural}`;
}

/**
 * Render a full-game rotation plan as copy/paste text for the team chat.
 * Focuses on WHO IS WHERE each period — there's no per-player game-time
 * footer; the per-period blocks are the whole message.
 *
 * Layout:
 *
 *   🗓 Game plan — Hawks v Eagles
 *   Sat 25 Oct · 9:00 am · Ross Reserve       (when the caller knows)
 *   4 quarters · ~12 min each · subs ~every 3 min
 *   Out: Noah, Sienna                         (when anyone is)
 *
 *   Q1
 *     Back: Jack, Tom, Will
 *     Centre: Sam, Alex, Ben
 *     Forward: Max, Leo, Ned
 *     Interchange (on first → last): Charlie, Ollie, Finn
 *
 *   Q2
 *     …
 *
 * (Netball / rugby league don't rotate within a period, so they keep the
 *  "Bench:" label instead of the interchange queue.)
 */
export function formatGamePlan(
  plan: GamePlan,
  opts: FormatGamePlanOptions,
): string {
  const { teamName, opponentName, playerName, positionLabel, details } = opts;
  const names = (ids: string[], periodIndex?: number) =>
    ids.length > 0
      ? ids
          .map((id) => {
            const pos = periodIndex != null ? positionLabel?.(periodIndex, id) : undefined;
            return pos ? `${playerName(id)} (${pos})` : playerName(id);
          })
          .join(", ")
      : "—";

  const lines: string[] = [];

  // Header — mirrors "🏉 Full time — Team v Opp".
  const opp = opponentName?.trim();
  lines.push(`🗓 Game plan — ${teamName}${opp ? ` v ${opp}` : ""}`);

  // When and where, as the game page's FormattedDateTime says it.
  const at = details?.scheduledAt ? new Date(details.scheduledAt) : null;
  const when =
    at && !Number.isNaN(at.getTime())
      ? `${at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
      : null;
  const where = [when, details?.venue?.trim()].filter(Boolean).join(" · ");
  if (where) lines.push(where);

  // Subhead — period count + minutes-per-period (matches the modal
  // subhead and gives the chat reader the cadence at a glance). For a
  // rolling-sub plan, append the interchange cadence so parents know the
  // bench rotates through rather than sitting whole periods.
  const mins = Math.round(plan.periodMinutes);
  const cadence =
    plan.rotatesWithinPeriod && plan.subIntervalSeconds
      ? ` · subs ~every ${Math.round(plan.subIntervalSeconds / 60)} min`
      : "";
  lines.push(
    `${periodCountPhrase(plan, plan.periods.length)} · ~${mins} min each${cadence}`,
  );
  if (details?.out && details.out.length > 0) lines.push(`Out: ${details.out.join(", ")}`);

  // One block per period: each on-field group on its own indented line,
  // then the bench / interchange queue. When the plan rotates, the queue
  // is ordered next-on-first, so label it as a rotation order rather than
  // a static bench. Empty groups render "—" so a short-squad gap is
  // visible rather than silently dropped. The plan is deliberately just
  // "who is where each period" — no per-player game-time footer, so the
  // chat reads as a lineup, not a minutes ledger.
  const benchLabel = plan.rotatesWithinPeriod
    ? "Interchange (on first → last)"
    : "Bench";
  plan.periods.forEach((period, i) => {
    lines.push(`\n${period.label}`);
    for (const g of period.groups) {
      lines.push(`  ${g.groupLabel}: ${names(g.playerIds, i)}`);
    }
    if (period.bench.length > 0) {
      lines.push(`  ${benchLabel}: ${names(period.bench)}`);
    }
  });

  return lines.join("\n");
}
