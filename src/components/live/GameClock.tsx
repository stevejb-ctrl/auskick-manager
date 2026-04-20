"use client";

import { useEffect, useState } from "react";
import { clockElapsedMs, formatClock, QUARTER_MS, useLiveGame } from "@/lib/stores/liveGameStore";

export function GameClock() {
  const startedAt = useLiveGame((s) => s.clockStartedAt);
  const accumulatedMs = useLiveGame((s) => s.accumulatedMs);
  const quarter = useLiveGame((s) => s.currentQuarter);
  const [, force] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => force((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const elapsed = clockElapsedMs({ clockStartedAt: startedAt, accumulatedMs });
  const remaining = Math.max(0, QUARTER_MS - elapsed);
  const overtime = elapsed > QUARTER_MS;

  return (
    <div className="flex items-baseline justify-center gap-3">
      <span className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
        {quarter === 0 ? "Pre-game" : quarter > 4 ? "Full time" : `Q${quarter}`}
      </span>
      <span
        className={`nums font-mono text-4xl font-bold tracking-tightest ${
          overtime ? "text-warn" : "text-ink"
        }`}
      >
        {formatClock(remaining)}
      </span>
    </div>
  );
}
