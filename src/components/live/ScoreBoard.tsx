"use client";

import { useLiveGame } from "@/lib/stores/liveGameStore";

function points(s: { goals: number; behinds: number }) {
  return s.goals * 6 + s.behinds;
}

interface ScoreBoardProps {
  teamName: string;
  opponentName: string;
  onOpponent?: (kind: "goal" | "behind") => void;
}

export function ScoreBoard({ teamName, opponentName, onOpponent }: ScoreBoardProps) {
  const team = useLiveGame((s) => s.teamScore);
  const opp = useLiveGame((s) => s.opponentScore);

  return (
    <div className="flex items-stretch gap-2 rounded-lg border border-gray-200 bg-white p-2 text-sm shadow-sm">
      <div className="flex-1 text-center">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {teamName}
        </p>
        <p className="tabular-nums text-gray-900">
          <span className="text-lg font-bold">{team.goals}</span>
          <span className="text-lg font-bold">.</span>
          <span className="text-lg font-bold">{team.behinds}</span>
          <span className="text-lg font-bold ml-1">{points(team)}</span>
        </p>
      </div>
      <div className="flex-1 text-center">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {opponentName}
        </p>
        <p className="tabular-nums text-gray-900">
          <span className="text-lg font-bold">{opp.goals}</span>
          <span className="text-lg font-bold">.</span>
          <span className="text-lg font-bold">{opp.behinds}</span>
          <span className="text-lg font-bold ml-1">{points(opp)}</span>
        </p>
        {onOpponent && (
          <div className="mt-1 flex justify-center gap-1">
            <button
              type="button"
              onClick={() => onOpponent("goal")}
              className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-200"
            >
              +G
            </button>
            <button
              type="button"
              onClick={() => onOpponent("behind")}
              className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-200"
            >
              +B
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
