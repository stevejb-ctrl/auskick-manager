import { redirect } from "next/navigation";
import { sportHelpPath } from "@/lib/help/sports";
import { getMembership, getUser } from "@/lib/supabase/server";
import { teamSportById } from "@/lib/sports/teamSportById";

// Help from inside a team (the avatar menu, the app footer, the live
// screen's tour): straight to that team's sport hub, /help/netball and
// so on. Only a member learns the team's sport; anyone else, or a team
// that can't be read, gets the help home page.
export default async function TeamHelpPage({ params }: { params: { teamId: string } }) {
  const {
    data: { user },
  } = await getUser();
  const member = user ? await getMembership(params.teamId, user.id) : null;
  const sport = member ? await teamSportById(params.teamId) : null;
  redirect(sport ? sportHelpPath(sport) : "/help");
}
