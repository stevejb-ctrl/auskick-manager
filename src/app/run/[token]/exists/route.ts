import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Does this game-day link still open a game? The runner's GameGoneWatcher
// asks: the coach may have deleted the game or replaced the link.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const { data, error } = await createAdminClient()
    .from("games")
    .select("id")
    .eq("share_token", params.token)
    .maybeSingle();
  return NextResponse.json({ exists: !!data || !!error }, { headers: { "Cache-Control": "no-store" } });
}
