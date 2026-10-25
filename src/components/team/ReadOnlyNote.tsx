import type { ReactNode } from "react";

/**
 * One line at the top of a screen someone can see but not change,
 * saying who can, in the role's own name ("Only the coach can…").
 * A Manager's Squad and Team tabs used to look editable and say
 * nothing (round 2 usability, 24 Oct 2026).
 */
export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      className="rounded-md border border-hairline bg-surface-alt px-3 py-2 text-xs leading-relaxed text-ink-dim"
    >
      {children}
    </p>
  );
}

/** What a Manager can do, for the end of a read-only note. */
export const MANAGER_CAN = "You're a Manager: you run games and mark availability.";
