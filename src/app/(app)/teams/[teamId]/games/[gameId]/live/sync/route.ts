// The coach's live sync check (<LiveSync>, lib/live/liveSync.ts): the
// game's stamp, read as the signed-in member (row-level security keeps it
// to the team's own games), for the phone to compare with the page it has.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readLiveSyncStamp } from "@/lib/live/liveSyncStamp";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { teamId: string; gameId: string } }) {
  const supabase = createClient();
  const { data: game } = await supabase
    .from("games")
    .select("id")
    .eq("id", params.gameId)
    .eq("team_id", params.teamId)
    .maybeSingle();
  const stamp = game ? await readLiveSyncStamp(supabase, params.gameId) : null;
  if (!stamp) return NextResponse.json({ stamp: null }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ stamp }, { headers: { "Cache-Control": "no-store" } });
}
