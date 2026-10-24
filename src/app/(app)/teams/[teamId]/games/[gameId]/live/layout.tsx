import { createClient } from "@/lib/supabase/server";
import { SquadNamesProvider } from "@/components/live/SquadNames";
import { loadSquadNames } from "@/lib/live/loadSquadNames";

/**
 * Every live and lineup screen's tiles, sub cards and sheets tell two
 * kids with the same short name apart (round 3 edge testing, 24 Oct
 * 2026), from the squad loaded once here.
 */
export default async function LiveLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { teamId: string; gameId: string };
}) {
  const players = await loadSquadNames(createClient(), params.teamId, params.gameId);
  return <SquadNamesProvider players={players}>{children}</SquadNamesProvider>;
}
