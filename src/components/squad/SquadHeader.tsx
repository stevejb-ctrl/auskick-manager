import { Eyebrow } from "@/components/sf";

interface SquadHeaderProps {
  activeCount: number;
  maxPlayers: number;
}

/**
 * Squad page header — eyebrow + h1 "Squad" + count chip on the right.
 * Mirrors the page-header pattern used on Games and Dashboard.
 */
export function SquadHeader({ activeCount, maxPlayers }: SquadHeaderProps) {
  const isFull = activeCount >= maxPlayers;
  return (
    <header className="flex items-end justify-between gap-3">
      <div>
        <Eyebrow>2026 Season</Eyebrow>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tightest text-ink sm:text-[32px]">
          Squad
        </h1>
      </div>
      <div className="text-right">
        <span
          className={`font-mono text-2xl font-bold tabular-nums leading-none ${
            isFull ? "text-warn" : "text-ink"
          }`}
        >
          {activeCount}
        </span>
        <span className="font-mono text-lg text-ink-mute">/{maxPlayers}</span>
        <p className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
          Players
        </p>
      </div>
    </header>
  );
}
