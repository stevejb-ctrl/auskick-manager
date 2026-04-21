import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Reuse CRON_SECRET for lightweight admin-only access.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Idempotent: skip if demo team already exists.
  const { data: existing } = await admin
    .from("teams")
    .select("id")
    .eq("is_demo", true)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true, teamId: existing.id });
  }

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

  const { data: team, error: teamErr } = await admin
    .from("teams")
    .insert({
      name: "Demo Team",
      age_group: "U10",
      track_scoring: true,
      is_demo: true,
      created_by: superAdmin.id,
    })
    .select("id")
    .single();

  if (teamErr || !team) {
    return NextResponse.json(
      { error: teamErr?.message ?? "Failed to create team" },
      { status: 500 }
    );
  }

  // Make the super admin an admin of the team.
  await admin.from("team_memberships").insert({
    team_id: team.id,
    user_id: superAdmin.id,
    role: "admin",
  });

  const demoPlayers = [
    { name: "Alex Johnson", jersey: 1 },
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
      created_by: superAdmin.id,
    }))
  );

  if (playersErr) {
    return NextResponse.json(
      { error: playersErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, teamId: team.id, players: demoPlayers.length });
}
