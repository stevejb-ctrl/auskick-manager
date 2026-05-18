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
import { SFButton, Guernsey } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { PlayerVestBadge } from "./PlayerVestBadge";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import {
  currentVests,
  eligibleForVest,
  type VestType,
} from "@/lib/sports/rugby_league/vests";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { GameEvent, LiveAuth, Player } from "@/lib/types";

interface VestAssignmentCardProps {
  auth: LiveAuth;
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
}

export function VestAssignmentCard({
  auth,
  gameId,
  squad,
  onFieldPlayerIds,
  events,
  ageGroup,
  period,
  onDone,
}: VestAssignmentCardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingVest, setPendingVest] = useState<VestType | null>(null);
  const [replacingVest, setReplacingVest] = useState<VestType | null>(null);

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

  function renderRow(vest: VestType, label: string) {
    const wearerId = vest === "fr" ? current.fr : current.dh;
    const wearer = wearerId ? playerById.get(wearerId) ?? null : null;
    const isReplacing = replacingVest === vest;
    const isPending = pendingVest === vest;

    if (wearer && !isReplacing) {
      return (
        <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-3 py-2.5">
          <div className="flex items-center gap-2">
            <PlayerVestBadge vest={vest} />
            <span className="text-sm font-medium text-ink">
              {wearer.full_name}
            </span>
          </div>
          <SFButton
            size="sm"
            variant="ghost"
            onClick={() => setReplacingVest(vest)}
            disabled={isPending}
          >
            Replace
          </SFButton>
        </div>
      );
    }

    // Picker mode — either no wearer yet for this period, OR the
    // coach tapped Replace mid-period.
    //
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

    return (
      <div className="space-y-2 rounded-lg border border-brand-500/30 bg-brand-50 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlayerVestBadge vest={vest} />
            <span className="text-sm font-semibold text-ink">
              {isReplacing
                ? `Replace ${label} (injury, this ${ageGroup.periodLabel ?? "period"} only)`
                : `Assign ${label} for ${ageGroup.periodLabel ?? "period"} ${period}`}
            </span>
          </div>
          {isReplacing && (
            <SFButton
              size="sm"
              variant="ghost"
              onClick={() => setReplacingVest(null)}
              disabled={isPending}
            >
              Cancel
            </SFButton>
          )}
        </div>

        {candidates.length === 0 ? (
          <p className="text-xs text-ink-mute">
            No eligible players on the field for the {label} vest. Sub
            someone fresh on first.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {candidates.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={isPending}
                onClick={() => assign(vest, p.id, isReplacing)}
                className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-2.5 py-2 text-left text-sm transition-colors hover:border-brand-600 active:scale-[0.97] disabled:opacity-50"
              >
                <Guernsey
                  num={p.jersey_number != null ? String(p.jersey_number) : ""}
                  size={26}
                />
                <span className="min-w-0 flex-1 truncate text-ink">
                  {p.full_name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <section
      aria-label="Vest assignment"
      className="space-y-3 rounded-xl border border-hairline bg-surface p-3 shadow-card"
    >
      <header className="px-1">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-dim">
          Vests
        </h2>
        <p className="text-xs text-ink-mute">
          Rotate each {ageGroup.periodLabel ?? "period"} — no player wears the same
          vest twice in a game.
        </p>
      </header>
      {error && <InlineAlert kind="danger">{error}</InlineAlert>}
      {reqs.fr && renderRow("fr", "First Receiver")}
      {reqs.dh && renderRow("dh", "Dummy Half")}
    </section>
  );
}
