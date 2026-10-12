"use client";

import { usePathname } from "next/navigation";
import { TeamTabBar } from "@/components/team/TeamTabBar";
import { isFullScreenTeamPath } from "@/lib/nav";

interface TeamNavProps {
  teamId: string;
  teamName: string;
}

/**
 * Team page header: the team name and, from 768 px, the section tabs.
 * On phones the name lives in the header's team switcher and the tabs
 * in the bottom bar, freeing the top of every team page (UX plan §6),
 * so the heading stays for screen readers only.
 *
 * Hidden on the full-screen game modes (game day / live, availability,
 * setup) — those screens bring their own chrome.
 */
export function TeamNav({ teamId, teamName }: TeamNavProps) {
  const pathname = usePathname();
  if (isFullScreenTeamPath(pathname)) return null;

  return (
    <div className="space-y-3">
      <h1 className="sr-only md:not-sr-only md:text-2xl md:font-bold md:text-ink">{teamName}</h1>
      <TeamTabBar teamId={teamId} />
    </div>
  );
}
