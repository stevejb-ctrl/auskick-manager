"use client";

import { usePathname } from "next/navigation";
import { SegTabs, type SegTabOption } from "@/components/sf";

interface TeamTabBarProps {
  teamId: string;
}

/**
 * Per-team navigation. Pill segmented control (SF design) replacing
 * the previous underline tab strip. Routing logic preserved exactly:
 * each tab is a Next.js Link, active is determined by `usePathname`.
 *
 * The Home tab uses an exact match because every other tab path
 * starts with `/teams/[teamId]/...` and would otherwise also match
 * Home's prefix.
 */
export function TeamTabBar({ teamId }: TeamTabBarProps) {
  const pathname = usePathname();

  const tabs: Array<SegTabOption & { exact?: boolean }> = [
    { id: "home", label: "Home", href: `/teams/${teamId}`, exact: true },
    { id: "squad", label: "Squad", href: `/teams/${teamId}/squad` },
    { id: "games", label: "Games", href: `/teams/${teamId}/games` },
    { id: "stats", label: "Stats", href: `/teams/${teamId}/stats` },
    { id: "settings", label: "Settings", href: `/teams/${teamId}/settings` },
  ];

  const activeId =
    tabs.find((t) =>
      t.exact ? pathname === t.href : pathname?.startsWith(t.href!)
    )?.id ?? "home";

  // Constrain width on desktop so the segmented control doesn't stretch
  // across the whole 1080px content area — the design caps it ~560px
  // and left-aligns. On phone it stretches full-width.
  return (
    <div className="max-w-[560px] overflow-x-auto scrollbar-none">
      <SegTabs
        options={tabs}
        value={activeId}
        size="md"
        full
        ariaLabel="Team sections"
      />
    </div>
  );
}
