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
      <h2 className="text-lg font-semibold text-ink">Squad management</h2>
      <div className="text-right">
        <span
          className={`text-2xl font-bold tabular-nums ${
            isFull ? "text-warn" : "text-brand-600"
          }`}
        >
          {activeCount}
        </span>
        <span className="text-lg text-ink-mute"> / {maxPlayers}</span>
        <p className="text-xs text-ink-mute">players</p>
      </div>
    </div>
  );
}
