"use client";

interface NextSubBarProps {
  /** Ms until the next sub is due. Null means the sub timer isn't running. */
  msUntilDue: number | null;
  /** Sub interval in ms (used to compute the ring progress). */
  subIntervalMs: number;
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Pill showing circular progress + "NEXT SUB IN 1:50".
 * When the sub is overdue the countdown freezes at 0:00 and pulses "NOW".
 */
export function NextSubBar({ msUntilDue, subIntervalMs }: NextSubBarProps) {
  if (msUntilDue === null) return null;

  const due = msUntilDue <= 0;
  const progress = Math.max(0, Math.min(1, 1 - msUntilDue / subIntervalMs));
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);
  const ringColor = due ? "#C8751F" : "#2F6B3E";

  return (
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
        {due ? (
          <span className="nums mt-0.5 animate-pulse font-mono text-sm font-bold text-warn">
            NOW
          </span>
        ) : (
          <span className="nums mt-0.5 font-mono text-sm font-bold text-ink">
            {formatCountdown(msUntilDue)}
          </span>
        )}
      </div>
    </div>
  );
}
