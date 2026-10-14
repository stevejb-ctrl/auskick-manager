// A team's sport by id, for server code whose RLS-backed team read came
// back empty. That happens for a team created moments ago (see the team
// layout, which reads with the service client for the same reason); the
// old `team?.sport ?? "afl"` quietly rendered those teams as AFL. A
// team's sport isn't secret, and the team layout has already checked
// membership, so it's read past RLS here. Null when there's no such
// team. Cached per request.

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamSport } from "@/lib/sports/registry";
import type { SportId } from "@/lib/sports/types";

export const teamSportById = cache(async (teamId: string): Promise<SportId | null> => {
  const { data } = await createAdminClient().from("teams").select("sport").eq("id", teamId).maybeSingle();
  return data ? teamSport((data as { sport: unknown }).sport) : null;
});
