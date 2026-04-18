"use client";

import { useEffect, useState } from "react";
import { clockElapsedMs, formatClock, useLiveGame } from "@/lib/stores/liveGameStore";

const QUARTER_MS = 12 * 60 * 1000;

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
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {quarter === 0 ? "Pre-game" : quarter > 4 ? "Full time" : `Q${quarter}`}
      </span>
      <span
        className={`text-4xl font-bold tabular-nums ${
          overtime ? "text-red-600" : "text-gray-900"
        }`}
      >
        {formatClock(remaining)}
      </span>
    </div>
  );
}
