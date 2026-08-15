// Object-level ownership guard for destructive game operations performed via
// the RLS-bypassing service-role (admin) client.
//
// SECURITY (audit 2026-07): resetGame / deleteGame authorise the CALLER
// against a caller-supplied teamId, then mutate rows keyed only by gameId
// using the admin client, which ignores RLS. Without confirming the game
// actually belongs to that team, an admin of team B can pass team A's gameId
// and wipe team A's events/availability (an IDOR). Callers MUST gate the
// destructive writes on this check after loading the game's team_id.
export function gameBelongsToTeam(
  gameTeamId: string | null | undefined,
  authorizedTeamId: string,
): boolean {
  return (
    typeof gameTeamId === "string" &&
    gameTeamId.length > 0 &&
    gameTeamId === authorizedTeamId
  );
}
