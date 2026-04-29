type Status = "live" | "upcoming" | "final";

interface StatusPillProps {
  status: Status;
  /** Optional accessible label (e.g. "Live, Q3, 4 minutes 12 seconds"). */
  ariaLabel?: string;
}

/**
 * Game-status chip. Three tones:
 *   - `live`     alarm-tinted with a pulsing dot (matches `siren-pulse` keyframe in globals.css)
 *   - `upcoming` neutral surface-alt
 *   - `final`    ghost outline
 *
 * Per the design spec the live pill always includes the literal "LIVE"
 * text alongside the dot — colour isn't the only signal.
 */
export function StatusPill({ status, ariaLabel }: StatusPillProps) {
  if (status === "live") {
    return (
      <span
        aria-label={ariaLabel ?? "Live"}
        className="inline-flex items-center gap-1.5 rounded-full bg-alarm-soft py-1 pl-2 pr-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-alarm"
      >
        <span
          aria-hidden="true"
          className="siren-dot--pulsing inline-block h-[7px] w-[7px] rounded-full bg-alarm"
          style={{ ["--siren-pulse-r" as string]: "8px" } as React.CSSProperties}
        />
        Live
      </span>
    );
  }

  if (status === "upcoming") {
    return (
      <span
        aria-label={ariaLabel ?? "Upcoming"}
        className="inline-flex items-center rounded-full bg-surface-alt px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink"
      >
        Upcoming
      </span>
    );
  }

  return (
    <span
      aria-label={ariaLabel ?? "Final"}
      className="inline-flex items-center rounded-full border border-hairline bg-transparent px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute"
    >
      Final
    </span>
  );
}
