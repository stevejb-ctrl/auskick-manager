"use client";

// ─── VestAssignmentCard ──────────────────────────────────────
// Coach-facing picker for the FR (and DH at U9+) vest assignments
// each period. Surfaces at game start and at every period break.
// Renders nothing for age groups that don't require any vest
// (U6, U7).
//
// Behaviour:
//   - The picker only shows the FR row at U8 (vestRequirements.dh
//     is false), and both rows at U9+.
//   - Players who have already worn that vest type this game are
//     greyed out — the "one vest worn once" rule. The same check
//     runs server-side in `assignLeagueVest`, so a stale UI can't
//     bypass it.
//   - "Already assigned" state shows the current wearer's name +
//     a Replace-due-to-injury affordance. Tapping Replace surfaces
//     a second picker that allows ANY eligible on-field player to
//     take the vest mid-period (laws §12 carve-out). The server
//     marks replacement: true on the event so the dashboard /
//     equity report can distinguish carry-overs from fresh stints.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RoleHandoverCard,
  type HandoverRow,
} from "@/components/quarter-break/RoleHandoverCard";
import { PlayerVestBadge } from "./PlayerVestBadge";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import {
  currentVests,
  eligibleForVest,
  type VestType,
} from "@/lib/sports/rugby_league/vests";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { GameEvent, LiveAuth, Player } from "@/lib/types";
import { periodLabels, type RugbySport } from "@/lib/sports";

interface VestAssignmentCardProps {
  auth: LiveAuth;
  /** The team's rugby sport: its words for the period. */
  sport: RugbySport;
  gameId: string;
  /** All squad players (used to look up names for the picker rows). */
  squad: Player[];
  /** Players currently on the field — the eligible pool. */
  onFieldPlayerIds: string[];
  /** All vest_assigned events on the game so we can derive history. */
  events: GameEvent[];
  /** Age-group config — vestRequirements gates which rows render. */
  ageGroup: AgeGroupConfig;
  /** Period the picker is assigning for (1-indexed quarter / half). */
  period: number;
  /** Optional dismiss handler when the card is rendered as a modal/overlay. */
  onDone?: () => void;
  /**
   * Just this vest, with its replacement picker open: the "a vest
   * wearer left the field" prompt. Showing both rows there read as the
   * other wearer being off too (Stagehand round 4).
   */
  vest?: VestType;
}

export function VestAssignmentCard({
  auth,
  sport,
  gameId,
  squad,
  onFieldPlayerIds,
  events,
  ageGroup,
  period,
  onDone,
  vest: onlyVest,
}: VestAssignmentCardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingVest, setPendingVest] = useState<VestType | null>(null);
  const [replacingVest, setReplacingVest] = useState<VestType | null>(onlyVest ?? null);

  const reqs = ageGroup.vestRequirements;
  // U6/U7 have no vest requirement — render nothing.
  if (!reqs || (!reqs.fr && !reqs.dh)) return null;

  const current = currentVests(events, period);
  const playerById = new Map(squad.map((p) => [p.id, p]));

  async function assign(
    vest: VestType,
    playerId: string,
    replacement: boolean,
  ) {
    setPendingVest(vest);
    setError(null);
    const { flushed } = enqueueLiveAction("assignLeagueVest", [
      auth,
      gameId,
      vest,
      period,
      playerId,
      { replacement },
    ]);
    await flushed;
    setPendingVest(null);
    setReplacingVest(null);
    router.refresh();
    onDone?.();
  }

  // One handover row per vest. The rules stay here (who may wear it,
  // what the server records); RoleHandoverCard draws the row.
  function rowFor(vest: VestType, label: string): HandoverRow {
    const wearerId = vest === "fr" ? current.fr : current.dh;
    const wearer = wearerId ? playerById.get(wearerId) ?? null : null;
    const isReplacing = replacingVest === vest;
    // At a break (not the mid-period replace prompt), a planned wearer who
    // isn't on the field — subbed off, hurt or lent since kickoff planned
    // every period — needs someone else for that period: picker open.
    // Without it the period kicked off with the vest on the bench
    // (Stagehand round 5).
    const plannedOff = !!wearerId && !onlyVest && !onFieldPlayerIds.includes(wearerId);
    // Picker mode — either no wearer yet for this period, OR the
    // coach tapped Replace mid-period.
    const picking = !wearer || isReplacing || plannedOff;

    // Replace mode uses `replacement: true` and ignores the
    // no-twice gate (laws §12 carve-out). The eligibility check
    // for the fresh-period path uses `eligibleForVest`.
    //
    // Mutual exclusion: a player can't be both FR and DH at the
    // same time. Whoever currently wears the OTHER vest for this
    // period is excluded from the candidates, even in Replace
    // mode. (The carve-out only lets you bypass the no-twice
    // history, not the both-at-once rule.)
    const otherVestWearer = vest === "fr" ? current.dh : current.fr;
    const candidates = onFieldPlayerIds
      .map((id) => playerById.get(id))
      .filter((p): p is Player => Boolean(p))
      .filter(
        (p) => isReplacing || eligibleForVest(events, p.id, vest),
      )
      .filter((p) => p.id !== otherVestWearer);

    return {
      key: vest,
      badge: <PlayerVestBadge vest={vest} />,
      holder: wearer,
      picking,
      heading: isReplacing
        ? `Replace ${label} (this ${periodWord} only)`
        : `Assign ${label} for ${periodWord} ${period}`,
      note:
        plannedOff && wearer && !isReplacing
          ? `${wearer.full_name} isn’t on the field. Pick who wears it.`
          : null,
      emptyText: `No eligible players on the field for the ${label} vest. Sub someone fresh on first.`,
      candidates: candidates.map((player) => ({ player })),
      pending: pendingVest === vest,
      onReplace: () => setReplacingVest(vest),
      onCancel: isReplacing ? () => setReplacingVest(null) : undefined,
      onPick: (playerId) => assign(vest, playerId, isReplacing),
    };
  }

  const periodWord = periodLabels(sport, ageGroup).label;
  const rows: HandoverRow[] = [];
  if (reqs.fr && (!onlyVest || onlyVest === "fr")) rows.push(rowFor("fr", "First Receiver"));
  if (reqs.dh && (!onlyVest || onlyVest === "dh")) rows.push(rowFor("dh", "Dummy Half"));

  return (
    <RoleHandoverCard
      ariaLabel="Vest assignment"
      title="Vests"
      subtitle={`Rotate each ${periodWord} — no player wears the same vest twice in a game.`}
      error={error}
      rows={rows}
    />
  );
}
