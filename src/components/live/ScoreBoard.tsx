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
    <div className="flex items-stretch gap-2 rounded-md border border-hairline bg-surface p-2 text-sm shadow-card">
      <div className="flex-1 text-center">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {teamName}
        </p>
        <p className="nums font-mono text-ink">
          <span className="text-lg font-bold">{team.goals}</span>
          <span className="text-lg font-bold text-ink-mute">.</span>
          <span className="text-lg font-bold">{team.behinds}</span>
          <span className="ml-1 text-lg font-bold">{points(team)}</span>
        </p>
      </div>
      <div className="w-px self-stretch bg-hairline" aria-hidden />
      <div className="flex-1 text-center">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {opponentName}
        </p>
        <p className="nums font-mono text-ink">
          <span className="text-lg font-bold">{opp.goals}</span>
          <span className="text-lg font-bold text-ink-mute">.</span>
          <span className="text-lg font-bold">{opp.behinds}</span>
          <span className="ml-1 text-lg font-bold">{points(opp)}</span>
        </p>
        {onOpponent && (
          <div className="mt-1 flex justify-center gap-1">
            <button
              type="button"
              onClick={() => onOpponent("goal")}
              className="rounded-xs bg-surface-alt px-2 py-0.5 text-[11px] font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink"
            >
              +G
            </button>
            <button
              type="button"
              onClick={() => onOpponent("behind")}
              className="rounded-xs bg-surface-alt px-2 py-0.5 text-[11px] font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink"
            >
              +B
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
