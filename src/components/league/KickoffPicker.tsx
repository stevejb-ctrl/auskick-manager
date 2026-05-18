"use client";

// ─── KickoffPicker ───────────────────────────────────────────
// Surfaces at the start of each period when no kickoff has been
// recorded yet. Junior Laws §16: "Once a player has taken a
// kickoff to start the quarter that player may not take another
// kickoff until all other players of the same team have been
// given an opportunity to kick." The pool is the FULL squad, not
// just on-field — the kicker is selected just before the whistle
// and may still be warming up.
//
// Pure UX over the `recordKickoff` server action; the server
// re-derives the cycle and is the authority. Coach can also tap
// "Skip" to record nothing — laws don't mandate tracking, just the
// rotation.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton, Guernsey } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import {
  kickoffCycle,
  nextEligibleKickoffTakers,
} from "@/lib/sports/rugby_league/kicks";
import type { GameEvent, LiveAuth, Player } from "@/lib/types";

interface KickoffPickerProps {
  auth: LiveAuth;
  gameId: string;
  squad: Player[];
  events: GameEvent[];
  /** The period this kickoff is for (1-indexed). */
  period: number;
  /** Tap "Skip" — closes the picker without writing. */
  onSkip: () => void;
}

export function KickoffPicker({
  auth,
  gameId,
  squad,
  events,
  period,
  onSkip,
}: KickoffPickerProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const squadIds = squad.map((p) => p.id);
  const cycle = kickoffCycle(events, squadIds);
  const eligible = new Set(nextEligibleKickoffTakers(events, squadIds));
  const showResetBanner
    = cycle.taken.size === 0 && events.some((e) => e.type === "kickoff_taken");

  async function commit(kickerId: string) {
    setPendingId(kickerId);
    const { flushed } = enqueueLiveAction("recordKickoff", [
      auth,
      gameId,
      period,
      kickerId,
      squadIds,
    ]);
    await flushed;
    setPendingId(null);
    router.refresh();
  }

  return (
    <section className="space-y-2 rounded-xl border border-brand-500/30 bg-brand-50 p-3 shadow-card">
      <header className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-dim">
            Kickoff
          </h2>
          <p className="text-xs text-ink-mute">
            Who&apos;s kicking off this period? Laws §16 rotation enforced.
          </p>
        </div>
        <SFButton size="sm" variant="ghost" onClick={onSkip}>
          Skip
        </SFButton>
      </header>

      {showResetBanner && (
        <InlineAlert kind="warn">
          Rotation reset — every player has had a turn. Starting a new cycle.
        </InlineAlert>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {squad.map((p) => {
          const canPick = eligible.has(p.id);
          const isPending = pendingId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={!canPick || isPending}
              onClick={() => commit(p.id)}
              className={[
                "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors active:scale-[0.97]",
                canPick
                  ? "border-hairline bg-surface text-ink hover:border-brand-600"
                  : "border-hairline bg-surface-alt text-ink-mute opacity-60",
              ].join(" ")}
            >
              <Guernsey
                num={p.jersey_number != null ? String(p.jersey_number) : ""}
                size={26}
              />
              <span className="min-w-0 flex-1 truncate">{p.full_name}</span>
              {!canPick && (
                <span className="text-[10px] uppercase tracking-wide">Done</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
