// The game-day link's live sync check (<LiveSync>, lib/live/liveSync.ts):
// the game's stamp, for the runner's phone to compare with the page it
// has. A link the coach has replaced finds nothing (404), and the phone's
// next refresh shows the link is no longer in use.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readLiveSyncStamp } from "@/lib/live/liveSyncStamp";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const { data: game } = await admin.from("games").select("id").eq("share_token", params.token).maybeSingle();
  const stamp = game ? await readLiveSyncStamp(admin, (game as { id: string }).id) : null;
  if (!stamp) return NextResponse.json({ stamp: null }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ stamp }, { headers: { "Cache-Control": "no-store" } });
}
