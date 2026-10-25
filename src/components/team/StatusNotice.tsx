import type { ReactNode } from "react";

/**
 * A one-off confirmation at the top of the page after joining or
 * leaving a team ("You left Coogee Stingrays."). Joining and leaving
 * used to land you somewhere with no word of what happened (round 2
 * usability, 24 Oct 2026).
 */
export function StatusNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-ok/30 bg-ok/10 px-4 py-3 text-sm leading-relaxed text-ink"
    >
      {children}
    </div>
  );
}
