import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Is the game still there? The open live screen's GameGoneWatcher asks
// (round 3 edge testing, 24 Oct 2026: a deleted game's live screen
// carried on until a reload). A GET, not a server action: actions run
// one at a time, and a poll mustn't hold up a coach's write.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { teamId: string; gameId: string } }) {
  const { data, error } = await createClient()
    .from("games")
    .select("id")
    .eq("id", params.gameId)
    .eq("team_id", params.teamId)
    .maybeSingle();
  // Only a clean "no such row" says gone; an error isn't proof.
  return NextResponse.json({ exists: !!data || !!error }, { headers: { "Cache-Control": "no-store" } });
}
