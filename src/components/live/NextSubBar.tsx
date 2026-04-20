"use client";

interface NextSubBarProps {
  /** Ms until the next sub is due. Null means the sub timer isn't running. */
  msUntilDue: number | null;
  /** Sub interval in ms (used to compute the ring progress). */
  subIntervalMs: number;
  /** How many swaps the engine is currently suggesting. */
  suggestionCount: number;
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Pill showing circular progress + "NEXT SUB IN 1:50" — plus a right-aligned
 * "• N NEXT UP" micro-label when the engine has suggestions queued.
 */
export function NextSubBar({
  msUntilDue,
  subIntervalMs,
  suggestionCount,
}: NextSubBarProps) {
  if (msUntilDue === null) return null;

  const due = msUntilDue <= 0;
  const progress = Math.max(0, Math.min(1, 1 - msUntilDue / subIntervalMs));
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);
  // Hard-coded hexes because Tailwind tokens aren't exposed as CSS variables here.
  const ringColor = due ? "#C8751F" : "#2F6B3E";

  return (
    <div className="flex items-center justify-between">
      <div className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 shadow-card">
        <svg
          width="26"
          height="26"
          viewBox="0 0 26 26"
          className="flex-shrink-0"
          aria-hidden
        >
          <circle cx="13" cy="13" r={r} fill="none" stroke="#E3DFD7" strokeWidth="2.5" />
          <circle
            cx="13"
            cy="13"
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth="2.5"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 13 13)"
            style={{ transition: "stroke-dashoffset 400ms linear" }}
          />
        </svg>
        <div className="flex flex-col leading-none">
          <span className="font-mono text-[9px] font-bold uppercase tracking-micro text-ink-dim">
            {due ? "Sub due" : "Next sub in"}
          </span>
          <span className="nums mt-0.5 font-mono text-sm font-bold text-ink">
            {formatCountdown(Math.abs(msUntilDue))}
          </span>
        </div>
      </div>
      {suggestionCount > 0 && (
        <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-micro text-warn">
          <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
          <span>
            {suggestionCount} Next Up
          </span>
        </div>
      )}
    </div>
  );
}
