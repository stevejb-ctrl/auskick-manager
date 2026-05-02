import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

// Reuse CRON_SECRET for lightweight admin-only access.
//
// Idempotent: each sport's demo team is created once and reused.
// POSTing again is safe — both the AFL and netball demos are
// upserted independently and the response reports which were
// created vs already present.
//
// Wired in two places:
//   - POST /api/admin/seed-demo  (manual curl)
//   - GET  /api/admin/seed-demo  (Vercel cron — schedule in
//     vercel.json runs daily, idempotent so it just no-ops once
//     both demos exist)
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // We need a real user as owner — pick the first super admin.
  const { data: superAdmin } = await admin
    .from("profiles")
    .select("id")
    .eq("is_super_admin", true)
    .limit(1)
    .maybeSingle();

  if (!superAdmin) {
    return NextResponse.json(
      { error: "No super admin found to own demo team" },
      { status: 500 }
    );
  }

  // Seed both demos in turn. The seedDemoTeam helper is per-sport
  // so callers can reseed individually too if needed.
  try {
    const aflResult = await seedDemoTeam(admin, superAdmin.id, "afl");
    const netballResult = await seedDemoTeam(admin, superAdmin.id, "netball");
    return NextResponse.json({ ok: true, afl: aflResult, netball: netballResult });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Two methods, one handler. Vercel cron always sends GET; manual
// curl normally uses POST. Both share the same secret check + seed
// logic so re-runs are safe regardless of who triggered them.
export const GET = handle;
export const POST = handle;

interface SeedResult {
  teamId: string;
  skipped?: true;
  players?: number;
}

async function seedDemoTeam(
  admin: SupabaseClient,
  ownerId: string,
  sport: "afl" | "netball",
): Promise<SeedResult> {
  // Idempotent: skip if a demo team for this sport already exists.
  const { data: existing } = await admin
    .from("teams")
    .select("id")
    .eq("is_demo", true)
    .eq("sport", sport)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { teamId: existing.id, skipped: true };
  }

  const teamName = sport === "netball" ? "Demo Netball" : "Demo Team";
  // Netball uses the "go" age group (7-a-side, NetSetGO Go tier);
  // AFL uses U10 to match the existing demo expectations.
  const ageGroup = sport === "netball" ? "go" : "U10";

  const { data: team, error: teamErr } = await admin
    .from("teams")
    .insert({
      name: teamName,
      age_group: ageGroup,
      sport,
      track_scoring: true,
      is_demo: true,
      created_by: ownerId,
    })
    .select("id")
    .single();

  if (teamErr || !team) {
    throw new Error(
      `Failed to create ${sport} demo team: ${teamErr?.message ?? "unknown"}`,
    );
  }

  // Make the super admin an admin of the team.
  await admin.from("team_memberships").insert({
    team_id: team.id,
    user_id: ownerId,
    role: "admin",
  });

  // Sport-specific roster. AFL uses 15 players with jersey numbers;
  // netball uses 10 single-name players with no jersey (matching the
  // Bondi Bandits screenshot squad).
  const demoPlayers =
    sport === "netball"
      ? [
          { name: "Aria", jersey: null as number | null },
          { name: "Bea", jersey: null },
          { name: "Charlie", jersey: null },
          { name: "Daisy", jersey: null },
          { name: "Eliza", jersey: null },
          { name: "Frankie", jersey: null },
          { name: "Grace", jersey: null },
          { name: "Harlow", jersey: null },
          { name: "Iris", jersey: null },
          { name: "Jade", jersey: null },
        ]
      : [
          { name: "Alex Johnson", jersey: 1 as number | null },
          { name: "Blake Smith", jersey: 2 },
          { name: "Casey Brown", jersey: 3 },
          { name: "Dana Wilson", jersey: 4 },
          { name: "Eli Taylor", jersey: 5 },
          { name: "Finley Anderson", jersey: 6 },
          { name: "Harper Thomas", jersey: 7 },
          { name: "Indigo Martin", jersey: 8 },
          { name: "Jordan White", jersey: 9 },
          { name: "Kai Harris", jersey: 10 },
          { name: "Logan Clark", jersey: 11 },
          { name: "Morgan Lewis", jersey: 12 },
          { name: "Nat Robinson", jersey: 13 },
          { name: "Oakley Walker", jersey: 14 },
          { name: "Parker Hall", jersey: 15 },
        ];

  const { error: playersErr } = await admin.from("players").insert(
    demoPlayers.map((p) => ({
      team_id: team.id,
      full_name: p.name,
      jersey_number: p.jersey,
      is_active: true,
      created_by: ownerId,
    })),
  );

  if (playersErr) {
    throw new Error(`Failed to seed ${sport} demo players: ${playersErr.message}`);
  }

  return { teamId: team.id, players: demoPlayers.length };
}
