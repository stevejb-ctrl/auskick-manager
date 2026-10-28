// The title of a game's share link (/run/<token>): the game itself, in
// any sport. The site's title is the host's brand, so a basketball or
// hockey link on sirenfooty.com.au read "Siren Footy" in the tab and the
// group chat's link preview (Stagehand round 7, 28 Oct 2026).

export function runLinkTitle(teamName: string, opponent: string | null | undefined): string {
  const them = opponent?.trim();
  return them ? `${teamName} v ${them} · Siren` : `${teamName} · Siren`;
}
