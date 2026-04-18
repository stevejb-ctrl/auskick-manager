interface SquadHeaderProps {
  activeCount: number;
  maxPlayers?: number;
}

export function SquadHeader({
  activeCount,
  maxPlayers = 15,
}: SquadHeaderProps) {
  const isFull = activeCount >= maxPlayers;

  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-gray-800">Squad management</h2>
      <div className="text-right">
        <span
          className={`text-2xl font-bold tabular-nums ${
            isFull ? "text-amber-600" : "text-brand-600"
          }`}
        >
          {activeCount}
        </span>
        <span className="text-lg text-gray-400"> / {maxPlayers}</span>
        <p className="text-xs text-gray-400">players</p>
      </div>
    </div>
  );
}
