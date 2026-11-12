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

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton, Guernsey } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import {
  kickoffCycle,
  nextEligibleKickoffTakers,
  seasonKickoffCountsByPlayer,
} from "@/lib/sports/rugby_league/kicks";
import type { GameEvent, LiveAuth, Player } from "@/lib/types";

interface KickoffPickerProps {
  auth: LiveAuth;
  gameId: string;
  squad: Player[];
  events: GameEvent[];
  /**
   * Prior season events (this game excluded). Drives the per-
   * candidate "K {N}" badge so the coach can see how often each
   * player has kicked off across the season. Empty / undefined =
   * first game of the season, badges hidden.
   */
  seasonEvents?: GameEvent[];
  /** The period this kickoff is for (1-indexed). */
  period: number;
  /** Tap "Skip" — closes the picker without writing. */
  onSkip: () => void;
  /**
   * Live v3: "sheet" is the kick-off sheet the live screen opens from its
   * Kickoff prompt: who can kick, fewest first, and Skip. The card stays
   * for anywhere else.
   */
  look?: "card" | "sheet";
  /** A kicker was picked and saved (the sheet closes). */
  onPicked?: () => void;
}

export function KickoffPicker({
  auth,
  gameId,
  squad,
  events,
  seasonEvents,
  period,
  onSkip,
  look = "card",
  onPicked,
}: KickoffPickerProps) {
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const squadIds = squad.map((p) => p.id);
  const cycle = kickoffCycle(events, squadIds);
  const eligible = new Set(nextEligibleKickoffTakers(events, squadIds));
  const showResetBanner
    = cycle.taken.size === 0 && events.some((e) => e.type === "kickoff_taken");
  // Per-player kickoff totals from prior season games + earlier
  // periods of THIS game. Shown under each candidate as "K {N}" so
  // the coach can balance kickoff exposure the same way VestPlanRow
  // surfaces FR/DH season counts. Memoised because the season log
  // can be long and we re-render on each pending-tap.
  const kickoffCounts = useMemo(() => {
    const seasonCounts = seasonKickoffCountsByPlayer(seasonEvents ?? []);
    const thisGameCounts = seasonKickoffCountsByPlayer(events);
    const merged: Record<string, number> = { ...seasonCounts };
    for (const [id, n] of Object.entries(thisGameCounts)) {
      merged[id] = (merged[id] ?? 0) + n;
    }
    return merged;
  }, [seasonEvents, events]);
  // Suppress badges entirely when nobody in the squad has ever
  // kicked off — clean-slate first-game-of-season reads better
  // without zeros plastered across every tile.
  const anyKickoffsRecorded = squad.some((p) => (kickoffCounts[p.id] ?? 0) > 0);

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
    onPicked?.();
    router.refresh();
  }

  if (look === "sheet") {
    // Who can kick, fewest kick-offs first (then by number), as v3 lists them.
    const order = squad
      .filter((p) => eligible.has(p.id))
      .sort((a, b) => (kickoffCounts[a.id] ?? 0) - (kickoffCounts[b.id] ?? 0) || (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
    const shown = showAll ? order : order.slice(0, 6);
    return (
      <section aria-labelledby="kickoff-bar-title" className="flex flex-col gap-[7px]">
        <div className="flex items-start gap-[8px] pl-[3px]">
          <div className="min-w-0 flex-1">
            <h2 id="kickoff-bar-title" className="font-display stretch-75 text-[1.1875rem] font-extrabold leading-[1.05] text-ink">
              Kickoff
            </h2>
            <p className="mt-[2px] text-[0.75rem] text-ink-mute">Who&apos;s kicking off? Kick-offs go round the team (§16). Fewest first.</p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="flex min-h-[44px] flex-none items-center rounded-[12px] px-[12px] font-display text-[0.875rem] font-extrabold uppercase text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] hover:bg-surface-alt"
          >
            Skip
          </button>
        </div>
        {showResetBanner && (
          <p className="pl-[3px] text-[0.75rem] text-ink-dim">Rotation reset: every player has had a turn.</p>
        )}
        <div className="grid grid-cols-3 gap-[6px] bigtext:grid-cols-2">
          {shown.map((p, i) => {
            const n = kickoffCounts[p.id] ?? 0;
            return (
              <button
                key={p.id}
                type="button"
                disabled={pendingId !== null}
                onClick={() => commit(p.id)}
                className="flex min-h-[48px] min-w-0 flex-col items-start justify-center rounded-[12px] bg-[rgb(var(--t-ink)/0.045)] px-[8px] text-left disabled:opacity-60 motion-safe:active:scale-[0.97]"
              >
                <span className="w-full truncate font-display stretch-75 text-[0.9375rem] font-extrabold leading-tight text-ink">{p.full_name}</span>
                <span className="text-[0.6875rem] text-ink-mute" aria-label={`Kicked off ${n} ${n === 1 ? "time" : "times"} this season`}>
                  K {n}
                  {i === 0 ? " · next" : ""}
                </span>
              </button>
            );
          })}
          {!showAll && order.length > shown.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex min-h-[48px] items-center justify-center rounded-[12px] text-[0.8125rem] font-bold text-ink-dim underline decoration-hairline underline-offset-[3px]"
            >
              {order.length - shown.length} more
            </button>
          )}
        </div>
      </section>
    );
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
          const kickoffCount = kickoffCounts[p.id] ?? 0;
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
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{p.full_name}</span>
                {/* Season kickoff count — matches VestPlanRow's
                    "FR N · DH N" rhythm but for the K rotation.
                    Hidden when the whole squad is at zero (cleaner
                    first-game-of-season look). */}
                {anyKickoffsRecorded && (
                  <span
                    className={`font-mono text-nano uppercase tracking-micro ${
                      kickoffCount > 0 ? "font-bold text-warn" : "text-ink-mute"
                    }`}
                    aria-label={`Kicked off ${kickoffCount} ${kickoffCount === 1 ? "time" : "times"} this season`}
                  >
                    K {kickoffCount}
                  </span>
                )}
              </span>
              {!canPick && (
                <span className="text-nano uppercase tracking-wide">Done</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
