"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TeamTabBar } from "@/components/team/TeamTabBar";

interface TeamNavProps {
  teamId: string;
  teamName: string;
}

/**
 * Renders the team header (back link, name, tab bar) on all team pages.
 * Returns null when in game mode (/live) so the field view gets the full screen.
 */
export function TeamNav({ teamId, teamName }: TeamNavProps) {
  const pathname = usePathname();

  if (pathname?.endsWith("/live")) return null;

  return (
    <div className="space-y-3">
      <Link
        href="/dashboard"
        className="text-sm text-gray-500 hover:text-brand-600"
      >
        ← My teams
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">{teamName}</h1>
      <TeamTabBar teamId={teamId} />
    </div>
  );
}
