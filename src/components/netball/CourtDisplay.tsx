"use client";

import { Court } from "@/components/netball/Court";
import { PositionToken } from "@/components/netball/PositionToken";
import { primaryThirdFor } from "@/lib/sports/netball";
import type { GenericLineup, PlayerThirdMs } from "@/lib/sports/netball/fairness";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Player } from "@/lib/types";

// ─── CourtDisplay ────────────────────────────────────────────
// The netball court as every screen draws it — live play, the quarter
// break (UX plan principle 2: one lineup, one picture). Moved out of
// NetballLiveGame so the break can render the same picture.
// Tokens stack vertically within each third (top → bottom reads
// GS, GA, WA, C, WD, GD, GK after item 3's WA/WD-to-centre move) and
// are subtly staggered left/right of centre for visual rhythm.
export function CourtDisplay({
  lineup,
  ageGroup,
  squadById,
  disabled,
  onTokenTap,
  onTokenLongPress,
  scoringPositionIds,
  injuredIds,
  loanedIds,
  nextBreakLocks,
  playerStats,
  playerGoals,
  positionPulseKeys,
  wakeUpKey,
  selectedPlayerId = null,
  captions,
}: {
  lineup: GenericLineup;
  ageGroup: AgeGroupConfig;
  squadById: Map<string, Player>;
  disabled?: boolean;
  /** Called with the playerId currently in the tapped position. */
  onTokenTap?: (positionId: string, playerId: string | null) => void;
  /** Called with the playerId for a long-press (≥500ms hold). */
  onTokenLongPress?: (positionId: string, playerId: string | null) => void;
  /**
   * Position ids that signal "tap me to score" (GS + GA in netball). Tokens
   * not in this set are still rendered but have no goal-affordance. The
   * actual handler still fires on tap regardless — this only drives
   * styling — so non-scoring positions can open the long-press menu via
   * the same component without confusing coaches into thinking everyone
   * shoots.
   */
  scoringPositionIds?: Set<string>;
  /** Players flagged as injured this game — drives INJ badge + greyscale. */
  injuredIds?: Set<string>;
  /** Players lent to opposition this game — drives LENT badge + greyscale. */
  loanedIds?: Set<string>;
  /** Position → playerId locks for the next quarter break — drives 🔒 badge. */
  nextBreakLocks?: Record<string, string>;
  /** Per-player {attack, centre, defence} ms — drives the stacked bar + total under each name. */
  playerStats?: Map<string, PlayerThirdMs>;
  /** Per-player goals scored this game — drives the dark chip in each token's top-right corner. */
  playerGoals?: Record<string, number>;
  /**
   * Per-position pulse keys — when a value is present for a
   * positionId, the token at that position halos with the brand
   * pulse on its next render. Driven by the parent's
   * midQuarterSubs state so each mid-quarter sub fires exactly
   * one halo on the position that just changed.
   */
  positionPulseKeys?: Record<string, string>;
  /**
   * Bumped by the parent on the pre-game → Q1 transition. Drives
   * Court's `wakeUpKey` — one-shot brand halo at kickoff. Null
   * (default) on Q-end / FT / read-only renders so the celebration
   * fires exactly once. Mirrors AFL Field.wakeUpKey (P1.5-5).
   */
  wakeUpKey?: number | null;
  /** Planning screens: the player picked for a swap gets the ring. */
  selectedPlayerId?: string | null;
  /** Per-position captions ("STAYS", "GA → WA") on the break court. */
  captions?: Record<string, { text: string; tone: "move" | "stay" }>;
}) {
  const byThird = (third: "attack-third" | "centre-third" | "defence-third") =>
    ageGroup.positions.filter((id) => primaryThirdFor(id) === third);

  const renderThird = (positionIds: string[]) => (
    <>
      {positionIds.map((positionId) => {
        const pid = lineup.positions[positionId]?.[0] ?? null;
        const name = pid ? squadById.get(pid)?.full_name ?? null : null;
        const stats = pid ? playerStats?.get(pid) : undefined;
        const totalMs = stats
          ? stats.attack + stats.centre + stats.defence
          : undefined;
        return (
          <div
            key={positionId}
            className={`relative z-10 flex w-full ${alignClass(positionId)}`}
          >
            <PositionToken
              positionId={positionId}
              playerName={name}
              disabled={disabled}
              canScore={scoringPositionIds?.has(positionId) ?? false}
              injured={injuredIds?.has(pid ?? "") ?? false}
              loaned={loanedIds?.has(pid ?? "") ?? false}
              locked={
                pid != null && nextBreakLocks?.[positionId] === pid
              }
              stats={stats}
              totalMs={totalMs}
              goalCount={pid ? playerGoals?.[pid] : undefined}
              onTap={
                onTokenTap ? () => onTokenTap(positionId, pid) : undefined
              }
              onLongPress={
                onTokenLongPress
                  ? () => onTokenLongPress(positionId, pid)
                  : undefined
              }
              pulseKey={positionPulseKeys?.[positionId]}
              selected={pid != null && pid === selectedPlayerId}
              caption={captions?.[positionId]}
            />
          </div>
        );
      })}
    </>
  );

  return (
    <Court
      attackThird={renderThird(byThird("attack-third"))}
      centreThird={renderThird(byThird("centre-third"))}
      defenceThird={renderThird(byThird("defence-third"))}
      wakeUpKey={wakeUpKey ?? null}
    />
  );
}

// ─── alignClass ─────────────────────────────────────────────
// Position-keyed horizontal alignment within each band. Spreads tokens
// across the full width of the court rather than stacking them in a
// central column.
//
// Pure alternating zigzag down the court — left/right/left/right/left
// /right/left for GS, GA, WA, C, WD, GD, GK respectively. C sits dead
// centre between WA and WD as the genuine pivot. The zigzag keeps
// every adjacent pair on OPPOSITE sides, so GA/WA sit across from each
// other (instead of stacking on the same wing) and the same for WD/GD,
// matching real-court geography where GA defends from the opposite
// side to WA's attacking lane.
//
// AFL doesn't have an analogous concept (zones are spatial bands, not
// named positions), so this is netball-specific and lives here rather
// than in the shared sports config.
//
// Re-skin (design session 17 Oct 2026): three lanes — left 16, centre,
// right 16 (x 16 / 117 / 218 at 390 with the 124px token) — at the
// classic centre-pass spots: GS and GK in their circles, C on the
// centre circle, GA / WD right, WA / GD left.
function alignClass(positionId: string): string {
  switch (positionId) {
    case "gs":
      return "justify-center";
    case "ga":
      return "justify-end pr-4";
    case "wa":
      return "justify-start pl-4";
    case "c":
      return "justify-center";
    case "wd":
      return "justify-end pr-4";
    case "gd":
      return "justify-start pl-4";
    case "gk":
      return "justify-center";
    default:
      return "justify-center";
  }
}
