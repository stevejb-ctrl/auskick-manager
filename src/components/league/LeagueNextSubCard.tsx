"use client";

// ─── LeagueNextSubCard ───────────────────────────────────────
// League and union's upcoming rotation: the shared NextSubCard (AFL
// SwapCard's shape) with each pair labelled forward or back, or by the
// spot the kid coming on takes with named positions ("HK2 Tevita →
// Leo"; UX audit, 23 Oct 2026). Empty spots on a short side come first,
// a bench kid on with nobody off (round 3 edge cases, 24 Oct 2026).

import type { Player } from "@/lib/types";
import { NextSubCard } from "@/components/live/NextSubCard";
import type { RugbyFill } from "@/lib/sports/rugby/fills";

interface LeagueSwap {
  off: { playerId: string; msOnField: number };
  on: { playerId: string; msOnBench: number };
  zone: "forward" | "back";
  /** Named positions: the slot the kid coming on takes over. */
  position?: { key: string; label: string };
}

interface LeagueNextSubCardProps {
  /** Ordered list of suggested swaps — longest-on-bench first. */
  suggestions: LeagueSwap[];
  /** Empty spots to fill first, nobody off. */
  fills?: RugbyFill[];
  /** Fill one empty spot. */
  onApplyFill?: (fill: RugbyFill) => void;
  /** ms remaining until the next sub-due moment. Null when timer not running. */
  msUntilDue: number | null;
  /** Full sub interval ms — sizes the progress ring. */
  subIntervalMs: number | null;
  /** Sub state — "due" triggers a warn ring and forces the card open. */
  due: boolean;
  /** Apply ALL suggested swaps. */
  onApplyAll: () => void;
  /** Apply a single pair (optional — coach can run a partial rotation). */
  onApplyOne?: (swap: LeagueSwap) => void;
  /** Pending guard — disables the action buttons while a swap is in flight. */
  pending: boolean;
  /** Player lookup. */
  playerById: Map<string, Player>;
}

const ZONE_LABEL: Record<"forward" | "back", string> = {
  forward: "FWD",
  back: "BACK",
};
const ZONE_COLOR: Record<"forward" | "back", string> = {
  forward: "text-warn",
  back: "text-brand-200",
};

export function LeagueNextSubCard({
  suggestions,
  fills = [],
  onApplyFill,
  msUntilDue,
  subIntervalMs,
  due,
  onApplyAll,
  onApplyOne,
  pending,
  playerById,
}: LeagueNextSubCardProps) {
  return (
    <NextSubCard
      pairs={[
        ...fills.map((f) => ({ offId: null, onId: f.playerId, label: ZONE_LABEL[f.zone], labelClass: ZONE_COLOR[f.zone] })),
        ...suggestions.map((s) => ({
          offId: s.off.playerId,
          onId: s.on.playerId,
          label: s.position?.label ?? ZONE_LABEL[s.zone],
          labelClass: ZONE_COLOR[s.zone],
        })),
      ]}
      msUntilDue={msUntilDue}
      subIntervalMs={subIntervalMs}
      due={due}
      onApplyAll={onApplyAll}
      onApplyOne={
        onApplyOne
          ? (i) => (i < fills.length ? onApplyFill?.(fills[i]) : onApplyOne(suggestions[i - fills.length]))
          : undefined
      }
      pending={pending}
      playerById={playerById}
      pairTestIdPrefix="league-swap-pair"
    />
  );
}
