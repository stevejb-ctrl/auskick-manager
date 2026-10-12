"use client";

import { usePathname } from "next/navigation";
import { SegTabs } from "@/components/sf";
import { teamTabs } from "@/components/team/teamTabs";

interface TeamTabBarProps {
  teamId: string;
}

/**
 * Desktop / tablet team navigation (≥ 768 px). Phones use the bottom
 * TeamBottomBar instead; both read the same five sections.
 */
export function TeamTabBar({ teamId }: TeamTabBarProps) {
  const pathname = usePathname();
  const tabs = teamTabs(teamId);
  const activeId =
    tabs.find((t) => (t.exact ? pathname === t.href : pathname?.startsWith(t.href)))?.id ??
    "today";

  // Constrain width on desktop so the segmented control doesn't stretch
  // across the whole content area — the design caps it ~560px.
  return (
    <div className="hidden max-w-[560px] md:block">
      <SegTabs options={tabs} value={activeId} size="md" full ariaLabel="Team sections" />
    </div>
  );
}
