import type { HeadToHeadRecord } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

interface Props {
  records: HeadToHeadRecord[];
  hasData: boolean;
}

export function HeadToHead({ records, hasData }: Props) {
  if (!hasData || records.length === 0) {
    return (
      <EmptyState
        title="No completed games yet"
        description="Records against each opponent will appear here once games are finalised."
      />
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {records.map((r) => {
        const teamScore = r.goalsFor * 6 + r.behindsFor;
        const oppScore = r.goalsAgainst * 6 + r.behindsAgainst;
        return (
          <div
            key={r.opponent}
            className="rounded-lg border border-hairline bg-surface p-3 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                {r.opponent}
              </p>
              <p className="shrink-0 text-[11px] text-ink-mute">
                {r.gamesPlayed} {r.gamesPlayed === 1 ? "game" : "games"}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 tabular-nums">
                {r.wins}W
              </span>
              <span className="rounded bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger tabular-nums">
                {r.losses}L
              </span>
              {r.draws > 0 && (
                <span className="rounded bg-surface-alt px-2 py-0.5 text-xs font-semibold text-ink-dim tabular-nums">
                  {r.draws}D
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-micro text-ink-mute">
                  For
                </p>
                <p className="font-medium tabular-nums text-ink">
                  {r.goalsFor}.{r.behindsFor}{" "}
                  <span className="text-ink-mute">({teamScore})</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-micro text-ink-mute">
                  Against
                </p>
                <p className="font-medium tabular-nums text-ink">
                  {r.goalsAgainst}.{r.behindsAgainst}{" "}
                  <span className="text-ink-mute">({oppScore})</span>
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
