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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {records.map((r) => {
        const teamScore = r.goalsFor * 6 + r.behindsFor;
        const oppScore = r.goalsAgainst * 6 + r.behindsAgainst;
        return (
          <div key={r.opponent} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="truncate text-sm font-semibold text-gray-900">{r.opponent}</p>
            <p className="mt-1 text-xs text-gray-500">
              {r.gamesPlayed} {r.gamesPlayed === 1 ? "game" : "games"}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-md bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                {r.wins}W
              </span>
              <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {r.losses}L
              </span>
              {r.draws > 0 && (
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {r.draws}D
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              For:{" "}
              <span className="font-medium text-gray-700">
                {r.goalsFor}.{r.behindsFor} ({teamScore})
              </span>
              {" · "}
              Agnst:{" "}
              <span className="font-medium text-gray-700">
                {r.goalsAgainst}.{r.behindsAgainst} ({oppScore})
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
