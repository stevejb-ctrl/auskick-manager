"use client";

// ─── LeagueNextSubCard ───────────────────────────────────────
// League and union's upcoming rotation: the shared NextSubCard (AFL
// SwapCard's shape) with each pair labelled forward or back.

import type { Player } from "@/lib/types";
import { NextSubCard } from "@/components/live/NextSubCard";

interface LeagueSwap {
  off: { playerId: string; msOnField: number };
  on: { playerId: string; msOnBench: number };
  zone: "forward" | "back";
}

interface LeagueNextSubCardProps {
  /** Ordered list of suggested swaps — longest-on-bench first. */
  suggestions: LeagueSwap[];
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
      pairs={suggestions.map((s) => ({
        offId: s.off.playerId,
        onId: s.on.playerId,
        label: ZONE_LABEL[s.zone],
        labelClass: ZONE_COLOR[s.zone],
      }))}
      msUntilDue={msUntilDue}
      subIntervalMs={subIntervalMs}
      due={due}
      onApplyAll={onApplyAll}
      onApplyOne={onApplyOne ? (i) => onApplyOne(suggestions[i]) : undefined}
      pending={pending}
      playerById={playerById}
      pairTestIdPrefix="league-swap-pair"
    />
  );
}
