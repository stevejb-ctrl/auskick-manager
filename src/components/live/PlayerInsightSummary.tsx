"use client";

// F3 (Phase 12) — SHARED, sport-agnostic long-press player summary.
//
// Consumed verbatim by AFL (LockModal), rugby league (LockModal) and
// netball (NetballPlayerActions) via the host's `insight` slot. It owns
// presentation only; the numbers come from the pure `buildPlayerInsight`
// view-model so all three sports render identical chrome (reuse-before-fork).
//
// Three sections, each with a stable test id:
//   player-insight-ingame  — this game: time since last sub + per-zone time
//   player-insight-periods — per-period zone breakdown (one row per period)
//   player-insight-season  — season per-zone PERCENTAGES (D-04, no raw mins)

import { buildPlayerInsight, type PlayerInsightInput } from "@/lib/player-insight";
import { formatClock } from "@/lib/stores/liveGameStore";

interface PlayerInsightSummaryProps {
  input: PlayerInsightInput;
}

const SECTION_LABEL =
  "font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute";

export function PlayerInsightSummary({ input }: PlayerInsightSummaryProps) {
  const vm = buildPlayerInsight(input);
  const activeInGame = vm.inGameZones.filter((z) => z.ms > 0);

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-md bg-surface-alt p-3">
      {/* This game ------------------------------------------------------ */}
      <section data-testid="player-insight-ingame" className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className={SECTION_LABEL}>This game</span>
          <span className="text-xs text-ink-dim">
            {vm.msSinceLastSub === null ? (
              "Not on yet"
            ) : (
              <>
                On{" "}
                <span className="font-semibold text-ink">
                  {formatClock(vm.msSinceLastSub)}
                </span>
              </>
            )}
          </span>
        </div>
        {activeInGame.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {activeInGame.map((z) => (
              <span
                key={z.id}
                className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink"
              >
                <span className="text-ink-mute">{z.shortLabel}</span>{" "}
                <span className="font-semibold tabular-nums">
                  {formatClock(z.ms)}
                </span>
              </span>
            ))}
            <span className="rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-warm tabular-nums">
              {formatClock(vm.inGameTotalMs)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-ink-mute">No field time yet</span>
        )}
      </section>

      {/* Per-period ----------------------------------------------------- */}
      {vm.perPeriod.length > 0 && (
        <section
          data-testid="player-insight-periods"
          className="flex flex-col gap-1.5 border-t border-hairline pt-2"
        >
          <span className={SECTION_LABEL}>By period</span>
          <div className="flex flex-col gap-1">
            {vm.perPeriod.map((p) => {
              const active = p.zones.filter((z) => z.ms > 0);
              return (
                <div
                  key={p.period}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="shrink-0 text-xs font-semibold text-ink">
                    {p.periodLabel}
                  </span>
                  <span className="flex flex-1 flex-wrap justify-end gap-x-2 gap-y-0.5 text-xs text-ink-dim">
                    {active.length > 0 ? (
                      active.map((z) => (
                        <span key={z.id}>
                          <span className="text-ink-mute">{z.shortLabel}</span>{" "}
                          <span className="tabular-nums">{formatClock(z.ms)}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-ink-mute">bench</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Season (percentages only) -------------------------------------- */}
      <section
        data-testid="player-insight-season"
        className="flex flex-col gap-1.5 border-t border-hairline pt-2"
      >
        <span className={SECTION_LABEL}>Season mix</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {vm.seasonZonePct.map((z) => (
            <span key={z.id} className="text-xs text-ink-dim">
              <span className="text-ink-mute">{z.label}</span>{" "}
              <span className="font-semibold text-ink tabular-nums">{z.pct}%</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
