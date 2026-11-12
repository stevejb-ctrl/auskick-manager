"use client";

import { usePathname } from "next/navigation";

/**
 * Where an in-app Help link goes: inside a team (/teams/<id>/…), that
 * team's sport hub, by way of /teams/<id>/help (which redirects there);
 * anywhere else, the help home page.
 */
export function helpHrefFor(pathname: string | null): string {
  const team = /^\/teams\/([^/]+)/.exec(pathname ?? "")?.[1];
  return team ? `/teams/${team}/help` : "/help";
}

export function useHelpHref(): string {
  return helpHrefFor(usePathname());
}
