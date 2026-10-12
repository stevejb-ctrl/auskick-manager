// The team's five sections (UX plan §6: Today · Games · Squad · Stats ·
// Team), shared by the phone bottom bar and the desktop top tabs.

export interface TeamTab {
  id: "today" | "games" | "squad" | "stats" | "team";
  label: string;
  href: string;
  /** Today matches its path exactly; the rest match as a prefix. */
  exact?: boolean;
}

export function teamTabs(teamId: string): TeamTab[] {
  return [
    { id: "today", label: "Today", href: `/teams/${teamId}`, exact: true },
    { id: "games", label: "Games", href: `/teams/${teamId}/games` },
    { id: "squad", label: "Squad", href: `/teams/${teamId}/squad` },
    { id: "stats", label: "Stats", href: `/teams/${teamId}/stats` },
    { id: "team", label: "Team", href: `/teams/${teamId}/settings` },
  ];
}
