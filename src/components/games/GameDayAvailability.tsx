"use client";

import { useState, type ReactNode } from "react";
import { SFIcon } from "@/components/sf";

interface GameDayAvailabilityProps {
  inCount: number;
  total: number;
  /** First names of squad players currently Out, for the summary line. */
  outNames: string[];
  /** Open on first render — used when nobody is in yet. */
  defaultOpen?: boolean;
  /** The availability list (server-rendered AvailabilityList). */
  children: ReactNode;
}

// ─── GameDayAvailability ─────────────────────────────────────
// "Who's here" on the game-day (lineup) screen. Game day is one screen
// (UX plan §4 target journey): a no-show is marked Out right here and
// the lineup rebuilds without them, instead of a round trip to the
// availability page. Collapsed it's one summary line, so the field
// keeps the screen. The availability page stays for the night before.
export function GameDayAvailability({
  inCount,
  total,
  outNames,
  defaultOpen = false,
  children,
}: GameDayAvailabilityProps) {
  const [open, setOpen] = useState(defaultOpen);
  const summary =
    outNames.length > 0
      ? `${inCount} of ${total} in · Out: ${outNames.join(", ")}`
      : `${inCount} of ${total} in`;

  return (
    <section className="rounded-lg border border-hairline bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="game-day-availability"
        className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left"
      >
        <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Who&apos;s here
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{summary}</span>
        <span
          aria-hidden
          className={`text-ink-mute transition-transform duration-fast ease-out-quart ${open ? "rotate-180" : ""}`}
        >
          <SFIcon.chevronDown />
        </span>
      </button>
      {open && (
        <div id="game-day-availability" className="border-t border-hairline p-3">
          {children}
        </div>
      )}
    </section>
  );
}
