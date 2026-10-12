"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SFIcon } from "@/components/sf";
import { teamIdFromPath } from "@/lib/nav";

export interface SwitcherTeam {
  id: string;
  name: string;
  /** "AFL · Under 12" */
  detail: string;
}

/**
 * Team switcher in the app header (UX plan §6: "Siren · [Team ▾]").
 * Shows the current team on team routes and lists the coach's other
 * teams, so switching is one tap from anywhere instead of a trip back
 * to the dashboard. Renders nothing off team routes.
 */
export function TeamSwitcher({ teams }: { teams: SwitcherTeam[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentId = teamIdFromPath(pathname);
  const current = teams.find((t) => t.id === currentId);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!current) return null;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch team — ${current.name}`}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left hover:bg-surface-alt"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{current.name}</span>
          <span className="block truncate text-[11px] text-ink-mute">{current.detail}</span>
        </span>
        <SFIcon.chevronDown />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 max-h-[60vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-hairline bg-surface shadow-pop"
        >
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/teams/${t.id}`}
              role="menuitem"
              aria-current={t.id === current.id ? "true" : undefined}
              className={`block px-3 py-2.5 hover:bg-surface-alt ${t.id === current.id ? "bg-surface-alt" : ""}`}
            >
              <span className="block truncate text-sm font-medium text-ink">{t.name}</span>
              <span className="block truncate text-[11px] text-ink-mute">{t.detail}</span>
            </Link>
          ))}
          <div className="border-t border-hairline">
            <Link href="/dashboard?list=1" role="menuitem" className="block px-3 py-2.5 text-sm text-ink-dim hover:bg-surface-alt">
              All teams
            </Link>
            <Link href="/teams/new" role="menuitem" className="block px-3 py-2.5 text-sm text-ink-dim hover:bg-surface-alt">
              + New team
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
