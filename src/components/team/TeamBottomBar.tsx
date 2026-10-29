"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SFIcon } from "@/components/sf";
import { showsTeamBottomBar } from "@/lib/nav";
import { teamTabs } from "@/components/team/teamTabs";

const ICONS: Record<string, ReactNode> = {
  today: <SFIcon.today />,
  games: <SFIcon.calendar />,
  squad: <SFIcon.users />,
  stats: <SFIcon.chart />,
  team: <SFIcon.sliders />,
};

/**
 * Phone navigation for a team: a bottom tab bar (UX plan §6 — it's a
 * one-handed sideline app and the thumb reaches the bottom, not the
 * top). Top tabs take over from 768 px (TeamTabBar). Hidden on the
 * full-screen game modes so the field keeps the whole screen.
 *
 * Renders an in-flow spacer as well, so page content never sits under
 * the fixed bar.
 */
export function TeamBottomBar({ teamId, role }: { teamId: string; role?: string | null }) {
  const pathname = usePathname();
  if (!showsTeamBottomBar(pathname)) return null;

  const tabs = teamTabs(teamId, role);
  const activeId =
    tabs.find((t) => (t.exact ? pathname === t.href : pathname?.startsWith(t.href)))?.id ??
    "today";

  return (
    <>
      <div aria-hidden className="h-16 md:hidden" />
      <nav
        aria-label="Team sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul
          className="mx-auto grid max-w-md"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-micro font-semibold transition-colors duration-fast ease-out-quart ${
                    active ? "text-brand-700" : "text-ink-mute hover:text-ink"
                  }`}
                >
                  <span aria-hidden>{ICONS[t.id]}</span>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
