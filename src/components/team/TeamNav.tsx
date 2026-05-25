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
 *
 * Hidden on the in-game surfaces — /live (the field view) and
 * /availability (the pre-game roster step) — so those screens read
 * as part of the game flow rather than as another team-browse tab.
 * The page itself provides its own back-link/return path on those
 * surfaces.
 */
export function TeamNav({ teamId, teamName }: TeamNavProps) {
  const pathname = usePathname();

  if (pathname?.endsWith("/live") || pathname?.endsWith("/availability")) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Link
        // ?list=1 bypasses the dashboard's single-team auto-redirect.
        // Without this, a coach with only one team clicks "← My teams"
        // and immediately bounces back to the same team page they
        // came from — an infinite back-loop. The escape hatch lets
        // them reach the actual team picker (and "+ New team")
        // regardless of how many teams they own.
        href="/dashboard?list=1"
        className="text-sm text-ink-dim transition-colors duration-fast ease-out-quart hover:text-brand-700"
      >
        ← My teams
      </Link>
      <h1 className="text-2xl font-bold text-ink">{teamName}</h1>
      <TeamTabBar teamId={teamId} />
    </div>
  );
}
