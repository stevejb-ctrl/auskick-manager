import type { Zone } from "@/lib/types";
import type { ZoneCombination } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

const ZONE_LABEL: Record<Zone, string> = {
  back: "Back",
  hback: "Half-back",
  mid: "Midfield",
  hfwd: "Half-forward",
  fwd: "Forward",
};

const MS_PER_MIN = 60_000;

interface Props {
  combosByZone: Partial<Record<Zone, ZoneCombination[]>>;
  playerNames: Record<string, string>;
  hasData: boolean;
}

export function WinningCombinations({
  combosByZone,
  playerNames,
  hasData,
}: Props) {
  if (!hasData || Object.keys(combosByZone).length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Requires zone-assignment and scoring events to compute lineup effectiveness."
      />
    );
  }

  const zones = Object.keys(combosByZone) as Zone[];

  return (
    <div className="space-y-5">
      {zones.map((zone) => {
        const combos = combosByZone[zone] ?? [];
        if (combos.length === 0) return null;
        return (
          <div key={zone}>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-micro text-ink-mute">
              {ZONE_LABEL[zone]}
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {combos.map((c, i) => {
                const names = c.playerIds
                  .map((id) => playerNames[id] ?? id)
                  .join(", ");
                const netColor =
                  c.netDiff > 0
                    ? "text-brand-600"
                    : c.netDiff < 0
                    ? "text-danger"
                    : "text-ink-mute";
                return (
                  <div
                    key={i}
                    className={`rounded-lg border border-hairline bg-surface p-3 shadow-card ${
                      c.isLowConfidence ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-ink">
                          {names}
                        </p>
                        {c.isLowConfidence && (
                          <span className="mt-1 inline-block rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                            &lt;20 min
                          </span>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-lg font-bold leading-none tabular-nums ${netColor}`}
                      >
                        {c.netDiff > 0 ? "+" : ""}
                        {c.netDiff}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-dim">
                      <span className="tabular-nums">
                        {Math.round(c.durationMs / MS_PER_MIN)} min
                      </span>
                      <span className="h-3 w-px bg-hairline" aria-hidden />
                      <span>
                        <span className="font-semibold text-brand-600 tabular-nums">
                          {c.goalsFor}
                        </span>{" "}
                        for
                      </span>
                      <span>
                        <span className="font-semibold text-danger tabular-nums">
                          {c.goalsAgainst}
                        </span>{" "}
                        agst
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
